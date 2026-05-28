"use client";

/**
 * ManagerCapabilities context — loads the current signed-in manager's
 * profile + the manager_types vocabulary once at admin-shell mount,
 * then exposes per-capability checks (`has(cap)`) to every page.
 *
 * Mounts inside `AdminShell` so every admin route gets it. Pages
 * gate via the `<RequireCapability>` wrapper, and components hide
 * inline affordances via the `has(cap)` callback.
 *
 * Lenient defaults at every check site (matches the `canCreateCustomers`
 * convention — see DESIGN.md §12):
 *   - while loading → `has(cap)` returns true (don't flash block
 *     screens for users who actually have access)
 *   - profile is null (transient auth blip / not signed in) → false
 *   - manager_type is NULL OR points to a deleted vocab entry → true
 *     (preserves existing-manager behaviour after the migration)
 *   - capability key missing on the vocab entry → true
 *
 * SECURITY: this is purely client-side UX. A motivated manager could
 * call the underlying API routes directly. Hard RLS gating is
 * deferred — see the SESSIONS.md entry for the rollout commit.
 */

import * as React from "react";
import { supabase } from "./supabase";
import { getProfileById, type Profile } from "./profiles-store";
import {
  getManagerTypes,
  managerTypeCan,
  type ManagerCapability,
  type ManagerTypeConfig,
} from "./settings-store";

interface ManagerCapabilitiesContextValue {
  /** True while the initial fetch is in flight. Components should
   *  not show block screens while loading. */
  loading: boolean;
  /** The current manager's profile (incl. manager_type). Null when
   *  not signed in or the profile lookup failed. */
  profile: Profile | null;
  /** The current vocabulary — used by the self-demote guard, the
   *  manager-type dropdown, and the per-row chip. */
  managerTypes: ManagerTypeConfig[];
  /** Capability check for the CURRENT logged-in user. Returns true
   *  while loading; returns false when no profile is available. */
  has: (capability: ManagerCapability) => boolean;
  /** Manual refresh — called by the Roles & permissions editor after
   *  a save, and by the user edit page after changing manager_type
   *  on someone other than yourself. */
  refresh: () => Promise<void>;
}

const Ctx = React.createContext<ManagerCapabilitiesContextValue | null>(null);

export function ManagerCapabilitiesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [managerTypes, setManagerTypes] = React.useState<ManagerTypeConfig[]>(
    []
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const types = await getManagerTypes();
      setManagerTypes(types);
      if (!supabase) {
        setProfile(null);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setProfile(null);
        return;
      }
      const p = await getProfileById(userId);
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const has = React.useCallback(
    (capability: ManagerCapability): boolean => {
      // Loading → lenient. Real RBAC enforcement still happens
      // server-side (deferred to a later hard-gate pass); the UX
      // gate just hides affordances quicker.
      if (loading) return true;
      if (!profile) return false;
      if (profile.role !== "manager") return false;
      return managerTypeCan(managerTypes, profile.manager_type, capability);
    },
    [loading, profile, managerTypes]
  );

  const value: ManagerCapabilitiesContextValue = {
    loading,
    profile,
    managerTypes,
    has,
    refresh: load,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the current manager's capabilities. Must be called inside the
 * `ManagerCapabilitiesProvider` (which AdminShell mounts).
 */
export function useManagerCapabilities(): ManagerCapabilitiesContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useManagerCapabilities must be used inside <ManagerCapabilitiesProvider>"
    );
  }
  return ctx;
}
