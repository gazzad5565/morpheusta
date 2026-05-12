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
  buildDayMapsUrl,
  buildLegMapsUrl,
  openMapsLink,
  type PlanMyDayResult,
  type PlannerStop,
} from "@/lib/route-planner";

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

/** localStorage key for the rep's "Live traffic" toggle preference.
 *  Persists across sessions so they don't have to flick it every
 *  time they reopen the app. Default is true — the green Live-traffic
 *  state is what most reps want once the API key is wired up. */
const TRAFFIC_LS_KEY = "morpheus.route.useTraffic";

export default function RoutePage() {
  const router = useRouter();
  const [optimize, setOptimize] = useState(false);
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
      <AppHeader title="Plan my day" onBack={() => router.push("/")} withMenu />

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

        {/* Optimize order — flips the toggle, useEffect refetches */}
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
            onClick={() => setOptimize((v) => !v)}
            style={{
              width: 38,
              height: 22,
              borderRadius: 999,
              background: optimize ? MC.brand : "#CDD3DA",
              position: "relative",
              transition: "background .15s ease",
              flexShrink: 0,
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
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13.5,
                fontWeight: 600,
                color: MC.ink,
                letterSpacing: -0.1,
              }}
            >
              Optimize stop order
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.mute,
                marginTop: 1,
              }}
            >
              Re-order today's stops for the shortest drive
            </div>
          </div>
          {/* Hidden checkbox keeps a11y semantics on the label tap target */}
          <input
            type="checkbox"
            checked={optimize}
            onChange={(e) => setOptimize(e.target.checked)}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            tabIndex={-1}
          />
        </label>

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

            {/* Schedule row — three chips that tell the whole story
                without contradicting each other:
                  1. When you'll arrive if you leave now
                  2. When the shift is scheduled to start
                  3. A single on-time / tight / late status, derived
                     from the comparison of the first two.
                Replaces an earlier "Arrive X · Leave by Y" pair that
                managers were reading as a contradiction (the math was
                right; the framing was wrong). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <StatusChip tone="brand" icon="clock">
                Arrive ~ {formatClock(eta)}
              </StatusChip>
              {scheduledStart && (
                <StatusChip tone="neutral" icon="check">
                  Shift starts {formatClock(scheduledStart)}
                </StatusChip>
              )}
              {status && (
                <StatusChip
                  tone={
                    status.kind === "late"
                      ? "danger"
                      : status.kind === "tight"
                      ? "warn"
                      : "ok"
                  }
                  icon={status.kind === "late" ? "warn" : "check-circle"}
                >
                  {status.kind === "late"
                    ? `Late by ${status.minsLate} min`
                    : status.kind === "tight"
                    ? `Leave by ${formatClock(status.leaveBy)}`
                    : status.kind === "ok"
                    ? "On time"
                    : `On time · ${status.minsEarly} min early`}
                </StatusChip>
              )}
            </div>

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
