-- 2026-05-27 (later): claimable shift restrictions by rep type.
--
-- Unassigned shifts (rep_id IS NULL) are "claimable" — any rep can
-- pick them up from the mobile app. Today that's strictly any-rep.
-- This migration adds an optional restriction so a manager can say
-- "this shift is claimable, but only by Sales Reps" or "by Sales
-- Reps OR Drivers".
--
-- Column: shifts.claimable_rep_types text[] NULL
--   NULL or empty array = any rep can claim (backwards compatible —
--     existing claimable shifts behave unchanged on the next deploy).
--   Non-empty array = only reps whose profiles.rep_type is in this
--     list can claim. Values are the type NAMES as stored in
--     app_settings.rep_types (e.g. ["Sales Rep","Driver"]).
--
-- The text[] approach (vs a join table) matches the existing pattern
-- where rep_type itself lives on profiles as plain text against a
-- managed-vocabulary list. Same rename-fragility trade-off: if a
-- manager renames "Sales Rep" → "Account Manager" in the vocabulary,
-- existing restrictions on "Sales Rep" become orphaned (no rep
-- matches, so the shift becomes unclaimable). Acceptable for now;
-- the vocabulary manager-side will warn before destructive renames
-- in a future polish.
--
-- Enforcement: client-side only at first (mobile filters claimable
-- shifts by the rep's own type; admin shows the restriction inline
-- on the shift detail page). Hard RLS block deferred — same posture
-- as the canCreateCustomers capability flag (May 27 morning entry).
--
-- Safe to re-run.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS claimable_rep_types text[] NULL;

COMMENT ON COLUMN public.shifts.claimable_rep_types IS
  'Optional restriction on which rep types can claim this shift. NULL or empty = any rep can claim. Non-empty = only reps whose profiles.rep_type is in this array. Values are type NAMES from app_settings.rep_types.';

COMMIT;

-- ─── Smoke test ───────────────────────────────────────────────────
--   ✅ SELECT id, rep_id, claimable_rep_types FROM shifts LIMIT 5;
--      (existing rows should have NULL — no behaviour change)
--   ✅ As a manager: UPDATE shifts
--        SET claimable_rep_types = ARRAY['Sales Rep']
--        WHERE id = '<some-claimable-shift-id>';
--   ❌ As a rep with rep_type='Merchandiser', querying
--      .from('shifts').is('rep_id', null) should still return the
--      row (RLS not tightened yet — client-side filter is the only
--      enforcement layer for now).
