"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { MC } from "@/lib/tokens";
import { type Shift } from "@/lib/mock-data";
import { AppFooter, CustomerTile, StatusChip, PrimaryButton } from "@/components/Chrome";
import { CheckingInOverlay, type CheckMode } from "@/components/CheckingInOverlay";
import { useMenu } from "@/components/MenuShell";
import { LoadingBar, Skeleton } from "@/components/Loading";
import { Glyph, formatTime } from "@/components/Glyph";
import { formatShiftCountdown } from "@/lib/format";
import { getUser } from "@/lib/auth";
import { logEvent } from "@/lib/events-store";
import { drainEventQueue } from "@/lib/event-queue";
import {
  listMyShiftsToday,
  setShiftTravellingState,
  subscribeShifts,
  raiseUnableToAttend,
  withdrawUnableToAttend,
  type UnableReason,
} from "@/lib/shifts-store";
import { getMyProfile } from "@/lib/profiles-store";
import { listLibraryFiles } from "@/lib/library-store";
import { getOrganisationName, getOrganisationLogoUrl } from "@/lib/settings-store";
import {
  UnableToAttendSheet,
  unableReasonLabel,
} from "@/components/UnableToAttendSheet";
import { resolvedAttentionFeedback } from "@/lib/shifts-store";
import {
  openMapsLink,
  computeNextLeaveBy,
  planRoute,
  requestGeolocationOnce,
  type NextLeaveByInfo,
} from "@/lib/route-planner";
import {
  readShiftOrder,
  applySavedOrder,
  subscribeShiftOrder,
} from "@/lib/shift-order-store";

// MapLibre needs `window`; defer to client-only.
const DashboardMap = dynamic(
  () => import("@/components/DashboardMap").then((m) => m.DashboardMap),
  { ssr: false }
);
import type { DirectionsPreview } from "@/components/DashboardMap";

type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
  /** Raw HH:MM[:SS] + ISO date strings — feeds formatShiftCountdown
   *  on the Up Next card so the rep sees a live "in 50 min" /
   *  "10 min late" / "ends 1h" pill alongside the time row. The
   *  formatted `start` / `end` strings on the parent Shift type are
   *  human display ("9:00 AM"); these raw values are what the
   *  countdown helper needs for math. */
  shiftDate?: string;
  rawStartTime?: string;
  rawEndTime?: string;
  /** Site fields — flat for ergonomic access on cards. Mirror the shape
   *  exposed by lib/shifts-store.ts ShiftWithMeta. */
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  siteLat?: number | null;
  siteLng?: number | null;
  siteGeofenceM?: number | null;
  /** Attention overlay — the up-next card flips into an "Awaiting
   *  manager" state when these are set + unresolved. Mirrors the
   *  /shifts row behaviour so the rep learns the pattern once. */
  attention?: string | null;
  attentionReason?: string | null;
  attentionResolvedAt?: string | null;
  attentionResolution?: string | null;
  /** Flexible-time flag — display "Anytime today" in place of the
   *  start-end range and skip the countdown pill. */
  isFlexibleTime?: boolean;
};

function formatTodayHeader(): string {
  const d = new Date();
  return d
    .toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .replace(",", " ·");
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Friendly display name from an email address. Falls back gracefully when
 * email is missing or malformed. Examples:
 *   gary@example.com           → "Gary"
 *   gary.smith@example.com     → "Gary"
 *   gary_smith@example.com     → "Gary"
 *   merchandiser2@example.com  → "Merchandiser2"
 */
function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] || "";
  const firstPart = local.split(/[._-]/)[0] || local;
  if (!firstPart) return "there";
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

/**
 * Local-storage key for the in-flight travel timestamp. Lives outside
 * React state so closing the app mid-travel doesn't lose the start
 * marker — and so the timer keeps ticking from the right moment when
 * the rep reopens the app.
 */
const TRAVEL_LS_KEY = "morpheus.travelling_since";

/**
 * True if we have ANY way to navigate to the shift's site —
 * coordinates preferred, address as a fallback. Drives the
 * disabled state on Directions + Start travelling buttons so a
 * shift attached to a customer with no address yet doesn't get a
 * dead-tap into the map app.
 */
function hasDestination(s: DbShift): boolean {
  if (typeof s.siteLat === "number" && typeof s.siteLng === "number") return true;
  return Boolean(s.siteAddress && s.siteAddress.trim().length > 0);
}

/**
 * Build a maps deep link for the shift's destination. Coordinates
 * are preferred because they're unambiguous; falls back to the
 * address string when the site hasn't been geocoded yet.
 *
 * The URL form `https://www.google.com/maps/dir/?api=1&destination=...`
 * works on both iOS (the system handles `maps.google.com` URLs into
 * Apple Maps) and Android (Google Maps app if installed, else the
 * web app). Returns null when there's nothing to navigate to.
 */
