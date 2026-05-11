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
import {
  UnableToAttendSheet,
  unableReasonLabel,
} from "@/components/UnableToAttendSheet";

// A shift row from the DB carries internal id + state alongside the display fields.
type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
  rawStartTime: string;
  rawEndTime: string;
  shiftDate: string;
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

export default function ShiftsListPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const reload = () => {
    Promise.all([
      listMyShiftsToday(),
      listUnassignedShiftsToday(),
      listRequestedShifts(),
    ]).then(([m, u, r]) => {
      // Sort: in-progress first → scheduled → complete (so completed
      // shifts sink to the bottom of the list).
      const order: Record<string, number> = {
        "in-progress": 0,
        scheduled: 1,
        late: 2,
        complete: 3,
      };
      m.sort((a, b) => (order[a.state] ?? 1) - (order[b.state] ?? 1));
      setMine(m);
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
    const poll = window.setInterval(reload, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubShifts();
      unsubRequests();
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
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <Glyph name="plus" size={13} color={MC.brand} strokeWidth={2.6} />
          Request
        </button>
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
              timing={formatShiftCountdown(
                s.shiftDate,
                s.rawStartTime,
                s.rawEndTime,
                s.state
              )}
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
          unassignedFiltered.map((s) => (
            <ShiftRow
              key={s.realId}
              shift={s}
              expanded={false}
              unscheduled
              claimable
              claiming={claiming === s.realId}
              onClaim={() => onClaim(s.realId)}
            />
          ))
        )}
      </div>

      {/* CTA used to live here at the bottom too — moved to the top
          beneath the header so reps with many shifts can find it
          without scrolling. One copy is enough. */}
      <div style={{ height: 12 }} />

      <AppFooter />

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
  onToggle,
  onCheckIn,
  onResume,
  onRemove,
  onClaim,
  onUnableToAttend,
  onWithdrawUnable,
  unableBusy,
}: {
  shift: Shift & {
    siteId?: string | null;
    siteName?: string | null;
    siteAddress?: string | null;
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
}) {
  const isComplete = state === "complete";
  const isInProgress = state === "in-progress";
  // Only show a "lifecycle" badge for COMPLETE shifts — they have no
  // countdown so the badge is the only state signal. For in-progress
  // we deliberately don't render one: the green "Ends in 1h 25m"
  // countdown pill already conveys "this is live" (tone + copy), and
  // stacking "IN PROGRESS" next to "ENDS 1H 25M" made the row look
  // crowded for no extra information.
  const stateBadge = (() => {
    if (unscheduled) return null;
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
          gap: 12,
          alignItems: "center",
          cursor: onToggle ? "pointer" : "default",
          textAlign: "left",
        }}
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
                      {shift.start}–{shift.end}
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
                  {shift.start}–{shift.end}
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
              WHERE the shift is without expanding. Truncates with
              ellipsis on overflow. Only renders when the site has
              an address — single-address customers in particular
              benefit from the explicit street line. */}
          {shift.siteAddress && (
            <div
              style={{
                marginTop: 3,
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.hint,
                letterSpacing: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={shift.siteAddress}
            >
              <Glyph name="pin" size={11} color={MC.hint} strokeWidth={2} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {shift.siteAddress}
              </span>
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
        {unscheduled && claimable && onClaim && (
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
            // Same reasoning as above — dead Directions button removed.
            // Check-in is the single action on a not-yet-started row.
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onCheckIn}
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
                    <Glyph name="log" size={14} color="#fff" strokeWidth={2.2} />
                  )}
                </span>
                <span style={{ color: MC.brandDeep, fontWeight: 600 }}>
                  {navigating ? "Opening…" : "Check in"}
                </span>
              </button>
            </div>
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
