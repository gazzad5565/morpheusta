-- Exception toggles
-- -----------------
-- Adds per-customer overrides for the two kinds of check-in exception
-- that the mobile app surfaces:
--
--   1. Location exceptions — rep is off-site (outside the customer's
--      geofence radius). Today: always fires.
--   2. Timing exceptions — rep is late (past start + grace) or early
--      (before start - grace). Today: always fires.
--
-- The org-wide on/off pair already covers the simple case (set once,
-- applies to every customer). These per-customer columns let a
-- manager override the org default for a specific customer — useful
-- when one site is famously hard to GPS-locate (multi-level retail,
-- underground parking) or when a customer specifically asks for no
-- timing alerts on their shifts.
--
-- Semantics:
--   NULL  → inherit the org-wide setting (default)
--   TRUE  → exceptions enabled for this customer regardless of org default
--   FALSE → exceptions disabled for this customer regardless of org default
--
-- The org-wide pair is stored in `app_settings`:
--   key='location_exceptions_enabled'  value=boolean (default true)
--   key='timing_exceptions_enabled'    value=boolean (default true)
--
-- Both default ON so an existing install behaves exactly the same as
-- before this migration runs.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS location_exceptions_enabled boolean,
  ADD COLUMN IF NOT EXISTS timing_exceptions_enabled   boolean;

-- Comments — Postgres carries these into information_schema so any
-- future tooling (db editors, generators) sees the inherit semantics.
COMMENT ON COLUMN public.customers.location_exceptions_enabled IS
  'Per-customer override for off-site/geofence check-in exceptions. NULL = inherit app_settings.location_exceptions_enabled.';
COMMENT ON COLUMN public.customers.timing_exceptions_enabled IS
  'Per-customer override for late/early timing check-in exceptions. NULL = inherit app_settings.timing_exceptions_enabled.';

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='customers'
--       AND column_name IN ('location_exceptions_enabled','timing_exceptions_enabled');
