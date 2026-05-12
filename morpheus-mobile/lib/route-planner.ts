/**
 * route-planner — client wrapper for /api/route/plan.
 *
 * Two flavours:
 *
 *   planRoute(origin, stops, { optimize? })   — direct API call
 *   planMyDay({ optimize? })                  — convenience that
 *     gathers the rep's today shifts + their GPS, then calls the API
 *
 * Both go through a 5-minute in-memory cache keyed by
 * (lat,lng,stopIdsConcat,optimizeFlag). The cache prevents the rep
 * from blowing through Google quota by mashing the refresh button —
 * if nothing's changed in the last 5 minutes the cached response is
 * fine. Cache is cleared explicitly via clearRouteCache() when the
 * caller knows the underlying shifts changed.
 *
 * The API route handles the choice of provider (Google Routes when
 * GOOGLE_ROUTES_API_KEY env is set, mock otherwise). Client doesn't
 * care which — both flavours return the same PlanResponse shape.
 */

import { listMyShiftsToday, type ShiftWithMeta } from "./shifts-store";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlannerStop {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Optional ISO timestamp the rep is supposed to arrive by — drives
   *  the "Leave by X" pill in the UI. Not sent to the server. */
  scheduledArrival?: string;
}

export interface PlannedLeg {
  toStopId: string;
  toLabel?: string;
  haversineMeters: number;
  driveMeters: number;
  driveSeconds: number;
  polyline?: string;
}

export interface PlannedRoute {
  provider: "google" | "mock";
  legs: PlannedLeg[];
  totalSeconds: number;
  totalMeters: number;
  order: string[];
  trafficAware: boolean;
  warning?: string;
  /** Wall-clock time the plan was computed (ms epoch). Lets the UI
   *  show "Updated 2 min ago" + drive the cache TTL externally. */
  computedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  key: string;
  expiresAt: number;
  payload: PlannedRoute;
}
let _cache: CacheEntry | null = null;

function buildCacheKey(
  origin: LatLng,
  stops: PlannerStop[],
  optimize: boolean,
  traffic: boolean
): string {
  return [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    optimize ? "opt" : "fixed",
    traffic ? "traffic" : "mock",
    stops.map((s) => `${s.id}@${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join("|"),
  ].join("::");
}

export function clearRouteCache(): void {
  _cache = null;
}

/**
 * Direct planner call — caller supplies origin + stops.
 * Most pages should use planMyDay instead.
 *
 * `traffic` toggles the provider preference:
 *   - true (default)  → server uses Google Routes when GOOGLE_ROUTES_API_KEY
 *                       is configured; falls back to mock otherwise.
 *   - false           → server forces the mock provider even when Google
 *                       is configured. Drives the "Live traffic" toggle
 *                       on the /route page.
 */
export async function planRoute(
  origin: LatLng,
  stops: PlannerStop[],
  opts?: { optimize?: boolean; traffic?: boolean }
): Promise<PlannedRoute> {
  const optimize = opts?.optimize ?? false;
  const traffic = opts?.traffic ?? true;
  const key = buildCacheKey(origin, stops, optimize, traffic);
  if (_cache && _cache.key === key && _cache.expiresAt > Date.now()) {
    return _cache.payload;
  }
  const res = await fetch("/api/route/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, stops, optimize, traffic }),
  });
  if (!res.ok) {
    throw new Error(`Route plan failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as Omit<PlannedRoute, "computedAt">;
  const payload: PlannedRoute = { ...data, computedAt: Date.now() };
  _cache = { key, expiresAt: Date.now() + CACHE_TTL_MS, payload };
  return payload;
}

/**
 * Cross-platform geolocation request with permission-state awareness.
 *
 * Why a shared helper: iOS Safari is aggressive about downgrading the
 * "Allow Once" geolocation grant between sessions, so a naive
 * `getCurrentPosition` call re-prompts the rep every visit. Android
 * Chrome is much stickier — once granted, it stays granted. To avoid
 * needlessly retriggering iOS's prompt on user-initiated flows that
 * the rep takes every shift (Check in, Check out, Plan my day), we:
 *
 *   1. Query navigator.permissions first.
 *   2. If `granted` → silent fetch via getCurrentPosition (no prompt).
 *   3. If `denied` → resolve null immediately (no prompt — saves the
 *      rep tapping an action that's just going to fail).
 *   4. If `prompt` or no Permissions API support → call
 *      getCurrentPosition directly. iOS handles a user-initiated
 *      prompt gracefully when the rep just tapped a button; if they
 *      pick "Allow on Every Visit" the permission becomes `granted`
 *      and step 2 above kicks in for every subsequent call.
 *
 * Both platforms see consistent behaviour: no spurious prompts on
 * iOS, no regressions on Android. Both honour the same options
 * (8s timeout, low-accuracy, 60s cache) so the latency profile
 * matches.
 */
export async function requestGeolocationOnce(
  opts?: { highAccuracy?: boolean; timeoutMs?: number; maxAgeMs?: number }
): Promise<LatLng | null> {
  if (typeof window === "undefined" || !navigator.geolocation) return null;

  const options: PositionOptions = {
    enableHighAccuracy: opts?.highAccuracy ?? false,
    timeout: opts?.timeoutMs ?? 8000,
    maximumAge: opts?.maxAgeMs ?? 60_000,
  };

  const fetchNow = () =>
    new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        options
      );
    });

  // Permissions API check. Safari < 16 lacks it — fall through.
  type PermsAPI = {
    query: (d: { name: PermissionName }) => Promise<{ state: PermissionState }>;
  };
  const perms = (
    navigator as Navigator & { permissions?: PermsAPI }
  ).permissions;
  if (perms && typeof perms.query === "function") {
    try {
      const res = await perms.query({ name: "geolocation" as PermissionName });
      if (res.state === "denied") return null;
      // 'granted' OR 'prompt' both fall through to fetchNow.
      // For 'granted' the call is silent. For 'prompt' the OS asks
      // — acceptable on user-initiated flows.
      return await fetchNow();
    } catch {
      // Permissions API exists but query failed — fall through.
    }
  }
  return fetchNow();
}

