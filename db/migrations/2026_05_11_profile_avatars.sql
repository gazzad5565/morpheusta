-- Profile avatars
-- ---------------
-- Adds a single `avatar_url` text column to profiles so reps can
-- upload a small profile photo from the mobile app and have it show
-- up across the admin (rep list, rep detail, live-ops map markers)
-- and on the mobile dashboard.
--
-- We store the avatar as a base64 data URL directly in this column
-- rather than going through Supabase Storage. Two reasons:
--   1. Avatars are tiny (the mobile app compresses to ~96x96 JPEG,
--      typically 5-15 KB encoded). A `text` column holds that fine.
--   2. No bucket / policy setup needed — works the moment this
--      migration runs. Storage can be a follow-up if avatars ever
--      grow past the few-KB scale.
--
-- Existing rows get NULL (no avatar). The Glyph fallback shows the
-- generic "face" icon for those reps until they upload one.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- No RLS change needed — profiles already allows each user to UPDATE
-- their own row (id = auth.uid()), which is the only path that
-- writes avatar_url from the mobile app.

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='profiles' AND column_name='avatar_url';
