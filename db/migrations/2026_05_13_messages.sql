-- 2026-05-13: messaging (Feature E)
--
-- Managers compose messages to reps / other managers / everyone /
-- specific users. Two independent delivery channels per message:
--   - deliver_push   → OS push notification via web-push (Feature B's
--                      existing VAPID infra). Fires even when the app
--                      is closed. Good for urgent / time-sensitive.
--   - deliver_in_app → realtime banner inside the rep app while it's
--                      open + an inbox row. No system push. Good for
--                      FYI / non-urgent.
--   - Both can be on at once.
--
-- Scheduling: scheduled_at NULL = send_now (processed inline on
-- create). scheduled_at in the future = pending, picked up by the
-- /api/cron/messages sweep (Vercel cron, minute-tick).
--
-- Recipient materialisation: when a message is created we resolve
-- the audience into one row per recipient in message_recipients.
-- Done at compose-time (not at send-time) so audience changes between
-- compose and send (e.g. a rep gets added 2h after a scheduled
-- message was composed) DON'T retroactively change who got it.
--
-- Read state lives on message_recipients (read_at). Push state too
-- (push_sent_at, push_error). One row per recipient = one row to
-- update for each channel.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ─── 1. messages table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text NOT NULL,
  body          text NOT NULL,
  created_by    uuid REFERENCES public.profiles(id),
  -- Audience descriptor. audience_kind enumerates the major buckets;
  -- audience_user_ids is the explicit-pick list (only used when
  -- audience_kind='specific'). The audience_kind for everyone:
  --   'all'           → every profile
  --   'all_reps'      → every profile WHERE role='rep'
  --   'all_managers'  → every profile WHERE role='manager'
  --   'specific'      → just the user ids in audience_user_ids
  audience_kind  text NOT NULL CHECK (audience_kind IN (
    'all','all_reps','all_managers','specific'
  )),
  audience_user_ids uuid[] DEFAULT NULL,
  -- Delivery channels — independent. At least one must be true (CHECK).
  deliver_push    boolean NOT NULL DEFAULT true,
  deliver_in_app  boolean NOT NULL DEFAULT true,
  -- Scheduling. NULL = send now.
  scheduled_at    timestamptz,
  -- Lifecycle:
  --   'pending'   → not yet sent (scheduled OR awaiting fan-out)
  --   'sending'   → cron / API worker picked it up (advisory lock)
  --   'sent'      → fan-out complete
  --   'failed'    → fan-out errored; meta has details
  --   'cancelled' → manager cancelled before send
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sending','sent','failed','cancelled'
  )),
  sent_at         timestamptz,
  -- Free-form audit blob: errors, counts of recipients reached, etc.
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT messages_at_least_one_channel
    CHECK (deliver_push OR deliver_in_app)
);

COMMENT ON TABLE public.messages IS
  'Manager-composed messages with per-channel delivery + optional scheduling. See Feature E (2026-05-13).';

CREATE INDEX IF NOT EXISTS messages_status_scheduled_idx
  ON public.messages (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS messages_created_by_idx
  ON public.messages (created_by);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Permissive for Phase-pre-4 — tighten in the Phase 4 RLS pass.
-- Managers compose, reps read their inbox (via message_recipients
-- join, no direct access to messages.* fields outside their own
-- audience).
DROP POLICY IF EXISTS messages_select_authenticated ON public.messages;
CREATE POLICY messages_select_authenticated
  ON public.messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS messages_insert_authenticated ON public.messages;
CREATE POLICY messages_insert_authenticated
  ON public.messages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS messages_update_authenticated ON public.messages;
CREATE POLICY messages_update_authenticated
  ON public.messages FOR UPDATE
  TO authenticated USING (true);

DROP POLICY IF EXISTS messages_delete_authenticated ON public.messages;
CREATE POLICY messages_delete_authenticated
  ON public.messages FOR DELETE
  TO authenticated USING (true);

-- ─── 2. message_recipients (materialised audience + read state) ──

CREATE TABLE IF NOT EXISTS public.message_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Read state — null = unread, non-null = first-read timestamp.
  read_at       timestamptz,
  -- Per-channel delivery state.
  push_sent_at  timestamptz,
  push_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (message_id, recipient_id)
);

COMMENT ON TABLE public.message_recipients IS
  'One row per (message, recipient). Materialised at compose-time so audience changes between compose and send don''t retroactively shift who got it. Read state lives here.';

CREATE INDEX IF NOT EXISTS message_recipients_recipient_idx
  ON public.message_recipients (recipient_id, read_at);
CREATE INDEX IF NOT EXISTS message_recipients_message_idx
  ON public.message_recipients (message_id);

ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_select_authenticated ON public.message_recipients;
CREATE POLICY mr_select_authenticated
  ON public.message_recipients FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS mr_insert_authenticated ON public.message_recipients;
CREATE POLICY mr_insert_authenticated
  ON public.message_recipients FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS mr_update_authenticated ON public.message_recipients;
CREATE POLICY mr_update_authenticated
  ON public.message_recipients FOR UPDATE
  TO authenticated USING (true);

DROP POLICY IF EXISTS mr_delete_authenticated ON public.message_recipients;
CREATE POLICY mr_delete_authenticated
  ON public.message_recipients FOR DELETE
  TO authenticated USING (true);

-- Realtime for both tables so mobile inbox updates without polling +
-- admin sent/scheduled lists update across manager sessions.
--
-- ADD TABLE isn't natively idempotent — Postgres returns 42710
-- "relation X is already member of publication Y" on re-run, which
-- aborts the surrounding transaction. Wrap each in a guard so a
-- second run is a clean no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_recipients;
  END IF;
END $$;

COMMIT;
