"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { type Shift } from "@/lib/mock-data";
import { formatRelativeShort, formatShiftCountdown } from "@/lib/format";
import {
  listRequestedShifts,
  removeRequestedShift,
  subscribeRequestedShifts,
  type RequestedShift,
} from "@/lib/shift-store";
import {
  listMyShiftsToday,
  listUnassignedShiftsToday,
  claimShift,
  raiseUnableToAttend,
  withdrawUnableToAttend,
  resolvedAttentionFeedback,
  subscribeShifts,
  type UnableReason,
} from "@/lib/shifts-store";
import { AppHeader, AppFooter, CustomerTile, SectionLabel } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { CheckingInOverlay } from "@/components/CheckingInOverlay";
import dynamic from "next/dynamic";
// MapLibre needs `window` — defer to client-only and only when the
// row is actually expanded (the dynamic import keeps the bundle
// trim for reps who never expand a shift).
const MiniRouteMap = dynamic(
  () => import("@/components/MiniRouteMap").then((m) => m.MiniRouteMap),
  { ssr: false }
);
import {
  UnableToAttendSheet,
  unableReasonLabel,
} from "@/components/UnableToAttendSheet";
import {
  computeNextLeaveBy,
  computeShiftEtas,
  openMapsLink,
  requestGeolocationOnce,
  type LatLng,
  type NextLeaveByInfo,
  type ShiftEtaInfo,
} from "@/lib/route-planner";

/** Crow-flies distance between two points in metres. Used to label
 *  claimable shifts with "3.2 km away" so reps can pick the closest
 *  customer without firing N driving-distance API calls. Driving
 *  distance is more accurate but for a pick-list of unscheduled
 *  shifts a quick crow-flies estimate is good enough — the rep gets
 *  the precise drive time on the home Up Next card once they claim. */
