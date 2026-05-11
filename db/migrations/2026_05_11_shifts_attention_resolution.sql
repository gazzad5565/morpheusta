-- 2026-05-11 (follow-up): persist the resolution outcome.
--
-- Stage 2B let the manager pick one of four actions on an open
-- attention overlay (reassign / release / acknowledge / cancel) and
-- cleared the overlay on success. Stage 2B.1: we now also record
-- WHICH action was taken, so the rep's mobile app can show a brief
-- feedback pill explaining what happened to their flagged shift.
--
-- Specifically: when the manager "acknowledges" the rep STAYS on the
-- shift (assignment + state untouched). Without a resolution marker
-- the rep just sees their flag silently disappear and the check-in
-- button reappear — they have no idea what their manager did. The
-- new column lets us show "Manager confirmed — you're still on
-- this shift" for a few hours after resolution.
--
-- Values:
--   'reassigned'  → manager picked a new rep (original rep no longer
--                   sees the row anyway, so this is mostly for audit)
--   'released'    → became claimable; original rep no longer sees it
--   'acknowledged'→ no change to rep_id/state; rep still on the shift
--   'cancelled'   → state := 'cancelled'; rep no longer sees it
--   'withdrawn'   → rep withdrew their flag themselves
--
-- All five also fire a `shift_events` row of the matching type. The
-- column lives on shifts so the mobile app doesn't have to query the
-- events log just to render a status pill on a row.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS attention_resolution text;

COMMIT;
