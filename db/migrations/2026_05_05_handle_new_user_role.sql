-- 2026-05-05: handle_new_user() trigger now reads `role` from
-- raw_user_meta_data so signups via the admin app land as managers
-- and signups via the mobile app land as reps. Falls back to 'rep'
-- if no role is supplied.
--
-- The shape of the trigger is otherwise unchanged — it still inserts
-- into public.profiles with id, email, name (also from metadata).
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_name text;
  meta_role text;
BEGIN
  meta_name := NEW.raw_user_meta_data ->> 'name';
  meta_role := NEW.raw_user_meta_data ->> 'role';
  -- Constrain to a known role so a malformed signup payload can't
  -- accidentally elevate someone to an unexpected value.
  IF meta_role IS NULL OR meta_role NOT IN ('rep', 'manager') THEN
    meta_role := 'rep';
  END IF;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, NEW.email, meta_name, meta_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- The trigger itself almost certainly already exists — keep the
-- statement here so a fresh environment also gets it. Safe to re-run
-- because we drop+create.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
