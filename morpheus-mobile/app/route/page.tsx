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
 * "Leave by" status for a leg. Compares the cumulative travel time
 * from "now" against the rep's scheduled arrival at that stop. Three
 * buckets:
 *   - ok      → on track, more than 10 min of slack
 *   - tight   → less than 10 min of slack (or already past leave-by)
 *   - missed  → ETA is already after the scheduled time
 * Returns null when the stop has no scheduledArrival — then we just
 * show the ETA and nothing else.
 */
type LeaveByState =
  | { kind: "ok"; leaveBy: Date; eta: Date; scheduledArrival: Date }
  | { kind: "tight"; leaveBy: Date; eta: Date; scheduledArrival: Date }
  | { kind: "missed"; leaveBy: Date; eta: Date; scheduledArrival: Date }
  | null;

function computeLeaveBy(
  now: Date,
  cumSecondsFromNow: number,
  scheduledArrivalISO?: string
): LeaveByState {
  if (!scheduledArrivalISO) return null;
  const scheduled = new Date(scheduledArrivalISO);
  if (!Number.isFinite(scheduled.getTime())) return null;
  // ETA-if-leaving-now (cumulative travel from origin):
  const eta = new Date(now.getTime() + cumSecondsFromNow * 1000);
  // Latest acceptable departure to arrive ON TIME: scheduled - travel.
  const leaveBy = new Date(scheduled.getTime() - cumSecondsFromNow * 1000);
  const slackMs = leaveBy.getTime() - now.getTime();
  if (eta.getTime() > scheduled.getTime()) {
    return { kind: "missed", leaveBy, eta, scheduledArrival: scheduled };
  }
  if (slackMs < 10 * 60 * 1000) {
    return { kind: "tight", leaveBy, eta, scheduledArrival: scheduled };
  }
  return { kind: "ok", leaveBy, eta, scheduledArrival: scheduled };
}

export default function RoutePage() {
  const router = useRouter();
  const [optimize, setOptimize] = useState(false);
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
      const r = await planMyDay({ optimize });
      setResult(r);
    } catch (e) {
      setError((e as Error).message || "Couldn't plan your day. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch + every time the optimize toggle flips.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await planMyDay({ optimize });
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
  }, [optimize]);

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
            {provider === "google" && trafficAware ? (
              <StatusChip tone="ok" icon="sparkle">
                Live traffic
              </StatusChip>
            ) : (
              <StatusChip tone="neutral" icon="info">
                Estimated
              </StatusChip>
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

        {/* Open whole day in Maps */}
        {dayMapsUrl && legs.length >= 2 && (
          <a
            href={dayMapsUrl}
            target="_blank"
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
        const leaveBy = computeLeaveBy(now, cumSeconds, scheduledArrivalISO);
        const eta = new Date(now.getTime() + cumSeconds * 1000);
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

            {/* ETA + Leave-by row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <StatusChip tone="brand" icon="clock">
                Arrive {formatClock(eta)}
              </StatusChip>
              {leaveBy && (
                <StatusChip
                  tone={
                    leaveBy.kind === "missed"
                      ? "danger"
                      : leaveBy.kind === "tight"
                      ? "warn"
                      : "ok"
                  }
                  icon={leaveBy.kind === "missed" ? "warn" : "arrow-r"}
                >
                  {leaveBy.kind === "missed"
                    ? `Late · sched ${formatClock(leaveBy.scheduledArrival)}`
                    : `Leave by ${formatClock(leaveBy.leaveBy)}`}
                </StatusChip>
              )}
            </div>

            {/* Per-leg Open in Maps */}
            {legMapsUrl && (
              <a
                href={legMapsUrl}
                target="_blank"
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
