-- 2026-05-28: manager types + capabilities (light-touch RBAC v1).
--
-- Parallel to the May 27 rep_types pattern. Adds:
--   1. profiles.manager_type text NULL — assigned via the new
--      /settings/roles page. NULL = "unrestricted" (lenient default;
--      preserves behaviour for every existing manager on this
--      migration's first run — no one gets locked out).
--   2. Seeded vocabulary in app_settings.manager_types with three
--      starter types:
--        Owner       — canManageSettings: true,  canScheduleShifts: true
--        Operations  — canManageSettings: false, canScheduleShifts: true
--        View only   — canManageSettings: false, canScheduleShifts: false
--
-- Capability semantics (v1 — small on purpose, expand later):
--   canManageSettings  — gates the entire /settings/* rail incl.
--                        /settings/roles itself, organisation,
--                        check-in rules, custom fields, notifications,
--                        bulk imports, the user CRUD page at
--                        /settings/managers, and the messaging /
--                        billing settings.
--   canScheduleShifts  — gates /schedule/new, the schedule drag-drop
--                        save path, /shifts/[id]/edit save, and the
--                        request-approval queue.
--
-- Everything else (customers + sites + tasks + library + Live Ops
-- view) stays un-gated for v1.
--
-- Lenient default-allow at every check site: NULL manager_type OR
-- a manager_type that no longer exists in the vocab → returns true
-- for every capability. Matches the canCreateCustomers convention
-- (see DESIGN.md §12). Hard RLS gating is deferred and called out
-- loudly in the SESSIONS entry.
--
-- profiles.manager_type is only consulted when role='manager'. For
-- reps it's ignored (their parallel column is rep_type).
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + ON CONFLICT DO NOTHING.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_type text NULL;

COMMENT ON COLUMN public.profiles.manager_type IS
  'Vocab name from app_settings.manager_types. NULL = unrestricted (lenient default). Used only when role=manager. Light-touch RBAC v1 — May 28.';

-- Optional index — partial so it stays tiny (most rows are NULL).
-- Helps the /settings/managers filter chip + the per-row chip query
-- when tenants grow many managers.
CREATE INDEX IF NOT EXISTS profiles_manager_type_idx
  ON public.profiles (manager_type)
  WHERE manager_type IS NOT NULL;

-- Seed the vocabulary. Three starter types — the manager can rename,
-- add, or delete them via /settings/roles after the first run. ON
-- CONFLICT DO NOTHING so a re-run doesn't stomp customer edits.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'manager_types',
  '[
    {"name":"Owner","canManageSettings":true,"canScheduleShifts":true},
    {"name":"Operations","canManageSettings":false,"canScheduleShifts":true},
    {"name":"View only","canManageSettings":false,"canScheduleShifts":false}
  ]'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ─── Smoke test (paste in a manager session) ─────────────────────
--   ✅ SELECT key, value FROM app_settings WHERE key = 'manager_types';
--   ✅ \d public.profiles  → should show manager_type column
--   ✅ Visit /settings/roles as the seeded Gary manager → see the
--      three types + the two capability columns; toggle them.
--   ✅ Visit /settings/roles as a manager with manager_type=
--      'View only' → should hit the "you don't have permission"
--      block screen (canManageSettings=false).
--   ✅ Visit /schedule/new as a 'View only' manager → blocked.
--   ✅ As an Owner, try to set your OWN manager_type to 'View only'
--      via /settings/managers/[id]/edit → the dropdown is disabled
--      with a tooltip explaining why.
