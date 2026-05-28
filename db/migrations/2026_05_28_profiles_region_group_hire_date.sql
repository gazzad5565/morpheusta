-- 2026-05-28: region / group / hire_date on profiles + tag vocabularies.
--
-- Mariska G2 — "User profile fields: Region, Group, Hire date".
-- Downstream asks that all depend on these existing (G3 rep filters,
-- G5a customer filters, G8 schedule filters, G11a notify audience
-- targeting, G13c timesheet filters). Land the columns + vocabularies
-- first; the filter UI is a separate piece of work that reads from
-- here.
--
-- Three columns added to profiles:
--
--   region      text NULL       — geographic region (e.g. Gauteng,
--                                  Western Cape, KZN)
--   group_name  text NULL       — tenant-defined work group / team
--                                  (e.g. "Team A", "Cape route",
--                                  "Bakery merchandisers"). The
--                                  column is `group_name` not
--                                  `group` because GROUP is a SQL
--                                  reserved word in some dialects;
--                                  the UI surfaces it as just
--                                  "Group" to the manager.
--   hire_date   date NULL       — when the rep / manager joined the
--                                  field workforce. Distinct from
--                                  profiles.created_at (which is
--                                  when their account was created
--                                  in the system — often LATER
--                                  than their actual start date).
--
-- Two tag vocabularies in app_settings:
--
--   regions    text[] / jsonb   — admin-managed list of permitted
--                                  region strings. Empty array seed
--                                  — tenant fills in their own at
--                                  /settings/roles (Regions tab).
--   groups     text[] / jsonb   — same shape for work groups.
--
-- Difference from rep_types / manager_types: these are PLAIN TAGS,
-- no per-tag capabilities. The vocabulary is just an array of
-- strings (stored as JSON array for consistency with the existing
-- vocabularies). Settings store helpers `getRegions` / `setRegions`
-- / `getGroups` / `setGroups` cover the read/write.
--
-- Lenient values: any of region / group_name / hire_date may be
-- NULL on every row. Unknown / NULL region or group does not block
-- anything; they're filter conveniences, not gates.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS group_name text NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hire_date date NULL;

-- Partial indexes — only useful once managers actually filter by
-- region / group. Tiny: only non-NULL rows.
CREATE INDEX IF NOT EXISTS profiles_region_idx
  ON public.profiles (region)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_group_name_idx
  ON public.profiles (group_name)
  WHERE group_name IS NOT NULL;

-- Seed empty vocabularies. Tenants populate them on first use at
-- /settings/roles → Regions / Groups tabs. ON CONFLICT DO NOTHING
-- so re-runs don't stomp manager edits.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('regions', '[]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('groups', '[]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.profiles.region IS
  'Tenant-defined region tag. NULL = unassigned. Vocabulary in app_settings.regions (May 28).';
COMMENT ON COLUMN public.profiles.group_name IS
  'Tenant-defined work group / team tag. NULL = unassigned. Vocabulary in app_settings.groups. Named *_name to avoid the SQL "GROUP" reserved word (May 28).';
COMMENT ON COLUMN public.profiles.hire_date IS
  'When the person joined the field workforce. Distinct from created_at (account creation). NULL = unknown (May 28).';

COMMIT;

-- ─── Smoke test (paste in a manager session) ─────────────────────
--   ✅ SELECT column_name, data_type FROM information_schema.columns
--      WHERE table_name = 'profiles'
--        AND column_name IN ('region','group_name','hire_date');
--      → three rows, types text/text/date.
--   ✅ SELECT key, value FROM app_settings
--      WHERE key IN ('regions','groups');
--      → both rows, value = [].
--   ✅ Open /settings/roles → Regions tab → add "Gauteng" → save →
--      open /settings/managers/[id]/edit → Region dropdown shows
--      "Gauteng" as an option.
