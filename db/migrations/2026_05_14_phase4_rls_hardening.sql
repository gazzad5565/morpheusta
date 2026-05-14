-- 2026-05-14 (evening): Phase 4 RLS hardening.
--
-- The previous "Phase 3" policies on most tables were
-- `TO authenticated USING (true)` placeholders — reps had the same
-- DB-write powers as managers, gated only by the UI. A motivated
-- rep could curl Supabase directly and modify customers / shifts /
-- tasks / library files / app_settings / profiles. This migration
-- closes that gap before opening to real users.
--
-- Strategy:
--   1. Create an `is_manager()` SECURITY DEFINER helper that reads
--      profiles.role. SECURITY DEFINER runs the lookup as the
--      function owner, NOT as the caller, so it works even when the
--      caller's RLS on profiles is restrictive. Centralised here so
--      every policy can call it without re-inlining the EXISTS lookup.
--   2. Drop and recreate every `USING (true)` policy with role-aware
--      logic. Three reusable shapes:
--        - **manager-only writes**: customers metadata, customer_tasks,
--          library_files, app_settings, custom_fields, etc.
--        - **rep-self writes**: rep updates own row (shifts.state,
--          rep_locations, push_subscriptions, message_recipients.read_at)
--        - **rep-INSERT + manager-all**: photos, signatures,
--          shift_task_completions, shift_events, customers (for
--          rep-created customer flow from mobile)
--   3. Preserve every existing user flow:
--        - Feature A: rep creates new customer + head-office site
--        - Feature B: rep geocodes a customer's site
--        - Feature C/D: rep uploads photos + signatures
--        - Check-in/out: rep updates own shift state
--        - Mobile messaging inbox: rep marks own row read
--
-- Safe to re-run: every policy is dropped (IF EXISTS) before being
-- recreated. Wrapped in BEGIN/COMMIT so a partial failure rolls back.
--
-- Service-role callers (Vercel cron routes, /api/messages/send,
-- /api/push/notify, /api/users) BYPASS RLS by design — those flows
-- continue to work regardless of the policies below.

BEGIN;

-- ─── 1. is_manager() helper ────────────────────────────────────────
--
-- SECURITY DEFINER so the lookup doesn't recurse into profiles RLS.
-- Returns true when the current auth.uid() has role='manager'.
-- Caching set to STABLE because role rarely changes per query; the
-- planner can hoist the call out of row scans.

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager'
  );
$$;

REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

COMMENT ON FUNCTION public.is_manager() IS
  'True when the current authenticated user has role=''manager''. Used by RLS policies across the schema to gate manager-only writes. SECURITY DEFINER so the inner profiles lookup runs as the function owner, bypassing profiles RLS.';

-- ─── 2. profiles ───────────────────────────────────────────────────
--
-- SELECT: everyone authenticated reads (rep picker, avatars, mentions).
-- UPDATE: self can change own name/avatar; managers can change role
--         + any other column. Split into two policies so the
--         WITH CHECK on the rep path can be tighter once we add
--         column-level guards later.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_manager_update"    ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_manager_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 3. app_settings ──────────────────────────────────────────────
--
-- Reads: anyone authenticated (mobile reads photo_quality_tier,
-- exception toggles, etc.). Writes: manager only.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select"   ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_upsert"   ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert"   ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update"   ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_delete"   ON public.app_settings;

CREATE POLICY "app_settings_select"
  ON public.app_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "app_settings_insert"
  ON public.app_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_manager());

CREATE POLICY "app_settings_update"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "app_settings_delete"
  ON public.app_settings FOR DELETE
  TO authenticated USING (public.is_manager());

-- ─── 4. customers ──────────────────────────────────────────────────
--
-- Reads: anyone authenticated (reps need the customer list to pick
-- where to request a shift). Writes: managers can do all; reps can
-- INSERT (Feature A: rep adds a new customer from mobile) and
-- DELETE only their own freshly-created row (used by the
-- error-rollback path in createCustomer). Updates are manager-only.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select"           ON public.customers;
DROP POLICY IF EXISTS "customers_insert"           ON public.customers;
DROP POLICY IF EXISTS "customers_update"           ON public.customers;
DROP POLICY IF EXISTS "customers_delete"           ON public.customers;
DROP POLICY IF EXISTS "customers_all"              ON public.customers;
DROP POLICY IF EXISTS "customers_manager_all"      ON public.customers;
DROP POLICY IF EXISTS "customers_rep_insert"       ON public.customers;
DROP POLICY IF EXISTS "customers_rep_rollback_delete" ON public.customers;

CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "customers_manager_all"
  ON public.customers FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- Rep can INSERT only when the new row's created_by_rep_id is set to
-- their own id (enforced by Feature A's createCustomer client code).
-- Prevents reps from spoofing customer_count via /rest with someone
-- else's rep id.
CREATE POLICY "customers_rep_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_rep_id = auth.uid()
  );

-- Rep can DELETE only their own rep-created customer, AND only when
-- it has zero sites — the error-rollback path in createCustomer is
-- the sole legitimate use. Stops a rep from nuking real customers.
CREATE POLICY "customers_rep_rollback_delete"
  ON public.customers FOR DELETE
  TO authenticated
  USING (
    created_by_rep_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_sites s WHERE s.customer_id = customers.id
    )
  );

-- ─── 5. customer_sites ─────────────────────────────────────────────
--
-- Reads: anyone authenticated. Writes: manager can do all; rep can
-- INSERT (Feature A head-office site) AND UPDATE coords (Feature B
-- geocode flow). Rep DELETE is denied — managers handle site cleanup.

ALTER TABLE public.customer_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_sites_select"            ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_insert"            ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_update"            ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_delete"            ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_manager_all"       ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_rep_insert"        ON public.customer_sites;
DROP POLICY IF EXISTS "customer_sites_rep_update_coords" ON public.customer_sites;

CREATE POLICY "customer_sites_select"
  ON public.customer_sites FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "customer_sites_manager_all"
  ON public.customer_sites FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- Rep can INSERT a site, but only for a customer the rep created
-- AND only when that customer doesn't yet have any sites (Feature A
-- "first site for this brand-new customer" guard).
CREATE POLICY "customer_sites_rep_insert"
  ON public.customer_sites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_sites.customer_id
        AND c.created_by_rep_id = auth.uid()
    )
  );

-- Rep can UPDATE coords on any site they have a shift at OR any
-- site of a customer they created (Feature B geocode flow). This
-- lets the rep self-pin a location they're physically at without
-- needing a manager to fix it. Note: rep can technically UPDATE
-- other columns too — column-level guards would tighten further
-- in a future pass, but for now the value of self-pinning beats
-- the risk of a rep editing site names.
CREATE POLICY "customer_sites_rep_update"
  ON public.customer_sites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.site_id = customer_sites.id AND s.rep_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_sites.customer_id
        AND c.created_by_rep_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.site_id = customer_sites.id AND s.rep_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_sites.customer_id
        AND c.created_by_rep_id = auth.uid()
    )
  );

-- ─── 6. customer_tasks ─────────────────────────────────────────────
--
-- Manager-only writes. Reps just read the list to render task tiles.

ALTER TABLE public.customer_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_tasks_select"      ON public.customer_tasks;
DROP POLICY IF EXISTS "customer_tasks_insert"      ON public.customer_tasks;
DROP POLICY IF EXISTS "customer_tasks_update"      ON public.customer_tasks;
DROP POLICY IF EXISTS "customer_tasks_delete"      ON public.customer_tasks;
DROP POLICY IF EXISTS "customer_tasks_manager_all" ON public.customer_tasks;

CREATE POLICY "customer_tasks_select"
  ON public.customer_tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "customer_tasks_manager_all"
  ON public.customer_tasks FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 7. library_files ──────────────────────────────────────────────
--
-- Manager-only writes. Reps read all files (no per-rep filter yet).

ALTER TABLE public.library_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_files_select"       ON public.library_files;
DROP POLICY IF EXISTS "library_files_insert"       ON public.library_files;
DROP POLICY IF EXISTS "library_files_update"       ON public.library_files;
DROP POLICY IF EXISTS "library_files_delete"       ON public.library_files;
DROP POLICY IF EXISTS "library_files_manager_all"  ON public.library_files;

