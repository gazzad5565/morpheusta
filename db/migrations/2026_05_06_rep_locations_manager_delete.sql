-- 2026-05-06: rep_locations — let managers delete any row.
--
-- Why: the orphan-cleanup pass in sweepStaleShifts() runs from the
-- admin app and tries to DELETE rep_locations rows for reps whose
-- shift is no longer active. Without this policy, RLS silently blocks
-- the DELETE (no error, just zero rows affected) and phantom green
-- dots stay on the live map forever.
--
-- The existing self-delete policy is kept so reps' clearRepLocation()
-- on check-out keeps working from the mobile app.
--
-- Phase 4 will narrow the manager check to a SECURITY DEFINER helper
-- function instead of inlining the subquery.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

DROP POLICY IF EXISTS "rep_locations_manager_delete" ON public.rep_locations;
CREATE POLICY "rep_locations_manager_delete"
  ON public.rep_locations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'manager'
    )
  );
