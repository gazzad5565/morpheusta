-- Claim-radius on unassigned shifts
-- ---------------------------------
-- When a manager creates a shift without a specific rep ("Unassigned"
-- / claimable by any rep), they can now optionally restrict who sees
-- it on the mobile app to reps physically within N metres of the
-- customer's site at the time of viewing. Use case: a manager wants
-- to scope a last-minute claimable shift in Cape Town to reps already
-- in Cape Town, not the whole national team.
--
-- The new `claim_radius_m` column is:
--   - integer, nullable
--   - NULL = no radius restriction (the existing "any rep can claim"
--     behaviour — backwards-compatible default for every existing row)
--   - 1000 = 1 km radius around the shift's site
--   - 50000 = 50 km radius, etc.
--
-- Server-side, the column is informational on the DB — the mobile
-- app reads it back when it lists claimable shifts and filters
-- locally against the rep's GPS. We don't push the filter into RLS
-- because the rep's location isn't part of the auth context; the
-- mobile filter is the source of truth.
--
-- Once the rep claims the shift (rep_id flips from NULL to a real
-- user id), the claim_radius_m is ignored — the rep "owns" the
-- shift and a follow-up location move out of range doesn't auto-
-- release. Manager can release manually via the existing Reopen
-- action if needed.
--
-- An assigned shift (rep_id NOT NULL at creation) may carry
-- claim_radius_m but it has no effect — kept on the row for audit /
-- in case the shift is later released back to claimable.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS claim_radius_m integer;

-- No index needed — the column is queried only when the mobile app
-- fetches `rep_id IS NULL` rows (which is already indexed) and the
-- distance filter happens client-side.

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'shifts' AND column_name = 'claim_radius_m';
