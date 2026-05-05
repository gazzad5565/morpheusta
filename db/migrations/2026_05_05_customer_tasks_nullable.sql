-- 2026-05-05: customer_tasks.customer_id is now nullable.
-- A NULL customer_id means "this task applies to ALL customers" — the
-- universal task. Mobile reads tasks for a shift by combining the
-- shift's customer_id matches AND the universal (null) tasks.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.customer_tasks
  ALTER COLUMN customer_id DROP NOT NULL;
