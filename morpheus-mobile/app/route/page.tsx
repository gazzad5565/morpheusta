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
  // The minute-tick that used to drive per-leg "Leave now / X min
  // late" pills was removed (May 12) along with those pills — /route
  // is now pure ordering, no clock-relative state on the page.

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

  // "Re-checked at HH:MM" — the wall-clock time the planner last
  // computed this route. Gary's been explicit: he wants a TIME
  // visible on every visit to /route, regardless of whether the
  // rep has saved an order. Persisted in localStorage so a cold-
  // load shows the previous check time until the fresh fetch
  // lands; once `result` populates we sync from `route.computedAt`.
  const LAST_CHECKED_LS_KEY = "morpheus.route.last_checked_at";
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(LAST_CHECKED_LS_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  });

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

  // Whenever a fresh route lands, snapshot its computedAt as the
  // new "re-checked at" timestamp and persist it. This is what
  // drives the always-visible "Re-checked at HH:MM" caption — the
  // page's stamp of "the data you're looking at is this fresh".
  useEffect(() => {
    if (!route?.computedAt) return;
    setLastCheckedAt(route.computedAt);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LAST_CHECKED_LS_KEY,
          String(route.computedAt)
        );
      }
    } catch {
      /* private mode */
    }
  }, [route?.computedAt]);

  // "Open whole day in Maps" URL builder was removed (May 12 —
  // Gary). The dayMapsUrl useMemo + the CTA that consumed it are
  // gone, so buildDayMapsUrl / buildLegMapsUrl / PlannerStop are no
  // longer used in this file.

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
        {/* Header layout (May 12 rev — Gary):
            The previous one-row layout (LIVE pill + total drive +
            Re-check button all on the same flex line) wrapped the
            "LIVE TRAFFIC" label to two lines on iPhone widths and
            squashed the totals.
            New 2-row stack:
              Row 1: LIVE / ESTIMATE chip — | — Re-check button
              Row 2: "Total drive time: 16 min · 8.3 km" — full
                     width, heavier weight (this is the lead number)
            Below the band: an always-visible "Re-checked at HH:MM"
            line so the rep can tell how fresh the figure is, plus
            the "Order saved at HH:MM" banner when a save is on
            file. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
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
                padding: "4px 10px",
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
                whiteSpace: "nowrap",
              }}
            >
              <Glyph
                name={useTraffic ? "sparkle" : "info"}
                size={12}
                color={useTraffic ? MC.ok : MC.ink2}
                strokeWidth={2.2}
              />
              {useTraffic ? "Live traffic" : "Estimated"}
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
          </div>
          {/* Single re-check action. Was labelled "Refresh" — renamed
              so the verb matches the action ("re-check route with
              current traffic") and the duplicate "Re-check route"
              button that used to live in the save area below is
              gone. One button, one place. */}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            aria-label="Re-check route with current traffic"
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
            {loading ? "Checking…" : "Re-check"}
          </button>
        </div>

        {/* Row 2: total drive time — lead number, full width, slightly
            heavier than the chip row so the eye lands here first. */}
        <div
          style={{
            marginTop: 8,
            fontFamily: MC.font,
            fontSize: 15,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.2,
          }}
        >
          {loading
            ? "Planning…"
            : legs.length === 0
            ? "No stops"
            : `Total drive time: ${formatDuration(totalSeconds)} · ${formatMeters(totalMeters)}`}
        </div>

        {/* Row 3: always-visible "Re-checked at HH:MM" caption.
            Hydrated from localStorage so revisiting the page shows
            the previous check time instantly, then updates as soon
            as the fresh route lands. Gary's been explicit: he wants
            a TIME on the page every visit, not only when there's a
            saved order. */}
        {lastCheckedAt && (
          <div
            style={{
              marginTop: 4,
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.hint,
              letterSpacing: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title="The wall-clock time this route was last computed against current data"
          >
            <Glyph name="refresh" size={11} color={MC.hint} strokeWidth={2.2} />
            Re-checked at{" "}
            {new Date(lastCheckedAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </div>
        )}

        {/* Optimized-at banner.
            Promoted to its own row (was tucked inside the toggle's
            subtitle in 10.5px hint colour — Gary's mentioned a few
            times that the optimization time wasn't obvious enough).
            Now sits prominently directly under the totals so the
            first thing the rep sees when arriving on a planned day
            is "your order was saved at 2:42 PM" — clear, actionable,
            answers "when did I last touch this?" without scrolling. */}
        {savedOrder && savedAt && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: MC.okTint,
              border: `1px solid ${MC.ok}33`,
              borderLeft: `3px solid ${MC.ok}`,
              fontFamily: MC.font,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Glyph
              name="check-circle"
              size={16}
              color={MC.ok}
              strokeWidth={2.4}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0d6a45",
                letterSpacing: -0.1,
              }}
            >
              Order optimized at{" "}
              <span style={{ fontWeight: 700 }}>
                {new Date(savedAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </span>
          </div>
        )}

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
                ? "Tap Re-check above to refresh with current traffic — we'll flag any better route."
                : "Re-order today's stops for the shortest drive"}
            </div>
            {/* Old tiny "Optimized order saved at HH:MM" caption
                used to live here. Promoted to the prominent banner
                above the toggle (May 12 — Gary's repeated request)
                so the timestamp answers "when did I save this?" at
                a glance instead of being buried in 10.5px hint
                text. */}
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

        {/* Save button.
            Shows ONLY for the FIRST save. Once the rep has saved an
            order, this button never returns — Gary's been explicit
            about this multiple times. The "Update saved order"
            variant was removed (May 12). If the rep re-checks later
            and the planner finds a faster route, the comparison
            banner below shows the delta + timestamp so the rep
            knows; if they want to swap orders they can flip the
            toggle off/on which will re-save automatically the next
            time they tap Save (i.e. after they clear). Keeping the
            page calm and read-only after the initial save is the
            whole point. */}
        {(() => {
          if (!result || result.route.legs.length < 2) return null;
          const currentOrder = result.stopsInOrder.map((s) => s.realId);
          if (currentOrder.length < 2) return null;
          if (!comparison) return null;
          const chronoSame =
            comparison.chronologicalOrder.join("|") === currentOrder.join("|");
          const savedExists = !!savedOrder && savedOrder.length > 0;
          // Once an order is saved, no button. Ever.
          if (savedExists) return null;
          // No saved order yet AND current view == chronological →
          // nothing to save.
          if (chronoSame) return null;
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
                Save this order
              </button>
              <span
                style={{
                  fontFamily: MC.font,
                  fontSize: 11,
                  color: MC.hint,
                  lineHeight: 1.35,
                }}
              >
                Reorders your shifts list to match — doesn&apos;t
                change customer scheduled times.
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
            // Banner copy needs to make the state crystal clear:
            //   - Optimize OFF + savings available → "Could save N
            //     min" prompt (brand tint — call to action).
            //   - Optimize ON + saved order matches current view →
            //     "✓ Active — saving N min" (green, present-tense).
            //   - Optimize ON + saved order differs from current →
            //     "New: save N more min — tap Update saved order"
            //     (green, calls out the pending action).
            //   - Optimize ON + no saved order yet → "Optimized
            //     order saves N min" (green, prompts a Save).
            // Computed inline because the banner sits above the
            // save area where savedMatchesCurrent already lives but
            // not in scope here.
            const optimizeOn = optimize;
            const currentOrder =
              result?.stopsInOrder.map((s) => s.realId) ?? [];
            const savedMatchesCurrentBanner =
              !!savedOrder &&
              currentOrder.length > 0 &&
              savedOrder.length === currentOrder.length &&
              savedOrder.join("|") === currentOrder.join("|");
            const tone = optimizeOn
              ? { bg: MC.okTint, border: MC.ok, fg: "#0d6a45" }
              : { bg: MC.brandTint, border: MC.brand, fg: MC.brandDeep };
            const savingsLabel =
              savedMin > 0 ? `${savedMin} min` : "drive time";
            const distSuffix =
              savedKm > 0.5 ? ` · ${savedKm.toFixed(1)} km less` : "";
            // Headline + subtitle per state.
            const headline = optimizeOn
              ? savedMatchesCurrentBanner
                ? `✓ Active — saving ${savingsLabel}${distSuffix}`
                : savedOrder
                ? `New route — ${savingsLabel} faster${distSuffix}`
                : `Optimized order saves ${savingsLabel}${distSuffix}`
              : `Could save ${savingsLabel} by reordering`;
            const subtitle = optimizeOn
              ? savedMatchesCurrentBanner
                ? "This is the order on your shifts list. Re-check anytime to see if traffic has shifted things."
                : savedOrder
                ? "Your saved order is still active. Re-check anytime — traffic may have shifted the picture."
                : "Tap 'Save this order' below to lock it in."
              : "Flip 'Optimize stop order' above to use the shorter route.";
            // Icon: ✓ when applied, sparkle when there's something
            // to act on (savings available, save needed).
            const iconName = savedMatchesCurrentBanner
              ? "check-circle"
              : "sparkle";
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
                  name={iconName}
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
                    {headline}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: MC.mute,
                      marginTop: 2,
                    }}
                  >
                    {subtitle}
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
          <LegList legs={legs} stopsInOrder={stopsInOrder} />
        )}

        {/* "Open whole day in Maps" CTA was removed (May 12 — Gary).
            /route is now scoped purely to ordering. Reps tap into
            /shifts (or the home Up Next card) when they actually
            want to drive somewhere; the explicit Maps handoff lives
            there alongside the Start-travelling button. */}
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
}: {
  legs: NonNullable<PlanMyDayResult["route"]>["legs"];
  stopsInOrder: PlanMyDayResult["stopsInOrder"];
}) {
  // /route is intentionally scoped to ONE job: re-ordering today's
  // stops for the shortest drive. Per-leg ETA / Leave-now / Open-in-
  // Maps affordances have been stripped (May 12 — Gary). Those live
  // on /shifts now, where they read as actions against a specific
  // shift. Mixing them in here was confusing reps and risked taps
  // (e.g. "Leave now — 91 min late · Open in Maps") on a screen
  // that's supposed to be a calm planning view. Each row now shows
  // ONLY: order number, customer, address, and the drive duration +
  // distance for THIS leg. The rep clicks back to /shifts for any
  // action on a stop.
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
      {legs.map((leg, index) => {
        const stop = stopsInOrder[index];
        if (!stop) return null;
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
                  {/* Same-address legs (two stops at the same site)
                      have driveSeconds≈0 / driveMeters≈0 → the old
                      "— drive · —" line read as broken. Show a clean
                      "Same address as previous stop" label instead. */}
                  {leg.driveSeconds < 30 && leg.driveMeters < 50 ? (
                    <span>Same address as previous stop</span>
                  ) : (
                    <>
                      <span>{formatDuration(leg.driveSeconds)} drive</span>
                      <span style={{ color: MC.line }}>·</span>
                      <span>{formatMeters(leg.driveMeters)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* No per-leg schedule banner or Open-in-Maps button —
                /route is purely an ordering view now. Drive time +
                distance for THIS leg already appears under the
                customer name above; that's enough planning info. */}
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
