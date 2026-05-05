-- 2026-05-05: library — shared file storage for the team.
-- Admin uploads files (planograms, SOPs, brand guides, etc); reps view
-- them on their phone via signed URLs.
--
-- Storage:
--   - Bucket "library" (private; signed URLs for downloads).
--
-- Metadata:
--   - public.library_files: one row per uploaded file with friendly name,
--     storage path, customer association (optional), uploader, timestamp.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- ─── Storage bucket ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('library', 'library', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: any authenticated user can read/upload/delete in the
-- "library" bucket. Phase 4 will narrow uploads/deletes to manager role.
DROP POLICY IF EXISTS "library_storage_read" ON storage.objects;
CREATE POLICY "library_storage_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'library');

DROP POLICY IF EXISTS "library_storage_insert" ON storage.objects;
CREATE POLICY "library_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'library');

DROP POLICY IF EXISTS "library_storage_delete" ON storage.objects;
CREATE POLICY "library_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'library');

-- ─── Metadata table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.library_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  storage_path  text NOT NULL UNIQUE,
  size_bytes    bigint,
  mime_type     text,
  customer_id   text REFERENCES public.customers(id) ON DELETE SET NULL,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS library_files_uploaded_at_idx
  ON public.library_files (uploaded_at DESC);

CREATE INDEX IF NOT EXISTS library_files_customer_idx
  ON public.library_files (customer_id);

ALTER TABLE public.library_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library_files_select" ON public.library_files;
CREATE POLICY "library_files_select"
  ON public.library_files FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "library_files_insert" ON public.library_files;
CREATE POLICY "library_files_insert"
  ON public.library_files FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "library_files_delete" ON public.library_files;
CREATE POLICY "library_files_delete"
  ON public.library_files FOR DELETE
  TO authenticated USING (true);
