/**
 * Rep locations store (admin) — reads the live GPS position of each rep,
 * joined with their profile for display.
 *
 * Implementation note: we do two queries instead of an embedded PostgREST
 * join. The FK on `rep_locations.rep_id` points at `auth.users(id)`, not
 * `profiles(id)`. Both tables share auth.users as a parent, but PostgREST
 * can't resolve a multi-hop relationship through a table in another schema,
 * so `profiles(name, email)` as an embedded resource silently errors and
 * the whole call returns []. Two small queries + JS merge sidesteps that.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface RepLocation {
  repId: string;
  name: string;
  initials: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string; // ISO
}

interface LocationRow {
  rep_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string;
}

function deriveInitials(name: string, email: string): string {
  const source = (name?.trim() || email.split("@")[0] || "?").trim();
  const parts = source.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function listRepLocations(): Promise<RepLocation[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  // 1. Fetch rep_locations rows.
  const { data: locs, error: locsErr } = await supabase
    .from("rep_locations")
    .select("rep_id, latitude, longitude, accuracy_m, recorded_at");
  if (locsErr) {
    // eslint-disable-next-line no-console
    console.warn("[rep-locations] list locs:", locsErr.message);
    return [];
  }
  if (!locs || locs.length === 0) return [];

  // 2. Fetch matching profiles (one query, IN list).
  const repIds = (locs as LocationRow[]).map((l) => l.rep_id);
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", repIds);
  if (profErr) {
    // eslint-disable-next-line no-console
    console.warn("[rep-locations] list profiles:", profErr.message);
    // Carry on — we'll fall back to "Unknown" labels rather than dropping the dots.
  }

  const profileMap = new Map<string, { name: string | null; email: string }>();
  for (const p of (profiles as ProfileRow[] | null) || []) {
    profileMap.set(p.id, { name: p.name, email: p.email });
  }

  // 3. Merge.
  return (locs as LocationRow[]).map((l) => {
    const profile = profileMap.get(l.rep_id) || { name: null, email: "" };
    const email = profile.email || "";
    const name = profile.name?.trim() || email.split("@")[0] || "Unknown";
    return {
      repId: l.rep_id,
      name,
      initials: deriveInitials(profile.name || "", email),
      latitude: l.latitude,
      longitude: l.longitude,
      accuracyM: l.accuracy_m,
      recordedAt: l.recorded_at,
    };
  });
}

/**
 * Subscribe to realtime changes on rep_locations. The callback receives the
 * full updated list so the caller can re-render markers in one shot.
 *
 * Returns an unsubscribe function.
 */
export function subscribeRepLocations(
  onChange: (rows: RepLocation[]) => void
): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};

  const channel = supabase
    .channel("rep_locations_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rep_locations" },
      async () => {
        const rows = await listRepLocations();
        onChange(rows);
      }
    )
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}
