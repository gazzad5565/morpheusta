-- 2026-05-05: customers gets a geofence_radius_m column.
-- Default: 100 metres. Used by the Address tab on /customers/[id] to
-- draw a check-in circle on the map.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer NOT NULL DEFAULT 100;
