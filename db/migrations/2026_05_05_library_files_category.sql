-- 2026-05-05: library_files gets a category column + UPDATE policy.
-- Lets admin tag files (Documents / Photos / Training / Forms / Reference /
-- Other), filter on mobile by category, and edit name/category/customer.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- ─── New column ────────────────────────────────────────────────────────
ALTER TABLE public.library_files
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.library_files
  SET category = 'Documents'
  WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS library_files_category_idx
  ON public.library_files (category);

-- ─── Allow UPDATE so the admin edit page can save changes ──────────────
DROP POLICY IF EXISTS "library_files_update" ON public.library_files;
CREATE POLICY "library_files_update"
  ON public.library_files FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
