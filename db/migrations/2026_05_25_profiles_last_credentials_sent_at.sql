-- 2026-05-25: track when a user was last emailed their credentials.
--
-- Single nullable timestamptz column on profiles, written by the
-- /api/users/[id]/send-credentials route after a successful Resend
-- delivery. Read by the "Email this user" modal on the manager edit
-- page + the rep detail page so the manager can see "Last sent: 3
-- minutes ago" before deciding whether to resend.
--
-- No RLS changes — profiles already allows manager UPDATE under the
-- Phase 4 is_manager() policy. Reps can self-update their own row but
-- have no UI exposing this column.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_credentials_sent_at timestamptz NULL;

COMMIT;
