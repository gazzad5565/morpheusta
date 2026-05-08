-- 2026-05-08 (follow-up): rename auto-seeded "Main" sites to "Head office".
--
-- The earlier customer_sites migration seeded each customer with a
-- site named "Main". Product feedback: the term we actually use is
-- "head office" — the customer's primary address, with optional
-- additional sites for satellite locations.
--
-- This rename is purely cosmetic (display + the "show site only when
-- name != head office" heuristic that hides the label for single-site
-- customers). Idempotent: only renames rows that are still literally
-- "Main", so a customer who explicitly named a site "Main" later
-- isn't touched by accident.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.

BEGIN;

UPDATE public.customer_sites
SET name = 'Head office'
WHERE name = 'Main';

COMMIT;
