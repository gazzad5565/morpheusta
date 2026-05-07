-- 2026-05-07: extend custom_fields.applies_to to allow 'organisation'.
--
-- Lets a manager attach their own arbitrary fields to the company
-- record itself (industry, ABN/ACN, default working hours, anything).
-- Single-tenant for now, so we'll use the literal entity_id
-- 'organisation' for every value row.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.custom_fields
  DROP CONSTRAINT IF EXISTS custom_fields_applies_to_check;

ALTER TABLE public.custom_fields
  ADD CONSTRAINT custom_fields_applies_to_check
  CHECK (
    applies_to IN (
      'customer',
      'rep',
      'shift',
      'task',
      'library_file',
      'organisation'
    )
  );
