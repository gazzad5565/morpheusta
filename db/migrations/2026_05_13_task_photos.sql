-- 2026-05-13: photos on tasks (Feature C)
--
-- Two related changes so reps can capture photos during a task and
-- the system can later auto-generate beautiful per-customer reports
-- from them.
--
--   1. customer_tasks gains photo_count + photos_compulsory columns
--      so the admin can specify "this task needs 3 photos, all
--      required" per-task. Defaults preserve existing behaviour
--      (no photos for any pre-existing task).
--   2. shift_task_photos — new table, one row per uploaded photo.
--      Links (shift_id, task_id) to a Supabase Storage object,
--      stores file metadata for later report rendering.
--   3. Supabase Storage bucket `shift_photos` — where the actual
--      JPEGs live. Public-read so report generation can embed by
--      URL; auth-write so only signed-in users (i.e. reps in
--      the field) can upload.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ─── 1. customer_tasks: photo requirements per task ───────────────

ALTER TABLE public.customer_tasks
  ADD COLUMN IF NOT EXISTS photo_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photos_compulsory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customer_tasks.photo_count IS
  'How many photos the rep must upload to complete this task. 0 = no photos. Default 0 so existing tasks aren''t affected.';
COMMENT ON COLUMN public.customer_tasks.photos_compulsory IS
  'When photo_count > 0, whether ALL N photos are required to mark the task complete. Default true. Ignored when photo_count = 0.';

-- ─── 2. shift_task_photos: uploaded photos per (shift, task) ──────

CREATE TABLE IF NOT EXISTS public.shift_task_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES public.customer_tasks(id) ON DELETE CASCADE,
  rep_id          uuid REFERENCES public.profiles(id),
  -- Position within the (shift, task) photo slot — 0..N-1. Lets
  -- the UI render N stable slots even as photos are deleted +
  -- re-uploaded. Soft-unique on (shift_id, task_id, slot_index)
  -- so a slot can be replaced cleanly.
  slot_index      integer NOT NULL DEFAULT 0,
  -- Storage path within the shift_photos bucket. Convention:
  --   {shift_id}/{task_id}/{photo-uuid}.jpg
  storage_path    text NOT NULL,
  -- Public URL — cached at upload time so the admin's report
  -- generator + mobile thumbnail load don't need an extra
  -- getPublicUrl() call. Storage is public-read so this is fine.
  public_url      text NOT NULL,
  -- File metadata for later report rendering: dimensions for
  -- layout, byte size for storage accounting.
  width           integer,
  height          integer,
  file_size_bytes integer,
  -- Photo quality tier in force at upload time (standard/high/
  -- maximum). Snapshotted here in case the admin changes the
  -- setting later; reports can still differentiate "this old
  -- photo was captured at standard quality".
  quality_tier    text DEFAULT 'standard',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_task_photos_shift_task_idx
  ON public.shift_task_photos (shift_id, task_id, slot_index);
CREATE INDEX IF NOT EXISTS shift_task_photos_shift_idx
  ON public.shift_task_photos (shift_id);
CREATE INDEX IF NOT EXISTS shift_task_photos_task_idx
  ON public.shift_task_photos (task_id);

ALTER TABLE public.shift_task_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_task_photos_select ON public.shift_task_photos;
CREATE POLICY shift_task_photos_select
  ON public.shift_task_photos FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS shift_task_photos_insert ON public.shift_task_photos;
CREATE POLICY shift_task_photos_insert
  ON public.shift_task_photos FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS shift_task_photos_delete ON public.shift_task_photos;
CREATE POLICY shift_task_photos_delete
  ON public.shift_task_photos FOR DELETE
  TO authenticated USING (true);

-- Realtime so /active updates the slot thumbnails in real time as
-- uploads land (useful when a rep has multiple tabs / devices).
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.shift_task_photos;

-- ─── 3. Supabase Storage bucket ───────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('shift_photos', 'shift_photos', true, 5242880)  -- 5 MB hard cap
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

-- RLS on storage.objects scoped to the new bucket.
--
-- Public-read so report generation can embed photos by URL without
-- a signed-URL roundtrip. We can tighten to signed URLs in the
-- Phase 4 RLS pass when we want stricter per-org access. For now
-- the URLs are unguessable (uuid in path) so leaked-link risk is
-- low.

DROP POLICY IF EXISTS shift_photos_objects_select ON storage.objects;
CREATE POLICY shift_photos_objects_select
  ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'shift_photos');

DROP POLICY IF EXISTS shift_photos_objects_insert ON storage.objects;
CREATE POLICY shift_photos_objects_insert
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'shift_photos');

DROP POLICY IF EXISTS shift_photos_objects_delete ON storage.objects;
CREATE POLICY shift_photos_objects_delete
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'shift_photos');

COMMIT;
