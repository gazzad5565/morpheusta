-- 2026-05-28 (later): drop the wrongly-added profiles.region and
-- profiles.group_name columns.
--
-- Background: the morning's 2026_05_28_profiles_region_group_hire_date.sql
-- migration was based on a misread of Mariska's G2 feedback ("user
-- profile fields: region, group, hire_date"). Gary corrected the
-- semantics same day:
--
--   - Region and Group are CUSTOMER attributes, not user attributes
--     (a customer is in a region; a customer belongs to a group).
--     A rep operates IN a region via their customer assignments, not
--     by having their own region tag.
--   - Hire date is a USER attribute (when the rep/manager joined the
--     field workforce). That column stays.
--
-- This migration drops the two columns + their indexes. The shared
-- vocabularies in app_settings.regions / app_settings.groups are
-- KEPT — they're re-purposed for customers (customers.region already
-- existed; customers.customer_group is added in the next migration
-- alongside the customer-side wiring).
--
-- Safe to re-run.

BEGIN;

DROP INDEX IF EXISTS public.profiles_region_idx;
DROP INDEX IF EXISTS public.profiles_group_name_idx;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS region;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS group_name;

COMMIT;

-- Smoke test:
--   ✅ SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'profiles'
--        AND column_name IN ('region','group_name');
--      → 0 rows (both gone).
--   ✅ SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'profiles' AND column_name = 'hire_date';
--      → 1 row (correctly retained).
--   ✅ SELECT key FROM app_settings WHERE key IN ('regions','groups');
--      → 2 rows (vocabularies preserved for customer-side reuse).
