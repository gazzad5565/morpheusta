/**
 * Location tracker — pushes the current rep's GPS to the rep_locations
 * table while the active shift screen is open.
 *
 * Throttled to MIN_INTERVAL_MS so rapid position events don't hammer the DB.
 * Browsers can't run this in the background once the page is hidden — the
 * geolocation watcher is paused and resumes when the user returns.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

const MIN_INTERVAL_MS = 30_000; // 30s minimum between upserts

interface TrackerHandle {
  stop: () => void;
}

export function startLocationTracking(): TrackerHandle {
  if (typeof window === "undefined" || !navigator.geolocation) {
    // eslint-disable-next-line no-console
    console.warn("[location] geolocation not available in this browser");
    return { stop: () => {} };
  }
  if (!isSupabaseConfigured() || !supabase) {
    // eslint-disable-next-line no-console
    console.warn("[location] supabase not configured; tracking disabled");
    return { stop: () => {} };
  }

  let lastSentAt = 0;
  let stopped = false;
  let cachedRepId: string | null = null;

  async function ensureRepId(): Promise<string | null> {
    if (cachedRepId) return cachedRepId;
    const { data } = await supabase!.auth.getUser();
    cachedRepId = data.user?.id ?? null;
    return cachedRepId;
  }

  async function upsert(latitude: number, longitude: number, accuracy_m: number | null) {
    const repId = await ensureRepId();
    if (!repId) {
      // eslint-disable-next-line no-console
      console.warn("[location] no signed-in user; skipping upsert");
      return;
    }
    const { error } = await supabase!.from("rep_locations").upsert(
      {
        rep_id: repId,
        latitude,
        longitude,
        accuracy_m,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "rep_id" }
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[location] upsert error:", error.message);
    }
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return;
      const now = Date.now();
      if (now - lastSentAt < MIN_INTERVAL_MS) return;
      lastSentAt = now;
      upsert(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null
      );
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.warn("[location] watch error:", err.code, err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    }
  );

  return {
    stop: () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
    },
  };
}
