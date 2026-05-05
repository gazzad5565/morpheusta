-- 2026-05-05: add address + geo coordinates to customers
-- Run this once in Supabase → SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS latitude   double precision,
  ADD COLUMN IF NOT EXISTS longitude  double precision;

CREATE INDEX IF NOT EXISTS customers_lat_lng_idx
  ON public.customers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
