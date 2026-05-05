/**
 * Rep locations store (admin) — reads the live GPS position of each rep,
 * joined with their profile for display.
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

interface DbRow {
  rep_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
  profiles: { name: string | null; email: string } | null;
}

function deriveInitials(name: string, email: string): string {
  const source = (name?.trim() || email.split("@")[0] || "?").trim();
  const parts = source.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function rowToRepLocation(row: DbRow): RepLocation {
  const email = row.profiles?.email || "";
  const name = row.profiles?.name?.trim() || email.split("@")[0] || "Unknown";
  return {
    repId: row.rep_id,
    name,
    initials: deriveInitials(row.profiles?.name || "", email),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    recordedAt: row.recorded_at,
  };
}

export async function listRepLocations(): Promise<RepLocation[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("rep_locations")
    .select("rep_id, latitude, longitude, accuracy_m, recorded_at, profiles(name, email)");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[rep-locations] list:", error.message);
    return [];
  }
  return (data as unknown as DbRow[]).map(rowToRepLocation);
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