/**
 * Internal alias used by planMyDay so the call site reads naturally
 * ("get my current location"). Thin wrapper over
 * requestGeolocationOnce so /route taps get the same permission-aware
 * behaviour as /check-in and /check-out.
 */
function getCurrentLocation(): Promise<LatLng | null> {
  return requestGeolocationOnce();
}

export interface PlanMyDayResult {
  route: PlannedRoute;
  /** The shifts in visit order, matching route.order. Caller usually
   *  wants both — the route data for ETAs + the shift metadata for
   *  rendering (customer name, scheduled times). */
  stopsInOrder: ShiftWithMeta[];
  /** True when the rep refused / lacked GPS — we fell back to the
   *  first shift's coords as the origin. UI can warn that ETAs are
   *  measured from the first store, not "from where you are". */
  originFromFirstStop: boolean;
}

/**
 * Convenience: pulls the rep's today shifts that have coords, gets
 * the rep's GPS, calls the planner. Returns enough metadata for the
 * /route page to render in one shot.
 *
 * Filters out:
 *   - shifts in 'complete' or 'cancelled' state (no point routing
 *     to a done shift)
 *   - shifts whose attention is open + unresolved (the rep flagged
 *     "can't make it" — manager hasn't actioned yet, exclude from
 *     the day plan)
 *   - shifts with no resolvable coords (no site_id and no customer
 *     fallback geocode)
 */
