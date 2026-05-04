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
  created_at?: string;
}

/** All profiles, optionally filtered by role. */
export async function listProfiles(opts?: { role?: string }): Promise<Profile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let q = supabase
    .from("profiles")
    .select("id, email, name, role, created_at")
    .order("name", { ascending: true, nullsFirst: false });
  if (opts?.role) q = q.eq("role", opts.role);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[profiles] list:", error.message);
    return [];
  }
  return data as Profile[];
}

/** Helper for displaying a profile's name in UI — falls back to email if name unset. */
export function displayName(p: Profile): string {
  return p.name?.trim() || p.email.split("@")[0];
}
