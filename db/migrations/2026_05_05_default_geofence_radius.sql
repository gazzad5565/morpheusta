-- 2026-05-05: organization-wide default geofence radius.
-- New customers can use this as their starting radius if no per-customer
-- override is set. Stored alongside the late/early grace settings.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

INSERT INTO public.app_settings (key, value)
  VALUES ('default_geofence_radius_m', '100'::jsonb)
  ON CONFLICT (key) DO NOTHING;
