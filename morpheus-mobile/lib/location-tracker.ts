/**
 * Location tracker — pushes the current rep's GPS to the rep_locations
 * table while the active shift screen is open.
 *
 * Throttled to MIN_INTERVAL_MS so rapid position events don't hammer the DB.
 *
 * ── Cross-platform note (iOS vs Android PWAs) ─────────────────────
 *
 * Browsers can't run this in the background once the page is hidden —
 * the geolocation watcher pauses and resumes when the user returns.
 * That browser-level pause is consistent across platforms.
 *
 * What's NOT consistent is how aggressively the OS suspends a hidden
 * PWA:
 *
 *   - **Android Chrome PWAs** keep the page alive longer when
 *     backgrounded; on return from another app the page resumes
 *     quickly and the geolocation watcher fires within ~1s.
 *
 *   - **iOS Safari PWAs** suspend the page very aggressively when
 *     the rep locks the screen, switches to another app, or even
 *     just minimises the PWA. On resume there's often a multi-
 *     second gap before the first GPS tick lands. Worst case, iOS
 *     evicts the PWA from memory entirely and a cold start has to
 *     re-acquire location from scratch.
 *
 * For TRUE background GPS tracking (continuous location during a
 * shift even when the phone is locked or the rep is in another
 * app), the only durable solution is a Capacitor native wrap with
 * the background-location plugin. That's on the deferred list. For
 * now the rep_locations row updates only while the /active screen
 * is in the foreground — which is the design intent today.
 * ──────────────────────────────────────────────────────────────────
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

/**
 * Delete the current user's rep_locations row.
 *
 * Called on check-out so the admin map's green dot disappears immediately
 * instead of lingering as a "stale" pin until the 5-min timeout. Safe to
 * call when no row exists — Supabase will simply affect zero rows.
 */
export async function clearRepLocation(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured() || !supabase) return;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from("rep_locations")
    .delete()
    .eq("rep_id", userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[location] clear error:", error.message);
  }
}
