-- 2026-05-06: shift_task_completions — record which customer_tasks the
-- rep ticked off during a specific shift. Closes the loop between
-- "shifts.tasks_done = 5 of 7" (just a count) and "the manager wants to
-- know *which* 5".
--
-- One row per (shift, task) pair. Ticking re-inserts (idempotent via
-- ON CONFLICT in the app), unticking deletes the row. Cascades on shift
-- delete and task delete so we don't accumulate orphans.
--
-- Phase 3 stays "any authenticated" until Phase 4 RLS-by-role.
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.shift_task_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id     uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES public.customer_tasks(id) ON DELETE CASCADE,
  rep_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_task_completions_unique UNIQUE (shift_id, task_id)
);

CREATE INDEX IF NOT EXISTS shift_task_completions_shift_idx
  ON public.shift_task_completions (shift_id);
CREATE INDEX IF NOT EXISTS shift_task_completions_task_idx
  ON public.shift_task_completions (task_id);

ALTER TABLE public.shift_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_task_completions_select" ON public.shift_task_completions;
CREATE POLICY "shift_task_completions_select"
  ON public.shift_task_completions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shift_task_completions_insert" ON public.shift_task_completions;
CREATE POLICY "shift_task_completions_insert"
  ON public.shift_task_completions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "shift_task_completions_delete" ON public.shift_task_completions;
CREATE POLICY "shift_task_completions_delete"
  ON public.shift_task_completions
  FOR DELETE TO authenticated USING (true);
