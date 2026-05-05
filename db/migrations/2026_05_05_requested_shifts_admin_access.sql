-- 2026-05-05: requested_shifts — let any authenticated user (i.e. an admin)
-- read, update, and delete rows. Phase 3 stays "any authenticated" until
-- Phase 4 RLS-by-role. Without this the admin Requests inbox sees zero
-- rows because the original SELECT policy was rep_id = auth.uid().
--
-- These new policies are permissive (the default), so they OR with any
-- existing self-only policies — adding USING(true) effectively opens
-- access regardless of the older restrictive policies.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

DROP POLICY IF EXISTS "requested_shifts_admin_select" ON public.requested_shifts;
CREATE POLICY "requested_shifts_admin_select"
  ON public.requested_shifts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "requested_shifts_admin_update" ON public.requested_shifts;
CREATE POLICY "requested_shifts_admin_update"
  ON public.requested_shifts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "requested_shifts_admin_delete" ON public.requested_shifts;
CREATE POLICY "requested_shifts_admin_delete"
  ON public.requested_shifts
  FOR DELETE
  TO authenticated
  USING (true);
