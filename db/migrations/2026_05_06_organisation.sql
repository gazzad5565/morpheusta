-- 2026-05-06: organisation settings — name + logo.
--
-- The organisation has one row's worth of settings; we reuse the
-- existing app_settings key/value table rather than a dedicated table
-- (single tenant, two values).
--
-- Logos live in a public Storage bucket (`org_assets`) so the admin
-- console can `<img src=PUBLIC_URL>` them without a signed URL roundtrip.
-- They're not sensitive — a brand mark is fine to be world-readable.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- 1. Seed the two app_settings keys (no-op if already present).
INSERT INTO public.app_settings (key, value)
VALUES
  ('organisation_name', '""'::jsonb),
  ('organisation_logo_url', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Create the public Storage bucket for the org logo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org_assets', 'org_assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Storage policies for the org_assets bucket.
--    Phase 3: any authenticated user can upload / replace / delete.
--    Phase 4 will narrow these to manager-only.
DROP POLICY IF EXISTS "org_assets_authed_select" ON storage.objects;
CREATE POLICY "org_assets_authed_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'org_assets');

DROP POLICY IF EXISTS "org_assets_authed_insert" ON storage.objects;
CREATE POLICY "org_assets_authed_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org_assets');

DROP POLICY IF EXISTS "org_assets_authed_update" ON storage.objects;
CREATE POLICY "org_assets_authed_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org_assets')
  WITH CHECK (bucket_id = 'org_assets');

DROP POLICY IF EXISTS "org_assets_authed_delete" ON storage.objects;
CREATE POLICY "org_assets_authed_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'org_assets');
