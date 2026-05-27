-- 2026-05-27: rep types (Option C from the design discussion).
--
-- One nullable text column on profiles + an admin-managed vocabulary
-- stored as JSON in app_settings. Mirrors the library_categories
-- pattern Gary already uses (categories in app_settings, picked from
-- a managed list on user surfaces).
--
-- Each rep type has a name + a per-type capability flag. First flag
-- shipped: canCreateCustomers — drives whether the mobile app shows
-- the Add Customer affordance for that rep type. Additional flags
-- (canRequestShifts, canViewOtherReps, etc) can be added later by
-- extending the JSON shape; the settings store reader tolerates
-- missing keys (treats them as true / allow-all so legacy rows
-- don't break).
--
-- profiles.rep_type is NULL for managers AND for any rep that
-- hasn't been categorised yet. NULL = "uncategorised" = allow-all
-- on every capability (preserves existing behaviour for reps that
-- predate this migration).
--
-- Seeded vocabulary:
--   Sales Rep      — canCreateCustomers: true
--   Merchandiser   — canCreateCustomers: false
--   Driver         — canCreateCustomers: false
-- Edit at /settings/managers via the "Manage rep types" modal.
--
-- Safe to re-run: column add is guarded; vocabulary seed is
-- ON CONFLICT DO NOTHING so a manager's edits aren't stomped on
-- subsequent runs.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rep_type text NULL;

-- Optional index — only useful once a manager actually filters /reps
-- or queries by type. Partial so it's tiny: only non-NULL rows.
CREATE INDEX IF NOT EXISTS profiles_rep_type_idx
  ON public.profiles (rep_type)
  WHERE rep_type IS NOT NULL;

-- Seed the vocabulary. JSON shape:
--   [{ name: "Sales Rep", canCreateCustomers: true }, ...]
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'rep_types',
  '[
    {"name":"Sales Rep","canCreateCustomers":true},
    {"name":"Merchandiser","canCreateCustomers":false},
    {"name":"Driver","canCreateCustomers":false}
  ]'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ─── Smoke test (paste in a manager session) ─────────────────────
--   ✅ SELECT key, value FROM app_settings WHERE key = 'rep_types';
--   ✅ \d public.profiles  (should show rep_type column)
--   ✅ As a manager: UPDATE profiles SET rep_type = 'Sales Rep'
--      WHERE id = '<some-rep-uid>';
--   ✅ As a rep: same UPDATE on a different rep's row should fail
--      under Phase 4 RLS (profiles_manager_update gate).
