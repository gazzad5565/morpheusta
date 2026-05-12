"use client";

/**
 * /route — "Plan my day" page.
 *
 * The rep opens this when they want a single screen that says:
 *   "Drive here next. ETA 8:42 AM. Leave by 8:18 to be on time. Open in Maps."
 *
 * Data flow:
 *   planMyDay() →
 *     pulls my today shifts that aren't done / cancelled / "can't make it",
 *     gets GPS (falls back to first stop),
 *     calls /api/route/plan,
 *     returns { route, stopsInOrder, originFromFirstStop }.
 *
 * Render:
 *   - Provider + total ETA pill at top
 *   - "Optimize order" toggle (recomputes with greedy TSP server-side)
 *   - Vertical leg list — one card per stop with arrival time + "Leave by"
 *   - Per-leg "Open in Maps" deep link
 *   - "Open whole day in Maps" deep link at the bottom
 *
 * Defensive bits:
 *   - The 5-min planner cache means tapping Refresh actually replans
 *     (we clear it first). Without the clear the user could tap Refresh
 *     and get the exact same response back because the cache key
 *     wouldn't have changed.
 *   - Provider badge ("Mock") is visible when GOOGLE_ROUTES_API_KEY
 *     isn't configured so the rep knows ETAs are approximations.
 *   - Empty state: no shifts → friendly "nothing to plan" message.
 *   - GPS denied → small note "ETAs from your first stop" so the rep
 *     isn't confused by an arrival time that doesn't match their
 *     current location.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter, CustomerTile, StatusChip } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import {
  planMyDay,
  clearRouteCache,
  clearGpsCache,
  buildDayMapsUrl,
  buildLegMapsUrl,
  openMapsLink,
  TRAFFIC_LS_KEY,
  type PlanMyDayResult,
  type PlannerStop,
} from "@/lib/route-planner";
import {
  saveShiftOrder,
  readShiftOrder,
  readShiftOrderMeta,
  subscribeShiftOrder,
} from "@/lib/shift-order-store";
import { getRouteOptimizationAllowed } from "@/lib/settings-store";

/** "5 km" / "950 m" — friendly distance. */
function formatMeters(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** "12 min" / "1 h 24 min". Always whole minutes for ETAs. */
function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const totalMin = Math.max(1, Math.round(sec / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "8:42 AM" — clock label. */
function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Schedule status for a leg. Compares the predicted arrival (now +
 * cumulative travel) against the rep's scheduled shift start time.
 *
 * Returns one of four states with human copy ready for a chip:
 *   - early   → eta is more than 10 min before scheduled (green; lots
 *               of slack, "On time · 25 min early")
 *   - ok      → eta is 0–10 min before scheduled (green; "On time")
 *   - tight   → eta is within 5 min EITHER SIDE of scheduled (amber;
 *               "Tight · leave soon")
 *   - late    → eta is more than 5 min after scheduled (red; "Late by
 *               12 min")
 *
 * Earlier this returned a "leave by" time that the UI rendered next
 * to the ETA. The math was correct ("the latest you could leave now
 * and still arrive on time") but the side-by-side display was
 * confusing — a manager seeing "Arrive 11:00 · Leave by 12:00"
 * read it as a contradiction even though both numbers were
 * internally consistent. Replacing with a single on-time/late chip
 * removes the ambiguity. We still expose `leaveBy` on the type for
 * the "tight" bucket so the UI can render "Leave by 4:15 PM" as the
 * actionable copy in that one case.
 *
 * Returns null when the stop has no scheduledArrival — the UI then
 * skips the status chip entirely and just shows the ETA.
 */
type ScheduleStatus =
  | { kind: "early"; eta: Date; scheduled: Date; minsEarly: number }
  | { kind: "ok"; eta: Date; scheduled: Date; minsEarly: number }
  | { kind: "tight"; eta: Date; scheduled: Date; leaveBy: Date; minsSlack: number }
  | { kind: "late"; eta: Date; scheduled: Date; minsLate: number }
  | null;

function computeScheduleStatus(
  now: Date,
  cumSecondsFromNow: number,
  scheduledArrivalISO?: string
): ScheduleStatus {
  if (!scheduledArrivalISO) return null;
  const scheduled = new Date(scheduledArrivalISO);
  if (!Number.isFinite(scheduled.getTime())) return null;
  const eta = new Date(now.getTime() + cumSecondsFromNow * 1000);
  const diffMs = scheduled.getTime() - eta.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < -5) {
    return { kind: "late", eta, scheduled, minsLate: Math.abs(diffMin) };
  }
  if (diffMin <= 5) {
    // Tight — within 5 minutes either side of scheduled. Compute a
    // leave-by time for the actionable "go now" copy.
    const leaveBy = new Date(scheduled.getTime() - cumSecondsFromNow * 1000);
    return { kind: "tight", eta, scheduled, leaveBy, minsSlack: diffMin };
  }
  if (diffMin <= 10) {
    return { kind: "ok", eta, scheduled, minsEarly: diffMin };
  }
  return { kind: "early", eta, scheduled, minsEarly: diffMin };
}

// TRAFFIC_LS_KEY is imported from lib/route-planner so the leave-by
// helpers used by /shifts and the home page can honour the same
// preference the rep set here.

export default function RoutePage() {
  const router = useRouter();
  // Optimize defaults to ON when the rep already has a saved order
  // for today — they "planned their day" in a previous session and
  // /route should reflect that, not silently revert to chronological.
  // Without this the saved-order banner on home said "Day planned"
  // but tapping through showed the original order, which felt
  // broken. (Applying the saved order client-side would need a
  // re-fetch with the saved order as input to get correct per-leg
  // drive times — turning optimize on is a pragmatic approximation:
  // the planner's greedy nearest-neighbour tends to produce a result
  // very close to what the rep saved.)
  const [optimize, setOptimize] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!readShiftOrder();
  });
  // Org-wide gate from /settings/check-in-rules → "Allow Plan my day
  // to optimize stop order". When false, the Optimize toggle hides
  // entirely and the rep sees their day in chronological order only.
  // Defaults to true so a missing setting / slow fetch doesn't break
  // the feature on first load.
  const [optimizeAllowed, setOptimizeAllowed] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getRouteOptimizationAllowed().then((on) => {
      if (!cancelled) setOptimizeAllowed(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // When the setting flips off after the rep had optimize on, force
  // the toggle back to false so the comparison logic doesn't run
  // against an order the rep can't actually use.
  useEffect(() => {
    if (!optimizeAllowed && optimize) setOptimize(false);
  }, [optimizeAllowed, optimize]);
  // Live-traffic toggle. Initialised from localStorage on mount (after
  // hydration to avoid SSR/CSR mismatch), default true.
  const [useTraffic, setUseTraffic] = useState(true);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TRAFFIC_LS_KEY);
      if (raw === "false") setUseTraffic(false);
    } catch {
      /* localStorage disabled — fall through to default */
    }
  }, []);
  const setUseTrafficPersist = (v: boolean) => {
    setUseTraffic(v);
    try {
      window.localStorage.setItem(TRAFFIC_LS_KEY, v ? "true" : "false");
    } catch {
      /* noop */
    }
    // Cache key already includes the traffic flag, so flipping it
    // naturally invalidates the cached payload — but we clear
    // anyway to keep things obvious.
    clearRouteCache();
  };
  const [result, setResult] = useState<PlanMyDayResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Re-render every 60s so "Leave by" / ETAs stay accurate as the
  // clock ticks. The underlying route data doesn't change — we just
  // want the relative timing pills to refresh. 60s is fine grain.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      clearRouteCache(); // user explicitly asked for fresh
      clearGpsCache(); // and a fresh GPS fix while we're at it
      const r = await planMyDay({ optimize, traffic: useTraffic });
      setResult(r);
    } catch (e) {
      setError((e as Error).message || "Couldn't plan your day. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch + every time the optimize or traffic toggle flips.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await planMyDay({ optimize, traffic: useTraffic });
        if (!cancelled) setResult(r);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optimize, useTraffic]);

  // Saved visit order (Option A — per-rep preference, non-destructive).
  // Reps tap "Save this order" after flipping Optimize to lock in the
  // optimized sequence; /shifts + home Up Next then honour it. We
  // store today's array of shift IDs in localStorage and subscribe to
  // changes so a save propagates instantly without remounts.
  const [savedOrder, setSavedOrder] = useState<string[] | null>(() =>
    typeof window === "undefined" ? null : readShiftOrder()
  );
  // Saved-at timestamp drives the "Last optimized X min ago" line in
  // the optimize section. Updates alongside savedOrder via the same
  // change event so a fresh save flips both atomically.
  const [savedAt, setSavedAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readShiftOrderMeta()?.savedAt ?? null
  );
  useEffect(() => {
    // Re-read after hydration in case SSR returned null.
    setSavedOrder(readShiftOrder());
    setSavedAt(readShiftOrderMeta()?.savedAt ?? null);
    return subscribeShiftOrder(() => {
      setSavedOrder(readShiftOrder());
      setSavedAt(readShiftOrderMeta()?.savedAt ?? null);
    });
  }, []);

  // Background fetch of the OTHER mode so we can compare totals and
  // show concrete proof that "Optimize stop order" is doing something.
  // Without this comparison the rep flicks the toggle, sees the same
  // stops in (often) the same order, and concludes the feature is
  // broken. The 5-min planRoute cache absorbs repeat calls cheaply.
  //
  // We store BOTH totals; the leg list still renders the primary
  // `result` (whatever the rep's toggle currently selects), but the
  // savings banner at the top reads off this comparison state.
  const [comparison, setComparison] = useState<{
    chronologicalSec: number;
    chronologicalMeters: number;
    optimizedSec: number;
    optimizedMeters: number;
    chronologicalOrder: string[];
    optimizedOrder: string[];
  } | null>(null);
  useEffect(() => {
    if (!result || result.route.legs.length < 2) {
      setComparison(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [chrono, opt] = await Promise.all([
          planMyDay({ optimize: false, traffic: useTraffic }),
          planMyDay({ optimize: true, traffic: useTraffic }),
        ]);
        if (cancelled) return;
        setComparison({
          chronologicalSec: chrono.route.totalSeconds,
          chronologicalMeters: chrono.route.totalMeters,
          optimizedSec: opt.route.totalSeconds,
          optimizedMeters: opt.route.totalMeters,
          chronologicalOrder: chrono.route.order,
          optimizedOrder: opt.route.order,
        });
      } catch {
        if (!cancelled) setComparison(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Recompute whenever the rep's data changes — but NOT on the
    // optimize toggle flip (the comparison itself is order-agnostic;
    // flipping the toggle just changes which we display as primary).
  }, [useTraffic, result?.stopsInOrder.map((s) => s.realId).join("|")]);

  const route = result?.route;
  const stopsInOrder = result?.stopsInOrder ?? [];
  const provider = route?.provider ?? "mock";
  const totalSeconds = route?.totalSeconds ?? 0;
  const totalMeters = route?.totalMeters ?? 0;
  const legs = route?.legs ?? [];
  const trafficAware = route?.trafficAware ?? false;
  const warning = route?.warning;
  const originFromFirstStop = result?.originFromFirstStop ?? false;

  // Build the "Open whole day in Maps" URL. Needs an origin —
  // when GPS was denied we used the first stop as origin, which
  // means the day URL should ALSO start at that first stop (and
  // skip it in the waypoints). Simpler: when originFromFirstStop,
  // start from the second stop onwards in the URL.
  const dayMapsUrl = useMemo(() => {
    if (!route || stopsInOrder.length === 0) return null;
    if (originFromFirstStop && stopsInOrder.length === 1) {
      // Only one stop, no GPS — just link to it.
      const s = stopsInOrder[0];
      if (typeof s.siteLat !== "number" || typeof s.siteLng !== "number") return null;
      return buildLegMapsUrl({
        id: s.realId,
        lat: s.siteLat,
        lng: s.siteLng,
        label: s.name,
      });
    }
    const trail = originFromFirstStop ? stopsInOrder.slice(1) : stopsInOrder;
    if (trail.length === 0) return null;
    const origin = originFromFirstStop
      ? { lat: stopsInOrder[0].siteLat as number, lng: stopsInOrder[0].siteLng as number }
      : null;
    // When we have real GPS we DON'T know it here — buildDayMapsUrl
    // requires an origin, and the user's current location is already
    // baked into the route plan. Use the first stop as origin
    // regardless for the Maps deep link (Maps will route from the
    // user's GPS anyway via "My location" handling on the device).
    const dayOrigin =
      origin ??
      {
        lat: stopsInOrder[0].siteLat as number,
        lng: stopsInOrder[0].siteLng as number,
      };
    const stopsForUrl: PlannerStop[] = trail
      .filter(
        (s) => typeof s.siteLat === "number" && typeof s.siteLng === "number"
      )
      .map((s) => ({
        id: s.realId,
        lat: s.siteLat as number,
        lng: s.siteLng as number,
        label: s.name,
      }));
    return buildDayMapsUrl(dayOrigin, stopsForUrl);
  }, [route, stopsInOrder, originFromFirstStop]);

  return (
    <div
      style={{
        background: MC.bg,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Back goes to /shifts (Today's Shifts), not the dashboard.
          The two pages are conceptually the same workflow — /shifts
          is the roster, /route is the optimised planning view of
          the same shifts — so back-navigation should stay inside
          that workflow rather than punt to the home screen. */}
      <AppHeader title="Plan my day" onBack={() => router.push("/shifts")} withMenu />

      {/* Sticky summary band — provider, ETA totals, Refresh + Optimize toggles */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: MC.card,
          borderBottom: `1px solid ${MC.line}`,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            {/* Live traffic toggle. Tap flips between the Google
                provider (traffic-aware ETAs) and the mock provider
                (haversine × 1.4 × 30 km/h urban estimate). State is
                persisted to localStorage so the rep's preference
                sticks across sessions. The visual changes per state:
                  - On  → green pill, sparkle glyph, "Live traffic"
                  - Off → neutral pill, info glyph, "Estimated"
                When Google isn't configured (no API key on server),
                turning the toggle on still returns mock data — but
                the pill's labelled state still reflects the
                preference so re-enabling once the key lands works. */}
            <button
              type="button"
              onClick={() => setUseTrafficPersist(!useTraffic)}
              aria-pressed={useTraffic}
              title={
                useTraffic
                  ? "Live traffic on — tap to switch to estimated"
                  : "Estimated only — tap to use live traffic"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 9px",
                borderRadius: 999,
                background: useTraffic ? MC.okTint : "#EEF0F3",
                color: useTraffic ? "#0d6a45" : MC.ink2,
                border: `1px solid ${useTraffic ? MC.ok + "33" : MC.line}`,
                fontFamily: MC.font,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <Glyph
                name={useTraffic ? "sparkle" : "info"}
                size={12}
                color={useTraffic ? MC.ok : MC.ink2}
                strokeWidth={2.2}
              />
              {useTraffic
                ? provider === "google" && trafficAware
                  ? "Live traffic"
                  : "Live traffic"
                : "Estimated"}
            </button>
            {/* When the toggle says "Live traffic" but the server is
                actually serving mock (no API key configured), show a
                tiny ⓘ hint so the rep doesn't think Google is broken. */}
            {useTraffic && !(provider === "google" && trafficAware) && !loading && (
              <span
                title="Server is using the estimate provider. Ask your admin to add the Google Routes API key."
                style={{
                  fontFamily: MC.font,
                  fontSize: 10.5,
                  color: MC.hint,
                  fontWeight: 500,
                }}
              >
                using estimate
              </span>
            )}
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13.5,
                color: MC.ink,
                fontWeight: 600,
                letterSpacing: -0.1,
              }}
            >
              {loading
                ? "Planning…"
                : legs.length === 0
                ? "No stops"
                : `${formatDuration(totalSeconds)} · ${formatMeters(totalMeters)}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Refresh route"
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${MC.line}`,
              background: MC.bg,
              cursor: loading ? "wait" : "pointer",
              fontFamily: MC.font,
              fontSize: 12.5,
              fontWeight: 600,
              color: MC.ink2,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <Glyph name="refresh" size={13} color={MC.ink2} strokeWidth={2.2} />
            Refresh
          </button>
        </div>

        {/* Optimize order — flips the toggle, useEffect refetches.
            Hidden entirely when the org has disabled route
            optimization (admin /settings/check-in-rules → "Allow
            Plan my day to optimize stop order"). The savings banner
            below and the Save-order button also fall away naturally
            because they depend on `comparison` / non-chronological
            order which never fires when optimize stays false. */}
        {optimizeAllowed && (
        <label
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span
            role="switch"
            aria-checked={optimize}
            aria-label="Optimize stop order"
            tabIndex={0}
            onClick={() => setOptimize((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setOptimize((v) => !v);
              }
            }}
            style={{
              width: 38,
              height: 22,
              borderRadius: 999,
              background: optimize ? MC.brand : "#CDD3DA",
              position: "relative",
              transition: "background .15s ease",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: optimize ? 18 : 2,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                transition: "left .15s ease",
              }}
            />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Copy flips based on whether the rep has a saved
                order. The "Optimize stop order" verb only really
                makes sense BEFORE a save; afterwards the order is
                already chosen, so we reframe it as
                "Already optimized" + a re-check prompt. */}
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13.5,
                fontWeight: 600,
                color: MC.ink,
                letterSpacing: -0.1,
              }}
            >
              {savedOrder ? "Order optimized" : "Optimize stop order"}
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.mute,
                marginTop: 1,
              }}
            >
              {savedOrder
                ? "Re-check below for any better route with current traffic."
                : "Re-order today's stops for the shortest drive"}
            </div>
            {/* "Last optimized X min ago" — only shows when the rep
                has a saved order today AND we have the savedAt
                timestamp. Helps the rep judge whether to re-run
                with current traffic (a 3-hour-old plan is more
                worth re-checking than a 3-minute-old one). The
                `now` state above ticks every minute so this label
                refreshes without each child owning a timer. */}
            {savedOrder && savedAt && (
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 10.5,
                  color: MC.hint,
                  marginTop: 3,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Glyph
                  name="check-circle"
                  size={10}
                  color={MC.hint}
                  strokeWidth={2.2}
                />
                Last optimized{" "}
                {(() => {
                  const ms = Math.max(0, Date.now() - savedAt);
                  const min = Math.round(ms / 60_000);
                  if (min < 1) return "just now";
                  if (min < 60) return `${min} min ago`;
                  const h = Math.floor(min / 60);
                  const m = min % 60;
                  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
                })()}
              </div>
            )}
          </div>
          {/* Hidden checkbox removed (May 12).
              It used to live here "for a11y" but it actually broke the
              switch: clicks inside a <label> implicitly toggle the
              associated checkbox via the label-form association
              regardless of pointer-events: none, so every tap fired
              BOTH the span's onClick AND the checkbox's onChange →
              double-flip → toggle appeared to do nothing.
              The role="switch" + aria-checked + tabIndex + keyboard
              handler on the span itself gives screen readers and
              keyboard users the same affordance without the
              double-flip footgun. */}
        </label>
        )}

        {/* Save / Re-check button.
            Three states (one button, three labels):
              - chronological on screen AND nothing saved → hide
                (nothing useful to do; the toggle handles re-ordering)
              - non-chrono order on screen AND nothing saved yet →
                "Save this order" (primary brand button)
              - non-chrono on screen AND saved order != current view
                → "Update saved order" (primary brand button)
              - non-chrono on screen AND saved order == current view
                → "Re-check route" (neutral; refreshes the planner so
                the rep can see if traffic has shifted savings)
            The old "Order saved ✓ · Clear" pill set was removed —
            saved-state is already communicated by the "Last
            optimized X min ago" caption above + the home page's
            Planned chip. Honours Option A: this is a per-rep view
            preference. It never touches shifts.start_time so the
            manager's calendar stays exactly as scheduled. */}
        {(() => {
          if (!result || result.route.legs.length < 2) return null;
          const currentOrder = result.stopsInOrder.map((s) => s.realId);
          if (currentOrder.length < 2) return null;
          if (!comparison) return null;
          const chronoSame =
            comparison.chronologicalOrder.join("|") === currentOrder.join("|");
          const savedMatchesCurrent =
            !!savedOrder &&
            savedOrder.length === currentOrder.length &&
            savedOrder.join("|") === currentOrder.join("|");
          const savedExists = !!savedOrder && savedOrder.length > 0;
          if (chronoSame && !savedExists) return null;
          return (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {savedMatchesCurrent ? (
                // Saved order matches what's on screen → nothing to
                // save. Surface a re-check affordance so the rep can
                // refresh and see if traffic conditions have moved
                // the optimum since they saved.
                <button
                  type="button"
                  onClick={() => void reload()}
                  disabled={loading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    borderRadius: 999,
                    background: "#fff",
                    color: MC.ink2,
                    border: `1px solid ${MC.line}`,
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: -0.1,
                    cursor: loading ? "wait" : "pointer",
                  }}
                >
                  <Glyph
                    name="refresh"
                    size={13}
                    color={MC.ink2}
                    strokeWidth={2.2}
                  />
                  {loading ? "Re-checking…" : "Re-check route"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    saveShiftOrder(currentOrder);
                    // Don't loiter on /route after a save — the rep
                    // wanted to plan their day, they planned it,
                    // bounce them somewhere useful. /shifts is the
                    // natural next destination because that's where
                    // they'll see their list reordered to match.
                    // Small delay so the success state on the
                    // button is briefly visible before nav.
                    window.setTimeout(() => {
                      router.push("/shifts");
                    }, 350);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 12px",
                    borderRadius: 999,
                    background: MC.brand,
                    color: "#fff",
                    border: "none",
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                    cursor: "pointer",
                    boxShadow: `0 2px 8px ${MC.brand}44`,
                  }}
                >
                  <Glyph
                    name="check"
                    size={13}
                    color="#fff"
                    strokeWidth={2.4}
                  />
                  {savedExists ? "Update saved order" : "Save this order"}
                </button>
              )}
              <span
                style={{
                  fontFamily: MC.font,
                  fontSize: 11,
                  color: MC.hint,
                  lineHeight: 1.35,
                }}
              >
                {savedMatchesCurrent
                  ? "Refresh with current traffic to see if a faster route is available."
                  : "Reorders your shifts list to match — doesn't change customer scheduled times."}
              </span>
            </div>
          );
        })()}

        {/* Inline warnings: GPS fallback + Google fallback */}
        {(originFromFirstStop || warning) && legs.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: MC.warnTint,
              border: `1px solid ${MC.warn}33`,
              fontFamily: MC.font,
              fontSize: 11.5,
              color: "#7A560A",
              lineHeight: 1.45,
            }}
          >
            {originFromFirstStop && (
              <div>
                <b>Location unavailable.</b> ETAs are measured from your first
                stop, not your current position.
              </div>
            )}
            {warning && <div style={{ marginTop: originFromFirstStop ? 4 : 0 }}>{warning}</div>}
          </div>
        )}
      </div>

      {/* Main scroll area — leg list */}
      <div style={{ flex: 1, padding: "14px 14px 24px" }}>
        {/* Optimize comparison banner — proof that the toggle is doing
            something concrete. Three states:
              - savings > 1 min: green banner "Optimized order saves
                N min · X km less"
              - savings ≤ 1 min: neutral "Already in the best order"
              - no comparison yet / too few stops: hide entirely
            Sits ABOVE the leg list so the rep sees the value before
            scanning the cards. Hidden during the initial load to
            avoid flashing. */}
        {legs.length >= 2 && comparison && !loading && (
          (() => {
            const savedSec =
              comparison.chronologicalSec - comparison.optimizedSec;
            const savedMin = Math.round(savedSec / 60);
            const savedKm =
              (comparison.chronologicalMeters - comparison.optimizedMeters) /
              1000;
            // Order differs if the two stop-id arrays don't match
            // element-for-element. A different order with similar
            // total time is still WORTH showing — it might be more
            // logical for the rep.
            const orderDiffers =
              comparison.chronologicalOrder.join("|") !==
              comparison.optimizedOrder.join("|");
            const hasMeaningfulSaving = savedMin >= 1 || orderDiffers;
            if (!hasMeaningfulSaving) {
              return (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: MC.bg,
                    border: `1px solid ${MC.line}`,
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    color: MC.mute,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Glyph
                    name="check"
                    size={13}
                    color={MC.mute}
                    strokeWidth={2.2}
                  />
                  Your shifts are already in the best order — optimizing
                  wouldn't save you any time today.
                </div>
              );
            }
            // Optimize ON + meaningful savings → loud green banner.
            // Optimize OFF + savings available → softer "you could
            // save N min" prompt with the toggle as the call-to-action.
            const optimizeOn = optimize;
            const tone = optimizeOn
              ? { bg: MC.okTint, border: MC.ok, fg: "#0d6a45" }
              : { bg: MC.brandTint, border: MC.brand, fg: MC.brandDeep };
            return (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: tone.bg,
                  border: `1px solid ${tone.border}33`,
                  borderLeft: `3px solid ${tone.border}`,
                  fontFamily: MC.font,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Glyph
                  name="sparkle"
                  size={14}
                  color={tone.fg}
                  strokeWidth={2.4}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: tone.fg,
                      letterSpacing: -0.1,
                    }}
                  >
                    {optimizeOn
                      ? savedOrder
                        ? `Saved order saves ${savedMin > 0 ? `${savedMin} min` : "drive time"}${savedKm > 0.5 ? ` · ${savedKm.toFixed(1)} km less` : ""}`
                        : `Optimized order saves ${savedMin > 0 ? `${savedMin} min` : "drive time"}${savedKm > 0.5 ? ` · ${savedKm.toFixed(1)} km less` : ""}`
                      : `Could save ${savedMin > 0 ? `${savedMin} min` : "drive time"} by reordering`}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: MC.mute,
                      marginTop: 2,
                    }}
                  >
                    {optimizeOn
                      ? savedOrder
                        ? "Compared with visiting in scheduled-time order. Re-run with current traffic above if you want to update."
                        : "Compared with visiting your stops in scheduled-time order."
                      : "Flip 'Optimize stop order' above to use the shorter route."}
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {loading && !result ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : legs.length === 0 ? (
          <EmptyState onAddShift={() => router.push("/add-shift")} />
        ) : (
          <LegList
            legs={legs}
            stopsInOrder={stopsInOrder}
            now={new Date(nowTick)}
          />
        )}

        {/* Open whole day in Maps.
            Uses openMapsLink() which picks the right open strategy
            per platform:
              - iOS PWA → same-window navigation (universal link
                intercepts before the PWA actually leaves the page,
                no white-screen on return)
              - Android PWA / desktop → window.open(_blank) so the
                PWA stays alive in its own process and is reachable
                via the app switcher when the rep comes back. */}
        {dayMapsUrl && legs.length >= 2 && (
          <a
            href={dayMapsUrl}
            onClick={(e) => {
              e.preventDefault();
              openMapsLink(dayMapsUrl);
            }}
            rel="noopener noreferrer"
            style={{
              marginTop: 14,
              width: "100%",
              height: 54,
              borderRadius: 14,
              border: "none",
              background: MC.ink,
              color: "#fff",
              fontFamily: MC.font,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: -0.1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textDecoration: "none",
              boxShadow: `0 10px 24px ${MC.ink}33, inset 0 1px 0 rgba(255,255,255,.2)`,
            }}
          >
            <Glyph name="pin" size={17} color="#fff" strokeWidth={2.2} />
            Open whole day in Maps
          </a>
        )}
      </div>

      <AppFooter />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: 14,
            padding: 14,
            height: 96,
          }}
        >
          <div
            style={{
              width: "60%",
              height: 14,
              background: MC.bg,
              borderRadius: 6,
              marginBottom: 10,
            }}
          />
          <div
            style={{
              width: "40%",
              height: 12,
              background: MC.bg,
              borderRadius: 6,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAddShift }: { onAddShift: () => void }) {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 16,
        padding: "28px 18px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: MC.brandTint,
          margin: "0 auto 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Glyph name="pin" size={24} color={MC.brandDeep} strokeWidth={2.2} />
      </div>
      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 17,
          fontWeight: 700,
          color: MC.ink,
          letterSpacing: -0.3,
        }}
      >
        Nothing to plan today
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 13,
          color: MC.mute,
          marginTop: 6,
          lineHeight: 1.5,
        }}
      >
        Your scheduled shifts will appear here with ETAs and a one-tap launch
        to Maps. Request a shift to get started.
      </div>
      <button
        type="button"
        onClick={onAddShift}
        style={{
          marginTop: 16,
          height: 42,
          padding: "0 18px",
          borderRadius: 999,
          border: "none",
          background: MC.brand,
          color: "#fff",
          fontFamily: MC.font,
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: -0.1,
        }}
      >
        Request a shift
      </button>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.danger}33`,
        borderLeft: `4px solid ${MC.danger}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 13.5,
          fontWeight: 600,
          color: MC.danger,
        }}
      >
        Couldn't plan your day
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 12.5,
          color: MC.mute,
          marginTop: 4,
          lineHeight: 1.5,
        }}
      >
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 10,
          height: 34,
          padding: "0 14px",
          borderRadius: 999,
          border: `1px solid ${MC.danger}55`,
          background: "#fff",
          color: MC.danger,
          fontFamily: MC.font,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}

