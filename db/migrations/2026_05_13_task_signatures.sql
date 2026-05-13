-- 2026-05-13: signatures on tasks (Feature D — per Gary, May 13)
--
-- A task can be marked "requires signature" in admin. On mobile,
-- tapping such a task opens a signature pad — customer signs on
-- screen, rep saves, the saved signature image data-URL is stored
-- in shift_task_signatures and serves as the gating "proof" for
-- task completion (alongside photos if also required).
--
-- Why store as a base64 data-URL in `text`, not Supabase Storage:
--   - Signatures are tiny (typical: 5–20 KB base64 PNG, a few hundred
--     line strokes at most). No compression headroom worth a separate
--     bucket + RLS dance.
--   - Embedded display in the eventual customer-facing report
--     becomes a one-shot: render the data URL as <img src>. No
--     getPublicUrl() roundtrip, no signed-URL TTL to manage.
--   - One row per (shift, task), unique — so we never have the
--     "which signature is the real one" problem.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ─── 1. customer_tasks: signature requirement per task ────────────

ALTER TABLE public.customer_tasks
  ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_tasks.requires_signature IS
  'When true, the rep must capture a customer signature to complete this task. Combines with photo_count + photos_compulsory: both gates must pass when both are set. Default false so existing tasks aren''t affected.';

-- ─── 2. shift_task_signatures: one row per (shift, task) ──────────

CREATE TABLE IF NOT EXISTS public.shift_task_signatures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id    uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL REFERENCES public.customer_tasks(id) ON DELETE CASCADE,
  rep_id      uuid REFERENCES public.profiles(id),
  -- Base64 PNG data URL. Typical size: 5–20 KB for a normal
  -- handwritten signature on a ~300x150 canvas.
  signature_data_url text NOT NULL,
  -- Optional printed name of the signer (the customer). Some reps
  -- ask the signer to type their name below the pad — captures it
  -- here. Null when the rep skipped the name field.
  signer_name text,
  signed_at   timestamptz NOT NULL DEFAULT now(),
  -- One signature per (shift, task). A re-sign replaces (delete+
  -- insert) rather than accumulating, mirroring how photo slots
  -- handle re-shoots.
  UNIQUE (shift_id, task_id)
);

CREATE INDEX IF NOT EXISTS shift_task_signatures_shift_idx
  ON public.shift_task_signatures (shift_id);
CREATE INDEX IF NOT EXISTS shift_task_signatures_task_idx
  ON public.shift_task_signatures (task_id);

ALTER TABLE public.shift_task_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_task_signatures_select ON public.shift_task_signatures;
CREATE POLICY shift_task_signatures_select
  ON public.shift_task_signatures FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS shift_task_signatures_insert ON public.shift_task_signatures;
CREATE POLICY shift_task_signatures_insert
  ON public.shift_task_signatures FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS shift_task_signatures_delete ON public.shift_task_signatures;
CREATE POLICY shift_task_signatures_delete
  ON public.shift_task_signatures FOR DELETE
  TO authenticated USING (true);

-- Realtime so /active updates the "signed" pill in real time as
-- captures land (e.g. rep on a tablet, manager watching Live Ops
-- on web).
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.shift_task_signatures;

COMMIT;
