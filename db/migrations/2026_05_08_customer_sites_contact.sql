-- 2026-05-08 (follow-up): per-site contact details.
--
-- Each site can have its own contact person, phone, email, and free
-- text access notes. Multi-site customers have different people on
-- the ground at each location, and reps need a tap-to-call number
-- when they're travelling, can't find the back entrance, or are
-- running late.
--
-- All four columns are nullable — sites without explicit contact info
-- just hide the contact row in the UI. The backfill from the earlier
-- 2026_05_08_customer_sites migration created head-office sites with
-- only address/coords; no synthetic contact data is added by this
-- migration (managers fill it in themselves).
--
-- Run once in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.customer_sites
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS notes         text;

COMMIT;
