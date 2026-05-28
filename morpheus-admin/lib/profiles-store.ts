/**
 * Profiles store (admin) — list all profiles (for the rep picker on
 * shift creation, etc).
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  /** Base64 data URL of the rep's profile photo. Uploaded from the
   *  mobile app's /profile page, compressed to a small avatar. Shown
   *  on rep lists, rep detail, and as the rep marker on the
   *  live-ops map. Null = generic face glyph fallback. */
  avatar_url: string | null;
  created_at?: string;
  /** When the "Email this user" button was last used to send the
   *  user their credentials. Null = never. Bumped by the
   *  /api/users/[id]/send-credentials route on successful send.
   *  Surfaced as "Last sent: X ago" in the modal so the manager
   *  doesn't re-spam. */
  last_credentials_sent_at?: string | null;
  /** Rep category (Sales Rep / Merchandiser / Driver / etc) —
   *  managed vocabulary in app_settings.rep_types. NULL = uncategorised
   *  (allow-all capabilities). Only meaningful when role='rep'; the
   *  edit UI hides the picker for managers. See May 27 migration. */
  rep_type?: string | null;
  /** Manager category (Owner / Operations / View only / etc) —
   *  managed vocabulary in app_settings.manager_types. NULL =
   *  unrestricted (allow-all capabilities — preserves existing-manager
   *  behaviour after the migration). Only meaningful when role=
   *  'manager'. Two capability flags gate /settings/* and /schedule/*
   *  respectively — see managerTypeCan in settings-store.ts. May 28. */
  manager_type?: string | null;
  /** When the person joined the field workforce. Distinct from
   *  created_at, which is when their account was created in the
   *  system (often later). NULL = unknown. Mariska G2 (May 28).
   *
   *  Note (May 28 follow-up): region + group_name were originally
   *  added to this row too based on a misread of Mariska's G2 —
   *  Gary corrected that region + group belong to CUSTOMERS, not
   *  users. Those two columns were dropped via
   *  2026_05_28_drop_wrong_profile_columns.sql; hire_date stays. */
  hire_date?: string | null;
}

// SELECT column lists for profile reads.
//
// FULL = every column the latest code knows about. Includes columns
// added by post-Phase-4 migrations (last_credentials_sent_at,
// rep_type, manager_type) which may not yet exist on a Supabase
// project that hasn't run the corresponding `.sql` files yet.
//
// SAFE = the pre-May-25 column set. Guaranteed to exist on every
// project that's at least at Phase 4. Used as a fallback when the
// FULL select hits Postgres error 42703 ("column does not exist") —
// keeps the admin functional even when a deploy has raced ahead of
// a migration. May 28 (post-rep-vanish incident).
const PROFILE_COLS_FULL =
  "id, email, name, role, avatar_url, created_at, last_credentials_sent_at, rep_type, manager_type, hire_date";
const PROFILE_COLS_SAFE =
  "id, email, name, role, avatar_url, created_at";

/** Detect Postgres' "column does not exist" error so we can fall
 *  back to a narrower SELECT. PostgREST surfaces the underlying
 *  Postgres code in `error.code`; 42703 is `undefined_column`. */
function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown };
  return e.code === "42703";
}

/** All profiles, optionally filtered by role. Falls back to the safe
 *  column set when a post-Phase-4 migration hasn't been applied yet
 *  — see PROFILE_COLS_FULL note above. */
export async function listProfiles(opts?: { role?: string }): Promise<Profile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const sb = supabase;

  async function run(cols: string) {
    let q = sb.from("profiles").select(cols).order("name", { ascending: true, nullsFirst: false });
    if (opts?.role) q = q.eq("role", opts.role);
    return q;
  }

  let { data, error } = await run(PROFILE_COLS_FULL);
  if (error && isUndefinedColumnError(error)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[profiles] listProfiles: FULL select failed (likely a pending migration). Falling back to the SAFE column set. Apply pending migrations from docs/OPS.md to restore optional columns.",
      error.message
    );
    ({ data, error } = await run(PROFILE_COLS_SAFE));
  }
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] list:", error.message);
    return [];
  }
  // supabase-js can't infer the row type from a runtime SELECT string;
  // cast through unknown since both branches return a row shape we
  // already type via the Profile interface.
  return ((data as unknown) as Profile[]) || [];
}

/** Helper for displaying a profile's name in UI — falls back to email if name unset. */
export function displayName(p: Profile): string {
  return p.name?.trim() || p.email.split("@")[0];
}

/**
 * Fetch a single profile by id. Used by the schedule form to back-fill
 * the rep dropdown when the requester isn't in the listProfiles({role:'rep'})
 * result — e.g. a manager who requested a shift via the mobile app while
 * testing. Without this, the requester silently drops out of the dropdown
 * and the shift is created as Unassigned.
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const sb = supabase;

  async function run(cols: string) {
    return sb.from("profiles").select(cols).eq("id", id).maybeSingle();
  }

  let { data, error } = await run(PROFILE_COLS_FULL);
  if (error && isUndefinedColumnError(error)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[profiles] getProfileById: FULL select failed (likely a pending migration). Falling back to the SAFE column set.",
      error.message
    );
    ({ data, error } = await run(PROFILE_COLS_SAFE));
  }
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] getById:", error.message);
    return null;
  }
  // Cast via unknown — supabase-js can't infer the row type from a
  // runtime SELECT string.
  return ((data as unknown) as Profile | null) ?? null;
}

/**
 * Set a profile's role. Used by /settings/managers to promote a rep
 * to manager (giving them admin console access) or demote a manager
 * back to rep. We require RLS to allow UPDATE on profiles where
 * id = auth.uid() OR role = 'manager' updating others — see migration
 * 2026_05_05_profiles_manager_update.sql.
 */
export async function setProfileRole(
  id: string,
  role: "rep" | "manager"
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Subscribe to any change on the profiles table — INSERT (new user
 * was created), UPDATE (name / role / avatar changed), DELETE. Used
 * by /reps and /settings/managers so the list refreshes in place
 * without a full page reload.
 *
 * The callback is debounced inside the caller (we don't fan out
 * per-row; the caller refetches the whole list). Returns an
 * unsubscribe function. Per-call channel name avoids the supabase-js
 * collision two subscribers would otherwise hit.
 */
let _profilesChannelCounter = 0;
export function subscribeProfiles(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  _profilesChannelCounter += 1;
  const channelName = `profiles_live_${Date.now()}_${_profilesChannelCounter}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
