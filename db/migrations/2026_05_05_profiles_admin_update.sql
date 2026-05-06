-- 2026-05-05: open profiles UPDATE so an admin can promote / demote
-- other users (the /settings/managers page). Phase 3 keeps this as
-- any-authenticated; Phase 4 narrows to "actor must be a manager".
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- Drop the old self-only update policy if it lingers.
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
