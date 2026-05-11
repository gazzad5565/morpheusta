-- Customer logos
-- --------------
-- Adds a `logo_url` text column to customers so managers can upload a
-- small logo per customer. The mobile rep app renders this in place of
-- the coloured-initials tile on shift cards, the dashboard map pin
-- popover, and the route page step badges so customer branding is
-- visible at a glance.
--
-- Storage choice mirrors profile avatars (see 2026_05_11_profile_avatars.sql):
-- base64 data URL directly in a `text` column. Logos are compressed
-- client-side to ~96x96 JPEG (typically 5-15 KB) so they fit
-- comfortably in a row, and there's no Supabase Storage bucket /
-- policy setup needed to deploy this. The mobile app sends LOTS of
-- customer rows down on cold start; keeping each logo tight is the
-- whole point of the compression step.
--
-- Existing customers get NULL — the initials-tile fallback remains so
-- nothing visually breaks until a manager actively uploads a logo.
--
-- RLS: customers already allows managers to UPDATE their org's rows.
-- No policy change needed.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='customers' AND column_name='logo_url';
