-- Customers added by reps from the mobile app.
--
-- Until now every customers row was created by a manager via the
-- admin console. The new mobile /add-customer flow lets reps
-- create customers directly (Feature A, May 13). This column
-- records who created the row when a rep was the source — NULL
-- when a manager created it.
--
-- The admin /customers list reads this to surface a "NEW" badge
-- on rep-added rows that no manager has acknowledged yet (the
-- badge clears when the manager opens the customer's detail
-- page). The shift_events feed also surfaces these as
-- `customer.created_by_rep` rows in the Live Ops feed.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS created_by_rep_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.customers.created_by_rep_id IS
  'When non-null, the rep''s profile id who created this customer via the mobile /add-customer flow. NULL = admin-created. Used to surface NEW badges + audit feed entries.';

-- Index for the admin list filter ("show only rep-added customers")
-- and the badge-clear lookup. Partial index so we only index rows
-- where the column is non-null (the vast majority will be NULL).
CREATE INDEX IF NOT EXISTS customers_created_by_rep_id_idx
  ON public.customers (created_by_rep_id)
  WHERE created_by_rep_id IS NOT NULL;

-- Track which customers a given manager has already "seen" so the
-- NEW badge can clear per-manager. One row per (customer, manager).
-- Soft-state — fine to lose; if Supabase ever resets this the
-- badges just come back briefly until each manager re-opens each
-- new customer.
CREATE TABLE IF NOT EXISTS public.customer_seen_by_manager (
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, manager_id)
);

ALTER TABLE public.customer_seen_by_manager ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_seen_by_manager_select ON public.customer_seen_by_manager;
CREATE POLICY customer_seen_by_manager_select
  ON public.customer_seen_by_manager FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS customer_seen_by_manager_insert ON public.customer_seen_by_manager;
CREATE POLICY customer_seen_by_manager_insert
  ON public.customer_seen_by_manager FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS customer_seen_by_manager_delete ON public.customer_seen_by_manager;
CREATE POLICY customer_seen_by_manager_delete
  ON public.customer_seen_by_manager FOR DELETE
  TO authenticated USING (true);

COMMIT;