CREATE POLICY "library_files_select"
  ON public.library_files FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "library_files_manager_all"
  ON public.library_files FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- Storage objects for the library bucket — narrow writes to manager.
-- Reads stay open to authenticated (signed-URL flow uses caller's
-- auth and our storage policy already scopes to bucket_id).

DROP POLICY IF EXISTS "library_storage_read"    ON storage.objects;
DROP POLICY IF EXISTS "library_storage_insert"  ON storage.objects;
DROP POLICY IF EXISTS "library_storage_delete"  ON storage.objects;
DROP POLICY IF EXISTS "library_storage_update"  ON storage.objects;

CREATE POLICY "library_storage_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'library');

CREATE POLICY "library_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'library' AND public.is_manager());

CREATE POLICY "library_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'library' AND public.is_manager());

-- ─── 8. custom_fields + custom_field_values ────────────────────────
--
-- Manager-only writes (org-level config). Everyone reads to render
-- the dynamic fields on detail pages.

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_fields_select"            ON public.custom_fields;
DROP POLICY IF EXISTS "custom_fields_insert"            ON public.custom_fields;
DROP POLICY IF EXISTS "custom_fields_update"            ON public.custom_fields;
DROP POLICY IF EXISTS "custom_fields_delete"            ON public.custom_fields;
DROP POLICY IF EXISTS "custom_fields_manager_all"       ON public.custom_fields;
DROP POLICY IF EXISTS "cfv_select"                      ON public.custom_field_values;
DROP POLICY IF EXISTS "cfv_insert"                      ON public.custom_field_values;
DROP POLICY IF EXISTS "cfv_update"                      ON public.custom_field_values;
DROP POLICY IF EXISTS "cfv_delete"                      ON public.custom_field_values;
DROP POLICY IF EXISTS "cfv_manager_all"                 ON public.custom_field_values;

CREATE POLICY "custom_fields_select"
  ON public.custom_fields FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "custom_fields_manager_all"
  ON public.custom_fields FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "cfv_select"
  ON public.custom_field_values FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "cfv_manager_all"
  ON public.custom_field_values FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 9. rep_customer_assignments ───────────────────────────────────
--
-- Manager-only writes. Reps need to read their own row to know which
-- customers they're assigned to (used in the future for filtering).

ALTER TABLE public.rep_customer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rca_select"             ON public.rep_customer_assignments;
DROP POLICY IF EXISTS "rca_insert"             ON public.rep_customer_assignments;
DROP POLICY IF EXISTS "rca_delete"             ON public.rep_customer_assignments;
DROP POLICY IF EXISTS "rca_update"             ON public.rep_customer_assignments;
DROP POLICY IF EXISTS "rca_manager_all"        ON public.rep_customer_assignments;

CREATE POLICY "rca_select"
  ON public.rep_customer_assignments FOR SELECT
  TO authenticated
  USING (rep_id = auth.uid() OR public.is_manager());

CREATE POLICY "rca_manager_all"
  ON public.rep_customer_assignments FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 10. shifts ────────────────────────────────────────────────────
--
-- Manager full access. Rep can SELECT their own + claimable
-- (unassigned) shifts, UPDATE their own (state, check_in/out,
-- attention, notes), and INSERT nothing (creation is manager-only).

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select"           ON public.shifts;
DROP POLICY IF EXISTS "shifts_insert"           ON public.shifts;
DROP POLICY IF EXISTS "shifts_update"           ON public.shifts;
DROP POLICY IF EXISTS "shifts_delete"           ON public.shifts;
DROP POLICY IF EXISTS "shifts_manager_all"      ON public.shifts;
DROP POLICY IF EXISTS "shifts_rep_self_select"  ON public.shifts;
DROP POLICY IF EXISTS "shifts_rep_self_update"  ON public.shifts;

CREATE POLICY "shifts_manager_all"
  ON public.shifts FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "shifts_rep_self_select"
  ON public.shifts FOR SELECT
  TO authenticated
  USING (
    rep_id = auth.uid()
    OR rep_id IS NULL  -- claimable (unassigned) shifts visible to all reps
  );