export async function planMyDay(opts?: {
  optimize?: boolean;
  /** Forwarded to planRoute / the API. See planRoute for semantics. */
  traffic?: boolean;
}): Promise<PlanMyDayResult> {
  const [allShifts, origin] = await Promise.all([
    listMyShiftsToday(),
    getCurrentLocation(),
  ]);
  const candidates = allShifts.filter((s) => {
    if (s.state === "complete" || s.state === "cancelled") return false;
    if (s.attention === "unable_to_attend" && !s.attentionResolvedAt) return false;
    return typeof s.siteLat === "number" && typeof s.siteLng === "number";
  });
  // Sort by scheduled start time so non-optimized callers get a
  // sensible chronological order out of the box.
  const sorted = [...candidates].sort((a, b) =>
    (a.rawStartTime || "").localeCompare(b.rawStartTime || "")
  );

  let effectiveOrigin: LatLng;
  let originFromFirstStop = false;
  if (origin) {
    effectiveOrigin = origin;
  } else if (sorted.length > 0) {
    effectiveOrigin = {
      lat: sorted[0].siteLat as number,
      lng: sorted[0].siteLng as number,
    };
    originFromFirstStop = true;
  } else {
    // No GPS AND no shifts to ground from — return an empty plan
    // so the UI can show an empty-state without an extra API call.
    return {
      route: {
        provider: "mock",
        legs: [],
        totalSeconds: 0,
        totalMeters: 0,
        order: [],
        trafficAware: false,
        computedAt: Date.now(),
      },
      stopsInOrder: [],
      originFromFirstStop: false,
    };
  }

  const stops: PlannerStop[] = sorted.map((s) => ({
    id: s.realId,
    lat: s.siteLat as number,
    lng: s.siteLng as number,
    label: s.name,
    scheduledArrival: s.rawStartTime
      ? buildArrivalISO(s.shiftDate, s.rawStartTime)
      : undefined,
  }));
  const route = await planRoute(effectiveOrigin, stops, {
    optimize: opts?.optimize,
    traffic: opts?.traffic,
  });

  // Re-order shifts to match the planner's chosen visit order.
  const byId = new Map(sorted.map((s) => [s.realId, s]));
  const stopsInOrder: ShiftWithMeta[] = [];
  for (const id of route.order) {
    const s = byId.get(id);
    if (s) stopsInOrder.push(s);
  }
  return { route, stopsInOrder, originFromFirstStop };
}

/** Build a local-time ISO for the shift's scheduled arrival.
 *  shift_date is "YYYY-MM-DD", start_time is "HH:MM" or "HH:MM:SS". */
function buildArrivalISO(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  if (![Y, M, D, h, m].every((n) => Number.isFinite(n))) return undefined;
  return new Date(Y, M - 1, D, h, m, 0, 0).toISOString();
}

/**
 * Direct-link helper for "Open the whole day in Maps" — Google Maps
 * URL with multiple waypoints. iOS routes maps.google.com URLs into
 * Apple Maps; Android opens Google Maps app if installed.
 */
export function buildDayMapsUrl(
  origin: LatLng,
  stops: PlannerStop[]
): string | null {
  if (stops.length === 0) return null;
  const dest = stops[stops.length - 1];
  const waypoints = stops
    .slice(0, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Per-leg deep link to a single destination. */
export function buildLegMapsUrl(stop: PlannerStop): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
}

/**
 * Open a Google Maps deep-link with the right strategy for the
 * platform, so the PWA stays alive and reachable when the rep
 * comes back from the Maps app.
 *
 * Why this isn't just a plain `<a href target="_blank">`:
 *
 *   - **iOS PWAs** white-screen on return from Maps if the deep-link
 *     opens in a new browser context (target="_blank" spawns a new
 *     window the iOS process model can't restore). The reliable
 *     pattern on iOS is to navigate the SAME window with
 *     `window.location.href = url`; iOS recognises maps.google.com
 *     as a universal link, intercepts the navigation BEFORE the
 *     PWA actually leaves the page, and hands off to the Maps app.
 *     When the rep switches back, the PWA is exactly where they
 *     left it.
 *
 *   - **Android PWAs** behave the opposite way: `window.location.href`
 *     on a maps.google.com URL doesn't always trigger the intent
 *     picker — sometimes the PWA just navigates to google.com/maps
 *     in its own window, which strands the rep on a web map view
 *     with no way back to their shift screen. The reliable pattern
 *     on Android is `window.open(url, "_blank")`, which spawns a
 *     Chrome custom tab the OS happily hands off to Maps via the
 *     intent system; the PWA stays alive in its own process and is
 *     reachable via the app switcher.
 *
 *   - **Desktop browsers** behave like Android — `window.open(url,
 *     "_blank")` is the conventional "open in a new tab" pattern.
 *
 * Falls back to a same-window navigation if window.open is blocked
 * (some popup-blocker configurations) so the link never silently
 * dies.
 */
export function openMapsLink(url: string): void {
  if (typeof window === "undefined") return;
  const ua = navigator.userAgent || "";
  // iPad on iOS 13+ reports as Mac in some configs — sniff for
  // Apple touch devices to catch both.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
  if (isIOS) {
    // Same-window nav. iOS catches the maps.google.com universal
    // link before the PWA actually navigates, so the page stays put.
    window.location.href = url;
    return;
  }
  // Android / desktop — new window/tab. window.open returns null
  // when blocked; fall back to same-window so the rep still gets
  // somewhere.
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
}
