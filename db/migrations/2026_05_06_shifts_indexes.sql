-- 2026-05-06: indexes on the hot paths of `shifts` and `requested_shifts`.
--
-- Every admin dashboard load runs queries like:
--   SELECT ... FROM shifts WHERE shift_date = '...'
--   SELECT ... FROM shifts WHERE shift_date BETWEEN '...' AND '...'
--   SELECT ... FROM shifts WHERE rep_id = '...' AND shift_date = '...'
--   SELECT ... FROM shifts WHERE state IN ('in-progress','travelling',...)
--   SELECT ... FROM requested_shifts WHERE status = 'pending'
--
-- None of these had a supporting index — every query was a full table
-- scan. Fine at hundreds of rows; degrades quickly past that. Adding
-- the indexes below gives us index-only scans for the common cases.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- shifts: most common filters are by date and by (rep, date).
CREATE INDEX IF NOT EXISTS shifts_shift_date_idx
  ON public.shifts (shift_date);

CREATE INDEX IF NOT EXISTS shifts_rep_id_date_idx
  ON public.shifts (rep_id, shift_date);

-- shifts.state is filtered by sweepStaleShifts and the KPI strip
-- (in-progress count, etc). Partial index on the active states keeps
-- it tiny — most rows are 'complete' which we don't need to scan.
CREATE INDEX IF NOT EXISTS shifts_state_active_idx
  ON public.shifts (state)
  WHERE state IN ('in-progress', 'travelling', 'on-break', 'late');

CREATE INDEX IF NOT EXISTS shifts_customer_id_idx
  ON public.shifts (customer_id);

-- requested_shifts: the admin Needs-action tab and the realtime
-- subscription both filter on status='pending'.
CREATE INDEX IF NOT EXISTS requested_shifts_status_idx
  ON public.requested_shifts (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS requested_shifts_rep_id_idx
  ON public.requested_shifts (rep_id);
