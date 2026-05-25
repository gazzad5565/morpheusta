-- 2026-05-25: Import hub foundation.
--
-- Three things, all wired together:
--
--   1. import_runs — one row per bulk-import attempt the manager
--      triggers from the new /import hub. Holds counts (total /
--      created / updated / failed), per-row errors as JSON, and
--      the settings the manager chose for that run (duplicate
--      behaviour, send-welcome-email flag, etc). Manager-only
--      via the is_manager() helper from Phase 4 RLS. On the
--      supabase_realtime publication so the Import hub can show
--      live progress as a long-running import ticks through rows.
--
--   2. geocode_status on customers + customer_sites — drives the
--      every-minute background geocoder cron that lands in Phase E.
--      Statuses: 'pending' (cron will pick it up), 'done' (already
--      has lat/lng), 'failed' (Nominatim couldn't resolve the
--      address — edit-address flow flips it back to pending), and
--      'skipped' (no address to geocode in the first place).
--      Backfilled so existing rows don't all flood the cron the
--      first time it runs: anything with lat/lng goes to 'done',
--      anything with no address goes to 'skipped'. The partial
--      index on `WHERE geocode_status = 'pending'` keeps the
--      cron's pull cheap — it scans only the work queue, not
--      every customer in the org.
--
--   3. app_settings seed for the import hub's two defaults
--      (duplicate behaviour + send-welcome-email-on-user-import).
--      ON CONFLICT DO NOTHING so re-running the migration after
--      a manager has tuned the values doesn't stomp their choice.
--
-- Safe to re-run. Wrapped in BEGIN/COMMIT so a partial failure
-- rolls back atomically.

BEGIN;

-- ─── 1. import_runs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz NULL,
  -- Which entity type this run targeted. Kept loose (text + CHECK)
  -- rather than an enum so adding a new entity in Phase D doesn't
  -- need a follow-up migration to extend the enum value list.
  entity_type     text NOT NULL CHECK (
    entity_type IN ('customer', 'site', 'rep', 'manager', 'shift')
  ),
  status          text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'complete', 'failed')
  ),
  total_rows      integer NOT NULL DEFAULT 0,
  created_count   integer NOT NULL DEFAULT 0,
  updated_count   integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  -- Settings the manager picked for this run. Free-shape jsonb so
  -- per-entity adapters can stash whatever they need (e.g. the
  -- user-import adapter records send_welcome_email; the shift
  -- adapter could record recurrence expansion details).
  settings_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Array of per-row failures. Shape:
  --   [{ row_index: number, original_row: object, error_code: string,
  --      error_message: string }, ...]
  -- The Result screen + "Download failures CSV" both read from here.
  errors_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_filename text NULL
);

CREATE INDEX IF NOT EXISTS import_runs_started_at_idx
  ON public.import_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS import_runs_entity_type_idx
  ON public.import_runs (entity_type, started_at DESC);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_runs_select"      ON public.import_runs;
DROP POLICY IF EXISTS "import_runs_insert"      ON public.import_runs;
DROP POLICY IF EXISTS "import_runs_update"      ON public.import_runs;
DROP POLICY IF EXISTS "import_runs_delete"      ON public.import_runs;
DROP POLICY IF EXISTS "import_runs_manager_all" ON public.import_runs;

-- Manager-only across the board. Reps have no business reading
-- import history or starting runs.
CREATE POLICY "import_runs_manager_all"
  ON public.import_runs FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- Add to the realtime publication so the Import hub's Result screen
-- + Recent Imports panel can subscribe and tick counts live as a
-- long-running import progresses. Guarded so re-runs don't error
-- ("relation already member of publication" has no IF NOT EXISTS
-- form on ALTER PUBLICATION).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'import_runs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.import_runs';
  END IF;
END $$;

-- ─── 2. geocode_status on customers + customer_sites ──────────────

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_attempted_at timestamptz NULL;

ALTER TABLE public.customer_sites
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_attempted_at timestamptz NULL;

-- Backfill so the very first cron tick doesn't try to re-geocode
-- every customer the org already has. Three buckets:
--   - already has coords → 'done' (cron skips, badge stays green)
--   - has no address to work with → 'skipped'
--   - everything else stays at the column default ('pending')
--
-- Re-run safe because we only flip rows that are still on the
-- default — explicit 'done' / 'skipped' / 'failed' aren't touched.

UPDATE public.customers
SET geocode_status = 'done', geocode_attempted_at = COALESCE(geocode_attempted_at, now())
WHERE geocode_status = 'pending'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

UPDATE public.customers
SET geocode_status = 'skipped'
WHERE geocode_status = 'pending'
  AND (address IS NULL OR length(trim(address)) = 0);

UPDATE public.customer_sites
SET geocode_status = 'done', geocode_attempted_at = COALESCE(geocode_attempted_at, now())
WHERE geocode_status = 'pending'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

UPDATE public.customer_sites
SET geocode_status = 'skipped'
WHERE geocode_status = 'pending'
  AND (address IS NULL OR length(trim(address)) = 0);

-- Partial indexes for the cron's work queue. The cron pulls 50 rows
-- per tick filtered to status = 'pending', so the index covers
-- exactly that path and stays small (most rows quickly settle into
-- 'done' or 'skipped').

CREATE INDEX IF NOT EXISTS customers_geocode_pending_idx
  ON public.customers (geocode_attempted_at NULLS FIRST)
  WHERE geocode_status = 'pending';

CREATE INDEX IF NOT EXISTS customer_sites_geocode_pending_idx
  ON public.customer_sites (geocode_attempted_at NULLS FIRST)
  WHERE geocode_status = 'pending';

-- ─── 3. app_settings seed for the import hub ──────────────────────
--
-- Both settings are overridable from /settings/import. The DO
-- NOTHING on conflict means re-running the migration after the
-- manager has changed a value won't reset their choice back to
-- the default.

INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('import.default_duplicate_mode',    '"skip"'::jsonb, now()),
  ('import.send_welcome_email_default', 'true'::jsonb,   now())
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ─── Smoke-test checklist (paste these one at a time in the SQL
--     Editor as a manager session to verify the migration landed):
--
--   ✅ SELECT * FROM import_runs LIMIT 1;                   -- table exists
--   ✅ INSERT INTO import_runs (started_by, entity_type)
--        VALUES (auth.uid(), 'customer');                   -- manager can write
--   ❌ As a rep: same INSERT should be denied by RLS.
--   ✅ SELECT key, value FROM app_settings
--        WHERE key LIKE 'import.%';                         -- two seeded rows
--   ✅ SELECT geocode_status, count(*) FROM customers
--        GROUP BY geocode_status;                           -- 'done' / 'skipped' / 'pending'
--   ✅ SELECT geocode_status, count(*) FROM customer_sites
--        GROUP BY geocode_status;                           -- same
--   ✅ EXPLAIN SELECT id FROM customers
--        WHERE geocode_status = 'pending' LIMIT 50;         -- uses partial index
