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
// Module-level GPS cache. Returning from /route to home re-runs the
// home page's computeNextLeaveBy(), which calls this helper, which
// would otherwise re-acquire the GPS fix (up to 8s on iOS Safari
// even when permission is already granted). With a short-lived cache
// the second call inside the TTL resolves instantly, so the back-
// nav UX feels snappy. The browser already does some caching via
// `maximumAge`, but the prompt + permission check round-trips still
// run; this guards the WHOLE helper.
const _GPS_CACHE_TTL_MS = 60_000;
let _gpsCache: { lat: number; lng: number; expiresAt: number } | null = null;

/** Clear the GPS cache. Useful when the rep explicitly requests a
 *  refresh (e.g. tapping "Refresh route"). */
export function clearGpsCache(): void {
  _gpsCache = null;
}

export async function requestGeolocationOnce(
  opts?: { highAccuracy?: boolean; timeoutMs?: number; maxAgeMs?: number }
): Promise<LatLng | null> {
  if (typeof window === "undefined" || !navigator.geolocation) return null;

  // Cache hit — instant return. Skips the Permissions API round-trip
  // and the getCurrentPosition wait. Skipped when `highAccuracy` is
  // explicitly requested (those callers want a fresh, precise fix).
  if (
    _gpsCache &&
    _gpsCache.expiresAt > Date.now() &&
    !opts?.highAccuracy
  ) {
    return { lat: _gpsCache.lat, lng: _gpsCache.lng };
  }

  const options: PositionOptions = {
    enableHighAccuracy: opts?.highAccuracy ?? false,
    timeout: opts?.timeoutMs ?? 8000,
    maximumAge: opts?.maxAgeMs ?? 60_000,
  };

  const fetchNow = () =>
    new Promise<LatLng | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const out = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          _gpsCache = { ...out, expiresAt: Date.now() + _GPS_CACHE_TTL_MS };
          resolve(out);
        },
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

/* ─── Shared leave-by helper ──────────────────────────────────────
 *
 * The /shifts list and the home page Up Next card both want a small
 * "Leave by 10:42 · 12 min drive" line on the rep's next upcoming
 * shift — without duplicating the planner call or the math. This
 * section exposes:
 *
 *   - TRAFFIC_LS_KEY / readTrafficPref()
 *     The /route page's "Live traffic" toggle is persisted in
 *     localStorage; reading it from here lets the leave-by line
 *     honour the same preference so the rep sees consistent data
 *     across screens.
 *
 *   - NextLeaveByInfo / computeNextLeaveBy()
 *     One async call that returns the next shift's leave-by, drive
 *     duration, and which shift it applies to (so the caller can
 *     match it to the right row). Uses the existing planMyDay
 *     pipeline, so the 5-min planRoute cache absorbs repeat calls
 *     between /shifts and home.
 *
 * Returns null when:
 *   - no remaining shifts today
 *   - the GPS origin couldn't be determined (originFromFirstStop is
 *     true) — "leave by" math is meaningless without knowing where
 *     the rep is leaving from
 *   - the first shift has no scheduled start on record
 */

export const TRAFFIC_LS_KEY = "morpheus.route.useTraffic";

export function readTrafficPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TRAFFIC_LS_KEY) !== "false";
  } catch {
    return true;
  }
}

export interface NextLeaveByInfo {
  /** Real shift id this applies to — match against ShiftWithMeta.realId
   *  to find the right row in the consumer's list. */
  shiftRealId: string;
  /** Wall-clock time the rep should leave to arrive at the scheduled
   *  start. */
  leaveBy: Date;
  /** Drive seconds from current location to the next stop. */
  driveSeconds: number;
  /** True when the planner used Google traffic-aware data, false for
   *  the mock fallback. Lets the consumer add a "with live traffic"
   *  subtitle when available. */
  trafficAware: boolean;
}

