-- 2026-05-05: library_files goes from single customer_id to a multi-customer array.
-- NULL or empty array = "shared with all"; populated = the file applies to those customers.
-- Existing single-customer rows are migrated into the array.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.library_files
  ADD COLUMN IF NOT EXISTS customer_ids text[];

-- Migrate existing single customer_id values into the array.
UPDATE public.library_files
  SET customer_ids = ARRAY[customer_id]
  WHERE customer_id IS NOT NULL
    AND (customer_ids IS NULL OR cardinality(customer_ids) = 0);

-- Drop the old single-customer column once migration is done.
ALTER TABLE public.library_files DROP COLUMN IF EXISTS customer_id;

-- Drop the old single-column index too (if it lingers).
DROP INDEX IF EXISTS public.library_files_customer_idx;

-- GIN index so contains-checks (customer_ids @> ARRAY[id]) are fast.
CREATE INDEX IF NOT EXISTS library_files_customer_ids_gin
  ON public.library_files USING gin (customer_ids);
