"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useMemo } from "react";
import { MC } from "@/lib/tokens";
import { type Shift } from "@/lib/mock-data";
import { AppHeader, AppFooter, CustomerTile, StatusChip, PrimaryButton } from "@/components/Chrome";
import { LoadingBar, Skeleton } from "@/components/Loading";
import { Glyph, formatTime } from "@/components/Glyph";
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

// MapLibre needs `window`; defer to client-only.
const DashboardMap = dynamic(
  () => import("@/components/DashboardMap").then((m) => m.DashboardMap),
  { ssr: false }
);

type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
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

export default function DashboardPage() {
  // Lifted state — UpNextCard reacts to these.
  // directionsOpen: rep tapped "Directions" to preview the route on the map.
  // travellingSince: rep tapped "Start travelling" — route is now live.
  // Persisted to localStorage so closing the app mid-travel doesn't lose
  // the timer or leave a dangling shift.travel_started without an end.
  const [directionsOpen, setDirectionsOpen] = useState(false);
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
    setUnableBusyFor(realId);
    const r = await raiseUnableToAttend(realId, reason, note);
    setUnableBusyFor(null);
    if (!r.ok) {
      throw new Error(r.error || "Couldn't notify your manager");
    }
    setUnableSheetFor(null);
    // Refetch so the up-next card flips to "Awaiting manager" without
    // waiting for Realtime to round-trip on slow networks.
    void listMyShiftsToday().then((rows) => setShifts(rows));
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
      <AppHeader title="Dashboard" lastSync={nowLabel} compact />
      {!shiftsLoaded && <LoadingBar />}

      {/* Welcome strip — thin, glassy, branded. Org logo (if uploaded
          in admin /settings/organisation) sits left for personalised
          feel; subtle gradient wash uses the Morpheus brand cyan. */}
      <WelcomeStrip
        firstName={firstName}
        greeting={greeting}
        todayHeader={todayHeader}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
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
          {/* View all — primary action on the dashboard, was a tiny
              text link that disappeared next to the big shift count.
              Now a proper pill-style button that's actually tappable
              on a phone. */}
          <Link
            href="/shifts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: 10,
              background: MC.brandTint,
              border: `1px solid ${MC.brand}33`,
              fontFamily: MC.font,
              fontSize: 13.5,
              fontWeight: 700,
              color: MC.brandDeep,
              letterSpacing: -0.1,
              textDecoration: "none",
              boxShadow: `0 2px 6px ${MC.brand}22`,
            }}
          >
            View all
            <Glyph name="chev-r" size={15} color={MC.brandDeep} strokeWidth={2.4} />
          </Link>
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

      {/* Real map of today's shift locations + the rep's own GPS dot. */}
      {shiftsLoaded && shifts.length > 0 && <DashboardMap shifts={shifts} />}

      {/* Up Next — primary CTA */}
      <UpNextCard
        shifts={shifts}
        loaded={shiftsLoaded}
        directionsOpen={directionsOpen}
        setDirectionsOpen={setDirectionsOpen}
        travellingSince={travellingSince}
        setTravellingSince={setTravellingSince}
        inProgressCount={inProgressCount}
        onUnableToAttend={(s) =>
          setUnableSheetFor({ realId: s.realId, name: s.name })
        }
        onWithdrawUnable={handleWithdrawUnable}
        unableBusyFor={unableBusyFor}
      />

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
  directionsOpen,
  setDirectionsOpen,
  travellingSince,
  setTravellingSince,
  inProgressCount,
  onUnableToAttend,
  onWithdrawUnable,
  unableBusyFor,
}: {
  shifts: DbShift[];
  loaded: boolean;
  directionsOpen: boolean;
  setDirectionsOpen: (v: boolean) => void;
  travellingSince: number | null;
  setTravellingSince: (v: number | null) => void;
  inProgressCount: number;
  /** Open the unable-to-attend sheet for the up-next shift.
   *  Defined only when the next shift is scheduled and clean. */
  onUnableToAttend?: (shift: DbShift) => void;
  /** Withdraw a previously-raised attention flag on the next shift. */
  onWithdrawUnable?: (shiftRealId: string) => void;
  /** Real id of the shift currently in a raise/withdraw DB call.
   *  Used to disable the Withdraw button while it's in flight. */
  unableBusyFor?: string | null;
}) {
  // Prefer the in-progress shift; otherwise the earliest scheduled one.
  const inProgress = shifts.find((s) => s.state === "in-progress");
  const scheduled = shifts.find((s) => s.state === "scheduled");
  const next = inProgress || scheduled || null;
  const isResume = !!inProgress;
  void inProgressCount; // currently unused; kept for future polish
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!travellingSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [travellingSince]);

  const elapsed = travellingSince ? Math.floor((now - travellingSince) / 1000) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedLabel = `${m}:${String(s).padStart(2, "0")}`;

  // Empty state: distinguish "no shifts at all" vs "all shifts done today".
  // A rep who completed every shift shouldn't be told "no shift assigned".
  if (loaded && !next) {
    const totalToday = shifts.length;
    const allDone = totalToday > 0 && shifts.every((s) => s.state === "complete");
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
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 600,
                color: MC.hint,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              #{next.code}
            </div>
          </div>

          {/* Customer */}
          <div
            style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}
          >
            <CustomerTile initials={next.initials} color={next.color} size={48} />
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
                }}
              >
                {next.start} – {next.end} · {next.distance}
              </div>
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
              {/* Actions */}
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {/* Two-button row: Directions toggles inline preview, Start/Stop travelling */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setDirectionsOpen(!directionsOpen)}
                    style={{
                      ...secondaryBtnStyle,
                      flex: 1,
                      background: directionsOpen ? MC.brandTint : MC.card,
                      borderColor: directionsOpen ? MC.brand : `${MC.brand}33`,
                    }}
                    aria-pressed={directionsOpen}
                  >
                    <Glyph
                      name="target"
                      size={16}
                      color={directionsOpen ? MC.brandInk : MC.brandDeep}
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
                      onClick={() => setTravellingSince(Date.now())}
                      style={{ ...secondaryBtnStyle, flex: 1.4 }}
                    >
                      <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                      Start travelling
                    </button>
                  )}
                </div>
                {isResume ? (
                  <Link href="/active" style={{ textDecoration: "none" }}>
                    <PrimaryButton icon="arrow-r">Resume shift</PrimaryButton>
                  </Link>
                ) : (
                  <Link href={`/check-in?shift=${next.realId}`} style={{ textDecoration: "none" }}>
                    <PrimaryButton icon="log">Check in to shift</PrimaryButton>
                  </Link>
                )}
              </div>

              {/* Lateness/info banner — only shown for not-yet-checked-in shifts. */}
              {!isResume && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "9px 12px",
                    background: MC.warnTint,
                    borderRadius: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: "#6d4808",
                  }}
                >
                  <Glyph name="info" size={14} color="#b27606" />
                  <span>
                    You&apos;ll record any off-site or late reason at check-in.
                  </span>
                </div>
              )}

              {/* "I can't make this shift" — friction-by-design red
                  text-link, only on scheduled shifts where attention
                  isn't already raised. Same affordance as the
                  /shifts row so the rep learns it once. */}
              {!isResume && onUnableToAttend && (
                <button
                  type="button"
                  onClick={() => onUnableToAttend(next)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: MC.danger,
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: -0.1,
                    padding: "6px 0 2px",
                    cursor: "pointer",
                    textAlign: "center",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    opacity: 0.85,
                  }}
                >
                  I can&apos;t make this shift
                </button>
              )}
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
}: {
  firstName: string;
  greeting: string;
  todayHeader: string;
  orgName: string;
  orgLogoUrl: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        margin: "16px 14px 4px",
        padding: "12px 14px 14px",
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
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
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
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "rgba(255,255,255,.75)",
            }}
          >
            {orgName || "Morpheus"} · {todayHeader}
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 20,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: -0.4,
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </div>
        </div>
      </div>
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
        <div style={{ width: 40, height: 4, borderRadius: 99, background: MC.line, margin: "0 auto 12px" }} />
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

