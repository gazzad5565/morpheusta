-- 2026-05-05: customer_tasks — task templates per customer.
-- Admin defines tasks for each customer; rep sees those tasks during
-- the shift on /active.
--
-- Phase 3 stays "any authenticated" until Phase 4 RLS-by-role.
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.customer_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  duration_min integer DEFAULT 10,
  compulsory   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_tasks_customer_idx
  ON public.customer_tasks (customer_id, sort_order);

ALTER TABLE public.customer_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_tasks_select" ON public.customer_tasks;
CREATE POLICY "customer_tasks_select"
  ON public.customer_tasks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "customer_tasks_insert" ON public.customer_tasks;
CREATE POLICY "customer_tasks_insert"
  ON public.customer_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "customer_tasks_update" ON public.customer_tasks;
CREATE POLICY "customer_tasks_update"
  ON public.customer_tasks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "customer_tasks_delete" ON public.customer_tasks;
CREATE POLICY "customer_tasks_delete"
  ON public.customer_tasks
  FOR DELETE
  TO authenticated
  USING (true);
