-- 2026-05-29: RLS capability hardening (architecture-review epic #14 / #8).
--
-- WHAT: makes the per-type CAPABILITY flags real at the DATABASE, not
-- just hidden in the UI. Phase 4 RLS (2026_05_14) gated writes on
-- is_manager() and created-by-rep ownership, but the finer capabilities
--   • canCreateCustomers   (rep)
--   • canManageSettings    (manager)
--   • canScheduleShifts    (manager)
-- were CLIENT-SIDE ONLY — a motivated user with their JWT + curl could
-- bypass them by hitting PostgREST directly (flagged in
-- lib/settings-store.ts: "a motivated rep could still INSERT a customer
-- regardless of canCreateCustomers"). This closes that gap.
--
-- WHY THIS IS SAFE TO RUN:
-- The capability model is LENIENT DEFAULT-ALLOW (see settings-store
-- repTypeCan / managerTypeCan): a NULL type, an unknown/deleted type, or
-- a missing flag all mean ALLOW. The two helpers below mirror that
-- EXACTLY — they return FALSE *only* when the user's type is explicitly
-- configured with the capability = false. So every existing user with a
-- NULL rep_type/manager_type (which is almost everyone, including the
-- owner account) is COMPLETELY UNAFFECTED. Only users you have
-- deliberately placed on a restrictive type (e.g. a "View only" manager,
-- a "Merchandiser" rep) get tightened — which is the entire point.
--
-- Service-role API routes (/api/import/*, /api/users, …) BYPASS RLS, so
-- bulk imports + admin-mints are unaffected; they stay gated by
-- requireManager() at the route layer.
--
-- Idempotent — safe to re-run (CREATE OR REPLACE + DROP POLICY IF
-- EXISTS). Run once in Supabase → SQL Editor, then work the TEST
-- CHECKLIST at the bottom.
--
-- LOCKOUT RECOVERY (belt-and-braces): if a misconfigured type ever
-- blocks someone, clear their type and the lenient default restores
-- full access instantly:
--   UPDATE public.profiles SET manager_type = NULL WHERE id = '<uid>';
--   UPDATE public.profiles SET rep_type     = NULL WHERE id = '<uid>';


-- ─── 1. Capability helpers (SECURITY DEFINER, lenient default-allow) ──
--
-- Both mirror settings-store.repTypeCan / managerTypeCan: DENY only when
-- an explicit `false` is configured for the user's (non-null, known)
-- type. NULL type / no vocab row / unknown type / missing flag → allow.
-- SECURITY DEFINER so they can read profiles + app_settings regardless
-- of the calling user's own policies (same pattern as is_manager()).

CREATE OR REPLACE FUNCTION public.rep_can_create_customers()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.app_settings s ON s.key = 'rep_types'
    CROSS JOIN LATERAL jsonb_array_elements(s.value) elem
    WHERE p.id = auth.uid()
      AND p.rep_type IS NOT NULL
      AND lower(elem->>'name') = lower(p.rep_type)
      AND (elem->>'canCreateCustomers') = 'false'
  );
$$;

REVOKE ALL ON FUNCTION public.rep_can_create_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rep_can_create_customers() TO authenticated;

COMMENT ON FUNCTION public.rep_can_create_customers() IS
  'TRUE unless the calling user''s rep_type is explicitly configured canCreateCustomers:false in app_settings.rep_types. Lenient default-allow — mirrors settings-store.repTypeCan.';

CREATE OR REPLACE FUNCTION public.manager_can(capability text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.app_settings s ON s.key = 'manager_types'
    CROSS JOIN LATERAL jsonb_array_elements(s.value) elem
    WHERE p.id = auth.uid()
      AND p.manager_type IS NOT NULL
      AND lower(elem->>'name') = lower(p.manager_type)
      AND (elem->>capability) = 'false'
  );
$$;

REVOKE ALL ON FUNCTION public.manager_can(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_can(text) TO authenticated;

COMMENT ON FUNCTION public.manager_can(text) IS
  'TRUE unless the calling manager''s manager_type is explicitly configured <capability>:false in app_settings.manager_types. Lenient default-allow — mirrors settings-store.managerTypeCan. capability in (canManageSettings, canScheduleShifts).';


-- ─── 2. canCreateCustomers — gate the rep customer INSERT ────────────
--
-- Was: WITH CHECK (created_by_rep_id = auth.uid()) — ANY rep could
-- insert. Now also requires the rep's type to allow it. Managers are
-- unaffected (they insert via customers_manager_all).
DROP POLICY IF EXISTS "customers_rep_insert" ON public.customers;
CREATE POLICY "customers_rep_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_rep_id = auth.uid()
    AND public.rep_can_create_customers()
  );


-- ─── 3. canManageSettings — gate app_settings WRITES (SELECT stays open) ─
--
-- The app READS settings everywhere (branding, date format, vocab,
-- grace periods …) so app_settings_select stays USING (true). Only
-- INSERT/UPDATE/DELETE now require a manager whose type allows settings
-- management. A NULL-type manager still passes (lenient).
DROP POLICY IF EXISTS "app_settings_insert" ON public.app_settings;
CREATE POLICY "app_settings_insert"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager() AND public.manager_can('canManageSettings'));

DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
CREATE POLICY "app_settings_update"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.is_manager() AND public.manager_can('canManageSettings'))
  WITH CHECK (public.is_manager() AND public.manager_can('canManageSettings'));

DROP POLICY IF EXISTS "app_settings_delete" ON public.app_settings;
CREATE POLICY "app_settings_delete"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (public.is_manager() AND public.manager_can('canManageSettings'));


-- ─── 4. canScheduleShifts — gate shift WRITES, keep manager READ ─────
--
-- shifts_manager_all (FOR ALL) is split so a View-only / non-scheduling
-- manager can still SEE shifts but not create / edit / delete them. The
-- rep self-policies (claim an unassigned shift, operate their OWN shift
-- on check-in) are deliberately untouched — canScheduleShifts is a
-- MANAGER capability and must never block a rep working their own shift.
DROP POLICY IF EXISTS "shifts_manager_all"    ON public.shifts;
DROP POLICY IF EXISTS "shifts_manager_select" ON public.shifts;
DROP POLICY IF EXISTS "shifts_manager_insert" ON public.shifts;
DROP POLICY IF EXISTS "shifts_manager_update" ON public.shifts;
DROP POLICY IF EXISTS "shifts_manager_delete" ON public.shifts;

CREATE POLICY "shifts_manager_select"
  ON public.shifts FOR SELECT
  TO authenticated
  USING (public.is_manager());

CREATE POLICY "shifts_manager_insert"
  ON public.shifts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager() AND public.manager_can('canScheduleShifts'));

CREATE POLICY "shifts_manager_update"
  ON public.shifts FOR UPDATE
  TO authenticated
  USING (public.is_manager() AND public.manager_can('canScheduleShifts'))
  WITH CHECK (public.is_manager() AND public.manager_can('canScheduleShifts'));

CREATE POLICY "shifts_manager_delete"
  ON public.shifts FOR DELETE
  TO authenticated
  USING (public.is_manager() AND public.manager_can('canScheduleShifts'));

-- (shifts_rep_self_select / shifts_rep_self_update from Phase 4 remain
--  in place — not recreated here.)


-- ════════════════════════════════════════════════════════════════════
-- TEST CHECKLIST — work through this AFTER applying. Two accounts (one
-- owner/NULL-type manager, one restricted) + the mobile app cover it.
--
-- A. NO REGRESSION for normal users (the one that matters most):
--    1. Your owner account (manager, NULL manager_type): can still save
--       Site settings, schedule a shift, edit a customer. ✓ lenient
--    2. A rep with NULL rep_type: mobile "Add Customer" still saves. ✓
--    3. An "Owner" manager: unaffected (both caps true). ✓
--
-- B. ENFORCEMENT now real (set the type via /settings/managers/[id]/edit):
--    4. "View only" manager → settings save + shift create now REFUSED
--       by the DB (the UI already hid them); reading still works.
--    5. "Operations" manager → can schedule shifts, CANNOT save settings.
--    6. "Merchandiser" rep (canCreateCustomers:false) → the mobile
--       Add-Customer insert is refused at the DB, not just hidden.
--
-- C. Spot-check the helpers directly (run while authenticated as that
--    user, e.g. via the app's network tab or a test JWT):
--      SELECT public.rep_can_create_customers();
--      SELECT public.manager_can('canManageSettings');
--      SELECT public.manager_can('canScheduleShifts');
--
-- If anything legit breaks: clear the offending type (see LOCKOUT
-- RECOVERY at the top) — instant restore. Then tell me and we adjust.
-- ════════════════════════════════════════════════════════════════════