function buildDirectionsUrl(s: DbShift): string | null {
  if (typeof s.siteLat === "number" && typeof s.siteLng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.siteLat},${s.siteLng}`;
  }
  const addr = (s.siteAddress || "").trim();
  if (addr) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      addr
    )}`;
  }
  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  // Tap-feedback overlay shown the moment the rep taps "Check in to
  // shift" / "Resume shift". Without this, Next's client-side
  // navigation runs silently — there's a ~half-second gap between
  // tap and the destination page mounting where the rep sees nothing
  // change and can't tell whether the tap registered. Now we mount
  // the same CheckingInOverlay used by /check-in itself, in its
  // lighter "opening" mode (no stepper, just the pulsing brand
  // circle + a customer name), and unmount it when the route fully
  // mounts and unloads this page.
  const [opening, setOpening] = useState<{
    mode: CheckMode;
    customerName: string;
  } | null>(null);
  // Directions preview — when set, the dashboard map draws a dashed
  // line between the rep's GPS and this destination + shows a
  // floating "Open in Maps" button. Set from the up-next card's
  // Directions button; cleared when the rep taps the close ✕ on
  // the map overlay or when the up-next shift changes.
  const [directionsPreview, setDirectionsPreview] = useState<
    DirectionsPreview | null
  >(null);
  // Lifted state — UpNextCard reacts to these.
  // (directionsOpen / setDirectionsOpen removed — Directions now
  // opens the OS map app directly via buildDirectionsUrl, no in-app
  // preview state to lift.)
  // travellingSince: rep tapped "Start travelling" — route is now live.
  // Persisted to localStorage so closing the app mid-travel doesn't lose
  // the timer or leave a dangling shift.travel_started without an end.
  const [travellingSince, setTravellingSinceRaw] = useState<number | null>(null);
  // Hydrate from storage once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TRAVEL_LS_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (Number.isFinite(ts) && ts > 0) setTravellingSinceRaw(ts);
      }
    } catch {
      /* SSR or storage blocked */
    }
  }, []);
  // Wrap setter so every transition writes to storage, fires an audit
  // event, AND flips the next-up shift's state column so the admin
  // Live Ops "Travelling" tab can surface this rep mid-route. We pick
  // "next up" as the earliest scheduled shift today; if none exists
  // (rep already checked into everything, or has nothing scheduled)
  // the state flip is a quiet no-op handled inside the store helper.
  const setTravellingSince = (v: number | null) => {
    const wasTravelling = travellingSince !== null;
    setTravellingSinceRaw(v);
    try {
      if (v === null) {
        window.localStorage.removeItem(TRAVEL_LS_KEY);
      } else {
        window.localStorage.setItem(TRAVEL_LS_KEY, String(v));
      }
    } catch {
      /* noop */
    }
    // Find the shift the rep is travelling TO. We can't depend on
    // refetching here (state might be stale by the next render), so
    // we read straight off the current `shifts` snapshot. Earliest
    // scheduled = next destination.
    const nextScheduled = [...shifts]
      .filter((s) => s.state === "scheduled")
      .sort((a, b) => (a.start || "").localeCompare(b.start || ""))[0];

    if (v !== null && !wasTravelling) {
      void logEvent({
        event_type: "shift.travel_started",
        message: "Started travelling",
        ...(nextScheduled?.realId
          ? { shift_id: nextScheduled.realId, customer_id: nextScheduled.id }
          : {}),
      });
      if (nextScheduled?.realId) {
        void setShiftTravellingState(nextScheduled.realId, true);
      }
    } else if (v === null && wasTravelling && travellingSince) {
      // On arrival we flip the FIRST shift currently in 'travelling'
      // back to 'scheduled' (the rep can only be travelling to one
      // place at a time, so this is unambiguous). Use the snapshot
      // we have rather than refetching to avoid a race.
      const travellingShift = shifts.find((s) => s.state === "travelling");
      void logEvent({
        event_type: "shift.travel_ended",
        message: "Arrived",
        meta: { elapsed_sec: Math.floor((Date.now() - travellingSince) / 1000) },
        ...(travellingShift?.realId
          ? { shift_id: travellingShift.realId, customer_id: travellingShift.id }
          : {}),
      });
      if (travellingShift?.realId) {
        void setShiftTravellingState(travellingShift.realId, false);
      }
    }
  };

  // Greeting prefers the profiles.name (set on signup), falls back to email.
  const [displayName, setDisplayName] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>("");
  // Real shifts-today list, used for the count + the progress bar.
  const [shifts, setShifts] = useState<DbShift[]>([]);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  // Real library file count, used for the Library shortcut subtitle.
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  // "Leave by HH:MM · X min drive" line for the next upcoming shift.
  // Computed by the shared planner helper so /shifts and the home
  // page Up Next card show the exact same number. Refetches when
  // the shifts list changes; only the FIRST upcoming shift gets the
  // line so the rest of the day stays uncluttered.
  const [nextLeaveBy, setNextLeaveBy] = useState<NextLeaveByInfo | null>(null);
  useEffect(() => {
    if (!shiftsLoaded) return;
    let cancelled = false;
    computeNextLeaveBy()
      .then((info) => {
        if (!cancelled) setNextLeaveBy(info);
      })
      .catch(() => {
        if (!cancelled) setNextLeaveBy(null);
      });
    return () => {
      cancelled = true;
    };
    // Trigger by shifts list length + the realId set so we recompute
    // when a shift completes / new one lands / states change.
  }, [shiftsLoaded, shifts.map((s) => `${s.realId}:${s.state}`).join("|")]);

  // Saved visit order ("planned my day") — read from localStorage on
  // mount, refreshed whenever the rep saves/clears on /route via the
  // shared shift-order-store event bus. Drives:
  //   - the Up Next picker (within the same state bucket, the
  //     "next" shift follows the saved order)
  //   - the Plan-my-day pill copy ("Plan my day" vs "Day planned ·
  //     view")
  //   - the visual ordering of the home shift list (when we render it)
  const [savedOrder, setSavedOrder] = useState<string[] | null>(() =>
    typeof window === "undefined" ? null : readShiftOrder()
  );
  useEffect(() => {
    setSavedOrder(readShiftOrder());
    return subscribeShiftOrder(() => setSavedOrder(readShiftOrder()));
  }, []);
  // True when the rep has saved an order AND at least one of those
  // shifts is still on the schedule today (so the pill doesn't
  // claim "day planned" using a stale order from earlier).
  const dayPlanned =
    !!savedOrder &&
    savedOrder.length > 0 &&
    shifts.some((s) => savedOrder.includes(s.realId));

  // "I can't make this shift" sheet state — applies to the up-next
  // shift only on the dashboard. Mirrors the /shifts page pattern so
  // the rep learns it once. `unableSheetFor` holds the row currently
  // showing the slide-up sheet; `unableBusyFor` blocks the action
  // while the DB write is in flight.
  const [unableSheetFor, setUnableSheetFor] = useState<
    | { realId: string; name: string }
    | null
  >(null);
  const [unableBusyFor, setUnableBusyFor] = useState<string | null>(null);

  // Promise<void> contract from the sheet — throwing rolls back the
  // sheet's "busy" state and surfaces the error. ok=true → we close.
  const handleRaiseUnable = async (
    realId: string,
    reason: UnableReason,
    note: string
  ) => {
    // eslint-disable-next-line no-console
    console.warn("[unable] home: handleRaiseUnable entry", {
      realId,
      reason,
    });
    setUnableBusyFor(realId);
    const r = await raiseUnableToAttend(realId, reason, note);
    setUnableBusyFor(null);
    // eslint-disable-next-line no-console
    console.warn("[unable] home: raise returned", r);
    if (!r.ok) {
      throw new Error(r.error || "Couldn't notify your manager");
    }
    setUnableSheetFor(null);
    // Refetch so the up-next card flips to "Awaiting manager" without
    // waiting for Realtime to round-trip on slow networks.
    void listMyShiftsToday().then((rows) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[unable] home: refetched shifts",
        rows.map((r) => ({
          realId: r.realId,
          state: r.state,
          attention: r.attention,
        }))
      );
      setShifts(rows);
    });
  };

  const handleWithdrawUnable = async (realId: string) => {
    if (
      !confirm(
        "Withdraw the unable-to-attend flag? You'll be back on the schedule."
      )
    ) {
      return;
    }
    setUnableBusyFor(realId);
    const r = await withdrawUnableToAttend(realId);
    setUnableBusyFor(null);
    if (!r.ok) {
      alert(r.error || "Couldn't withdraw — your manager may already have actioned it.");
      return;
    }
    void listMyShiftsToday().then((rows) => setShifts(rows));
  };

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([
        getMyProfile(),
        getUser(),
        listMyShiftsToday(),
        listLibraryFiles(),
        getOrganisationName(),
        getOrganisationLogoUrl(),
      ]).then(([profile, user, myShifts, libFiles, oName, oLogo]) => {
        if (cancelled) return;
        const fromProfile = profile?.name?.trim();
        setDisplayName(fromProfile || nameFromEmail(user?.email));
        setShifts(myShifts);
        setShiftsLoaded(true);
        setLibraryCount(libFiles.length);
        setOrgName(oName);
        setOrgLogoUrl(oLogo);
      });
    load();
    // Drain any events that failed to send last time the app was open
    // (no network, screen slept mid-request, etc). Best-effort.
    void drainEventQueue();
    // Refetch on tab-becomes-visible so a rep who left the PWA open
    // overnight wakes up to today's shifts, not yesterday's. Also covers
    // the "checked in late last night, opens at 8 AM" case. We also
    // re-drain here — the rep might have done in-app actions while
    // backgrounded that queued events.
    const onVis = () => {
      if (document.visibilityState === "visible") {
        load();
        void drainEventQueue();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    // Realtime: refetch when ANY shift row changes — covers the case
    // where a manager assigns / reassigns / removes a shift while the
    // rep is actively looking at the dashboard. Without this the rep
    // would only see new assignments after switching tabs and coming
    // back (visibilitychange).
    const unsubShifts = subscribeShifts(load);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      unsubShifts();
    };
  }, []);

  const todayHeader = useMemo(formatTodayHeader, []);
  // Tick the AppHeader's last-sync label so it reflects real "now" rather
  // than a hardcoded time. Updates once a minute.
  const [nowLabel, setNowLabel] = useState<string>(() => formatNowTime());
  useEffect(() => {
    const t = setInterval(() => setNowLabel(formatNowTime()), 60_000);
    return () => clearInterval(t);
  }, []);

  const completedCount = shifts.filter((s) => s.state === "complete").length;
  const inProgressCount = shifts.filter((s) => s.state === "in-progress").length;
  const totalCount = shifts.length;

  // First-name only — "Welcome back, Gary" reads better than full name.
  const firstName = displayName.split(/[\s_]/)[0] || displayName;
  const greeting = greetingForNow();

  return (
    <div
      style={{
        background: MC.bg,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}
    >
      {!shiftsLoaded && <LoadingBar />}

      {/* Welcome strip — thin, glassy, branded. Owns the menu button
          inline (top-right) so the home page no longer needs the black
          AppHeader band that used to sit above it. Saves vertical space
          and keeps the dashboard feeling like a single hero card.
          Last-sync indicator is intentionally NOT here — managers
          fed back it cluttered the hero. It moved to the side menu
          footer for anyone who wants to confirm a heartbeat. */}
      <WelcomeStrip
        firstName={firstName}
        greeting={greeting}
        todayHeader={todayHeader}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        nowLabel={nowLabel}
      />

      {/* Shifts-today summary — real data */}
      <div style={{ padding: "14px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {shiftsLoaded ? (
              <>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 30,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.8,
                    lineHeight: 1,
                  }}
                >
                  {totalCount}
                </div>
                <div style={{ fontFamily: MC.font, fontSize: 14, fontWeight: 500, color: MC.mute }}>
                  shift{totalCount === 1 ? "" : "s"} today
                  {completedCount > 0 && (
                    <span style={{ marginLeft: 6, color: MC.ok, fontWeight: 600 }}>
                      · {completedCount} done
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Skeleton width={36} height={28} radius={6} />
                <Skeleton width={140} height={14} />
              </div>
            )}
          </div>
          {/* Single combined "View all" affordance.
              Replaces the previous two-pill cluster (Plan day + View
              all). Now: one brand-tinted pill with TWO tap targets:
                - left segment (icon only) → /route, signals
                  plan-state via the icon itself:
                    🎯 target (no plan yet)
                    ✓ green check (planned)
                - right segment ("View all ›") → /shifts
              A thin divider line separates the two so the rep can
              see they're distinct hit areas. When the rep has fewer
              than 2 remaining stops the left segment hides (no
              planning to do for a single shift) and the pill
              collapses to just "View all". */}
          {(() => {
            const remainingStops = shifts.filter(
              (s) => s.state !== "complete" && s.state !== "cancelled"
            ).length;
            const showPlanSlot = shiftsLoaded && remainingStops >= 2;
            const planned = dayPlanned;
            return (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "stretch",
                  borderRadius: 10,
                  background: MC.brandTint,
                  border: `1px solid ${MC.brand}33`,
                  boxShadow: `0 2px 6px ${MC.brand}22`,
                  overflow: "hidden",
                }}
              >
                {showPlanSlot && (
                  <>
                    <Link
                      href="/route"
                      aria-label={
                        planned
                          ? "Today is planned — view or re-optimize"
                          : "Plan today's route"
                      }
                      title={
                        planned
                          ? "Today's route is planned — tap to view or re-optimize"
                          : "Plan today's route"
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 11px",
                        textDecoration: "none",
                        // Visual weight reflects whether there's
                        // work to do:
                        //  - planned    → okTint surface (confirmation)
                        //  - unplanned  → solid brand-deep fill so
                        //    the icon pops as a real CTA. Earlier
                        //    iteration sat on transparent and Gary
                        //    flagged it "not clear or strong enough
                        //    when there's a day to optimize" — solid
                        //    fill + white glyph fixes that without
                        //    inflating the pill width.
                        background: planned ? MC.okTint : MC.brandDeep,
                      }}
                    >
                      <Glyph
                        name={planned ? "check-circle" : "target"}
                        size={15}
                        color={planned ? MC.ok : "#fff"}
                        strokeWidth={2.4}
                      />
                    </Link>
                    {/* Thin separator so the two halves read as
                        distinct tap targets. */}
                    <div
                      style={{
                        width: 1,
                        background: `${MC.brand}33`,
                        margin: "6px 0",
                      }}
                    />
                  </>
                )}
                <Link
                  href="/shifts"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 14px",
                    fontFamily: MC.font,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: MC.brandDeep,
                    letterSpacing: -0.1,
                    textDecoration: "none",
                  }}
                >
                  View all
                  <Glyph name="chev-r" size={15} color={MC.brandDeep} strokeWidth={2.4} />
                </Link>
              </div>
            );
          })()}
        </div>
        {/* Progress bar: green = complete, brand = in-progress, grey = scheduled. */}
        {totalCount > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {shifts.map((s) => (
              <div
                key={s.realId}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 999,
                  background:
                    s.state === "complete"
                      ? MC.ok
                      : s.state === "in-progress"
                      ? MC.brand
                      : "#DCE0E6",
                }}
                title={`${s.name} · ${s.state}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Map of today's shifts + the rep's GPS dot. Always rendered
          (no shifts-loaded gate) so the home screen doesn't reflow
          every time the app cold-starts — pins just layer in as the
          shifts data arrives. */}
      <DashboardMap
        shifts={shifts}
        preview={directionsPreview}
        onClosePreview={() => setDirectionsPreview(null)}
      />

      {/* Up Next — primary CTA */}
      <UpNextCard
        shifts={shifts}
        loaded={shiftsLoaded}
        nextLeaveBy={nextLeaveBy}
        savedOrder={savedOrder}
        travellingSince={travellingSince}
        setTravellingSince={setTravellingSince}
        inProgressCount={inProgressCount}
        onPreviewDirections={(p) => {
          // Two-phase preview so the rep gets instant feedback:
          //   1. Set the preview NOW with no polyline — DashboardMap
          //      shows a dashed straight-line placeholder + the
          //      "Calculating route…" caption while we fetch.
          //   2. Async: call planRoute for this single stop with the
          //      rep's GPS as origin. When the response lands, merge
          //      the encoded polyline + drive time + distance into
          //      the existing preview state so the map upgrades the
          //      dashed line to the real road-following route + the
          //      caption flips to "12 min · 5.2 km".
          // If GPS is denied, the dashed straight-line stays + the
          // overlay shows the existing label; Open in Maps still
          // works as the OS's turn-by-turn handoff.
          setDirectionsPreview(p);
          if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
          // Fire planRoute in the background. Capture the preview's
          // lat/lng so a fast follow-up tap on a different shift
          // doesn't accidentally merge stale data — we re-check
          // identity inside setDirectionsPreview before merging.
          void (async () => {
            const origin = await requestGeolocationOnce();
            if (!origin) return; // no GPS → keep the straight-line fallback
            try {
              const planned = await planRoute(
                origin,
                [{ id: "preview", lat: p.lat, lng: p.lng, label: p.label }],
                { optimize: false }
              );
              const leg = planned.legs[0];
              if (!leg) return;
              setDirectionsPreview((cur) => {
                // Race-safe: only merge if the preview still points
                // at the same destination. If the rep tapped a
                // different shift's Directions in the meantime,
                // we silently drop this stale response.
                if (!cur || cur.lat !== p.lat || cur.lng !== p.lng) {
                  return cur;
                }
                return {
                  ...cur,
                  polyline: leg.polyline ?? null,
                  driveSeconds: leg.driveSeconds,
                  driveMeters: leg.driveMeters,
                  trafficAware: planned.trafficAware,
                };
              });
            } catch {
              /* planner failed — leave the dashed straight-line +
               * the destination tile in place. The rep can still
               * hit Open in Maps for real turn-by-turn. */
            }
          })();
        }}
        onUnableToAttend={(s) =>
          setUnableSheetFor({ realId: s.realId, name: s.name })
        }
        onWithdrawUnable={handleWithdrawUnable}
        unableBusyFor={unableBusyFor}
        onOpenShift={(mode, customerName, href) => {
          // Show the overlay BEFORE router.push so the rep sees
          // motion the moment they tap. The destination page mounts
          // its own page-level overlay (check-in shows the 3-phase
          // stepper while it talks to Supabase), then this page
          // unmounts and the overlay disappears with it.
          setOpening({ mode, customerName });
          router.push(href);
        }}
      />

      {/* Plan-my-day pill moved (May 12) — used to live as its own
          row below Up Next. The new home is next to "View all" in
          the top stats row (see the section above) where the day-
          summary actions cluster naturally. The bottom of the page
          flows cleaner with one less stand-alone row. */}

      {/* Break or travel — combined affordance. The chooser sheet lets
          the rep pick break length OR start a travel timer without
          first opening a shift card. */}
      <BreakOrTravelCard
        travellingSince={travellingSince}
        setTravellingSince={setTravellingSince}
      />

      {/* Library shortcut — count is real */}
      <Link
        href="/library"
        style={{ padding: "14px 16px 22px", textDecoration: "none", display: "block" }}
      >
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: MC.brandTint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="book" size={20} color={MC.brandDeep} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 15,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.2,
              }}
            >
              Library
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 12.5, color: MC.mute, marginTop: 2 }}>
              {libraryCount === null
                ? "Loading…"
                : libraryCount === 0
                ? "No files yet"
                : `${libraryCount} file${libraryCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.hint} />
        </div>
      </Link>

      <AppFooter />

      {/* Confirm-and-pick-reason sheet for the up-next card's "I can't
          make this shift" link. Mounted at the dashboard root so it
          slides over the whole page. Same component the /shifts list
          uses — single source of truth for the reason picker. */}
      {unableSheetFor && (
        <UnableToAttendSheet
          shiftName={unableSheetFor.name}
          onClose={() =>
            unableBusyFor === unableSheetFor.realId
              ? undefined
              : setUnableSheetFor(null)
          }
          onSubmit={(reason, note) =>
            handleRaiseUnable(unableSheetFor.realId, reason, note)
          }
        />
      )}

      {/* Tap-feedback overlay shown the moment the rep taps a CTA
          that navigates to another page. Stays mounted until React
          unmounts this whole page, which Next.js does once the
          destination route finishes rendering. The check-in /
          check-out destinations mount their own page-level overlay
          (with the 3-phase stepper) the moment they load, so the
          handoff looks like one continuous loading state from tap
          to "Saved ✓". */}
      {opening && (
        <CheckingInOverlay
          mode={opening.mode}
          customerName={opening.customerName}
          phase="submitting"
        />
      )}
    </div>
  );
}

/**
 * Up Next card — picks the next thing the rep should focus on:
 *   - If they have an in-progress shift → "Resume shift" CTA.
 *   - Else if they have a scheduled shift today → "Check in to shift" CTA.
 *   - Else → empty state nudging /shifts.
 *
 * Shifts come down from the dashboard so we don't double-fetch.
 */
function UpNextCard({
  shifts,
  loaded,
  nextLeaveBy,
  savedOrder,
  travellingSince,
  setTravellingSince,
  inProgressCount,
  onUnableToAttend,
  onWithdrawUnable,
  unableBusyFor,
  onOpenShift,
  onPreviewDirections,
}: {
  shifts: DbShift[];
  loaded: boolean;
  /** Computed by the parent via computeNextLeaveBy(). When the
   *  realId matches the up-next shift AND the rep isn't already at
   *  the customer, the card renders a small "Leave by HH:MM · X
   *  min drive" line. Otherwise hidden. */
  nextLeaveBy: NextLeaveByInfo | null;
  /** Per-rep saved visit order from /route → Save this order. When
   *  set, the "next up" picker prefers shifts in this order within
   *  the same state-priority bucket. Null = chronological fallback. */
  savedOrder: string[] | null;
  travellingSince: number | null;
  setTravellingSince: (v: number | null) => void;
  inProgressCount: number;
  /** Tap on Directions → parent draws a dashed route line on the
   *  dashboard map between the rep's GPS and the destination, plus
   *  a floating "Open in Maps" button that hands off to the OS map
   *  app for turn-by-turn. Replaces the previous behaviour of
   *  immediately opening Google Maps in a new tab. */
  onPreviewDirections: (p: DirectionsPreview) => void;
  /** Open the unable-to-attend sheet for the up-next shift.
   *  Defined only when the next shift is scheduled and clean. */
  onUnableToAttend?: (shift: DbShift) => void;
  /** Withdraw a previously-raised attention flag on the next shift. */
  onWithdrawUnable?: (shiftRealId: string) => void;
  /** Real id of the shift currently in a raise/withdraw DB call.
   *  Used to disable the Withdraw button while it's in flight. */
  unableBusyFor?: string | null;
  /** Tap-feedback navigation. Called when the rep taps "Check in to
   *  shift" or "Resume shift" — parent shows the brand-tinted
   *  overlay BEFORE pushing the route so the gap between tap and
   *  destination-mount isn't a silent dead zone. */
  onOpenShift: (mode: CheckMode, customerName: string, href: string) => void;
}) {
  // Pick the rep's "up next" shift.
  //
  // Bug fix (May 11 — second pass): the original code only looked at
  // 'in-progress' and 'scheduled'. The shift state machine has other
  // live values too:
  //   - 'travelling' — rep started a travel timer toward the site
  //   - 'on-break'   — rep is mid-shift, paused
  //   - 'late'       — start time passed without check-in
  // When the rep's only remaining shift was in one of those states
  // (e.g. they had 4/5 complete and the last one was 'travelling'),
  // `next` came back null and the card falsely rendered "No shift
  // assigned today" — even though shifts.length > 0 and the progress
  // strip above clearly showed work remaining.
  //
  // New rule: anything that isn't terminal is a candidate. Priority
  // order surfaces the most urgent state first so the CTA reads
  // sensibly. Cancelled shifts are already filtered out server-side
  // (see listMyShiftsToday in lib/shifts-store.ts) so we only have to
  // exclude 'complete' here.
  const PRIORITY: Record<string, number> = {
    "in-progress": 0,
    "on-break": 1,
    travelling: 2,
    late: 3,
    scheduled: 4,
  };
  // Apply the saved visit order BEFORE the state-priority sort.
  // Array.sort is stable, so within the same priority bucket the
  // saved-order positioning survives. End result: if the rep has
  // saved an order, "next up" follows it within the relevant
  // priority bucket; with no saved order it falls back to the
  // server's chronological ordering.
  const ordered = applySavedOrder(shifts, savedOrder);
  const candidates = ordered
    .filter((s) => s.state !== "complete" && PRIORITY[s.state] !== undefined)
    .sort((a, b) => PRIORITY[a.state] - PRIORITY[b.state]);
  const next = candidates[0] || null;
  // "Resume" means the rep already has a live shift on-the-go — any
  // non-scheduled live state qualifies. Without this, a rep mid-break
  // saw "Check in to shift" again on the up-next card.
  // "Resume" copy only makes sense when the rep is already AT the
  // customer — either actively working ('in-progress') or paused
  // mid-shift ('on-break'). 'travelling' means the rep started a
  // travel timer but hasn't arrived yet, so the right CTA there is
  // still "Check in to shift", not "Resume" — you can't resume
  // something you never started. (Initial broadening of this set
  // included 'travelling'; that caused /shifts and home to disagree
  // for the same row when a rep was mid-break — home said Resume,
  // /shifts said Check in.)
  const isResume =
    !!next && (next.state === "in-progress" || next.state === "on-break");
  void inProgressCount; // currently unused; kept for future polish
  const [now, setNow] = useState(Date.now());

  // Note: the home Up Next card used to auto-fire the directions
  // preview on mount (mirroring /shifts inline mini-map). Reverted
  // 2026-05-12 per Gary's feedback — on home the map should default
  // to the day-overview pin view; reps who want directions tap the
  // explicit button. /shifts kept the auto-fire because expanding a
  // row there is a deliberate "I want to see this stop" action, so
  // showing the route immediately is the right call. Different
  // surfaces, different defaults — kept intentional.

  // Tick once a minute always — drives the leave-by staleness check
  // ("Leave by 10:13" should disappear at 10:13). Pre-fix the only
  // tick was the 1-second one below, gated on `travellingSince`, so
  // a rep who wasn't travelling never re-evaluated the wall clock
  // and the leave-by pill kept showing past times.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Second-granular tick only while travelling — drives the live
  // mm:ss travel timer.
  useEffect(() => {
    if (!travellingSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [travellingSince]);

  // Auto-end travelling when the rep checks in. The Stop button is
  // hidden once `isResume` is true (the rep is on the shift, there's
  // nothing to travel TO), so without this the travel timer would
  // run forever in localStorage. setTravellingSince(null) also fires
  // the `shift.travel_ended` event so the audit log stays correct.
  useEffect(() => {
    if (isResume && travellingSince !== null) {
      setTravellingSince(null);
    }
  }, [isResume, travellingSince, setTravellingSince]);

  const elapsed = travellingSince ? Math.floor((now - travellingSince) / 1000) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedLabel = `${m}:${String(s).padStart(2, "0")}`;

  // Empty state: distinguish "no shifts at all" vs "all shifts done today".
  // A rep who completed every shift shouldn't be told "no shift assigned".
  // "Done" here means any terminal state — complete or cancelled — so the
  // celebration fires even if one of the day's shifts ended up cancelled
  // by a manager. (cancelled is normally filtered server-side, but
  // mirroring the rule here keeps the check honest.)
  if (loaded && !next) {
    const totalToday = shifts.length;
    const TERMINAL = new Set(["complete", "cancelled"]);
    const allDone = totalToday > 0 && shifts.every((s) => TERMINAL.has(s.state));
    if (allDone) {
      return (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              background: `linear-gradient(135deg, ${MC.okTint} 0%, #ffffff 80%)`,
              borderRadius: MC.radiusCard,
              padding: 18,
              border: `1px solid ${MC.ok}33`,
              display: "flex",
              alignItems: "center",
              gap: 14,
              boxShadow: `0 6px 20px ${MC.ok}1a`,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: MC.ok,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 4px 12px ${MC.ok}55`,
                flexShrink: 0,
              }}
            >
              <Glyph name="check" size={22} color="#fff" strokeWidth={2.6} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 16,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.2,
                }}
              >
                All shifts done — nice work.
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                {totalToday} shift{totalToday === 1 ? "" : "s"} completed today.
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: "12px 16px 0" }}>
        <Link href="/shifts" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: MC.card,
              borderRadius: MC.radiusCard,
              padding: 18,
              border: `1px dashed ${MC.line}`,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: MC.bg,
                border: `1px solid ${MC.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Glyph name="clock" size={20} color={MC.mute} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 16,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.2,
                }}
              >
                No shift assigned today
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                Tap to view available shifts you can claim
              </div>
            </div>
            <Glyph name="chev-r" size={18} color={MC.hint} />
          </div>
        </Link>
      </div>
    );
  }

  // Skeleton while loading
  if (!loaded || !next) return null;

  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div
        style={{
          background: MC.card,
          borderRadius: MC.radiusCard,
          padding: 16,
          boxShadow: "0 1px 2px rgba(10,15,30,.04), 0 8px 24px rgba(10,15,30,.06)",
          border: `1px solid ${travellingSince ? MC.brand + "55" : MC.line}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Soft brand wash when travelling */}
        {travellingSince && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${MC.brandTint} 0%, transparent 60%)`,
              pointerEvents: "none",
            }}
          />
        )}

        <div style={{ position: "relative" }}>
          {/* Header row: status pill (UP NEXT or live TRAVELLING) + shift code */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {travellingSince ? (
              <TravellingPill elapsedLabel={elapsedLabel} />
            ) : (
              <StatusChip tone="brand" icon="sparkle">Up next</StatusChip>
            )}
            {/* "Can't make this shift?" — icon-only affordance
                top-right of the card. Previously transparent + neutral
                line border, which was too easy to miss — managers
                reported "I didn't realise that was clickable." Bumped
                to a warnTint background + warnTint border so it reads
                as a real action without screaming. Still icon-only
                (no label) to keep it from competing with the primary
                Check-in CTA. Tap opens the unable-to-attend sheet;
                long-press / hover reveals the full title.
                Hidden once the shift is in-progress / on-break (no
                point offering the action then — the rep's already on
                it). */}
            {!isResume && onUnableToAttend && (
              <button
                type="button"
                onClick={() => onUnableToAttend(next)}
                aria-label="Can't make this shift?"
                title="Can't make this shift?"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 99,
                  background: MC.warnTint,
                  border: `1px solid ${MC.warn}55`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  boxShadow: `0 1px 2px ${MC.warn}22`,
                }}
              >
                <Glyph
                  name="warn"
                  size={14}
                  color={MC.warn}
                  strokeWidth={2.4}
                />
              </button>
            )}
          </div>

          {/* Customer */}
          <div
            style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}
          >
            <CustomerTile initials={next.initials} color={next.color} size={48} logoUrl={next.logoUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 18,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.3,
                  lineHeight: 1.15,
                }}
              >
                {next.name}
                {/* Site sublabel — only for customers with a non-default
                    site name. Quiet for the single-site case. */}
                {next.siteName && next.siteName !== "Head office" && (
                  <span
                    style={{
                      fontFamily: MC.font,
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: MC.mute,
                      letterSpacing: 0,
                      marginLeft: 6,
                    }}
                  >
                    · {next.siteName}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 13,
                  color: MC.mute,
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {next.isFlexibleTime ? "Anytime today" : `${next.start} – ${next.end}`}
                  {next.distance ? ` · ${next.distance}` : ""}
                </span>
                {/* Live countdown pill — "in 50 min" / "starting now"
                    / "10 min late" / "ends 1h" / "ran 30 min over".
                    Restored here after an earlier refactor stripped
                    it from the home card; managers had grown used to
                    glancing at this for at-a-glance urgency without
                    opening the card.
                    `now` is the home-card state that ticks once a
                    minute (see the useEffect above), so the label
                    updates every minute without each row owning a
                    timer. Hidden when the shift has no scheduled
                    times on record (formatShiftCountdown returns
                    null). */}
                {(() => {
                  // Flexible-time shifts have no scheduled start to
                  // count down to — suppress the timing pill so we
                  // don't show "5h late" for a 06:00 sentinel.
                  if (next.isFlexibleTime) return null;
                  const timing = formatShiftCountdown(
                    next.shiftDate || "",
                    next.rawStartTime || "",
                    next.rawEndTime || "",
                    next.state,
                    new Date(now)
                  );
                  if (!timing) return null;
                  const tone =
                    timing.tone === "late"
                      ? { bg: MC.dangerTint, fg: "#9c1a3c" }
                      : timing.tone === "now"
                      ? { bg: MC.warnTint, fg: "#7A560A" }
                      : timing.tone === "live"
                      ? { bg: MC.okTint, fg: "#0d6a45" }
                      : timing.tone === "soon"
                      ? { bg: MC.brandTint, fg: MC.brandDeep }
                      : { bg: "#EEF0F3", fg: MC.ink2 };
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: tone.bg,
                        color: tone.fg,
                        fontFamily: MC.font,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                      }}
                    >
                      {timing.label}
                    </span>
                  );
                })()}
              </div>
              {/* Small address line so the rep can see the actual
                  street without having to open the card. Truncates
                  on overflow; tooltip shows the full string. */}
              {next.siteAddress && (
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: MC.hint,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={next.siteAddress}
                >
                  <Glyph name="pin" size={11} color={MC.hint} strokeWidth={2} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {next.siteAddress}
                  </span>
                </div>
              )}
              {/* Leave-by line — only when the planner could compute
                  it (we have real GPS origin + the up-next shift
                  hasn't started yet). Tiny single-line pill so it
                  reads as actionable info without crowding the card.
                  Same shape on the /shifts row so reps learn the
                  pattern once.
                  Also auto-hides when the leave-by time has passed —
                  showing "Leave by 10:13" at 12:20 PM was just
                  noise. The minute-tick on `now` above drives the
                  re-render so the pill disappears as soon as the
                  leave-by time crosses. The shift's own state badge
                  ("1H 50M LATE") still tells the urgency story. */}
              {!isResume &&
                nextLeaveBy &&
                nextLeaveBy.shiftRealId === next.realId &&
                nextLeaveBy.leaveBy.getTime() > now && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: MC.font,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "#7A560A",
                    background: MC.warnTint,
                    border: `1px solid ${MC.warn}33`,
                    padding: "4px 8px 4px 6px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    letterSpacing: 0.2,
                  }}
                  title={
                    nextLeaveBy.trafficAware
                      ? "Based on live traffic"
                      : "Estimated drive time"
                  }
                >
                  <Glyph name="clock" size={11} color={MC.warn} strokeWidth={2.4} />
                  Leave by{" "}
                  {nextLeaveBy.leaveBy.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}{" "}
                  ·{" "}
                  {Math.max(1, Math.round(nextLeaveBy.driveSeconds / 60))} min drive
                </div>
              )}
            </div>
          </div>

          {/* Attention raised → swap out the entire action block for
              an inline "Awaiting manager" banner + Withdraw button.
              We hide Directions / Travel / Check-in entirely so a rep
              who just told us they can't make it can't also tap
              Check-in by mistake. Same look as the /shifts row, so
              the rep recognises the state instantly. */}
          {next.attention === "unable_to_attend" && !next.attentionResolvedAt ? (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: MC.warnTint,
                border: `1px solid ${MC.warn}55`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Glyph name="warn" size={20} color={MC.warn} strokeWidth={2.2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#6d4808",
                    letterSpacing: -0.1,
                  }}
                >
                  Awaiting manager
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: "#7d5708",
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  Reason: {unableReasonLabel(next.attentionReason)} · Your
                  manager will reassign or release this shift.
                </div>
              </div>
              {onWithdrawUnable && (
                <button
                  type="button"
                  onClick={() => onWithdrawUnable(next.realId)}
                  disabled={unableBusyFor === next.realId}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${MC.warn}66`,
                    background: "#fff",
                    color: "#6d4808",
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor:
                      unableBusyFor === next.realId ? "not-allowed" : "pointer",
                    opacity: unableBusyFor === next.realId ? 0.6 : 1,
                  }}
                >
                  {unableBusyFor === next.realId ? "…" : "Withdraw"}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Resolved-recently pill — when the rep raised a flag
                  and it's since been actioned (or they withdrew it),
                  show a brief confirmation for up to four hours.
                  Only renders for outcomes that leave the rep still
                  seeing the row (acknowledged / withdrawn). */}
              {(() => {
                const fb = resolvedAttentionFeedback(next);
                if (!fb) return null;
                const isOk = fb.tone === "ok";
                return (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: isOk ? MC.okTint : MC.brandTint,
                      border: `1px solid ${isOk ? MC.ok + "55" : MC.brand + "55"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Glyph
                      name="check-circle"
                      size={18}
                      color={isOk ? MC.ok : MC.brandDeep}
                      strokeWidth={2.2}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: MC.font,
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: isOk ? "#0d6a45" : MC.brandInk,
                          letterSpacing: -0.1,
                        }}
                      >
                        {fb.label}
                      </div>
                      <div
                        style={{
                          fontFamily: MC.font,
                          fontSize: 12,
                          color: isOk ? "#0d6a45" : MC.brandDeep,
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {fb.detail}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Two-button row: Directions + Start/Stop travelling.
                    Hidden once the shift is in-progress — the rep is
                    already on-site so there's nothing to travel TO.
                    Directions opens the in-app route preview on the
                    dashboard map (or hands straight to the OS map
                    app when we don't have coords on file); Start
                    travelling does the same AND starts the in-app
                    travel timer + fires the shift.travel_started
                    audit event.

                    Earlier iteration auto-fired the directions
                    preview on mount to match /shifts inline mini-
                    map behaviour. Reverted 2026-05-12 per Gary:
                    home defaults to a clean day-overview pin view,
                    and reps who want the route tap the explicit
                    Directions button. /shifts kept the auto-fire
                    because expanding a row there is already a
                    deliberate "show me this stop" gesture. */}
                {!isResume && (() => {
                  // Pull the disabled state up so both buttons share
                  // it cleanly. The disabled visual was previously
                  // just opacity:0.5 — managers fed back it was too
                  // subtle ("I couldn't tell it was disabled at a
                  // glance"). Now we swap the background to a muted
                  // tint, dim every inner colour, and keep
                  // cursor:not-allowed so taps don't even feel like
                  // they registered.
                  const enabled = hasDestination(next);
                  const disabledStyle: React.CSSProperties = enabled
                    ? {}
                    : {
                        background: MC.bg,
                        borderColor: MC.line,
                        color: MC.hint,
                        cursor: "not-allowed",
                        opacity: 1,
                      };
                  const iconColor = enabled ? MC.brandDeep : MC.hint;
                  return (
                    <>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!enabled) return;
                            const url = buildDirectionsUrl(next);
                            if (!url) return;
                            // Coords required for the in-app preview
                            // polyline; if we only have an address
                            // string (no lat/lng yet) we fall back
                            // to opening Maps directly because we
                            // can't draw the line. Most customers
                            // have coords via the geocoder once an
                            // address is saved.
                            const hasCoords =
                              typeof next.siteLat === "number" &&
                              typeof next.siteLng === "number";
                            if (hasCoords) {
                              onPreviewDirections({
                                lat: next.siteLat as number,
                                lng: next.siteLng as number,
                                label: next.name,
                                openUrl: url,
                              });
                            } else {
                              openMapsLink(url);
                            }
                          }}
                          disabled={!enabled}
                          style={{
                            ...secondaryBtnStyle,
                            flex: 1,
                            ...disabledStyle,
                          }}
                          title={
                            enabled
                              ? "Preview the route on the map above"
                              : "No address on this site yet"
                          }
                        >
                          <Glyph
                            name="target"
                            size={16}
                            color={iconColor}
                            strokeWidth={2.2}
                          />
                          Directions
                        </button>
                        {travellingSince ? (
                          <button
                            type="button"
                            onClick={() => setTravellingSince(null)}
                            style={{ ...secondaryBtnStyle, flex: 1.4 }}
                          >
                            <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                            Stop · {formatTime(travellingSince)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!enabled) return;
                              // Start the in-app timer first so the audit
                              // event fires + the next shift's state
                              // flips to "travelling" before we hand off
                              // to the OS map app.
                              setTravellingSince(Date.now());
                              const url = buildDirectionsUrl(next);
                              if (url) {
                                openMapsLink(url);
                              }
                            }}
                            disabled={!enabled}
                            style={{
                              ...secondaryBtnStyle,
                              flex: 1.4,
                              ...disabledStyle,
                            }}
                            title={
                              enabled
                                ? "Starts the travel timer and opens directions in your map app"
                                : "No address on this site yet"
                            }
                          >
                            <Glyph name="pin" size={16} color={iconColor} strokeWidth={2.2} />
                            Start travelling
                          </button>
                        )}
                      </div>
                      {/* Inline hint when both buttons are disabled —
                          replaces the alert() that fired only on tap;
                          a passive line is more discoverable + less
                          jarring. */}
                      {!enabled && (
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: MC.font,
                            fontSize: 11.5,
                            color: MC.hint,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Glyph name="info" size={12} color={MC.hint} strokeWidth={2} />
                          <span>
                            No address on this site yet — ask your manager
                            to add one.
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
                {isResume ? (
                  <PrimaryButton
                    icon="arrow-r"
                    onClick={() =>
                      onOpenShift("opening", next.name || "your shift", "/active")
                    }
                  >
                    Resume shift
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    icon="log"
                    onClick={() =>
                      onOpenShift(
                        "opening",
                        next.name || "your shift",
                        `/check-in?shift=${next.realId}`
                      )
                    }
                  >
                    Check in to shift
                  </PrimaryButton>
                )}
              </div>

              {/* The yellow "you'll record any off-site or late reason
                  at check-in" banner used to sit here. Removed in
                  favour of a calmer card — managers fed back that the
                  shift card was too text-heavy. The check-in flow
                  itself surfaces an off-site / late / early card
                  inline with reasons when those exceptions actually
                  fire, so the up-front warning was redundant. */}

              {/* The underlined "Can't make this shift?" link that
                  used to live here moved to a small icon-only button
                  in the top-right corner of the card (see header
                  row above). Managers fed back the text link was too
                  prominent sitting right under the primary Check-in
                  CTA; an icon corner-button is discoverable without
                  competing for attention. */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryBtnStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  background: MC.card,
  color: MC.brandDeep,
  border: `1px solid ${MC.brand}33`,
  fontFamily: MC.font,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: -0.1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

/**
 * Greeting that adapts to time of day. Keeps the welcome strip from
 * always saying the same thing — small touch, big "this app pays
 * attention" feel.
 */
function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * WelcomeStrip — branded header that replaces the old plain "Welcome
 * back, X" line. Shows org logo (if uploaded) on the left, time-aware
 * greeting + first name big in the middle, and date subtle below.
 * Uses the Morpheus brand cyan as a subtle gradient wash so it pops
 * without being loud.
 */
function WelcomeStrip({
  firstName,
  greeting,
  todayHeader,
  orgName,
  orgLogoUrl,
  nowLabel,
}: {
  firstName: string;
  greeting: string;
  todayHeader: string;
  orgName: string;
  orgLogoUrl: string;
  /** Current wall-clock time as "HH:MM AM/PM". Appended to the
   *  small-caps top line so the rep can glance at the home page and
   *  see what time it is now. Different from "Last sync" (which got
   *  moved to the side-menu footer) — this is just "what time is it
   *  right now", which managers said they wanted visible. */
  nowLabel?: string;
}) {
  const { setOpen } = useMenu();
  return (
    <div
      style={{
        position: "relative",
        // Top margin respects the iOS safe-area inset (notch / dynamic
        // island) since the strip now sits at the very top of the
        // page — the black AppHeader band used to handle this.
        margin: "max(env(safe-area-inset-top, 0px), 12px) 14px 4px",
        padding: "10px 14px 12px",
        borderRadius: 18,
        background: `linear-gradient(135deg, ${MC.brand} 0%, ${MC.brandDeep} 60%, #073B47 110%)`,
        color: "#fff",
        boxShadow: `0 10px 30px ${MC.brand}33, inset 0 1px 0 rgba(255,255,255,.18)`,
        overflow: "hidden",
      }}
    >
      {/* Subtle grid pattern overlay — gives it depth without being noisy */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(255,255,255,.18), transparent 40%), radial-gradient(circle at 90% 100%, rgba(0,0,0,.18), transparent 35%)",
          pointerEvents: "none",
        }}
      />
      {/* alignItems:flex-start so when the greeting wraps to two lines,
          the menu button sits next to the FIRST line rather than
          floating in the vertical centre of the whole text block. Cuts
          the empty space below the menu that managers noticed when the
          rep had a long name. */}
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "rgba(255,255,255,.16)",
            border: "1px solid rgba(255,255,255,.25)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogoUrl}
              alt={orgName || "Org"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Glyph name="sparkle" size={18} color="#fff" strokeWidth={2.2} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top small-caps line — org + date on the LEFT (truncate
              on overflow), current time pinned on the RIGHT in its
              own flex item so it stays visible even when the org
              name is long. Previously the whole line was one
              white-space:nowrap + ellipsis container, so a long org
              name would chop the date AND the time off the right
              edge before the rep ever saw them. */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontFamily: MC.font,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,.75)",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={`${orgName || "Morpheus"} · ${todayHeader}`}
            >
              {orgName || "Morpheus"} · {todayHeader}
            </span>
            {nowLabel && (
              <span
                style={{
                  color: "rgba(255,255,255,.95)",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {nowLabel}
              </span>
            )}
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 20,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: -0.4,
              marginTop: 2,
              // Allow the greeting to wrap to a second line for long
              // names. The old whiteSpace:nowrap + ellipsis was
              // truncating people like "Garydurbach" into
              // "Good afternoon, Garydur…" which felt rude — losing
              // your own name to ellipsis on your own dashboard.
              // overflow-wrap on long unbroken strings lets us still
              // break the inevitable 30-char handles if they appear.
              lineHeight: 1.2,
              overflowWrap: "anywhere",
            }}
          >
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </div>
        </div>
        {/* Hamburger menu — used to live in the black AppHeader strip
            above the welcome card. Folding it inline frees up vertical
            space and keeps everything on a single line so the greeting
            is the first thing the rep notices. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.25)",
            background: "rgba(255,255,255,.16)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Glyph name="menu" size={20} color="#fff" strokeWidth={2.2} />
        </button>
      </div>
      {/* The "Last sync · …" line that used to live in its own row
          here has been folded into the small-caps line above next to
          the org name + date, eliminating the empty band of card
          background that was sitting under the greeting. */}
    </div>
  );
}

/**
 * BreakOrTravelCard — combined "pause your day" affordance on the
 * dashboard. Tapping opens a chooser sheet with break-length options
 * AND a travel-now option, so reps can start either timer in one
 * place. Travel state is owned by the dashboard (lifted) so the
 * UpNextCard's travel button stays in sync.
 */
const BREAK_LS_KEY = "morpheus.break_since";

function BreakOrTravelCard({
  travellingSince,
  setTravellingSince,
}: {
  travellingSince: number | null;
  setTravellingSince: (v: number | null) => void;
}) {
  const PURPLE = "#5b3da5";
  const PURPLE_TINT = "#EDE7F8";
  const [breakSince, setBreakSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  // Whether the duration-chooser sheet is open. Tapping the card no
  // longer auto-starts anything — it opens this sheet so the rep picks
  // break length OR travel first. Stops the "I tapped and suddenly
  // I'm on break" surprise.
  const [chooserOpen, setChooserOpen] = useState(false);

  // Hydrate from storage on mount so a break started from another
  // surface (e.g. the post-checkout summary) shows up here as live.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BREAK_LS_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (Number.isFinite(ts) && ts > 0) setBreakSince(ts);
      }
    } catch {
      /* SSR / blocked storage */
    }
  }, []);

  useEffect(() => {
    if (!breakSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [breakSince]);
  // Compute elapsed off Date.now() rather than the `now` state — `now`
  // is only there to trigger re-renders. Using it for the value caused
  // a brief negative blink right after starting a break (because `now`
  // was last set on mount, before breakSince). Math.max(0, ...) is
  // belt-and-braces in case a clock skew sets breakSince in the future.
  // We still reference `now` so React knows to re-read on each tick.
  void now;
  const elapsed = breakSince
    ? Math.max(0, Math.floor((Date.now() - breakSince) / 1000))
    : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  // Off-shift break — no shift_id attached, but the event still goes
  // into shift_events so the audit trail captures rest time.
  // `targetMinutes` is purely informational (logged in the event meta)
  // — the timer counts up, not down, so reps can take longer if they
  // need to and we still capture elapsed time.
  const startBreak = (targetMinutes: number | null) => {
    const ts = Date.now();
    setBreakSince(ts);
    setNow(ts); // sync `now` so the elapsed render is exactly 0:00
    setChooserOpen(false);
    try {
      window.localStorage.setItem(BREAK_LS_KEY, String(ts));
    } catch {
      /* noop */
    }
    void logEvent({
      event_type: "shift.break_started",
      message: targetMinutes
        ? `Started a ${targetMinutes}-minute break (off-shift)`
        : "Started a rest break (off-shift)",
      meta: {
        kind: "off_shift",
        ...(targetMinutes ? { target_minutes: targetMinutes } : {}),
      },
    });
  };
  const endBreak = () => {
    const startedAt = breakSince;
    setBreakSince(null);
    try {
      window.localStorage.removeItem(BREAK_LS_KEY);
    } catch {
      /* noop */
    }
    if (startedAt) {
      void logEvent({
        event_type: "shift.break_ended",
        message: "Ended a rest break (off-shift)",
        meta: {
          kind: "off_shift",
          elapsed_sec: Math.floor((Date.now() - startedAt) / 1000),
        },
      });
    }
  };

  return (
    <div style={{ padding: "12px 16px 0" }}>
      {breakSince === null && !travellingSince ? (
        <button
          type="button"
          onClick={() => setChooserOpen(true)}
          style={{
            width: "100%",
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: MC.radiusCard,
            padding: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: PURPLE_TINT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph name="clock" size={20} color={PURPLE} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 15,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.2,
              }}
            >
              Take a break or travel now
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12.5,
                color: MC.mute,
                marginTop: 2,
              }}
            >
              Pause your day · 15 / 30 / 60 min · or start a travel timer
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.hint} />
        </button>
      ) : breakSince ? (
        <div
          style={{
            background: MC.card,
            border: `1px solid ${PURPLE}55`,
            borderRadius: MC.radiusCard,
            padding: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${PURPLE_TINT} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: PURPLE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `0 6px 16px ${PURPLE}55`,
              }}
            >
              <Glyph name="clock" size={20} color="#fff" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: PURPLE,
                }}
              >
                On break
              </div>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 22,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.5,
                  lineHeight: 1.05,
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m}:{String(s).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                started {formatTime(breakSince)}
              </div>
            </div>
            <button
              type="button"
              onClick={endBreak}
              style={{
                background: PURPLE,
                color: "#fff",
                border: "none",
                padding: "10px 14px",
                borderRadius: 11,
                cursor: "pointer",
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: -0.1,
                boxShadow: `0 4px 12px ${PURPLE}55`,
              }}
            >
              Complete
            </button>
          </div>
        </div>
      ) : travellingSince ? (
        <TravelTimerInline
          travellingSince={travellingSince}
          onStop={() => setTravellingSince(null)}
        />
      ) : null}

      {/* Chooser sheet — break length + travel-now option.
          Picking a break logs target_minutes in the event meta so the
          manager can later see "this rep took a 30-min break". */}
      {chooserOpen && breakSince === null && !travellingSince && (
        <BreakChooserSheet
          purple={PURPLE}
          purpleTint={PURPLE_TINT}
          onPick={(mins) => startBreak(mins)}
          onTravel={() => {
            setChooserOpen(false);
            setTravellingSince(Date.now());
          }}
          onClose={() => setChooserOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Inline travel timer used by BreakOrTravelCard when the rep started
 * a travel timer from the dashboard chooser. Mirrors the styling of
 * the break timer so both states feel like the same component.
 */
function TravelTimerInline({
  travellingSince,
  onStop,
}: {
  travellingSince: number;
  onStop: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  void now;
  const elapsed = Math.max(0, Math.floor((Date.now() - travellingSince) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.brand}55`,
        borderRadius: MC.radiusCard,
        padding: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${MC.brandTint} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: MC.brand,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 6px 16px ${MC.brand}55`,
          }}
        >
          <Glyph name="pin" size={20} color="#fff" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: MC.brandDeep,
            }}
          >
            Travelling
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 22,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.5,
              lineHeight: 1.05,
              marginTop: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {m}:{String(s).padStart(2, "0")}
          </div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.mute,
              marginTop: 2,
            }}
          >
            started {formatTime(travellingSince)}
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          style={{
            background: MC.brand,
            color: "#fff",
            border: "none",
            padding: "10px 14px",
            borderRadius: 11,
            cursor: "pointer",
            fontFamily: MC.font,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: `0 4px 12px ${MC.brand}55`,
          }}
        >
          Arrived
        </button>
      </div>
    </div>
  );
}