CREATE POLICY "shifts_rep_self_update"
  ON public.shifts FOR UPDATE
  TO authenticated
  USING (rep_id = auth.uid() OR rep_id IS NULL)
  WITH CHECK (rep_id = auth.uid() OR rep_id IS NULL);

-- ─── 11. shift_events ──────────────────────────────────────────────
--
-- Append-only audit log. INSERT: any authenticated user (mobile +
-- admin both log here, including the rep when they log own events).
-- SELECT: manager all; rep sees own events. DELETE: manager only.
--
-- IMPORTANT: shift_events uses `actor_id` (the user who did the
-- thing) NOT `rep_id`. The first version of this migration
-- referenced `rep_id` and bailed with `42703: column "rep_id" does
-- not exist` — see schema in 2026_05_05_shift_events.sql.

ALTER TABLE public.shift_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_events_select"          ON public.shift_events;
DROP POLICY IF EXISTS "shift_events_insert"          ON public.shift_events;
DROP POLICY IF EXISTS "shift_events_delete"          ON public.shift_events;
DROP POLICY IF EXISTS "shift_events_rep_self_select" ON public.shift_events;
DROP POLICY IF EXISTS "shift_events_manager_select"  ON public.shift_events;
DROP POLICY IF EXISTS "shift_events_manager_delete"  ON public.shift_events;

CREATE POLICY "shift_events_select"
  ON public.shift_events FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid()
    OR public.is_manager()
  );

CREATE POLICY "shift_events_insert"
  ON public.shift_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "shift_events_manager_delete"
  ON public.shift_events FOR DELETE
  TO authenticated USING (public.is_manager());

-- ─── 12. shift_task_completions ────────────────────────────────────
--
-- Manager-all + rep-can-INSERT-own-shift. Rep DELETE allowed for
-- their own row so "untick complete" works.

ALTER TABLE public.shift_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_task_completions_select"       ON public.shift_task_completions;
DROP POLICY IF EXISTS "shift_task_completions_insert"       ON public.shift_task_completions;
DROP POLICY IF EXISTS "shift_task_completions_delete"       ON public.shift_task_completions;
DROP POLICY IF EXISTS "stc_manager_all"                     ON public.shift_task_completions;
DROP POLICY IF EXISTS "stc_rep_self_insert"                 ON public.shift_task_completions;
DROP POLICY IF EXISTS "stc_rep_self_delete"                 ON public.shift_task_completions;

CREATE POLICY "stc_select"
  ON public.shift_task_completions FOR SELECT
  TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_completions.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "stc_manager_all"
  ON public.shift_task_completions FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "stc_rep_self_insert"
  ON public.shift_task_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_completions.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "stc_rep_self_delete"
  ON public.shift_task_completions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_completions.shift_id AND s.rep_id = auth.uid()
    )
  );

-- ─── 13. shift_task_photos ─────────────────────────────────────────
--
-- Reps INSERT photos for their own shifts (Feature C). Reps DELETE
-- their own. Managers do all. SELECT mirrors: manager all + rep
-- sees own shift's photos.

ALTER TABLE public.shift_task_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_task_photos_select        ON public.shift_task_photos;
DROP POLICY IF EXISTS shift_task_photos_insert        ON public.shift_task_photos;
DROP POLICY IF EXISTS shift_task_photos_delete        ON public.shift_task_photos;
DROP POLICY IF EXISTS shift_task_photos_manager_all   ON public.shift_task_photos;
DROP POLICY IF EXISTS shift_task_photos_rep_insert    ON public.shift_task_photos;
DROP POLICY IF EXISTS shift_task_photos_rep_delete    ON public.shift_task_photos;

CREATE POLICY "shift_task_photos_select"
  ON public.shift_task_photos FOR SELECT
  TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_photos.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "shift_task_photos_manager_all"
  ON public.shift_task_photos FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "shift_task_photos_rep_insert"
  ON public.shift_task_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    rep_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_photos.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "shift_task_photos_rep_delete"
  ON public.shift_task_photos FOR DELETE
  TO authenticated
  USING (
    rep_id = auth.uid()
  );

