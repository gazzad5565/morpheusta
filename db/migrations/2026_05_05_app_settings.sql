-- 2026-05-05: app_settings — small key/value table for org-wide
-- configurable rules. First use: late_grace_minutes (how late a rep
-- can be before a "late check-in" exception is triggered).
--
-- Seeds the row for the late grace period at 10 minutes if absent.
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
  VALUES ('late_grace_minutes', '10'::jsonb)
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value)
  VALUES ('early_grace_minutes', '15'::jsonb)
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (mobile reps need the grace period).
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
CREATE POLICY "app_settings_select"
  ON public.app_settings FOR SELECT
  TO authenticated USING (true);

-- Phase 3: any authenticated user can update. Phase 4 will narrow to
-- managers only.
DROP POLICY IF EXISTS "app_settings_upsert" ON public.app_settings;
CREATE POLICY "app_settings_upsert"
  ON public.app_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
