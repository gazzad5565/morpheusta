-- 2026-05-05: rep_locations — current GPS position for each rep.
-- One row per rep, upserted by the mobile app while a shift is active.
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.rep_locations (
  rep_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  accuracy_m  integer,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rep_locations_recorded_at_idx
  ON public.rep_locations (recorded_at DESC);

ALTER TABLE public.rep_locations ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all rep locations (admins use this for the map).
DROP POLICY IF EXISTS "rep_locations_read_all" ON public.rep_locations;
CREATE POLICY "rep_locations_read_all"
  ON public.rep_locations
  FOR SELECT
  TO authenticated
  USING (true);

-- A rep can only insert/update their own row.
DROP POLICY IF EXISTS "rep_locations_self_insert" ON public.rep_locations;
CREATE POLICY "rep_locations_self_insert"
  ON public.rep_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (rep_id = auth.uid());

DROP POLICY IF EXISTS "rep_locations_self_update" ON public.rep_locations;
CREATE POLICY "rep_locations_self_update"
  ON public.rep_locations
  FOR UPDATE
  TO authenticated
  USING (rep_id = auth.uid())
  WITH CHECK (rep_id = auth.uid());

-- Add to the realtime publication so the admin map can subscribe to live changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rep_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rep_locations';
  END IF;
END $$;