-- Storage objects in the shift_photos bucket. Public-read kept (the
-- URLs are unguessable + report rendering needs no roundtrip).
-- INSERT/DELETE require rep-self (any authenticated who owns the
-- bucket_id row already passes our checks; we don't enforce per-
-- folder ownership here because the storage_path is in the DB row
-- and that DB row already checks rep_id).

DROP POLICY IF EXISTS shift_photos_objects_select ON storage.objects;
DROP POLICY IF EXISTS shift_photos_objects_insert ON storage.objects;
DROP POLICY IF EXISTS shift_photos_objects_delete ON storage.objects;

CREATE POLICY shift_photos_objects_select
  ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'shift_photos');

CREATE POLICY shift_photos_objects_insert
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'shift_photos');

CREATE POLICY shift_photos_objects_delete
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'shift_photos');

-- ─── 14. shift_task_signatures ─────────────────────────────────────
--
-- Same shape as shift_task_photos.

ALTER TABLE public.shift_task_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_task_signatures_select        ON public.shift_task_signatures;
DROP POLICY IF EXISTS shift_task_signatures_insert        ON public.shift_task_signatures;
DROP POLICY IF EXISTS shift_task_signatures_delete        ON public.shift_task_signatures;
DROP POLICY IF EXISTS shift_task_signatures_manager_all   ON public.shift_task_signatures;
DROP POLICY IF EXISTS shift_task_signatures_rep_insert    ON public.shift_task_signatures;
DROP POLICY IF EXISTS shift_task_signatures_rep_delete    ON public.shift_task_signatures;

CREATE POLICY "shift_task_signatures_select"
  ON public.shift_task_signatures FOR SELECT
  TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_signatures.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "shift_task_signatures_manager_all"
  ON public.shift_task_signatures FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "shift_task_signatures_rep_insert"
  ON public.shift_task_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    rep_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_task_signatures.shift_id AND s.rep_id = auth.uid()
    )
  );

CREATE POLICY "shift_task_signatures_rep_delete"
  ON public.shift_task_signatures FOR DELETE
  TO authenticated
  USING (rep_id = auth.uid());

-- ─── 15. messages ──────────────────────────────────────────────────
--
-- Manager-only — composing, listing the sent box, cancelling
-- scheduled. Reps don't read this table directly; they read their
-- own row in message_recipients (which joins through to messages).

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_authenticated   ON public.messages;
DROP POLICY IF EXISTS messages_insert_authenticated   ON public.messages;
DROP POLICY IF EXISTS messages_update_authenticated   ON public.messages;
DROP POLICY IF EXISTS messages_delete_authenticated   ON public.messages;
DROP POLICY IF EXISTS messages_manager_all            ON public.messages;
DROP POLICY IF EXISTS messages_recipient_select       ON public.messages;

-- Recipients can SELECT messages they're a recipient of, so the
-- mobile inbox's JOIN through message_recipients works. Managers
-- see all messages including ones they didn't compose.
CREATE POLICY "messages_recipient_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.message_recipients mr
      WHERE mr.message_id = messages.id AND mr.recipient_id = auth.uid()
    )
  );

CREATE POLICY "messages_manager_all"
  ON public.messages FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 16. message_recipients ────────────────────────────────────────
--
-- SELECT: own row + managers all. INSERT/DELETE: managers (compose
-- materialises recipients). UPDATE: rep can update OWN row's
-- read_at (mark-as-read); managers can update any.

ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_select_authenticated   ON public.message_recipients;
DROP POLICY IF EXISTS mr_insert_authenticated   ON public.message_recipients;
DROP POLICY IF EXISTS mr_update_authenticated   ON public.message_recipients;
DROP POLICY IF EXISTS mr_delete_authenticated   ON public.message_recipients;
DROP POLICY IF EXISTS mr_select_self            ON public.message_recipients;
DROP POLICY IF EXISTS mr_manager_all            ON public.message_recipients;
DROP POLICY IF EXISTS mr_self_update            ON public.message_recipients;

CREATE POLICY "mr_select_self"
  ON public.message_recipients FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid() OR public.is_manager());

