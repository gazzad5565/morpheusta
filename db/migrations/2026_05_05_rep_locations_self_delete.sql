-- 2026-05-05: rep_locations — allow a rep to delete their own row.
-- Used by the mobile app on check-out so the admin map's green dot
-- disappears immediately instead of lingering as "stale" for 5 minutes.
-- Run once in Supabase → SQL Editor. Safe to re-run.

DROP POLICY IF EXISTS "rep_locations_self_delete" ON public.rep_locations;
CREATE POLICY "rep_locations_self_delete"
  ON public.rep_locations
  FOR DELETE
  TO authenticated
  USING (rep_id = auth.uid());