export async function computeNextLeaveBy(): Promise<NextLeaveByInfo | null> {
  const result = await planMyDay({ traffic: readTrafficPref() });
  // No real origin → no meaningful leave-by.
  if (result.originFromFirstStop) return null;
  const firstLeg = result.route.legs[0];
  const firstStop = result.stopsInOrder[0];
  if (!firstLeg || !firstStop) return null;
  if (!firstStop.rawStartTime || !firstStop.shiftDate) return null;
  // Flexible-time shifts have no specific scheduled start to compute
  // "leave by" against (the 06:00 sentinel would produce a meaningless
  // 5:40 AM leave time). Skip them.
  if (firstStop.isFlexibleTime) return null;

  const [Y, M, D] = firstStop.shiftDate.split("-").map((n) => parseInt(n, 10));
  const [h, m] = firstStop.rawStartTime.split(":").map((n) => parseInt(n, 10));
  if (![Y, M, D, h, m].every((n) => Number.isFinite(n))) return null;
  const scheduled = new Date(Y, M - 1, D, h, m, 0, 0);
  const leaveBy = new Date(scheduled.getTime() - firstLeg.driveSeconds * 1000);

  return {
    shiftRealId: firstStop.realId,
    leaveBy,
    driveSeconds: firstLeg.driveSeconds,
    trafficAware: result.route.trafficAware,
  };
}

/**
 * Per-shift "if you leave now" arrival info for the /shifts row.
 *
 * Walks the planner's legs in visit order, accumulating drive time
 * from origin → stop N to compute a predicted arrival time. Compares
 * against each stop's scheduled start to classify early / on-time /
 * tight / late.
 *
 * Returns null when the planner has no usable origin (no GPS) — same
 * gate as computeNextLeaveBy(); a per-shift ETA against a first-
 * stop pseudo-origin would be meaningless.
 *
 * Keyed by `realId` so /shifts can look up its row directly.
 */
export type ShiftEtaStatus = "early" | "ok" | "tight" | "late";
export interface ShiftEtaInfo {
  /** Predicted arrival time if the rep leaves now. */
  eta: Date;
  /** The shift's scheduled start (may be null for flexible-time shifts
   *  or shifts with no recorded start). */
  scheduledAt: Date | null;
  /** Tone bucket relative to scheduledAt.
   *  early  → eta is more than 10 min before scheduled
   *  ok     → eta is 0–10 min before scheduled
   *  tight  → eta is within 5 min either side (or none for flex)
   *  late   → eta is more than 5 min after scheduled */
  status: ShiftEtaStatus;
  /** Signed minute delta: positive = early, negative = late. */
  minsDelta: number;
  /** True when the planner answered with Google traffic-aware data. */
  trafficAware: boolean;
}

export async function computeShiftEtas(): Promise<Map<string, ShiftEtaInfo> | null> {
  const result = await planMyDay({ traffic: readTrafficPref() });
  if (result.originFromFirstStop) return null;
  if (result.stopsInOrder.length === 0) return null;

  const map = new Map<string, ShiftEtaInfo>();
  const now = Date.now();
  let cumSec = 0;
  for (let i = 0; i < result.route.legs.length; i++) {
    const leg = result.route.legs[i];
    const stop = result.stopsInOrder[i];
    if (!leg || !stop) continue;
    cumSec += leg.driveSeconds;
    const eta = new Date(now + cumSec * 1000);

    let scheduledAt: Date | null = null;
    if (stop.rawStartTime && stop.shiftDate && !stop.isFlexibleTime) {
      const [Y, M, D] = stop.shiftDate.split("-").map((n) => parseInt(n, 10));
      const [h, m] = stop.rawStartTime.split(":").map((n) => parseInt(n, 10));
      if ([Y, M, D, h, m].every(Number.isFinite)) {
        scheduledAt = new Date(Y, M - 1, D, h, m, 0, 0);
      }
    }

    let status: ShiftEtaStatus;
    let minsDelta = 0;
    if (!scheduledAt) {
      // No specific scheduled time → just label as "ok" so callers
      // can render a neutral "arrive HH:MM" pill if they want.
      status = "ok";
    } else {
      const diffMin = Math.round(
        (scheduledAt.getTime() - eta.getTime()) / 60_000
      );
      minsDelta = diffMin;
      if (diffMin < -5) status = "late";
      else if (diffMin <= 5) status = "tight";
      else if (diffMin <= 10) status = "ok";
      else status = "early";
    }
    map.set(stop.realId, {
      eta,
      scheduledAt,
      status,
      minsDelta,
      trafficAware: result.route.trafficAware,
    });
  }
  return map;
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
