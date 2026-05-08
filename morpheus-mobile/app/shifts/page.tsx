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
  subscribeShifts,
} from "@/lib/shifts-store";
import { AppHeader, AppFooter, CustomerTile, SectionLabel } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";

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
  const onCheckIn = (shiftId: string) => {
    setNavigatingTo(shiftId);
    router.push(`/check-in?shift=${shiftId}`);
  };
  const onResumeShift = (shiftId: string) => {
    setNavigatingTo(shiftId);
    router.push("/active");
  };

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
        </div>
        <Link
          href="/add-shift"
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
          }}
        >
          <Glyph name="plus" size={13} color={MC.brand} strokeWidth={2.6} />
          Request
        </Link>
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
          <SkeletonRow />
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
            />
          ))
        )}
      </div>

      <SectionLabel count={unassignedFiltered.length}>
        Unscheduled · available
      </SectionLabel>

      <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loaded ? null : unassignedFiltered.length === 0 ? (
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

function SkeletonRow() {
  return (
    <div
      style={{
        height: 80,
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: MC.radiusCard,
        opacity: 0.5,
      }}
    />
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
}: {
  shift: Shift & {
    siteId?: string | null;
    siteName?: string | null;
    siteAddress?: string | null;
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
}) {
  const isComplete = state === "complete";
  const isInProgress = state === "in-progress";
  const stateBadge = (() => {
    if (unscheduled) return null;
    if (isComplete) {
      return { label: "Complete", bg: MC.okTint, fg: "#0d6a45" };
    }
    if (isInProgress) {
      return { label: "In progress", bg: MC.brandTint, fg: MC.brandInk };
    }
    return null;
  })();
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
        <CustomerTile initials={shift.initials} color={shift.color} size={52} />
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
          {isComplete ? (
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
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={secondaryBtn}>
                <Glyph name="pin" size={16} color={MC.ink2} />
                <span>Directions</span>
              </button>
              <button
                type="button"
                onClick={onResume}
                disabled={navigating}
                style={{
                  ...secondaryBtn,
                  flex: 1.4,
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
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={secondaryBtn}>
                <Glyph name="pin" size={16} color={MC.ink2} />
                <span>Directions</span>
              </button>
              <button
                type="button"
                onClick={onCheckIn}
                disabled={navigating}
                style={{
                  ...secondaryBtn,
                  flex: 1.4,
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