function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function formatDistance(meters: number): string {
  if (meters < 100) return "right here";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m away`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}
import {
  readShiftOrder,
  readShiftOrderMeta,
  applySavedOrder,
  subscribeShiftOrder,
} from "@/lib/shift-order-store";
import {
  readImprovementState,
  subscribeImprovement,
} from "@/lib/route-improvement-watcher";
import { RouteOptimizedSheet } from "@/components/RouteOptimizedSheet";

// A shift row from the DB carries internal id + state alongside the display fields.
type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
  rawStartTime: string;
  rawEndTime: string;
  shiftDate: string;
  /** Flexible-time flag — when true the manager picked "Anytime
   *  today" instead of a specific start/end; UI shows "Anytime
   *  today" and the countdown pill is suppressed. */
  isFlexibleTime?: boolean;
  /** Site fields — see ShiftWithMeta in lib/shifts-store.ts. */
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  siteLat?: number | null;
  siteLng?: number | null;
  siteGeofenceM?: number | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  siteContactEmail?: string | null;
  siteNotes?: string | null;
  /** Attention overlay — see ShiftAttentionFields. Optional here
   *  because the row also serves "requested shift" placeholders
   *  that don't carry attention fields. */
  attention?: string | null;
  attentionReason?: string | null;
  attentionNote?: string | null;
  attentionRaisedAt?: string | null;
  attentionResolvedAt?: string | null;
};

/** Build the OS-map deep link for a single shift. Mirrors the home
 *  page's helper of the same name — pulled out here so the
 *  "Start travelling" button on an expanded row can hand off to the
 *  device's preferred map app. Returns null when there's no
 *  destination (no coords AND no address). */
function buildDirectionsUrlForShift(s: {
  siteLat?: number | null;
  siteLng?: number | null;
  siteAddress?: string | null;
}): string | null {
  if (typeof s.siteLat === "number" && typeof s.siteLng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.siteLat},${s.siteLng}&travelmode=driving`;
  }
  if (s.siteAddress) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      s.siteAddress
    )}&travelmode=driving`;
  }
  return null;
}

/** localStorage key for the "currently travelling" pointer. Survives
 *  navigation so flipping to /route or the home dashboard and back
 *  preserves the Stop timer. Single key (not per-shift) because only
 *  one shift can be travelling at a time. Shape: { shiftId, since }. */
const TRAVELLING_LS_KEY = "morpheus.travelling";
interface TravellingState {
  shiftId: string;
  since: number;
}
function readTravelling(): TravellingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRAVELLING_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.shiftId === "string" &&
      typeof parsed.since === "number"
    ) {
      return { shiftId: parsed.shiftId, since: parsed.since };
    }
    return null;
  } catch {
    return null;
  }
}
function writeTravelling(t: TravellingState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!t) window.localStorage.removeItem(TRAVELLING_LS_KEY);
    else window.localStorage.setItem(TRAVELLING_LS_KEY, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}

export default function ShiftsListPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Rep's current GPS, used to label claimable shifts with "X km
  // away" so reps can pick the closest customer without expanding.
  // Uses requestGeolocationOnce so we share the module-level cache
  // with the home page + /route — no duplicate prompts. If the rep
  // denies permission the helper resolves to null and distance
  // pills hide gracefully.
  const [repOrigin, setRepOrigin] = useState<LatLng | null>(null);
  useEffect(() => {
    let cancelled = false;
    requestGeolocationOnce().then((p) => {
      if (!cancelled) setRepOrigin(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Currently travelling" pointer, hoisted to the page so only one
  // shift is in transit at a time + survives navigation via
  // localStorage. The expanded row reads from this to swap its
  // "Start travelling" button for a live "Stop · 5m" timer.
  const [travelling, setTravelling] = useState<TravellingState | null>(() =>
    typeof window === "undefined" ? null : readTravelling()
  );
  // Re-read on focus so if the rep starts travelling on /shifts then
  // hops to home and back, the timer doesn't reset. The home page
  // doesn't currently write to this key (it has its own local state
  // for legacy reasons), so the sync is one-way for now.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setTravelling(readTravelling());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  // Helpers wired to the button onClicks below — keep all
  // localStorage writes inside these so the persistence layer is in
  // one place.
  const onStartTravelling = (
    shiftId: string,
    shift: { siteLat?: number | null; siteLng?: number | null; siteAddress?: string | null }
  ) => {
    const url = buildDirectionsUrlForShift(shift);
    const next: TravellingState = { shiftId, since: Date.now() };
    setTravelling(next);
    writeTravelling(next);
    if (url) openMapsLink(url);
  };
  const onStopTravelling = () => {
    setTravelling(null);
    writeTravelling(null);
  };
  // 30s tick to keep the "Stop · 5m" timer label fresh without
  // re-rendering every second. ShiftRow reads `travelling` from
  // props so its own render is driven by this state update.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!travelling) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [travelling]);

  // Three lists, three sources:
  // - mine:        shifts where rep_id = me, today (from shifts table)
  // - unassigned:  shifts where rep_id IS NULL, today (claimable, from shifts table)
  // - requested:   rep-requested shifts (from requested_shifts table)
  const [mine, setMine] = useState<DbShift[]>([]);
  const [unassigned, setUnassigned] = useState<DbShift[]>([]);
  const [requested, setRequested] = useState<RequestedShift[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  // Free-text filter — applies across every section (mine /
  // unassigned / requested) by name, code, or distance label. Empty
  // string = show everything. Lives at the page top alongside the
  // date so a rep with many shifts can scan to one quickly.
  const [search, setSearch] = useState<string>("");
  // Live tick that re-renders the page every 30 seconds so the
  // "in 50 min" / "10 min late" countdown pills stay accurate
  // without each card needing its own timer. 30s is fine grain
  // for human-scale "approaching shift" labels.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // "Leave by HH:MM · X min drive" pill for the next-upcoming shift.
  // Computed via the shared planner helper so the home Up Next card
  // and this page show the same number. Recomputes when the shifts
  // list changes (a shift completes / a new one lands / states flip).
  // Only the matching row in `mine` will render the pill — the rest
  // stay clean.
  const [nextLeaveBy, setNextLeaveBy] = useState<NextLeaveByInfo | null>(null);
  // Per-shift ETA map — drives the "arrive HH:MM · 12 min late" pill
  // on every scheduled-state row. Same planner pipeline as
  // computeNextLeaveBy so the 5-min cache absorbs the call.
  const [shiftEtas, setShiftEtas] = useState<Map<string, ShiftEtaInfo> | null>(
    null
  );
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    // Two helpers, one promise so we get both numbers in parallel
    // (and the underlying planMyDay cache means it's still one
    // network call per traffic mode).
    Promise.all([computeNextLeaveBy(), computeShiftEtas()])
      .then(([leaveBy, etas]) => {
        if (cancelled) return;
        setNextLeaveBy(leaveBy);
        setShiftEtas(etas);
      })
      .catch(() => {
        if (cancelled) return;
        setNextLeaveBy(null);
        setShiftEtas(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, mine.map((s) => `${s.realId}:${s.state}`).join("|")]);

  // Tracked saved-order presence — drives the header pill state
  // ("Plan day" vs "Day planned ✓"). Mirrors the home page.
  const [pageSavedOrder, setPageSavedOrder] = useState<string[] | null>(() =>
    typeof window === "undefined" ? null : readShiftOrder()
  );
  // Wall-clock timestamp of the last save. Powers the "Optimized ·
  // 2:42 PM" caption on the header pill so the rep sees WHEN the
  // current order was locked in. Stays in sync with savedOrder via
  // the same subscribeShiftOrder change event.
  const [pageSavedAt, setPageSavedAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readShiftOrderMeta()?.savedAt ?? null
  );
  useEffect(() => {
    setPageSavedOrder(readShiftOrder());
    setPageSavedAt(readShiftOrderMeta()?.savedAt ?? null);
    return subscribeShiftOrder(() => {
      setPageSavedOrder(readShiftOrder());
      setPageSavedAt(readShiftOrderMeta()?.savedAt ?? null);
    });
  }, []);
  const headerDayPlanned =
    !!pageSavedOrder &&
    pageSavedOrder.length > 0 &&
    mine.some((s) => pageSavedOrder.includes(s.realId));

  // Route improvement watcher state — drives the action-vs-calm
  // icon on the header pill. Reads on mount, then re-renders on
  // every tick (the watcher fires a custom event after each check).
  const [improvement, setImprovement] = useState(() =>
    typeof window === "undefined"
      ? { available: false, savingsSeconds: 0, checkedAt: 0 }
      : readImprovementState()
  );
  useEffect(() => {
    setImprovement(readImprovementState());
    return subscribeImprovement(() => setImprovement(readImprovementState()));
  }, []);
  // Tap on the calm-state Route pill opens this celebratory sheet
  // instead of navigating to /route. Action-state taps still route
  // through to /route. Same component used on the home page.
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);

  const reload = () => {
    Promise.all([
      listMyShiftsToday(),
      listUnassignedShiftsToday(),
      listRequestedShifts(),
    ]).then(([m, u, r]) => {
      // Sort: in-progress first → scheduled → complete (so completed
      // shifts sink to the bottom of the list).
      //
      // The secondary tiebreaker (within the same state bucket) honours
      // the rep's saved visit order from /route → Save this order
      // when present. With no saved order it falls through to the
      // server's chronological ordering. Array.sort is stable, so a
      // savedOrder-applied pre-sort survives the state bucket sort.
      const saved = readShiftOrder();
      const preSorted = applySavedOrder(m, saved);
      // Sort buckets: live work first (in-progress + on-break +
      // travelling all sort to the top so a paused shift is just as
      // visible as an active one — Gary's report May 14), then
      // pre-check-in states (scheduled, late), then done at the
      // bottom. Stable sort preserves the saved-order tiebreaker
      // within each bucket.
      const order: Record<string, number> = {
        "in-progress": 0,
        "on-break": 0,
        travelling: 0,
        scheduled: 1,
        late: 2,
        complete: 3,
      };
      preSorted.sort(
        (a, b) => (order[a.state] ?? 1) - (order[b.state] ?? 1)
      );
      setMine(preSorted);
      setUnassigned(u);
      setRequested(r);
      setLoaded(true);
    });
  };
  useEffect(() => {
    reload();
    // Refetch on tab focus + on any change to EITHER shifts or
    // requested_shifts. The second sub closes the bug where an admin
    // approval inserted a shift (fired the shifts sub → reload) but
    // ALSO deleted the request (fired the requests sub → reload), and
    // without subscribing here the request lingered in the
    // "Unscheduled" section until the rep navigated away. Belt-and-
    // braces 60s poll catches the case where realtime drops while the
    // phone is asleep.
    const onVis = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVis);
    const unsubShifts = subscribeShifts(reload);
    const unsubRequests = subscribeRequestedShifts(reload);
    // Re-sort when the rep saves / clears a visit order from /route.
    // Cheap: this re-runs the existing reload() which fetches the same
    // 3 lists and re-applies the order. Could be optimised to just
    // resort the `mine` state but the network impact is negligible.
    const unsubOrder = subscribeShiftOrder(reload);
    const poll = window.setInterval(reload, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubShifts();
      unsubRequests();
      unsubOrder();
      window.clearInterval(poll);
    };
  }, []);

  // Track which shift the user just tapped Check-in / Resume on so we
  // can show "Opening…" feedback immediately. The destination page
  // does its own loading once it mounts, but on a slow network the
  // gap between tap and that page rendering can be a couple of
  // seconds — without this the button feels dead.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  // Tap-feedback for navigating to /add-shift via the Request pill.
  // Same brand-tinted overlay we use on check-in / check-out so the
  // rep sees motion the moment they tap rather than a silent half-
  // second gap while Next routes.
  const [openingRequest, setOpeningRequest] = useState(false);
  const onCheckIn = (shiftId: string) => {
    setNavigatingTo(shiftId);
    // Tap-feedback overlay for the check-in jump too. Mirrors the
    // Resume / Check-in CTAs on the home page.
    setOpeningCheckInFor(
      mine.find((s) => s.realId === shiftId)?.name || "your shift"
    );
    router.push(`/check-in?shift=${shiftId}`);
  };
  const onResumeShift = (shiftId: string) => {
    setNavigatingTo(shiftId);
    setOpeningCheckInFor(
      mine.find((s) => s.realId === shiftId)?.name || "your shift"
    );
    router.push("/active");
  };
  const [openingCheckInFor, setOpeningCheckInFor] = useState<string | null>(null);

  const onClaim = async (shiftRealId: string) => {
    setClaiming(shiftRealId);
    const result = await claimShift(shiftRealId);
    setClaiming(null);
    if (result.ok) {
      reload();
    } else {
      // eslint-disable-next-line no-console
      console.warn("[shifts] claim failed:", result.error);
      alert(`Couldn't claim that shift: ${result.error}`);
    }
  };

  const onRemoveRequested = (id: string) => {
    setRequested((rs) => rs.filter((r) => r.id !== id));
    removeRequestedShift(id);
  };

  // "I can't make this shift" state machine — which row is in flight
  // (sheet open or DB write running) so we can disable the row's
  // affordance while busy. `unableSheetFor` holds the row currently
  // showing the confirm sheet; null otherwise. We pass the row's
  // ShiftWithMeta so the sheet header can show the customer name
  // without re-fetching.
  const [unableSheetFor, setUnableSheetFor] = useState<
    | { realId: string; name: string }
    | null
  >(null);
  const [unableBusyFor, setUnableBusyFor] = useState<string | null>(null);

  const handleRaiseUnable = async (
    realId: string,
    reason: UnableReason,
    note: string
  ) => {
    setUnableBusyFor(realId);
    const r = await raiseUnableToAttend(realId, reason, note);
    setUnableBusyFor(null);
    if (!r.ok) {
      // Throw — the UnableToAttendSheet catches and renders the
      // message inline. Avoiding a separate alert() so we don't
      // double-display (the sheet's error block is the source of
      // truth).
      throw new Error(r.error || "Couldn't notify your manager. Try again?");
    }
    setUnableSheetFor(null);
    reload();
  };

  const handleWithdrawUnable = async (realId: string) => {
    if (!confirm("Withdraw the unable-to-attend flag? You'll be back on the schedule.")) return;
    setUnableBusyFor(realId);
    const r = await withdrawUnableToAttend(realId);
    setUnableBusyFor(null);
    if (!r.ok) {
      alert(r.error || "Couldn't withdraw — your manager may already have actioned it.");
      return;
    }
    reload();
  };

  // Apply the search filter across every section. Match is
  // case-insensitive across customer name, customer code, and the
  // distance label (whatever the rep is most likely to be skimming
  // for). Empty search returns the original arrays untouched.
  const matchSearch = (s: { name: string; code: number | string; distance?: string }) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      String(s.code).includes(q) ||
      (s.distance || "").toLowerCase().includes(q)
    );
  };
  const mineFiltered = mine.filter(matchSearch);
  const unassignedFiltered = unassigned.filter(matchSearch);
  const requestedFiltered = requested.filter(matchSearch);

  // Combine unassigned (DB) + requested (separate table) for the
  // Unscheduled section. Two filters here:
  //   1. Hide a request that's already showing as an unassigned shift
  //      (a manager scheduled it without a rep — same customer, two
  //      sources, would otherwise duplicate).
  //   2. Hide a request that's now in MY today's shifts. This is the
  //      "approval just happened" case: admin approved → new shift
  //      INSERT fires shifts realtime → reload pulls the new shift into
  //      `mine`. The DELETE on requested_shifts fires too but Supabase
  //      realtime DELETE events occasionally lag (sometimes by tens of
  //      seconds, especially if the WebSocket dropped while the phone
  //      was asleep). Without this filter the rep sees the same store
  //      both as "Pending" and "Scheduled for me" until the next 60s
  //      poll catches up.
  const unassignedIds = new Set(unassignedFiltered.map((u) => u.id));
  const mineIds = new Set(mineFiltered.map((m) => m.id));
  const requestedNonDup = requestedFiltered.filter(
    (r) => !unassignedIds.has(r.id) && !mineIds.has(r.id)
  );

  // "Wed, May 7" — sits below the title so the rep always knows what
  // day this list is for, even days into a long shift week where
  // they might lose track.
  // Progress indicator — "3 of 4 done · 1 live · 0 left" style. Computed
  // from `mine` (shifts assigned to this rep today). Managers asked for
  // a status-at-a-glance summary on this list page so a rep can see
  // where they are in the day without doing the maths themselves.
  const dayTotal = mine.length;
  const dayDone = mine.filter((s) => s.state === "complete").length;
  const dayLive = mine.filter((s) =>
    ["in-progress", "on-break", "travelling", "late"].includes(s.state)
  ).length;
  const dayLeft = mine.filter((s) =>
    ["scheduled", "unable_to_attend"].includes(s.state)
  ).length;
  const dayProgressPct = dayTotal > 0 ? (dayDone / dayTotal) * 100 : 0;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const totalVisible =
    mineFiltered.length + unassignedFiltered.length + requestedNonDup.length;
  const totalAll = mine.length + unassigned.length + requested.length;

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      {/* Route-pill pulse keyframe. Only fires when the improvement
          watcher found a better route — see the pill render below.
          Inlined here so the rule lives next to its only consumer
          and gets torn down with the page. Respect for reduced
          motion is wrapped in the media query. */}
      <style>{`
        @keyframes mc-route-pulse-kf {
          0%   { box-shadow: 0 0 0 0   rgba(36, 173, 217, 0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(36, 173, 217, 0);    }
          100% { box-shadow: 0 0 0 0   rgba(36, 173, 217, 0);    }
        }
        @media (prefers-reduced-motion: no-preference) {
          .mc-route-pulse { animation: mc-route-pulse-kf 1.6s ease-out infinite; }
        }
      `}</style>
      {/* Sticky header band — AppHeader (back / menu / title) stays
          pinned at the top while the rep scrolls down a long shift
          list. Managers asked for this so the back-to-dashboard
          affordance is always reachable without scrolling all the
          way up. The date + Request pill is part of the same
          sticky band; the search box and section labels below
          scroll normally. zIndex 30 keeps it above shift cards on
          scroll but below the menu overlay (zIndex 40). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: MC.bg,
          boxShadow: "0 1px 0 rgba(10,15,30,.04)",
        }}
      >
      <AppHeader title="Today's Shifts" onBack={() => router.push("/")} withMenu />

      {/* Date row — gives the rep an explicit "this is what today
          is" reference, plus the compact Request CTA on the right.
          Replaces the old layout that buried the date and put the
          CTA on its own row. */}
      <div
        style={{
          padding: "12px 16px 0",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 600,
              color: MC.hint,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Today
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 18,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.3,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {dateLabel}
          </div>
          {/* Day-progress strip — small fill bar + plain-English
              breakdown ("3 of 4 done · 1 live"). Only renders when
              the rep has any shifts today; the unassigned/requested
              sections below carry the empty-state copy when not. */}
          {dayTotal > 0 && (
            <div style={{ marginTop: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: MC.font,
                  fontSize: 11,
                  color: MC.mute,
                  fontWeight: 500,
                  letterSpacing: 0,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: MC.ink2, fontWeight: 600 }}>
                  {dayDone} of {dayTotal} done
                </span>
                {dayLive > 0 && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                      {dayLive} live
                    </span>
                  </>
                )}
                {dayLeft > 0 && dayDone + dayLive < dayTotal && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{dayLeft} left</span>
                  </>
                )}
              </div>
              {/* Tiny fill bar so the rep can see at a glance how
                  far they've got through the day. Brand-tinted for
                  in-progress, ok-green for complete; track stays
                  light grey for the "remaining" portion. */}
              <div
                style={{
                  marginTop: 5,
                  width: "100%",
                  maxWidth: 240,
                  height: 4,
                  borderRadius: 99,
                  background: MC.line,
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${dayProgressPct}%`,
                    background: MC.ok,
                    transition: "width .35s cubic-bezier(.22,1,.36,1)",
                  }}
                />
                {dayLive > 0 && (
                  <div
                    style={{
                      width: `${(dayLive / dayTotal) * 100}%`,
                      background: MC.brand,
                      transition: "width .35s cubic-bezier(.22,1,.36,1)",
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {/* Action pills (right-aligned in the header row).
            The Plan-route pill only surfaces when the rep has 2+
            REMAINING stops (anything not complete) — single-stop or
            all-done days are covered by the dashboard's Up Next CTAs.

            Unplanned state: BRAND-SOLID fill (white text + icon) so
              it reads as a clear CTA on this operational screen.
              Concrete copy: "Plan route · 5 stops" tells the rep
              exactly what's about to happen + the scope of the
              optimisation.
            Planned state:   subtle okTint surface, "Planned · 5
              stops" with a check glyph — confirmation tone, no
              competing for attention since the work's done.

            Earlier iteration used the same okTint surface for both
            states with only the glyph + label flipping; Gary fed
            back that the unplanned state didn't read as a strong
            enough call-to-action on this list view. The home page
            stays calmer (segmented View-all pill, target glyph)
            because it's a glance screen — /shifts is the do screen
            so the CTA pulls more weight here. */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {(() => {
            // Icon-only Route pill. Two states only (May 14 — Gary):
            //   - ACTION: the hourly watcher found a better route
            //     than the rep's current order. Pulsing brand-deep
            //     disc with a target glyph. Says "tap here, real
            //     improvement available".
            //   - CALM (default): no improvement found, day complete,
            //     or fewer than 2 stops to reorder. Calm okTint disc
            //     with green check. Says "route is current — nothing
            //     to act on".
            // Pre-this-change the pill had a third "CTA" state with
            // a "Route" text label that fired whenever no order had
            // been saved. Dropped: per spec, the icon only escalates
            // when the auto-check has something concrete to suggest.
            if (mine.length === 0) return null;
            const action = improvement.available;
            const minutesSaved = Math.max(
              1,
              Math.round(improvement.savingsSeconds / 60)
            );
            const ariaLabel = action
              ? `Route improvement available — save about ${minutesSaved} minute${minutesSaved === 1 ? "" : "s"}. Tap to view.`
              : "Today's route is up to date — tap to view.";
            const titleAttr = action
              ? `Better route available — ~${minutesSaved} min faster. Tap to see.`
              : "Route up to date";
            const tone = action
              ? {
                  bg: MC.brandDeep,
                  fg: "#fff",
                  border: MC.brandDeep,
                  shadow: `0 2px 6px ${MC.brand}55`,
                }
              : {
                  bg: MC.okTint,
                  fg: MC.ok,
                  border: `${MC.ok}55`,
                  shadow: "none",
                };
            const sharedStyle: React.CSSProperties = {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 999,
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              boxShadow: tone.shadow,
              textDecoration: "none",
              flexShrink: 0,
            };
            const iconNode = (
              <Glyph
                name={action ? "target" : "check-circle"}
                size={16}
                color={tone.fg}
                strokeWidth={2.4}
              />
            );
            if (action) {
              // Action state — link straight to /route.
              return (
                <Link
                  href="/route"
                  aria-label={ariaLabel}
                  title={titleAttr}
                  className="mc-route-pulse"
                  style={sharedStyle}
                >
                  {iconNode}
                </Link>
              );
            }
            // Calm state — open the celebratory sheet instead of
            // navigating. Sheet has an "Open route anyway" link for
            // reps who want to view /route despite the calm state.
            // Full UA reset so the native button renders identical
            // to a Link inside the same flex row (otherwise default
            // line-height + padding shift the icon a hair).
            return (
              <button
                type="button"
                onClick={() => setRouteSheetOpen(true)}
                aria-label={ariaLabel}
                title={titleAttr}
                style={{
                  ...sharedStyle,
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  margin: 0,
                  font: "inherit",
                  lineHeight: 0,
                  color: "inherit",
                }}
              >
                {iconNode}
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => {
              // Show the same brand-tinted "Opening…" overlay we use on
              // check-in / check-out so the rep sees motion the moment
              // they tap. Previously this was a bare <Link> — Next's
              // client-side navigation runs silently and there's a
              // half-second gap where the screen looks frozen.
              setOpeningRequest(true);
              router.push("/add-shift");
            }}
            aria-label="Request a customer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px 7px 9px",
              borderRadius: 999,
              background: MC.brandTint,
              border: `1px solid ${MC.brand}33`,
              color: MC.brandDeep,
              textDecoration: "none",
              fontFamily: MC.font,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: -0.1,
              cursor: "pointer",
            }}
          >
            <Glyph name="plus" size={13} color={MC.brand} strokeWidth={2.6} />
            Request
          </button>
        </div>
      </div>
      </div>

      {/* Search box — filters across every section by name, code, or
          distance label. Hidden until there are enough shifts to be
          worth filtering. The clear-X resets the filter without the
          rep needing to backspace through what they typed. */}
      {totalAll >= 4 && (
        <div style={{ padding: "10px 16px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: MC.card,
              border: `1px solid ${MC.line}`,
              borderRadius: 12,
            }}
          >
            <Glyph name="target" size={14} color={MC.hint} strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search today's shifts…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: MC.font,
                fontSize: 13.5,
                color: MC.ink,
              }}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                }}
              >
                <Glyph name="close" size={14} color={MC.hint} />
              </button>
            ) : (
              <span
                style={{
                  fontFamily: MC.font,
                  fontSize: 11,
                  color: MC.hint,
                  fontWeight: 600,
                }}
              >
                {totalAll}
              </span>
            )}
          </div>
          {search && (
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11,
                color: MC.mute,
                marginTop: 6,
                paddingLeft: 4,
              }}
            >
              {totalVisible} of {totalAll} match
            </div>
          )}
        </div>
      )}

      {/* Pending requests pinned to the top — moved out of the
          "Unscheduled · available" section because reps want to see
          at a glance "what am I waiting on?" before scanning today's
          schedule. Renders nothing when there are no pending
          requests so the section disappears cleanly. */}
      {requestedNonDup.length > 0 && (
        <>
          <SectionLabel count={requestedNonDup.length}>
            Awaiting approval
          </SectionLabel>
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {requestedNonDup.map((s) => (
              <ShiftRow
                key={s.id}
                shift={s}
                expanded={false}
                unscheduled
                requested
                requestedAt={s.requestedAt}
                onRemove={() => onRemoveRequested(s.id)}
              />
            ))}
          </div>
        </>
      )}

      <SectionLabel count={mineFiltered.length}>Scheduled for me</SectionLabel>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loaded ? (
          <SkeletonStack count={3} />
        ) : mineFiltered.length === 0 ? (
          <EmptyState
            text={
              search
                ? `No "Scheduled for me" matches "${search}".`
                : "No shifts assigned to you today."
            }
          />
        ) : (
          mineFiltered.map((s) => (
            <ShiftRow
              key={s.realId}
              shift={s}
              state={s.state}
              expanded={expandedId === s.realId}
              navigating={navigatingTo === s.realId}
              // Flexible-time shifts have no specific start to count
              // down to, so skip the timing pill entirely. Without
              // this a flexible shift would show "5h late" because
              // the 06:00 sentinel start would always have passed
              // by the time the rep opened the app.
              timing={
                s.isFlexibleTime
                  ? null
                  : formatShiftCountdown(
                      s.shiftDate,
                      s.rawStartTime,
                      s.rawEndTime,
                      s.state
                    )
              }
              // Only the row matching the planner's "next stop"
              // gets the leave-by pill. Everyone else passes null.
              leaveBy={
                nextLeaveBy && nextLeaveBy.shiftRealId === s.realId
                  ? {
                      leaveBy: nextLeaveBy.leaveBy,
                      driveSeconds: nextLeaveBy.driveSeconds,
                      trafficAware: nextLeaveBy.trafficAware,
                    }
                  : null
              }
              // Per-row "if you leave now you'll arrive at X" pill.
              // Hidden by ShiftRow itself for completed / in-progress /
              // on-break shifts where it's not meaningful.
              eta={shiftEtas?.get(s.realId) ?? null}
              onToggle={() =>
                setExpandedId(expandedId === s.realId ? null : s.realId)
              }
              onCheckIn={() => onCheckIn(s.realId)}
              onResume={() => onResumeShift(s.realId)}
              onUnableToAttend={() =>
                setUnableSheetFor({ realId: s.realId, name: s.name })
              }
              onWithdrawUnable={() => handleWithdrawUnable(s.realId)}
              unableBusy={unableBusyFor === s.realId}
              // Travelling pointer — only meaningful for "Mine" rows
              // (you can't be travelling to a shift you haven't
              // claimed). Triggers the swap of "Start travelling"
              // → "Stop · 5m" timer inside the expanded row.
              isTravelling={travelling?.shiftId === s.realId}
              travellingSince={
                travelling?.shiftId === s.realId ? travelling.since : null
              }
              onStartTravelling={() =>
                onStartTravelling(s.realId, {
                  siteLat: s.siteLat,
                  siteLng: s.siteLng,
                  siteAddress: s.siteAddress,
                })
              }
              onStopTravelling={onStopTravelling}
            />
          ))
        )}
      </div>

      <SectionLabel count={unassignedFiltered.length}>
        Unscheduled · available
      </SectionLabel>

      <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loaded ? (
          <SkeletonStack count={2} />
        ) : unassignedFiltered.length === 0 ? (
          <EmptyState
            text={
              search
                ? `No claimable matches "${search}".`
                : "Nothing available right now."
            }
          />
        ) : (
          unassignedFiltered.map((s) => {
            // Crow-flies distance from the rep's GPS to the site, in
            // metres. Null when we don't yet have GPS OR the site
            // has no coords — ShiftRow hides the pill in both cases.
            const distanceMeters =
              repOrigin &&
              typeof s.siteLat === "number" &&
              typeof s.siteLng === "number"
                ? haversineMeters(repOrigin, { lat: s.siteLat, lng: s.siteLng })
                : null;
            return (
              <ShiftRow
                key={s.realId}
                shift={s}
                expanded={false}
                unscheduled
                claimable
                claiming={claiming === s.realId}
                onClaim={() => onClaim(s.realId)}
                distanceMeters={distanceMeters}
              />
            );
          })
        )}
      </div>

      {/* CTA used to live here at the bottom too — moved to the top
          beneath the header so reps with many shifts can find it
          without scrolling. One copy is enough. */}
      <div style={{ height: 12 }} />

      <AppFooter />

      {/* Celebratory "Route optimized — nothing to do" sheet. Opens
          when the rep taps the calm-state Route pill above. Same
          component as the home page. */}
      <RouteOptimizedSheet
        open={routeSheetOpen}
        onClose={() => setRouteSheetOpen(false)}
      />

      {/* Confirm-and-pick-reason sheet. Mounted at the root so it
          slides up over the whole page; the row triggers it by
          setting `unableSheetFor`. */}
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

      {/* Tap-feedback overlays for the three nav-jump CTAs on this
          page (Request, Check in, Resume). The overlay stays mounted
          until Next finishes routing and the destination page mounts
          its own — looks like one continuous loading state from tap
          to destination. */}
      {openingRequest && (
        <CheckingInOverlay
          mode="opening"
          customerName=""
          phase="submitting"
        />
      )}
      {openingCheckInFor && (
        <CheckingInOverlay
          mode="opening"
          customerName={openingCheckInFor}
          phase="submitting"
        />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "20px 14px",
        textAlign: "center",
        fontFamily: MC.font,
        fontSize: 13,
        color: MC.mute,
        background: MC.card,
        border: `1px dashed ${MC.line}`,
        borderRadius: MC.radiusCard,
      }}
    >
      {text}
    </div>
  );
}

function SkeletonStack({ count }: { count: number }) {
  // A vertical stack of shimmering placeholder rows that match the
  // real ShiftRow's silhouette (customer tile + 2 stub lines). Better
  // than a featureless grey block — the rep's eye latches onto the
  // skeleton and skim-reads "ah, content is coming" rather than
  // wondering whether the page is broken.
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} delay={i * 100} />
      ))}
    </>
  );
}

function SkeletonRow({ delay = 0 }: { delay?: number }) {
  // CSS lint: spread the shimmer FIRST and let any per-row override
  // (corner radius on the customer-tile, for example) win. The other
  // way around triggers TS2783 "specified more than once".
  const shimmer = {
    background: `linear-gradient(90deg, ${MC.bg} 0%, ${MC.line} 50%, ${MC.bg} 100%)`,
    backgroundSize: "200% 100%",
    animation: "mc-skel 1.4s ease-in-out infinite",
    animationDelay: `${delay}ms`,
    borderRadius: 6,
  };
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: MC.radiusCard,
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          ...shimmer,
          width: 46,
          height: 46,
          borderRadius: 12,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...shimmer, height: 14, width: "65%" }} />
        <div style={{ ...shimmer, height: 11, width: "40%" }} />
      </div>
      <div style={{ ...shimmer, width: 24, height: 24, borderRadius: 6 }} />
    </div>
  );
}

function ShiftRow({
  shift,
  state,
  expanded,
  unscheduled,
  requested,
  requestedAt,
  claimable,
  claiming,
  navigating,
  timing,
  leaveBy,
  eta,
  onToggle,
  onCheckIn,
  onResume,
  onRemove,
  onClaim,
  onUnableToAttend,
  onWithdrawUnable,
  unableBusy,
  isTravelling,
  travellingSince,
  onStartTravelling,
  onStopTravelling,
  distanceMeters,
}: {
  shift: Shift & {
    siteId?: string | null;
    siteName?: string | null;
    siteAddress?: string | null;
    /** Coordinates — needed by the inline MiniRouteMap in the
     *  expanded section. Optional because pre-2026-05-08 rows may
     *  not have a site joined yet. */
    siteLat?: number | null;
    siteLng?: number | null;
    siteContactPhone?: string | null;
    siteContactName?: string | null;
    siteNotes?: string | null;
    /** Attention overlay — when 'unable_to_attend' (and not yet
     *  resolved) the row shows an amber "Awaiting manager" pill
     *  and the Can't-make-it action is replaced by Withdraw. */
    attention?: string | null;
    attentionReason?: string | null;
    attentionResolvedAt?: string | null;
    attentionResolution?: string | null;
    /** Flexible-time flag — display "Anytime today" in place of the
     *  start-end range and skip countdown comparisons. */
    isFlexibleTime?: boolean;
  };
  /** The shift's lifecycle state (scheduled | in-progress | complete | late). Only meaningful for "Mine". */
  state?: string;
  expanded: boolean;
  unscheduled?: boolean;
  requested?: boolean;
  /** When the request was submitted — used to render "X ago" relative time. */
  requestedAt?: number;
  claimable?: boolean;
  claiming?: boolean;
  /** True while the parent is in flight routing to /check-in or /active for this shift. */
  navigating?: boolean;
  /** Optional contextual countdown pill ("in 50 min" / "10 min late" / etc).
   *  Computed in the parent so it lives off the page-level 30s tick rather
   *  than each row owning its own timer. */
  timing?: import("@/lib/format").ShiftTiming | null;
  /** When set, the row renders a small "Leave by 10:42 · 12 min drive"
   *  pill below the time line. Only the next-upcoming row in the
   *  list passes this in — the rest leave it undefined to keep the
   *  list clean. Drive duration + leave-by come from the shared
   *  planner so the number matches the home Up Next card and /route
   *  exactly. */
  leaveBy?: {
    leaveBy: Date;
    driveSeconds: number;
    trafficAware: boolean;
  } | null;
  /** Per-row "if you leave now, arrive at X" info. Same shape as
   *  ShiftEtaInfo from the planner. Rendered as a small tone-coded
   *  pill under the time row on scheduled (pre-check-in) rows.
   *  Hidden for in-progress / on-break / complete / flexible-time
   *  shifts where the ETA isn't meaningful. */
  eta?: import("@/lib/route-planner").ShiftEtaInfo | null;
  onToggle?: () => void;
  onCheckIn?: () => void;
  onResume?: () => void;
  onRemove?: () => void;
  onClaim?: () => void;
  /** Open the "I can't make this shift" sheet for this row.
   *  Defined only when the row is a scheduled shift owned by the
   *  current rep AND attention isn't already raised. */
  onUnableToAttend?: () => void;
  /** Withdraw a previously-raised flag. Only valid before the
   *  manager has actioned it. */
  onWithdrawUnable?: () => void;
  /** True while the parent is sending raise/withdraw to the DB. */
  unableBusy?: boolean;
  /** True when THIS shift is the currently-travelling one (page-
   *  level state). Drives the Start ↔ Stop button swap on the
   *  expanded row. */
  isTravelling?: boolean;
  /** Epoch ms when the rep tapped Start travelling for THIS shift.
   *  Used to render the live "Stop · 5m" timer label. Only set when
   *  isTravelling is true. */
  travellingSince?: number | null;
  /** Start the travel timer + hand off to the device's map app.
   *  Defined only for "Mine" rows. */
  onStartTravelling?: () => void;
  /** Clear the travel timer. Defined only for "Mine" rows. */
  onStopTravelling?: () => void;
  /** Crow-flies distance from the rep's current GPS to the shift's
   *  site, in metres. Set ONLY on claimable rows (Unscheduled ·
   *  available) so the rep can see at a glance which customers are
   *  nearby before picking one. Null when GPS is denied or the site
   *  has no coords. */
  distanceMeters?: number | null;
}) {
  const isComplete = state === "complete";
  // "Live" means the rep is AT the customer — either actively working
  // ('in-progress') or paused mid-shift ('on-break'). Both render the
  // Resume CTA and hide "Can't make this shift?" (you can't say you
  // can't make it to a shift you're already attending). Earlier this
  // was a strict `=== "in-progress"` match, which meant a rep mid-break
  // saw "Check in" on /shifts even though the home page correctly
  // showed "Resume shift" — two screens out of sync for the same row.
  // 'travelling' is intentionally NOT bundled here: that state means
  // "en route, has not arrived yet" → Check in is the right CTA, and
  // can't-make-it is still a valid escape hatch.
  const isInProgress = state === "in-progress" || state === "on-break";
  // Only show a "lifecycle" badge for COMPLETE shifts — they have no
  // countdown so the badge is the only state signal. For in-progress
  // we deliberately don't render one: the green "Ends in 1h 25m"
  // countdown pill already conveys "this is live" (tone + copy), and
  // stacking "IN PROGRESS" next to "ENDS 1H 25M" made the row look
  // crowded for no extra information.
  // State badge variants the row surfaces near the customer name.
  //   - Paused (on-break) → warn-tint chip so the rep can spot the
  //     row at a glance from a long day's list. Same tone as the
  //     "Shift paused" banner on /active so the two screens agree
  //     visually. (May 14, Gary.)
  //   - Complete → calm okTint chip; the only "completed" signal
  //     since there's no countdown for finished shifts.
  // Other live states (in-progress / travelling / late) don't get
  // a badge — their countdown pill already conveys "this is live"
  // via colour + copy.
  const stateBadge = (() => {
    if (unscheduled) return null;
    if (state === "on-break") {
      return { label: "Paused", bg: MC.warnTint, fg: "#7A560A" };
    }
    if (isComplete) {
      return { label: "Complete", bg: MC.okTint, fg: "#0d6a45" };
    }
    return null;
  })();
  void isInProgress; // kept for future per-state styling hooks
  return (
    <div
      style={{
        background: MC.card,
        borderRadius: MC.radiusCard,
        // Pending requests get a warn-tone left rail so the rep can see
        // at a glance that this card is waiting on the manager rather
        // than something they can act on. In-progress shifts get the
        // brand-tint border like before.
        border: `1px solid ${
          requested
            ? MC.warn + "66"
            : isInProgress
            ? MC.brand + "55"
            : MC.line
        }`,
        borderLeft: requested
          ? `3px solid ${MC.warn}`
          : `1px solid ${isInProgress ? MC.brand + "55" : MC.line}`,
        overflow: "hidden",
        boxShadow: expanded
          ? "0 12px 28px rgba(10,15,30,.09)"
          : "0 1px 2px rgba(10,15,30,.04)",
        opacity: isComplete ? 0.78 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 14,
          display: "flex",
          // Claimable rows stack their actions below the content so
          // the meta line (time · AVAILABLE · distance) + the full
          // address have full width to breathe. Previously the
          // Claim button sat in-line on the right and squeezed the
          // content into a 140px column — the time wrapped, the
          // distance dropped to a new line, the address sprawled
          // across 4 lines. Now: top row carries the row data,
          // bottom row carries the Claim CTA right-aligned.
          flexDirection: claimable ? "column" : "row",
          gap: claimable ? 10 : 12,
          alignItems: claimable ? "stretch" : "center",
          cursor: onToggle ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        <div
          style={
            claimable
              ? {
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  width: "100%",
                }
              : { display: "contents" }
          }
        >
        <CustomerTile initials={shift.initials} color={shift.color} size={52} logoUrl={shift.logoUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 16.5,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.25,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shift.name}
            {/* Site sublabel — only when the customer has a named site
                that's not the default "Main". Same rule as the
                dashboard up-next card. */}
            {shift.siteName && shift.siteName !== "Head office" && (
              <span
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 500,
                  color: MC.mute,
                  letterSpacing: 0,
                  marginLeft: 6,
                }}
              >
                · {shift.siteName}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
            }}
          >
            <span
              style={{
                background: MC.bg,
                color: MC.ink2,
                borderRadius: 6,
                padding: "2px 6px",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: 0.3,
              }}
            >
              #{shift.code}
            </span>
            {unscheduled ? (
              <>
                {claimable ? (
                  <>
                    <Glyph name="clock" size={13} color={MC.mute} strokeWidth={2} />
                    <span>
                      {shift.isFlexibleTime
                        ? "Anytime today"
                        : `${shift.start}–${shift.end}`}
                    </span>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: MC.brandTint,
                        color: MC.brandInk,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      Available
                    </span>
                    {/* Distance from the rep's GPS — only renders
                        when we have a fix AND the site is geocoded.
                        Crow-flies, not driving — fine for a pick-
                        list: the rep gets the precise drive time
                        once they claim and the home Up Next card
                        kicks in. */}
                    {typeof distanceMeters === "number" && (
                      <span
                        style={{
                          color: MC.ink2,
                          fontWeight: 500,
                          fontSize: 12,
                          letterSpacing: 0,
                        }}
                        title="Approximate distance from your current location"
                      >
                        · {formatDistance(distanceMeters)}
                      </span>
                    )}
                  </>
                ) : requested ? (
                  <>
                    <Glyph name="clock" size={13} color={MC.warn} strokeWidth={2} />
                    <span style={{ color: MC.ink2 }}>
                      Waiting for manager
                      {requestedAt ? ` · ${formatRelativeShort(requestedAt)}` : ""}
                    </span>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: MC.warnTint,
                        color: "#7A560A",
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      Pending
                    </span>
                  </>
                ) : (
                  <span>Not scheduled today</span>
                )}
              </>
            ) : (
              <>
                <Glyph name="clock" size={13} color={MC.mute} strokeWidth={2} />
                <span style={{ textDecoration: isComplete ? "line-through" : "none" }}>
                  {shift.isFlexibleTime
                    ? "Anytime today"
                    : `${shift.start}–${shift.end}`}
                </span>
                {stateBadge && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: stateBadge.bg,
                      color: stateBadge.fg,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    {stateBadge.label}
                  </span>
                )}
                {/* Contextual countdown — "in 50 min", "10 min late",
                    "ends in 20m", etc. Only shown for actionable
                    states (scheduled / live); the in-progress
                    state badge above doesn't repeat the same info. */}
                {timing && (
                  <CountdownPill timing={timing} />
                )}
                {!stateBadge && !timing && shift.distance && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{shift.distance}</span>
                  </>
                )}
              </>
            )}
          </div>
          {/* Small address line under the time row so the rep knows
              WHERE the shift is without expanding. Only renders when
              the site has an address — single-address customers in
              particular benefit from the explicit street line.

              For claimable rows we let the address wrap to two lines
              so the rep sees the FULL street/suburb before deciding
              to request the shift. For their own scheduled rows we
              keep the single-line truncate — the rep already knows
              the customer and the full address is one tap away on
              expand. */}
          {shift.siteAddress && (
            <div
              style={{
                marginTop: 3,
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.hint,
                letterSpacing: 0,
                display: "flex",
                alignItems: claimable ? "flex-start" : "center",
                gap: 4,
                ...(claimable
                  ? {}
                  : {
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }),
              }}
              title={shift.siteAddress}
            >
              <Glyph
                name="pin"
                size={11}
                color={MC.hint}
                strokeWidth={2}
              />
              <span
                style={
                  claimable
                    ? { lineHeight: 1.35 }
                    : { overflow: "hidden", textOverflow: "ellipsis" }
                }
              >
                {shift.siteAddress}
              </span>
            </div>
          )}
          {/* Leave-by pill — only the next-upcoming row gets the
              `leaveBy` prop from the parent, so this only renders on
              that one row. Same shape as the home Up Next card so
              reps see the same number in both places.
              Auto-hides when the leave-by time is in the past —
              showing "Leave by 10:13 AM" at 12:20 PM was confusing
              reps. The page's 30s tick (setNowTick) re-evaluates
              this on every render so the pill disappears as soon as
              the leave-by passes. */}
          {leaveBy && leaveBy.leaveBy.getTime() > Date.now() && (
            <div
              style={{
                marginTop: 6,
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 700,
                color: "#7A560A",
                background: MC.warnTint,
                border: `1px solid ${MC.warn}33`,
                padding: "3px 8px 3px 6px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                letterSpacing: 0.2,
              }}
              title={
                leaveBy.trafficAware
                  ? "Based on live traffic"
                  : "Estimated drive time"
              }
            >
              <Glyph name="clock" size={11} color={MC.warn} strokeWidth={2.4} />
              Leave by{" "}
              {leaveBy.leaveBy.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}{" "}
              · {Math.max(1, Math.round(leaveBy.driveSeconds / 60))} min drive
            </div>
          )}
          {/* Per-row "if you leave now" arrival pill. Shown on
              scheduled (pre-check-in) rows when the planner has a
              real ETA for this stop. Tone matches the /route status
              banner so the visual language is consistent between
              the two pages.
              Flex-time shifts ("Anytime today") render the pill too,
              but neutrally — no late/early comparison since there's
              no specific start time to be late against. Detected via
              `eta.scheduledAt === null` from computeShiftEtas.
              Hidden when the shift is in-progress / on-break /
              complete / cancelled (already there or done) or when
              we have no eta info (e.g. GPS denied). */}
          {eta &&
            state !== "complete" &&
            state !== "in-progress" &&
            state !== "on-break" && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: MC.font,
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "3px 8px 3px 6px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  letterSpacing: 0.2,
                  ...(eta.scheduledAt === null
                    ? // Flex / no scheduled time → neutral okTint
                      // (rep is on time by definition since the
                      // shift has no specific start).
                      {
                        color: "#0d6a45",
                        background: MC.okTint,
                        border: `1px solid ${MC.ok}33`,
                      }
                    : eta.status === "late"
                    ? {
                        color: "#9c1a3c",
                        background: MC.dangerTint,
                        border: `1px solid ${MC.danger}33`,
                      }
                    : eta.status === "tight"
                    ? {
                        color: "#7A560A",
                        background: MC.warnTint,
                        border: `1px solid ${MC.warn}33`,
                      }
                    : {
                        color: "#0d6a45",
                        background: MC.okTint,
                        border: `1px solid ${MC.ok}33`,
                      }),
                }}
                title={
                  eta.trafficAware
                    ? "Based on live traffic"
                    : "Estimated drive time"
                }
              >
                <Glyph
                  name={
                    eta.scheduledAt === null
                      ? "clock"
                      : eta.status === "late"
                      ? "warn"
                      : "clock"
                  }
                  size={11}
                  color={
                    eta.scheduledAt === null
                      ? MC.ok
                      : eta.status === "late"
                      ? MC.danger
                      : eta.status === "tight"
                      ? MC.warn
                      : MC.ok
                  }
                  strokeWidth={2.4}
                />
                {(() => {
                  const arriveLabel = eta.eta.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  // Every variant leads with "Leave now →" so the rep
                  // doesn't have to mentally hold the "this is right
                  // this second" assumption. Flex-time shifts get the
                  // neutral form (no schedule to compare against).
                  if (eta.scheduledAt === null) {
                    return `Leave now → arrive ${arriveLabel}`;
                  }
                  if (eta.status === "late") {
                    return `Leave now → arrive ${arriveLabel} · ${Math.abs(eta.minsDelta)} min late`;
                  }
                  if (eta.status === "tight") {
                    return `Leave now → arrive ${arriveLabel} · on time`;
                  }
                  if (eta.minsDelta > 0) {
                    return `Leave now → arrive ${arriveLabel} · ${eta.minsDelta} min early`;
                  }
                  return `Leave now → arrive ${arriveLabel}`;
                })()}
              </div>
            )}
        </div>
        {!unscheduled && (
          <Glyph
            name={expanded ? "chev-u" : "chev-d"}
            size={20}
            color={MC.mute}
            strokeWidth={2}
          />
        )}
        </div>
        {unscheduled && claimable && onClaim && (
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClaim();
            }}
            disabled={claiming}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: claiming ? MC.line : MC.brand,
              color: "#fff",
              border: "none",
              cursor: claiming ? "not-allowed" : "pointer",
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: -0.1,
              boxShadow: claiming ? "none" : `0 2px 6px ${MC.brand}55`,
            }}
          >
            {claiming ? "Claiming…" : "Claim"}
          </button>
          </div>
        )}
        {unscheduled && requested && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove requested shift"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="close" size={16} color={MC.hint} />
          </button>
        )}
      </button>

      {expanded && !unscheduled && (
        <div
          style={{
            background: "#FAFBFC",
            borderTop: `1px solid ${MC.line}`,
            padding: "12px 14px 14px",
          }}
        >
          {/* Awaiting-manager banner — only when the rep has raised an
              unable-to-attend flag and the manager hasn't actioned it.
              Replaces the normal "Can't make it" affordance below; the
              rep can withdraw until the manager acts. */}
          {shift.attention === "unable_to_attend" && !shift.attentionResolvedAt && (
            <div
              style={{
                marginBottom: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: MC.warnTint,
                border: `1px solid ${MC.warn}55`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Glyph name="warn" size={16} color={MC.warn} strokeWidth={2.2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13,
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
                    fontSize: 11.5,
                    color: "#7d5708",
                    marginTop: 2,
                  }}
                >
                  Reason: {unableReasonLabel(shift.attentionReason)} ·
                  Your manager will reassign or release this shift.
                </div>
              </div>
              {onWithdrawUnable && (
                <button
                  type="button"
                  onClick={onWithdrawUnable}
                  disabled={unableBusy}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${MC.warn}66`,
                    background: "#fff",
                    color: "#6d4808",
                    fontFamily: MC.font,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: unableBusy ? "not-allowed" : "pointer",
                    opacity: unableBusy ? 0.6 : 1,
                  }}
                >
                  {unableBusy ? "…" : "Withdraw"}
                </button>
              )}
            </div>
          )}

          {/* Resolved-recently pill — surfaces what the manager (or
              rep) actually did to a previously-raised flag. Only
              renders for outcomes that leave the rep still seeing
              the row (acknowledged / withdrawn); reassigned /
              released / cancelled remove the row from the rep's view
              entirely, so they never get here. Auto-expires four
              hours after resolution. */}
          {(() => {
            const fb = resolvedAttentionFeedback(shift);
            if (!fb) return null;
            const isOk = fb.tone === "ok";
            return (
              <div
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: isOk ? MC.okTint : MC.brandTint,
                  border: `1px solid ${isOk ? MC.ok + "55" : MC.brand + "55"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Glyph
                  name="check-circle"
                  size={16}
                  color={isOk ? MC.ok : MC.brandDeep}
                  strokeWidth={2.2}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: MC.font,
                      fontSize: 13,
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
                      fontSize: 11.5,
                      color: isOk ? "#0d6a45" : MC.brandDeep,
                      marginTop: 2,
                    }}
                  >
                    {fb.detail}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Site contact strip — phone is tap-to-call, useful when
              the rep is travelling and needs to give an ETA or ask
              for the back-entrance code. Only renders when the site
              has a phone or notes worth surfacing. */}
          {(shift.siteContactPhone || shift.siteNotes) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {shift.siteContactPhone && (
                <a
                  href={`tel:${shift.siteContactPhone}`}
                  style={{
                    display: "inline-flex",
                    alignSelf: "flex-start",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 99,
                    background: MC.brand,
                    color: "#fff",
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 700,
                    textDecoration: "none",
                    boxShadow: `0 4px 10px ${MC.brand}55`,
                  }}
                >
                  <Glyph name="clock" size={13} color="#fff" strokeWidth={2.4} />
                  Call site
                  {shift.siteContactName ? ` · ${shift.siteContactName}` : ""}
                </a>
              )}
              {shift.siteNotes && (
                <div
                  style={{
                    padding: "8px 10px",
                    background: "#FFF6E2",
                    border: "1px solid #F2D17A",
                    borderRadius: 8,
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: "#6d4808",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      marginBottom: 4,
                      color: "#7d5708",
                    }}
                  >
                    Access notes
                  </div>
                  {shift.siteNotes}
                </div>
              )}
            </div>
          )}

          {/* Inline mini route map — mirrors the home Up Next card's
              "tap Directions to see the route" affordance, but
              embedded directly in the expanded row so the rep
              doesn't have to leave /shifts. Shows the actual
              road-following polyline from the rep's GPS to this
              site, with a small drive-time caption overlaid.

              Only mounted when:
                - the row is currently expanded (component is
                  dynamic-imported so the bundle stays small for
                  reps who never open a row)
                - the shift has coords on file (no point showing a
                  map of nothing)
                - the shift is in a "going there" state (scheduled,
                  late, travelling). For in-progress / on-break the
                  rep is already at the site; for complete it's
                  done. Hiding in those cases keeps the row tight.

              At most one row is expanded at a time (expandedId is
              single-valued) so only one MapLibre instance is live
              at any moment. */}
          {(state === "scheduled" || state === "late" || state === "travelling") &&
            typeof shift.siteLat === "number" &&
            typeof shift.siteLng === "number" && (
              <div style={{ marginBottom: 12 }}>
                <MiniRouteMap
                  destLat={shift.siteLat}
                  destLng={shift.siteLng}
                  destLabel={shift.name}
                  destInitials={shift.initials}
                  destColor={shift.color}
                />
              </div>
            )}

          {/* When the rep has raised an unable-to-attend flag we skip
              the regular action row entirely — the amber banner +
              Withdraw button above are the only valid affordances
              until the manager actions it. */}
          {shift.attention === "unable_to_attend" && !shift.attentionResolvedAt ? null : isComplete ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: MC.okTint,
                borderRadius: 11,
                color: "#0d6a45",
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Glyph name="check-circle" size={18} color={MC.ok} strokeWidth={2.2} />
              <span>Shift complete. Nice work.</span>
            </div>
          ) : isInProgress ? (
            // Directions used to live next to Resume here but it was
            // a dead button — no onClick, no Link. Removed (May 11).
            // The dashboard Up Next card carries the in-app Directions
            // preview + Open-in-Maps handoff, and the /route page has
            // per-leg deep links. This row is for checking in /
            // resuming; navigation lives on the screens designed for it.
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onResume}
                disabled={navigating}
                style={{
                  ...secondaryBtn,
                  flex: 1,
                  opacity: navigating ? 0.7 : 1,
                  cursor: navigating ? "wait" : "pointer",
                }}
              >
                <span
                  style={{
                    background: MC.brand,
                    color: "#fff",
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 6,
                  }}
                >
                  {navigating ? (
                    <NavSpinner />
                  ) : (
                    <Glyph name="arrow-r" size={14} color="#fff" strokeWidth={2.2} />
                  )}
                </span>
                <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                  {navigating ? "Opening…" : "Resume shift"}
                </span>
              </button>
            </div>
          ) : (
            // Pre-check-in row (scheduled / late / travelling). The
            // home page Up Next card had a Start-travelling button
            // for these states but /shifts previously didn't, leaving
            // a rep with no way to fire the route + start the travel
            // timer without going back to home. Now we surface both
            // affordances side by side:
            //   - Start travelling (or live "Stop · 5m" timer if
            //     already in transit for THIS shift) — opens OS Maps,
            //     persists the travelling pointer page-wide
            //   - Check in — unchanged primary action
            // We render Start travelling ONLY when the row has a
            // destination AND the parent provided the handler (it
            // does for "Mine" rows; claimable + requested rows skip
            // the handler so the button is hidden there).
            (() => {
              const hasDest =
                typeof shift.siteLat === "number" &&
                typeof shift.siteLng === "number";
              const canTravel = !!onStartTravelling && (hasDest || !!shift.siteAddress);
              return (
                <div style={{ display: "flex", gap: 8 }}>
                  {canTravel && (
                    isTravelling ? (
                      <button
                        type="button"
                        onClick={onStopTravelling}
                        style={{ ...secondaryBtn, flex: 1 }}
                        title="Stop the travel timer"
                      >
                        <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                        <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                          Stop · {formatTravelDuration(travellingSince ?? Date.now())}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onStartTravelling}
                        style={{ ...secondaryBtn, flex: 1 }}
                        title="Start the travel timer and open directions in your map app"
                      >
                        <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                        <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                          Start travelling
                        </span>
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={onCheckIn}
                    disabled={navigating}
                    style={{
                      ...secondaryBtn,
                      flex: canTravel ? 1.1 : 1,
                      opacity: navigating ? 0.7 : 1,
                      cursor: navigating ? "wait" : "pointer",
                    }}
                  >
                    <span
                      style={{
                        background: MC.brand,
                        color: "#fff",
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 6,
                      }}
                    >
                      {navigating ? (
                        <NavSpinner />
                      ) : (
                        <Glyph name="log" size={14} color="#fff" strokeWidth={2.2} />
                      )}
                    </span>
                    <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                      {navigating ? "Opening…" : "Check in"}
                    </span>
                  </button>
                </div>
              );
            })()
          )}

          {/* "Can't make this shift?" — friction-by-design.
              Muted text-link with a small warn glyph so it doesn't
              shout. Only renders for un-checked-in shifts (scheduled,
              travelling, late) without an active attention flag. Same
              tone as the home up-next card so the rep learns it once. */}
          {(state === "scheduled" || state === "travelling" || state === "late") &&
            !shift.attention &&
            !!onUnableToAttend && (
              <button
                type="button"
                onClick={onUnableToAttend}
                style={{
                  marginTop: 10,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: MC.mute,
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: -0.1,
                  padding: "8px 0 2px",
                  cursor: "pointer",
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Glyph name="warn" size={11} color={MC.warn} strokeWidth={2.2} />
                <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Can&apos;t make this shift?
                </span>
              </button>
            )}
        </div>
      )}
    </div>
  );
}

/** Tiny inline spinner used inside the Check-in / Resume buttons while
 *  the parent is in flight routing to the destination page. The
 *  destination does its own loading state once it mounts, but on a
 *  slow network the gap between tap and that page rendering can be a
 *  couple of seconds — without this the button just sits there. */
/** Tiny "in 50 min" / "10 min late" / "ends in 20m" pill. Tone
 *  picked from the timing helper so a soon/now/late shift each get
 *  their own colour without rebuilding the mapping in the row. */
function CountdownPill({
  timing,
}: {
  timing: import("@/lib/format").ShiftTiming;
}) {
  const tones: Record<
    import("@/lib/format").ShiftTimingTone,
    { bg: string; fg: string }
  > = {
    soon: { bg: MC.brandTint, fg: MC.brandInk },
    now: { bg: MC.brandTint, fg: MC.brandInk },
    later: { bg: "#EEF0F3", fg: MC.ink2 },
    live: { bg: MC.okTint, fg: "#0d6a45" },
    late: { bg: MC.warnTint, fg: "#7A560A" },
  };
  const t = tones[timing.tone];
  return (
    <span
      style={{
        padding: "1px 7px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {timing.label}
    </span>
  );
}

function NavSpinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: 99,
        border: "2px solid rgba(255,255,255,.4)",
        borderTopColor: "#fff",
        animation: "shift-spin 0.7s linear infinite",
        display: "inline-block",
      }}
    >
      <style>{`@keyframes shift-spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

/** "Stop · 5m" style elapsed-time formatter for the travel timer.
 *  Returns "<1m" for <60s, "Nm" up to 60min, then "Hh Mm". Page-
 *  level 30s tick keeps the label fresh without per-second renders. */
function formatTravelDuration(since: number): string {
  const sec = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (sec < 60) return "<1m";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: 11,
  background: "#fff",
  border: `1px solid ${MC.line}`,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: MC.font,
  fontSize: 14,
  fontWeight: 500,
  color: "#111418",
  padding: "0 12px",
};
