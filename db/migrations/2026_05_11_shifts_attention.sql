-- 2026-05-11: shifts "attention" overlay — the operational signal
-- behind cancellation / unable-to-attend / no-show / reassignment-
-- needed. Drives a Live Ops "Needs action" queue without expanding
-- the shifts state machine.
--
-- Why an overlay column instead of new states:
--   Adding `unable_to_attend` to shifts.state would cascade through
--   every state-aware switch in the codebase (calendar tints, Live
--   Ops tabs, mobile filters, reports, sweep job, etc). The state
--   machine stays untouched; the attention flag is what drives the
--   action queue. Same pattern will later carry `no_show` (sweep
--   stamps it when a shift starts with no check-in) and other
--   classes of "this needs a manager to look at it" without further
--   schema churn.
--
-- Lifecycle:
--   - Rep raises "I can't make it" on mobile → attention =
--     'unable_to_attend', attention_reason chip, optional note,
--     attention_raised_at = now().
--   - Manager acts in Live Ops → attention_resolved_at = now(),
--     attention_resolved_by = manager.id. Reassign clears the
--     overlay (the new rep should start clean); Release leaves
--     rep_id null + clears overlay (claimable); Acknowledge keeps
--     the row but resolves it; Cancel flips shifts.state =
--     'cancelled' and resolves.
--
-- Run once in Supabase. Idempotent.

BEGIN;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS attention             text,
  ADD COLUMN IF NOT EXISTS attention_reason      text,
  ADD COLUMN IF NOT EXISTS attention_note        text,
  ADD COLUMN IF NOT EXISTS attention_raised_at   timestamptz,
  ADD COLUMN IF NOT EXISTS attention_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS attention_resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index for the "Needs action" queue query:
--   select … where attention is not null and attention_resolved_at is null
-- Sorted by raised_at desc so the freshest issues bubble to the top.
CREATE INDEX IF NOT EXISTS shifts_attention_open_idx
  ON public.shifts (attention_raised_at DESC)
  WHERE attention IS NOT NULL AND attention_resolved_at IS NULL;

COMMIT;
