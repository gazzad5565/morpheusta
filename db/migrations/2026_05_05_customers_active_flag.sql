-- 2026-05-05: add `active` flag to customers (soft-delete pattern)
-- Run once in Supabase → SQL Editor. Safe to re-run.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS customers_active_idx
  ON public.customers (active);
