-- 2026-05-28 (later): customer_group column on customers.
--
-- Mariska G5a — "Customers list filters: add group and region"
-- (Gary corrected the earlier misread that put region + group on
-- profiles — these are CUSTOMER attributes).
--
-- customers.region already exists (was there pre-Phase 4). This
-- migration adds the parallel customer_group column + a partial
-- index on non-NULL rows, mirroring the May 28 profiles pattern.
-- The tenant vocabulary in app_settings.groups (seeded as []
-- on the morning's migration) is re-purposed as the dropdown
-- source for this column — no new app_settings row needed.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_group text NULL;

CREATE INDEX IF NOT EXISTS customers_customer_group_idx
  ON public.customers (customer_group)
  WHERE customer_group IS NOT NULL;

COMMENT ON COLUMN public.customers.customer_group IS
  'Tenant-defined customer cohort tag (e.g. "Premium", "Spaza", "Wholesale"). NULL = unassigned. Vocabulary in app_settings.groups (May 28).';

COMMIT;

-- Smoke test:
--   ✅ SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'customers' AND column_name = 'customer_group';
--      → one row, type text.
--   ✅ SELECT indexname FROM pg_indexes
--      WHERE tablename = 'customers' AND indexname = 'customers_customer_group_idx';
--      → one row.
--   ✅ Open /settings/organisation → Customer groups tab → add "Premium".
--      Open any customer's edit page → Customer group dropdown shows "Premium".
