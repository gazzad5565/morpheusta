-- 2026-05-05: shift_events — central immutable activity log.
-- Every meaningful action (shift scheduled / claimed / checked-in /
-- checked-out, request submitted / scheduled / declined, customer
-- created / deactivated, library upload, etc) writes a row here. The
-- admin Live Feed "All activity" tab streams this in real time.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.shift_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,        -- e.g. 'shift.scheduled', 'shift.checked_in'
  actor_id    uuid NULL,            -- the user who did this (auth.users.id); NULL = system
  actor_label text NULL,            -- display name snapshotted at event time
  shift_id    uuid NULL REFERENCES public.shifts(id) ON DELETE SET NULL,
  customer_id text NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  message     text NULL,            -- pre-rendered display string (the feed shows this)
  meta        jsonb NULL,           -- arbitrary extras (off-site distance, late mins, etc)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_events_created_idx
  ON public.shift_events (created_at DESC);
CREATE INDEX IF NOT EXISTS shift_events_type_idx
  ON public.shift_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_events_actor_idx
  ON public.shift_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_events_customer_idx
  ON public.shift_events (customer_id, created_at DESC);

ALTER TABLE public.shift_events ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the log.
DROP POLICY IF EXISTS "shift_events_select" ON public.shift_events;
CREATE POLICY "shift_events_select"
  ON public.shift_events FOR SELECT
  TO authenticated USING (true);

-- Any authenticated user can insert (mobile app + admin both write to it).
DROP POLICY IF EXISTS "shift_events_insert" ON public.shift_events;
CREATE POLICY "shift_events_insert"
  ON public.shift_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- Events are immutable: no UPDATE policy, and DELETE only for now (so an
-- admin can clean test data; tighten in Phase 4 if you want a true
-- append-only log).
DROP POLICY IF EXISTS "shift_events_delete" ON public.shift_events;
CREATE POLICY "shift_events_delete"
  ON public.shift_events FOR DELETE
  TO authenticated USING (true);

-- Add to the supabase_realtime publication so the admin Live Feed can
-- subscribe to inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shift_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_events';
  END IF;
END $$;
