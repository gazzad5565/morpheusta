-- 2026-05-05: requested_shifts — enable Realtime so the Live Feed
-- "Requests" tab updates the moment a rep taps "Request a customer" on
-- their phone, and clears immediately when the admin schedules/declines.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'requested_shifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.requested_shifts';
  END IF;
END $$;