function LegList({
  legs,
  stopsInOrder,
  now,
}: {
  legs: NonNullable<PlanMyDayResult["route"]>["legs"];
  stopsInOrder: PlanMyDayResult["stopsInOrder"];
  now: Date;
}) {
  // Cumulative seconds from origin → end of each leg. Drives the
  // ETA + leave-by calculation per row.
  let cum = 0;
  const rows = legs.map((leg, i) => {
    cum += leg.driveSeconds;
    const stop = stopsInOrder[i];
    return { leg, stop, cumSeconds: cum, index: i };
  });
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {rows.map(({ leg, stop, cumSeconds, index }) => {
        if (!stop) return null;
        const scheduledArrivalISO = stop.rawStartTime
          ? buildArrivalISOLocal(stop.shiftDate, stop.rawStartTime)
          : undefined;
        const status = computeScheduleStatus(now, cumSeconds, scheduledArrivalISO);
        const eta = new Date(now.getTime() + cumSeconds * 1000);
        const scheduledStart = scheduledArrivalISO ? new Date(scheduledArrivalISO) : null;
        const legMapsUrl =
          typeof stop.siteLat === "number" && typeof stop.siteLng === "number"
            ? buildLegMapsUrl({
                id: stop.realId,
                lat: stop.siteLat,
                lng: stop.siteLng,
                label: stop.name,
              })
            : null;
        return (
          <li
            key={`${stop.realId}-${index}`}
            style={{
              background: MC.card,
              border: `1px solid ${MC.line}`,
              borderRadius: 14,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Step index badge — tiny round number so the rep can
                  count their stops at a glance ("3 of 5"). */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CustomerTile
                  initials={stop.initials}
                  color={stop.color}
                  size={48}
                  logoUrl={stop.logoUrl}
                />
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: -6,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: MC.ink,
                    color: "#fff",
                    fontFamily: MC.font,
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,.2)",
                  }}
                >
                  {index + 1}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 14.5,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {stop.name}
                </div>
                {/* Address line — gives the rep an at-a-glance "where
                    am I actually going" without opening Maps. Ellipsis
                    on overflow + title attr for the full string on
                    hover/long-press. Hidden entirely if no address is
                    on file so the row doesn't render a blank gap. */}
                {stop.siteAddress && (
                  <div
                    title={stop.siteAddress}
                    style={{
                      fontFamily: MC.font,
                      fontSize: 12,
                      color: MC.mute,
                      marginTop: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <Glyph name="pin" size={11} color={MC.hint} strokeWidth={2.2} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {stop.siteAddress}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: MC.mute,
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{formatDuration(leg.driveSeconds)} drive</span>
                  <span style={{ color: MC.line }}>·</span>
                  <span>{formatMeters(leg.driveMeters)}</span>
                </div>
              </div>
            </div>

            {/* Schedule block.
                User feedback: three competing chips (Arrive / Shift
                starts / Status) read as a pile of numbers without an
                obvious story. "On time" in green was particularly
                unclear — green relative to WHAT?
                Replaced with a single coloured status banner that
                reads like a sentence ("17 min early — arrive 12:13
                for the 12:30 shift"). One block, one colour, one
                idea. */}
            {(() => {
              if (!status || !scheduledStart) {
                // No scheduled time on file → just show the ETA so
                // the rep at least knows when they'll arrive.
                return (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: MC.bg,
                      border: `1px solid ${MC.line}`,
                      fontFamily: MC.font,
                      fontSize: 13,
                      color: MC.ink,
                      fontWeight: 600,
                    }}
                  >
                    Arrive {formatClock(eta)}
                  </div>
                );
              }
              // Tones and the headline copy per status. The "if you
              // leave now" framing is explicit on early / late /
              // on-time so the rep doesn't have to mentally hold the
              // assumption "this number is relative to leaving
              // right this second". The tight case keeps "Leave by
              // HH:MM" because that IS the actionable number for
              // that bucket. Gary's reported confusion was that
              // "Late by 66 min" wasn't obviously "if you leave
              // now" — now it says so.
              const headline =
                status.kind === "late"
                  ? `Leave now — ${status.minsLate} min late`
                  : status.kind === "tight"
                  ? `Leave by ${formatClock(status.leaveBy)}`
                  : status.kind === "ok"
                  ? "Leave now to be on time"
                  : `Leave now — ${status.minsEarly} min early`;
              const tone =
                status.kind === "late"
                  ? { bg: MC.dangerTint, fg: "#9c1a3c", border: MC.danger }
                  : status.kind === "tight"
                  ? { bg: MC.warnTint, fg: "#7A560A", border: MC.warn }
                  : { bg: MC.okTint, fg: "#0d6a45", border: MC.ok };
              return (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: tone.bg,
                    border: `1px solid ${tone.border}33`,
                    borderLeft: `3px solid ${tone.border}`,
                    fontFamily: MC.font,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: tone.fg,
                      letterSpacing: -0.1,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Glyph
                      name={status.kind === "late" ? "warn" : "check-circle"}
                      size={14}
                      color={tone.fg}
                      strokeWidth={2.4}
                    />
                    {headline}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 12,
                      color: MC.mute,
                      lineHeight: 1.4,
                    }}
                  >
                    {status.kind === "late"
                      ? `You'd arrive at ${formatClock(eta)} — shift was due to start at ${formatClock(scheduledStart)}.`
                      : status.kind === "tight"
                      ? `Arriving on time for the ${formatClock(scheduledStart)} shift needs you out the door by ${formatClock(status.leaveBy)}.`
                      : `You'd arrive at ${formatClock(eta)} for the ${formatClock(scheduledStart)} shift.`}
                  </div>
                </div>
              );
            })()}

            {/* Per-leg Open in Maps — openMapsLink() handles the
                iOS-vs-Android split so the PWA stays reachable
                after the rep returns from the Maps app. */}
            {legMapsUrl && (
              <a
                href={legMapsUrl}
                onClick={(e) => {
                  e.preventDefault();
                  openMapsLink(legMapsUrl);
                }}
                rel="noopener noreferrer"
                style={{
                  height: 38,
                  borderRadius: 10,
                  border: `1px solid ${MC.line}`,
                  background: MC.bg,
                  color: MC.ink,
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  textDecoration: "none",
                  letterSpacing: -0.1,
                }}
              >
                <Glyph name="pin" size={13} color={MC.ink} strokeWidth={2.2} />
                Open in Maps
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Mirror of buildArrivalISO in route-planner.ts — duplicated here
 *  because the planner returns a flat ShiftWithMeta and we want the
 *  same local-time conversion when computing "Leave by". Keeping it
 *  inline avoids exporting an extra helper just for this one render. */
function buildArrivalISOLocal(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  if (![Y, M, D, h, m].every((n) => Number.isFinite(n))) return undefined;
  return new Date(Y, M - 1, D, h, m, 0, 0).toISOString();
}
