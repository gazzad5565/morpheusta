-- Flexible-time shifts
-- --------------------
-- A manager creating a shift can now say "anytime during the day"
-- instead of a specific start / end. Use case: a flexible drop-in
-- visit where the rep can show up whenever during the workday.
--
-- We keep start_time / end_time in the row (so legacy code paths,
-- the calendar, the timesheet etc all still see a window) but
-- set them to the org's workday bounds (currently hardcoded
-- 06:00–20:00 in the admin /schedule/new form). The new
-- is_flexible_time flag tells consumers to display the shift as
-- "Anytime today" rather than the bare time range.
--
-- Late / early exception logic on the mobile app reads the flag
-- and skips the "X min late" / "early" comparisons entirely when
-- it's true — flexible shifts have no scheduled-start to be late
-- against.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_flexible_time boolean NOT NULL DEFAULT false;

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'shifts' AND column_name = 'is_flexible_time';
