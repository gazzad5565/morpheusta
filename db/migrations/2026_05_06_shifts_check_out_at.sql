-- 2026-05-06: shifts.check_out_at — first-class column for the rep's
-- actual check-out timestamp.
--
-- Up to now we only had `state='complete'` to indicate the shift had
-- been checked out, with the timestamp living solely in the shift_events
-- log. The /reports/timesheet page had to query shift_events to compute
-- hours, which works but means another join. Adding a real column on
-- shifts simplifies the timesheet query and lets us compute paid hours
-- in SQL directly later.
--
-- Backfill from the events log so historical shifts get the column
-- populated rather than starting blank for everything before today.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz;

-- Backfill: take the latest checkout-flavoured event per shift and
-- copy its created_at into the column. Done once at migration time;
-- new check-outs from the mobile app will write the column directly.
WITH latest_checkout AS (
  SELECT DISTINCT ON (shift_id)
    shift_id,
    created_at
  FROM public.shift_events
  WHERE shift_id IS NOT NULL
    AND event_type IN (
      'shift.checked_out',
      'shift.checked_out_offsite',
      'shift.checked_out_early',
      'shift.auto_checked_out'
    )
  ORDER BY shift_id, created_at DESC
)
UPDATE public.shifts s
SET check_out_at = lc.created_at
FROM latest_checkout lc
WHERE s.id = lc.shift_id
  AND s.check_out_at IS NULL;