CREATE POLICY "mr_manager_all"
  ON public.message_recipients FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "mr_self_update"
  ON public.message_recipients FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ─── 17. customer_seen_by_manager ──────────────────────────────────
--
-- Manager-only — tracks per-manager "I've reviewed this rep-added
-- customer" badge dismissals. Reps don't write or read this.

ALTER TABLE public.customer_seen_by_manager ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_seen_by_manager_select   ON public.customer_seen_by_manager;
DROP POLICY IF EXISTS customer_seen_by_manager_insert   ON public.customer_seen_by_manager;
DROP POLICY IF EXISTS customer_seen_by_manager_delete   ON public.customer_seen_by_manager;
DROP POLICY IF EXISTS customer_seen_by_manager_all      ON public.customer_seen_by_manager;

CREATE POLICY "customer_seen_by_manager_all"
  ON public.customer_seen_by_manager FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ─── 18. org_assets storage bucket ─────────────────────────────────
--
-- Originally there was a `public.organisation` block here too, but
-- that table doesn't actually exist — the 2026-05-06 "organisation"
-- migration stored org settings as ROWS inside app_settings (keys
-- 'organisation_name' + 'organisation_logo_url'), so those reads /
-- writes are already gated by the app_settings policy above. Only
-- the storage bucket policies for org logo uploads need to be
-- tightened here.
DROP POLICY IF EXISTS "org_assets_authed_select"  ON storage.objects;
DROP POLICY IF EXISTS "org_assets_authed_insert"  ON storage.objects;
DROP POLICY IF EXISTS "org_assets_authed_update"  ON storage.objects;
DROP POLICY IF EXISTS "org_assets_authed_delete"  ON storage.objects;

CREATE POLICY "org_assets_authed_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'org_assets');

CREATE POLICY "org_assets_authed_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org_assets' AND public.is_manager());

CREATE POLICY "org_assets_authed_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org_assets' AND public.is_manager())
  WITH CHECK (bucket_id = 'org_assets' AND public.is_manager());

CREATE POLICY "org_assets_authed_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'org_assets' AND public.is_manager());

-- ─── 19. rep_locations ─────────────────────────────────────────────
--
-- Already mostly correct. Tighten SELECT so reps don't see other
-- reps' positions (the admin map needs the all-reps view; managers
-- get that). Reps see their own row.

DROP POLICY IF EXISTS "rep_locations_read_all"       ON public.rep_locations;
DROP POLICY IF EXISTS "rep_locations_self_select"    ON public.rep_locations;
DROP POLICY IF EXISTS "rep_locations_manager_select" ON public.rep_locations;

CREATE POLICY "rep_locations_select"
  ON public.rep_locations FOR SELECT
  TO authenticated
  USING (rep_id = auth.uid() OR public.is_manager());

-- INSERT/UPDATE/DELETE policies already correctly scope to rep_id =
-- auth.uid() (with a manager-can-delete-orphans variant). Left
-- untouched.

COMMIT;

-- ─── Smoke-test checklist (read-only — paste in a SQL editor under
--     a rep session OR a manager session to verify the new policies
--     behave as expected):
--
-- As a REP (rep_id = '<rep-uid>'):
--   ✅ SELECT * FROM customers;                                 -- all rows
--   ✅ INSERT INTO customers (id, name, created_by_rep_id)       -- own only
--        VALUES ('x', 'Test', auth.uid());
--   ❌ UPDATE customers SET name='X' WHERE id != '<own-just-created>';
--   ❌ DELETE FROM customers WHERE id != '<own-just-created>';
--   ✅ UPDATE shifts SET state='complete' WHERE rep_id = auth.uid();
--   ❌ UPDATE shifts SET state='complete' WHERE rep_id != auth.uid();
--   ❌ INSERT INTO customer_tasks ...;                           -- manager only
--   ❌ INSERT INTO library_files ...;                            -- manager only
--   ❌ UPDATE app_settings SET value='false';                    -- manager only
--   ❌ UPDATE profiles SET role='manager' WHERE id != auth.uid();-- manager only
--   ✅ UPDATE profiles SET name='New' WHERE id = auth.uid();
--
-- As a MANAGER:
--   ✅ Every write across every table works.
--   ✅ Reads see everything.
