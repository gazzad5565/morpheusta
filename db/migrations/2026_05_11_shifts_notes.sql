-- 2026-05-11 (follow-up): rep notes on a shift.
--
-- Reps need a place to drop a freeform note tied to a specific
-- shift — "customer paid cash, no receipt", "fridge in back room
-- was off when I arrived", "tasks went over because till queue
-- was backed up", etc. The note travels with the shift so admins
-- looking at /shifts/[id] later can see exactly what happened.
--
-- One free-text column on shifts. Single note per shift (the rep
-- can edit it freely during the shift); kept simple deliberately
-- because most field jobs only need one note's worth of context.
-- If multi-note history ever becomes a real ask, that's a separate
-- shift_notes table — but YAGNI for now.
--
-- Run once in Supabase. Idempotent.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS rep_notes text;

COMMIT;
