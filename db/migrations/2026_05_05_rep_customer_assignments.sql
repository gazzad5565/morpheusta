-- 2026-05-05: rep_customer_assignments — many-to-many between reps and customers.
-- Each row says "rep X is assigned to customer Y." A rep can have many
-- customers; a customer can have many reps. Both /reps/[id] and
-- /customers/[id] show + edit this from their respective sides.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.rep_customer_assignments (
  rep_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rep_id, customer_id)
);

CREATE INDEX IF NOT EXISTS rca_rep_idx
  ON public.rep_customer_assignments (rep_id);
CREATE INDEX IF NOT EXISTS rca_customer_idx
  ON public.rep_customer_assignments (customer_id);

ALTER TABLE public.rep_customer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rca_select" ON public.rep_customer_assignments;
CREATE POLICY "rca_select"
  ON public.rep_customer_assignments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rca_insert" ON public.rep_customer_assignments;
CREATE POLICY "rca_insert"
  ON public.rep_customer_assignments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rca_delete" ON public.rep_customer_assignments;
CREATE POLICY "rca_delete"
  ON public.rep_customer_assignments FOR DELETE
  TO authenticated USING (true);
