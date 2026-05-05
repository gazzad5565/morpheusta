-- 2026-05-05: shifts — enable Realtime so the admin Live Ops board can
-- subscribe to state changes (check-in → in-progress, check-out → complete,
-- new shift created by manager, rep claims an unassigned shift, etc).
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts';
  END IF;
END $$;