/**
 * Slide-up sheet to pick a break duration before the timer kicks off.
 * Replaces the old "tap → break starts immediately" path that surprised
 * reps. Note: the chosen duration is stored in the event's `target_minutes`
 * meta only — the timer always counts up so a rep who runs over still
 * gets accurate elapsed time logged at end-of-break.
 */
function BreakChooserSheet({
  purple,
  purpleTint,
  onPick,
  onTravel,
  onClose,
}: {
  purple: string;
  purpleTint: string;
  onPick: (minutes: number | null) => void;
  onTravel: () => void;
  onClose: () => void;
}) {
  const options: { label: string; sub: string; minutes: number | null }[] = [
    { label: "Short break", sub: "15 min", minutes: 15 },
    { label: "Lunch break", sub: "30 min", minutes: 30 },
    { label: "Long break", sub: "60 min", minutes: 60 },
    { label: "Open-ended", sub: "I'll end it manually", minutes: null },
  ];
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.42)",
          zIndex: 60,
          animation: "bcs-fade-in .18s ease-out both",
        }}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Pick break duration"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          background: MC.card,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: "16px 16px calc(env(safe-area-inset-bottom, 16px) + 12px)",
          boxShadow: "0 -16px 32px rgba(10,15,30,.22)",
          animation: "bcs-slide-up .26s cubic-bezier(.22, 1, .36, 1) both",
        }}
      >
        {/* Handle row — was a static decorative pill; reps were tapping
            it to close the sheet (iOS pattern) and nothing happened.
            Now it's a real button covering the whole top strip so a
            tap anywhere on the handle dismisses the sheet. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sheet"
          style={{
            display: "block",
            width: "100%",
            padding: "6px 0 12px",
            margin: "-16px 0 0",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 40,
              height: 4,
              borderRadius: 99,
              background: MC.line,
              margin: "0 auto",
            }}
          />
        </button>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 17,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.3,
            marginBottom: 4,
          }}
        >
          Take a break or travel
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12.5,
            color: MC.mute,
            marginBottom: 14,
            lineHeight: 1.45,
          }}
        >
          Pick a break length, or start a travel timer. Both count up — fine
          to run over.
        </div>
        {/* Travel option — visually distinct from break, uses Morpheus
            brand cyan so it stands out as the "go" path. */}
        <button
          type="button"
          onClick={onTravel}
          style={{
            width: "100%",
            background: `linear-gradient(135deg, ${MC.brand} 0%, ${MC.brandDeep} 100%)`,
            border: "none",
            borderRadius: 12,
            padding: "11px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left",
            color: "#fff",
            marginBottom: 10,
            boxShadow: `0 6px 18px ${MC.brand}55`,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "rgba(255,255,255,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph name="pin" size={16} color="#fff" strokeWidth={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MC.font, fontSize: 14, fontWeight: 700, letterSpacing: -0.1 }}>
              Travel now
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12,
                color: "rgba(255,255,255,.85)",
                marginTop: 2,
              }}
            >
              Start a travel timer between shifts
            </div>
          </div>
          <Glyph name="chev-r" size={16} color="rgba(255,255,255,.85)" />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => onPick(o.minutes)}
              style={{
                width: "100%",
                background: "#fff",
                border: `1px solid ${MC.line}`,
                borderRadius: 12,
                padding: "11px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: purpleTint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Glyph name="clock" size={16} color={purple} strokeWidth={2.4} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {o.label}
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: MC.mute,
                    marginTop: 2,
                  }}
                >
                  {o.sub}
                </div>
              </div>
              <Glyph name="chev-r" size={16} color={MC.hint} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "13px 0 4px",
            fontFamily: MC.font,
            fontSize: 13.5,
            fontWeight: 600,
            color: MC.mute,
            letterSpacing: -0.1,
          }}
        >
          Cancel
        </button>
      </div>
      <style>{`
        @keyframes bcs-slide-up {
          0%   { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes bcs-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}

function TravellingPill({ elapsedLabel }: { elapsedLabel: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: MC.brand,
        color: "#fff",
        fontFamily: MC.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 999,
        boxShadow: `0 4px 12px ${MC.brand}55`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: "1.5px solid #fff",
            opacity: 0.5,
            animation: "mc-pulse 1.6s ease-out infinite",
          }}
        />
      </span>
      Travelling ·{" "}
      <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 2 }}>
        {elapsedLabel}
      </span>
    </span>
  );
}

