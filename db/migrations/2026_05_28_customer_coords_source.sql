-- 2026-05-28: track WHY a customer / site has its current coordinates
-- (Mariska's B4 — option (b): GPS canonical, address as editable suggestion).
--
-- Mariska's pain: she opens a customer that a rep pinned from the
-- mobile app, sees an obviously-wrong street address ("Acme Apparel"
-- showing as "197 Bree Avenue, Pietermaritzburg") and assumes the
-- system is broken. The address IS wrong — Nominatim resolved a
-- vague name to a random plausible street — but the rep's GPS pin
-- replaced the coords with the right location. The wrong street
-- text stayed.
--
-- This migration adds one column to both `customers` and
-- `customer_sites`:
--
--   coords_source text NULL
--
-- Valid values (informal — no DB-level CHECK so values can evolve):
--   - NULL              — unknown / legacy / pre-migration
--   - 'manual'          — admin curated (typed/edited the address,
--                         which retriggers forward-geocode OR
--                         dragged the pin on the map)
--   - 'address_geocode' — the Phase E forward-geocode cron filled
--                         lat/lng from the address text (may be
--                         inaccurate for vague queries)
--   - 'rep_pinned'      — a field rep dropped a GPS pin via the
--                         /active geocode-task card. Coords are
--                         trustworthy; address text may not be.
--
-- UI uses this to render a "Pinned by rep — confirm address" chip
-- on the customer detail page so managers know which addresses are
-- known-stale. Editing the address from admin clears the flag back
-- to 'manual'.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS coords_source text NULL;

ALTER TABLE public.customer_sites
  ADD COLUMN IF NOT EXISTS coords_source text NULL;

COMMENT ON COLUMN public.customers.coords_source IS
  'NULL | manual | address_geocode | rep_pinned. Tracks why this customer has its current lat/lng so the admin can surface staleness (Mariska B4, May 28).';
COMMENT ON COLUMN public.customer_sites.coords_source IS
  'NULL | manual | address_geocode | rep_pinned. Same shape as customers.coords_source — per-site (Mariska B4, May 28).';

-- Deliberately NO backfill. Existing rows keep coords_source=NULL.
-- The chip only fires when a rep pins AFTER this migration, so
-- existing tenants see no UI change until the next real rep-pin.

COMMIT;

-- Smoke-test:
--   1. SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name IN ('customers', 'customer_sites')
--        AND column_name = 'coords_source';
--      → both rows present, type `text`.
--   2. Open a customer the rep has pinned (after the deploy) →
--      see a "Pinned by rep — confirm address" chip near the
--      address in the Overview tab.
--   3. Edit the address on that customer → chip disappears on save.
