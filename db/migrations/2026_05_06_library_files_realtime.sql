-- 2026-05-06: library_files — enable Realtime so the mobile /library
-- screen updates live as managers upload / delete files.
--
-- The mobile app's subscribeLibrary() opens a postgres_changes channel
-- on this table. Without the table in the supabase_realtime publication
-- the channel succeeds (no error returned to the client) but no events
-- ever fire. Symptom: rep sees nothing live, but it looks like
-- everything's wired up.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'library_files'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.library_files';
  END IF;
END $$;
