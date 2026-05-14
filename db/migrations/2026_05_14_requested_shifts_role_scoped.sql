-- 2026-05-14: scope requested_shifts SELECT/UPDATE/DELETE by role.
--
-- Bug fix: the previous "_admin_*" policies all used `USING (true)`,
-- which leaked every rep's pending requests onto every OTHER rep's
-- device. Gary reported: "a few of my reps are seeing 'pending,
-- awaiting approval' notifications that have nothing to do with
-- them." The leak propagated through Supabase Realtime too because
-- realtime respects whatever the SELECT policy returns.
--
-- New rule (same for SELECT/UPDATE/DELETE):
--   rep_id = auth.uid()                            (own rows)
--   OR
--   profiles.role = 'manager' for auth.uid()       (manager inbox)
--
-- The original rep INSERT policy (rep_id = auth.uid() via the
-- requested_shifts.rep_id DEFAULT) is left untouched so a rep can
-- still submit a new request via the mobile /add-shift flow.
--
-- Safe to re-run: every policy is dropped (IF EXISTS) before being
-- recreated. Wrapped in BEGIN/COMMIT so a partial failure rolls back.
--
-- Phase 4 RLS will swap the inline `EXISTS profiles role` lookups
-- for a shared `is_manager()` SECURITY DEFINER helper; for now the
-- inline pattern keeps this migration self-contained.

BEGIN;

-- ─── SELECT ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "requested_shifts_admin_select" ON public.requested_shifts;
DROP POLICY IF EXISTS "requested_shifts_self_select"  ON public.requested_shifts;

CREATE POLICY "requested_shifts_self_select"
  ON public.requested_shifts
  FOR SELECT
  TO authenticated
  USING (
    rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

-- ─── UPDATE ────────────────────────────────────────────────────────
-- Reps update their own row (e.g. withdraw their own request via the
-- mobile /add-shift "Cancel request" affordance). Managers can update
-- any row (mark as scheduled / declined from the admin Live Feed).
DROP POLICY IF EXISTS "requested_shifts_admin_update" ON public.requested_shifts;
DROP POLICY IF EXISTS "requested_shifts_self_update"  ON public.requested_shifts;

CREATE POLICY "requested_shifts_self_update"
  ON public.requested_shifts
  FOR UPDATE
  TO authenticated
  USING (
    rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  )
  WITH CHECK (
    rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

-- ─── DELETE ────────────────────────────────────────────────────────
-- Reps delete their own (withdraw), managers delete any (decline /
-- clear after handling). The approve flow inserts a real `shifts`
-- row and deletes the requested_shifts row — both run as the
-- authenticated manager, so the manager branch handles that.
DROP POLICY IF EXISTS "requested_shifts_admin_delete" ON public.requested_shifts;
DROP POLICY IF EXISTS "requested_shifts_self_delete"  ON public.requested_shifts;

CREATE POLICY "requested_shifts_self_delete"
  ON public.requested_shifts
  FOR DELETE
  TO authenticated
  USING (
    rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

COMMIT;
