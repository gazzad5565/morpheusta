"use client";

/**
 * Schedule / Calendar — toggleable week view.
 *
 * Two views, switchable from the toolbar. The user's preference is
 * persisted to localStorage so it sticks across visits.
 *
 *   - "Days"  (default): one row of 7 day columns. Each cell stacks
 *     every shift scheduled for that day, regardless of which rep
 *     it's assigned to. Compact even with a big team.
 *   - "Reps": one row per rep × 7 day columns. Lets you see a single
 *     rep's whole week at a glance and spot loaded vs unloaded reps.
 *     An "Unassigned" row at the top collects claimable shifts.
 *
 * Both views:
 *   - Empty day cell → "+" button to /schedule/new?date=YYYY-MM-DD
 *     (also pre-fills &rep= and &customer= where applicable).
 *   - Click a shift  → /shifts/[id].
 *   - Customer filter narrows visible shifts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import {
  listShiftsInRange,
  shiftHref,
  updateShift,
  type ShiftRow,
} from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { listCustomers } from "@/lib/customers-store";
import { localISO as isoDate, formatTime, initialsFromNameOrEmail } from "@/lib/format";
import type { Customer } from "@/lib/types";

// ─── Date helpers (week starts Monday) ──────────────────────────────────
function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function deriveInitials(p: Profile): string {
  return initialsFromNameOrEmail(p.name, p.email);
}
function stateRank(s: ShiftRow): number {
  if (s.state === "in-progress") return 0;
  if (s.state === "late") return 1;
  if (s.state === "scheduled") return 2;
  if (s.state === "complete") return 3;
  return 4;
}

const UNASSIGNED_KEY = "__unassigned__";

// ─── Time grid constants ──────────────────────────────────────────────
//
// The Days view is a real time-axis calendar. We render slots from
// HOUR_START to HOUR_END at SLOT_MIN-minute granularity. SLOT_PX is the
// height of one slot in CSS pixels, and PX_PER_MIN derives from it.
//
// Picked 06:00–20:00 (14 h) by default — covers early starts and late
// completions without making the column scroll on a typical 1080p
// screen. Two slots per hour matches the "thirty-minute slots" the
// product spec asks for.
const HOUR_START = 6;
const HOUR_END = 20;
const SLOT_MIN = 30;
const SLOT_PX = 24;
const PX_PER_MIN = SLOT_PX / SLOT_MIN;
const DAY_TOTAL_MIN = (HOUR_END - HOUR_START) * 60;
const DAY_TOTAL_PX = DAY_TOTAL_MIN * PX_PER_MIN;
const TIME_GUTTER_W = 60;

function timeToMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
/** Top offset in px for a given absolute minute-of-day. */
function minToTop(m: number): number {
  return Math.max(0, (m - HOUR_START * 60) * PX_PER_MIN);
}
/** Convert a Y offset (px from column top) into a snapped minute-of-day. */
function pxToSnappedMin(px: number): number {
  const raw = px / PX_PER_MIN + HOUR_START * 60;
  const snapped = Math.round(raw / SLOT_MIN) * SLOT_MIN;
  // Clamp so we can't drop a card so its start lands at or after HOUR_END.
  // Subtract one slot's worth so the shortest possible block still fits
  // before the day's bottom edge.
  return Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - SLOT_MIN, snapped));
}
function shiftOverlapsRange(
  s: ShiftRow,
  startMin: number,
  endMin: number
): boolean {
  return timeToMin(s.start_time) < endMin && startMin < timeToMin(s.end_time);
}

/**
 * Lay overlapping shifts side-by-side instead of stacking them on top
 * of each other. Returns a Map<shift_id, { lane, lanes }> where:
 *   - lane  is this shift's column index inside its overlap cluster
 *   - lanes is the total column count for that cluster
 *
 * We split the day into "clusters" (connected components of overlap)
 * so a single dense morning doesn't squish a quiet afternoon. Inside
 * each cluster a sweep-line greedy reuses the earliest free lane.
 *
 * Why we needed this:
 *   1. With every shift positioned at left:4 / right:4, two shifts at
 *      the same time rendered on top of each other — the calendar
 *      "looked a mess" and only the topmost (later DOM-order) card
 *      received pointer events.
 *   2. The card-on-top problem broke drag silently. Sort order put
 *      complete shifts last, so a complete card occluded the
 *      scheduled card behind it; the user grabbed nothing because
 *      complete shifts have draggable=false. Lanes eliminate the
 *      occlusion entirely.
 */
/**
 * Maximum number of overlapping shift lanes we render before bailing
 * out to a "+N more" overflow pill. Beyond this each card becomes a
 * 20-px strip nobody can read; better to surface the count and let
 * the manager click in for the full list.
 */
const MAX_VISIBLE_LANES = 3;

interface OverflowGroup {
  /** Anchor shifts (top of cluster, used to position the +N pill). */
  startMin: number;
  endMin: number;
  hidden: ShiftRow[];
}

interface LaneAssignment {
  /** Map<shift_id, lane info> for shifts that render normally. */
  visible: Map<string, { lane: number; lanes: number }>;
  /** One per cluster that exceeded MAX_VISIBLE_LANES — used to draw "+N more". */
  overflows: OverflowGroup[];
}

function assignLanes(shifts: ShiftRow[]): LaneAssignment {
  const visible = new Map<string, { lane: number; lanes: number }>();
  const overflows: OverflowGroup[] = [];
  if (shifts.length === 0) return { visible, overflows };

  // Sort by start, then by longer-first so longer shifts get the
  // leftmost lane (feels more natural when scanning).
  const sorted = [...shifts].sort((a, b) => {
    const sa = timeToMin(a.start_time);
    const sb = timeToMin(b.start_time);
    if (sa !== sb) return sa - sb;
    return timeToMin(b.end_time) - timeToMin(a.end_time);
  });

  // Walk shifts in order; whenever the next start is >= max end of
  // the current cluster, the cluster is closed and we flush.
  let cluster: ShiftRow[] = [];
  let clusterMaxEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Lane sweep within the cluster.
    const laneEnds: number[] = [];
    const laneOf: number[] = [];
    for (const s of cluster) {
      const start = timeToMin(s.start_time);
      const end = timeToMin(s.end_time);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      laneOf.push(lane);
    }
    const lanesNeeded = laneEnds.length;

    if (lanesNeeded <= MAX_VISIBLE_LANES) {
      cluster.forEach((s, i) =>
        visible.set(s.id, { lane: laneOf[i], lanes: lanesNeeded })
      );
    } else {
      // Cluster has too many overlapping lanes. Render the first
      // MAX-1 lanes normally; collapse everything else (including
      // the original lanes >= MAX-1) into a single "+N more" pill
      // occupying the rightmost slot.
      const lanesShown = MAX_VISIBLE_LANES;
      const lastVisibleLane = lanesShown - 2; // 0..lastVisibleLane render normally
      const hidden: ShiftRow[] = [];
      let clusterStart = Infinity;
      let clusterEnd = -Infinity;
      cluster.forEach((s, i) => {
        const lane = laneOf[i];
        if (lane <= lastVisibleLane) {
          visible.set(s.id, { lane, lanes: lanesShown });
        } else {
          hidden.push(s);
        }
        const sStart = timeToMin(s.start_time);
        const sEnd = timeToMin(s.end_time);
        if (sStart < clusterStart) clusterStart = sStart;
        if (sEnd > clusterEnd) clusterEnd = sEnd;
      });
      if (hidden.length > 0) {
        overflows.push({
          startMin: clusterStart,
          endMin: clusterEnd,
          hidden,
        });
      }
    }
    cluster = [];
    clusterMaxEnd = -1;
  };

  for (const s of sorted) {
    const start = timeToMin(s.start_time);
    const end = timeToMin(s.end_time);
    if (cluster.length === 0 || start < clusterMaxEnd) {
      cluster.push(s);
      clusterMaxEnd = Math.max(clusterMaxEnd, end);
    } else {
      flush();
      cluster.push(s);
      clusterMaxEnd = end;
    }
  }
  flush();
  return { visible, overflows };
}

// Shared dropdown style for the toolbar filters (rep + customer). Kept
// here so the two selects line up cell-for-cell on every screen size.
const filterSelectStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid #E2E8EE`,
  background: "#fff",
  fontFamily: "inherit",
  fontSize: 12,
  color: "#0E141B",
  cursor: "pointer",
};

/**
 * Smart default start time for the "+ Add" button on a day cell.
 *
 * - If the day already has shifts, start AFTER the latest shift's end
 *   time, rounded up to the next hour. Stacks new shifts after existing
 *   ones.
 * - Else, if the day is today, start at the next round hour (or 09:00,
 *   whichever is later). Avoids defaulting to a time that's already
 *   passed.
 * - Else (any other day, past or future), 09:00.
 *
 * Always falls within the same calendar day — clamps at 22:00 so the
 * +1h end_time on the create page can't roll past midnight.
 */
function defaultStartTimeFor(iso: string, dayShifts: ShiftRow[]): string {
  const ceilHour = (h: number, m: number) => Math.min(22, m === 0 ? h : h + 1);
  // Day already busy → start after the last end_time.
  if (dayShifts.length > 0) {
    const lastEnd = dayShifts
      .map((s) => s.end_time || "00:00")
      .sort()
      .pop()!;
    const [h, m] = lastEnd.split(":").map((n) => parseInt(n, 10));
    return `${String(ceilHour(h, m)).padStart(2, "0")}:00`;
  }
  const today = isoDate(new Date());
  if (iso === today) {
    const now = new Date();
    const h = ceilHour(now.getHours(), now.getMinutes());
    const target = Math.max(h, 9);
    return `${String(target).padStart(2, "0")}:00`;
  }
  return "09:00";
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  // Rep filter — "All" / __unassigned__ / specific rep id. Mirrors the
  // customer filter so a manager can quickly narrow the calendar to
  // "show me Hayid's whole week" without switching to the Reps view.
  const [repFilter, setRepFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayISO = useMemo(() => isoDate(new Date()), []);

  // Load all profiles (no role filter — managers who happen to have
  // shifts should still resolve to a name on cards).
  useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles(), listCustomers()]).then(([rs, cs]) => {
      if (cancelled) return;
      setAllProfiles(rs);
      setCustomers(cs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch shifts whenever the visible week changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const startISO = isoDate(weekStart);
    const endISO = isoDate(addDays(weekStart, 6));
    listShiftsInRange(startISO, endISO).then((rows) => {
      if (cancelled) return;
      setShifts(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  // Profile name map (id -> display name) — used by both views to
  // resolve rep_id on shift cards.
  const repNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of allProfiles) m[p.id] = displayName(p);
    return m;
  }, [allProfiles]);

  // Reps to render as rows in the "reps" view: role='rep' profiles
  // (sorted by name). Manager profiles are excluded from rows but
  // still resolve on cards.
  const repsForRows = useMemo(
    () =>
      allProfiles
        .filter((p) => p.role === "rep")
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [allProfiles]
  );

  // Filter once (by customer + rep), then index two different ways.
  // repFilter values: "All" → no rep filter; "__unassigned__" → rep_id IS NULL;
  // any other string → that exact rep id.
  const filteredShifts = useMemo(
    () =>
      shifts.filter((s) => {
        if (customerFilter !== "All" && s.customer_id !== customerFilter) return false;
        if (repFilter === "All") return true;
        if (repFilter === UNASSIGNED_KEY) return !s.rep_id;
        return s.rep_id === repFilter;
      }),
    [shifts, customerFilter, repFilter]
  );

  // Days view: { dayISO -> shifts[] }
  const byDay = useMemo(() => {
    const out = new Map<string, ShiftRow[]>();
    for (const s of filteredShifts) {
      if (!out.has(s.shift_date)) out.set(s.shift_date, []);
      out.get(s.shift_date)!.push(s);
    }
    for (const arr of out.values()) {
      arr.sort((a, b) => {
        const r = stateRank(a) - stateRank(b);
        if (r !== 0) return r;
        return a.start_time.localeCompare(b.start_time);
      });
    }
    return out;
  }, [filteredShifts]);

  const totalVisible = filteredShifts.length;

  // Transient banner messages for drag-and-drop feedback. Keeps the
  // alert() noise off while still telling the manager what happened on
  // a successful move or a conflict block. Auto-dismisses.
  const [moveBanner, setMoveBanner] = useState<{
    kind: "ok" | "warn" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!moveBanner) return;
    const t = window.setTimeout(() => setMoveBanner(null), 4000);
    return () => window.clearTimeout(t);
  }, [moveBanner]);

  /**
   * Optimistic shift move. Used by both the Days view (drag changes
   * date + start/end) and the Reps view (drag changes rep_id and/or
   * date, time-of-day preserved).
   *
   * Steps:
   *   1. Snapshot the original row so we can revert on DB error.
   *   2. Conflict check — if the new (rep, date, time-range) overlaps
   *      any other shift for the same rep, we block and surface the
   *      offender's customer name. Unassigned shifts (rep_id = null)
   *      don't conflict with anything; multiple unassigned shifts at
   *      the same time are allowed.
   *   3. Optimistic UI update. The drop visually lands instantly.
   *   4. Background updateShift(). On success we keep the optimistic
   *      state (the next refetch reconciles anyway). On failure we
   *      revert and surface the error in the banner.
   *
   * Refuses to move shifts in any state other than "scheduled" — the
   * draggable={...} guard on each card already prevents this, but we
   * double-check here so a stale drag can't slip through.
   */
  const applyShiftMove = async (
    id: string,
    patch: {
      shift_date?: string;
      start_time?: string;
      end_time?: string;
      rep_id?: string | null;
    }
  ): Promise<void> => {
    const before = shifts.find((s) => s.id === id);
    if (!before) return;
    if (before.state !== "scheduled") {
      setMoveBanner({
        kind: "warn",
        text: `Can't move a ${before.state} shift. Only scheduled shifts are draggable.`,
      });
      return;
    }

    const newDate = patch.shift_date ?? before.shift_date;
    const newStart = patch.start_time ?? before.start_time;
    const newEnd = patch.end_time ?? before.end_time;
    const newRep =
      patch.rep_id !== undefined ? patch.rep_id : before.rep_id;

    // No-op? Don't bother hitting the DB.
    if (
      newDate === before.shift_date &&
      newStart === before.start_time &&
      newEnd === before.end_time &&
      newRep === before.rep_id
    ) {
      return;
    }

    // Conflict check (only when the new shift has a rep — unassigned
    // shifts can stack freely; the manager picks one to claim later).
    if (newRep) {
      const newStartMin = timeToMin(newStart);
      const newEndMin = timeToMin(newEnd);
      const conflict = shifts.find(
        (s) =>
          s.id !== id &&
          s.rep_id === newRep &&
          s.shift_date === newDate &&
          shiftOverlapsRange(s, newStartMin, newEndMin)
      );
      if (conflict) {
        const cn = conflict.customers?.name || "another shift";
        setMoveBanner({
          kind: "warn",
          text: `Overlaps with ${cn} (${conflict.start_time}–${conflict.end_time}). Pick another slot.`,
        });
        return;
      }
    }

    // Optimistic update.
    setShifts((arr) =>
      arr.map((s) =>
        s.id === id
          ? {
              ...s,
              shift_date: newDate,
              start_time: newStart,
              end_time: newEnd,
              rep_id: newRep,
            }
          : s
      )
    );

    const r = await updateShift(id, {
      shift_date: newDate !== before.shift_date ? newDate : undefined,
      start_time: newStart !== before.start_time ? newStart : undefined,
      end_time: newEnd !== before.end_time ? newEnd : undefined,
      rep_id:
        newRep !== before.rep_id ? (newRep as string | null) : undefined,
    });

    if (!r.ok) {
      // Revert.
      setShifts((arr) => arr.map((s) => (s.id === id ? before : s)));
      setMoveBanner({
        kind: "error",
        text: r.error || "Couldn't save the move. The shift was put back.",
      });
      return;
    }
    setMoveBanner({
      kind: "ok",
      text: `Moved to ${newDate} ${newStart}–${newEnd}.`,
    });
  };

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goThisWeek = () => setWeekStart(startOfWeekMonday(new Date()));

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const startMonth = weekStart.toLocaleDateString(undefined, { month: "short" });
    const endMonth = end.toLocaleDateString(undefined, { month: "short" });
    if (startMonth === endMonth) {
      return `${startMonth} ${weekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Schedule"]}
      actions={
        <Link href="/schedule/new" style={{ textDecoration: "none" }}>
          <Btn icon="plus" kind="primary" size="sm">
            New shift
          </Btn>
        </Link>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 22,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.4,
            }}
          >
            Week planner
          </div>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 99,
              background: AC.bg,
              color: AC.mute,
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {loading ? "…" : `${totalVisible} shifts`}
          </span>
        </div>

        {/* Toolbar: week nav + view toggle + customer filter */}
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn size="sm" icon="chev-l" onClick={goPrev}>
              {""}
            </Btn>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: AC.ink,
                padding: "0 4px",
                letterSpacing: -0.2,
              }}
            >
              {weekLabel}
            </div>
            <Btn size="sm" icon="chev-r" onClick={goNext}>
              {""}
            </Btn>
            <Btn size="sm" onClick={goThisWeek}>
              This week
            </Btn>
            <div style={{ flex: 1 }} />
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              title="Filter by rep"
              style={filterSelectStyle}
            >
              <option value="All">All reps</option>
              <option value={UNASSIGNED_KEY}>Unassigned</option>
              {repsForRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {displayName(r)}
                </option>
              ))}
            </select>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              title="Filter by customer"
              style={filterSelectStyle}
            >
              <option value="All">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {moveBanner && <MoveBanner banner={moveBanner} />}

        {/* Body — single time-axis Days view. The previous "Reps" view
            (one row per rep × 7 day columns) was retired in favour of
            the rep filter dropdown above: pick a rep there to see only
            their shifts inside this calendar, or leave it on All to
            see everyone in one stack. */}
        <Card padding={0}>
          <DaysHeaderWithGutter days={days} todayISO={todayISO} />
          <DaysCalendar
            days={days}
            todayISO={todayISO}
            byDay={byDay}
            repNameMap={repNameMap}
            customerScopeForAdd={customerFilter === "All" ? null : customerFilter}
            onMove={applyShiftMove}
          />
        </Card>

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            textAlign: "center",
          }}
        >
          Drag a scheduled shift to move it. Click + to add a new one. Click a card for its detail page.
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Drag-feedback banner ───────────────────────────────────────────────

function MoveBanner({
  banner,
}: {
  banner: { kind: "ok" | "warn" | "error"; text: string };
}) {
  const palette =
    banner.kind === "ok"
      ? { bg: AC.okTint, ink: "#0F5A38", icon: "check" as const }
      : banner.kind === "warn"
      ? { bg: AC.warnTint, ink: "#7A560A", icon: "warn" as const }
      : { bg: AC.dangerTint, ink: "#9c1a3c", icon: "warn" as const };
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: palette.bg,
        color: palette.ink,
        borderRadius: 8,
        fontFamily: AC.font,
        fontSize: 12.5,
        fontWeight: 600,
        animation: "sched-banner-in .22s cubic-bezier(.22, 1, .36, 1) both",
      }}
    >
      <AGlyph name={palette.icon} size={13} color={palette.ink} />
      <span>{banner.text}</span>
      <style>{`
        @keyframes sched-banner-in {
          from { transform: translateY(-4px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Days view (time-axis calendar) ─────────────────────────────────────

function DaysHeaderWithGutter({
  days,
  todayISO,
}: {
  days: Date[];
  todayISO: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${TIME_GUTTER_W}px repeat(7, 1fr)`,
        borderBottom: `1px solid ${AC.line}`,
        background: AC.bg,
      }}
    >
      {/* Empty corner above the gutter */}
      <div
        style={{
          padding: "10px 8px",
          borderRight: `1px solid ${AC.lineDim}`,
        }}
      />
      {days.map((d, i) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        return (
          <div
            key={iso}
            style={{
              padding: "10px 12px",
              borderLeft: i === 0 ? "none" : `1px solid ${AC.lineDim}`,
              background: isToday ? AC.brandSoft : "transparent",
            }}
          >
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: isToday ? AC.brandDeep : AC.mute,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: isToday ? AC.brandDeep : AC.ink,
                letterSpacing: -0.2,
                marginTop: 1,
              }}
            >
              {d.getDate()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Top-level Days view: a left time gutter + 7 day columns, all
 * sharing the same DAY_TOTAL_PX height. Shifts are absolutely
 * positioned within their column based on start/end time. Drag a
 * scheduled shift to move its start time and/or change its day.
 *
 * Drag state is held in a ref + a single re-render-only state so the
 * dragging card and the hover preview can update without re-rendering
 * the entire week. We use HTML5 DnD because it just works for this
 * shape — pointer events would be more flexible but bring their own
 * scroll/iframe edge cases that aren't worth the complexity here.
 */
function DaysCalendar({
  days,
  todayISO,
  byDay,
  repNameMap,
  customerScopeForAdd,
  onMove,
}: {
  days: Date[];
  todayISO: string;
  byDay: Map<string, ShiftRow[]>;
  repNameMap: Record<string, string>;
  customerScopeForAdd: string | null;
  onMove: (
    id: string,
    patch: {
      shift_date?: string;
      start_time?: string;
      end_time?: string;
      rep_id?: string | null;
    }
  ) => Promise<void>;
}) {
  // Active drag — both views share the same drag state shape so we can
  // reuse the helper. `pickupOffsetMin` is how far down the card the
  // cursor was when picked up, so the dropped block lands at exactly
  // the position the user expects rather than snapping its top to the
  // cursor.
  const [drag, setDrag] = useState<{
    shift: ShiftRow;
    pickupOffsetMin: number;
  } | null>(null);
  const [hover, setHover] = useState<{
    dayISO: string;
    startMin: number;
    endMin: number;
  } | null>(null);

  const beginDrag = (shift: ShiftRow, pickupOffsetMin: number) => {
    setDrag({ shift, pickupOffsetMin });
  };
  const endDrag = () => {
    setDrag(null);
    setHover(null);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${TIME_GUTTER_W}px repeat(7, 1fr)`,
        position: "relative",
      }}
    >
      <TimeGutter />
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        const list = byDay.get(iso) || [];
        return (
          <DayColumn
            key={iso}
            iso={iso}
            isToday={isToday}
            shifts={list}
            repNameMap={repNameMap}
            customerScopeForAdd={customerScopeForAdd}
            drag={drag}
            hover={hover && hover.dayISO === iso ? hover : null}
            onBeginDrag={beginDrag}
            onEndDrag={endDrag}
            onSetHover={(h) => setHover(h)}
            onCommit={async (newDateISO, newStartMin, newEndMin) => {
              if (!drag) return;
              const id = drag.shift.id;
              endDrag();
              await onMove(id, {
                shift_date: newDateISO,
                start_time: minToTime(newStartMin),
                end_time: minToTime(newEndMin),
              });
            }}
          />
        );
      })}
    </div>
  );
}

function TimeGutter() {
  const slots: number[] = [];
  for (let m = HOUR_START * 60; m < HOUR_END * 60; m += SLOT_MIN) slots.push(m);
  return (
    <div
      style={{
        position: "relative",
        height: DAY_TOTAL_PX,
        background: AC.bg,
        borderRight: `1px solid ${AC.lineDim}`,
      }}
    >
      {slots.map((m) => {
        const onTheHour = m % 60 === 0;
        return (
          <div
            key={m}
            style={{
              position: "absolute",
              top: minToTop(m),
              left: 0,
              right: 0,
              height: SLOT_PX,
              borderTop: `1px ${onTheHour ? "solid" : "dashed"} ${
                onTheHour ? AC.lineDim : "#EEF1F4"
              }`,
            }}
          >
            {onTheHour && (
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  right: 6,
                  fontFamily: AC.font,
                  fontSize: 10,
                  fontWeight: 600,
                  color: AC.mute,
                  letterSpacing: 0.2,
                }}
              >
                {formatHourLabel(m / 60)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

/**
 * Renders one day column's worth of shift cards plus any "+N more"
 * overflow pills. Pulled into its own component so the popover state
 * (which overflow group is open?) is local — keeping it on DayColumn
 * would invalidate the whole calendar grid on each open/close.
 */
function DayColumnContents({
  shifts,
  repNameMap,
  drag,
  onBeginDrag,
  onEndDrag,
}: {
  shifts: ShiftRow[];
  repNameMap: Record<string, string>;
  drag: { shift: ShiftRow; pickupOffsetMin: number } | null;
  onBeginDrag: (shift: ShiftRow, pickupOffsetMin: number) => void;
  onEndDrag: () => void;
}) {
  const [openOverflowIdx, setOpenOverflowIdx] = useState<number | null>(null);
  const { visible: laneMap, overflows } = useMemo(
    () => assignLanes(shifts),
    [shifts]
  );

  return (
    <>
      {shifts.map((s) => {
        const meta = laneMap.get(s.id);
        if (!meta) return null; // Hidden in an overflow group — popover renders these.
        return (
          <DraggableShiftCard
            key={s.id}
            shift={s}
            repLabel={s.rep_id ? repNameMap[s.rep_id] || "Rep" : "Unassigned"}
            dimmed={drag?.shift.id === s.id}
            lane={meta.lane}
            lanes={meta.lanes}
            onBeginDrag={onBeginDrag}
            onEndDrag={onEndDrag}
          />
        );
      })}

      {overflows.map((g, i) => {
        const top = minToTop(g.startMin);
        const height = Math.max(
          SLOT_PX - 2,
          (g.endMin - g.startMin) * PX_PER_MIN - 2
        );
        // The pill always sits in the rightmost lane (lane 2 of 3).
        const lanePct = ((MAX_VISIBLE_LANES - 1) / MAX_VISIBLE_LANES) * 100;
        return (
          <div
            key={`overflow-${i}`}
            style={{
              position: "absolute",
              top,
              height,
              left: `calc(${lanePct}% + 2px)`,
              right: 2,
              zIndex: 3,
            }}
          >
            <button
              type="button"
              onClick={() => setOpenOverflowIdx(openOverflowIdx === i ? null : i)}
              style={{
                width: "100%",
                height: "100%",
                background: AC.brandSoft,
                border: `1.5px dashed ${AC.brand}`,
                borderRadius: 6,
                cursor: "pointer",
                color: AC.brandDeep,
                fontFamily: AC.font,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: -0.1,
                padding: "4px 4px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                textAlign: "center",
              }}
              title={`${g.hidden.length} more shifts overlap here — click to view`}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+{g.hidden.length}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                more
              </span>
            </button>

            {openOverflowIdx === i && (
              <OverflowPopover
                shifts={g.hidden}
                repNameMap={repNameMap}
                onClose={() => setOpenOverflowIdx(null)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Tiny popover anchored to the "+N more" pill. Lists every hidden
 * shift as a stacked card with full text — click any one to navigate
 * to its detail. Click outside or the close button to dismiss.
 */
function OverflowPopover({
  shifts,
  repNameMap,
  onClose,
}: {
  shifts: ShiftRow[];
  repNameMap: Record<string, string>;
  onClose: () => void;
}) {
  // Close on outside click. Mounted via a small effect on the
  // backdrop instead of a portal — good enough for a small popover.
  return (
    <>
      <div
        onMouseDown={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "transparent",
        }}
      />
      <div
        role="dialog"
        aria-label={`${shifts.length} additional shifts`}
        style={{
          position: "absolute",
          top: 0,
          left: "100%",
          marginLeft: 6,
          minWidth: 240,
          maxWidth: 300,
          maxHeight: 320,
          overflowY: "auto",
          background: "#fff",
          border: `1px solid ${AC.line}`,
          borderRadius: 10,
          boxShadow: "0 12px 28px rgba(10,15,30,.16)",
          zIndex: 101,
          padding: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 6px 8px",
            borderBottom: `1px solid ${AC.lineDim}`,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              flex: 1,
            }}
          >
            {shifts.length} more shifts
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 2,
              display: "flex",
            }}
          >
            <AGlyph name="x" size={12} color={AC.mute} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {shifts.map((s) => {
            const repLabel = s.rep_id
              ? repNameMap[s.rep_id] || "Rep"
              : "Unassigned";
            const c = s.customers;
            const color = c?.color || "#888";
            const isComplete = s.state === "complete";
            return (
              <Link
                key={s.id}
                href={shiftHref(s)}
                style={{
                  display: "block",
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: `${color}10`,
                  borderLeft: `3px solid ${color}`,
                  textDecoration: "none",
                  color: "inherit",
                  opacity: isComplete ? 0.7 : 1,
                }}
              >
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: AC.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: isComplete ? "line-through" : "none",
                  }}
                >
                  {repLabel}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 1,
                    textDecoration: isComplete ? "line-through" : "none",
                  }}
                >
                  {c?.name || "Unknown customer"}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 10.5,
                    color: AC.ink2,
                    marginTop: 2,
                  }}
                >
                  {formatTime(s.start_time, { compact: true })}–
                  {formatTime(s.end_time, { compact: true })}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DayColumn({
  iso,
  isToday,
  shifts,
  repNameMap,
  customerScopeForAdd,
  drag,
  hover,
  onBeginDrag,
  onEndDrag,
  onSetHover,
  onCommit,
}: {
  iso: string;
  isToday: boolean;
  shifts: ShiftRow[];
  repNameMap: Record<string, string>;
  customerScopeForAdd: string | null;
  drag: { shift: ShiftRow; pickupOffsetMin: number } | null;
  hover: { dayISO: string; startMin: number; endMin: number } | null;
  onBeginDrag: (shift: ShiftRow, pickupOffsetMin: number) => void;
  onEndDrag: () => void;
  onSetHover: (
    h: { dayISO: string; startMin: number; endMin: number } | null
  ) => void;
  onCommit: (newDateISO: string, newStartMin: number, newEndMin: number) => void;
}) {
  const router = useRouter();
  const colRef = useRef<HTMLDivElement | null>(null);
  const isWeekend = (() => {
    const d = new Date(iso);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  })();
  const slots: number[] = [];
  for (let m = HOUR_START * 60; m < HOUR_END * 60; m += SLOT_MIN) slots.push(m);

  // Compute hover preview when a drag is over this column.
  const computeHoverFromEvent = (e: React.DragEvent<HTMLDivElement>) => {
    if (!drag || !colRef.current) return null;
    const rect = colRef.current.getBoundingClientRect();
    const yPx = e.clientY - rect.top;
    // Apply pickup offset so the cursor stays where the user grabbed.
    const pickupOffsetPx = drag.pickupOffsetMin * PX_PER_MIN;
    const startMin = pxToSnappedMin(yPx - pickupOffsetPx);
    const dur =
      timeToMin(drag.shift.end_time) - timeToMin(drag.shift.start_time);
    const endMin = Math.min(HOUR_END * 60, startMin + dur);
    return { dayISO: iso, startMin, endMin };
  };

  return (
    <div
      ref={colRef}
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const h = computeHoverFromEvent(e);
        if (h) onSetHover(h);
      }}
      onDragLeave={() => {
        // Don't blank the hover too aggressively — moving across child
        // elements can trigger spurious leaves. Only clear if the
        // pointer truly left this column. We rely on the next column's
        // dragOver to overwrite the hover state.
      }}
      onDrop={(e) => {
        if (!drag) return;
        e.preventDefault();
        const h = computeHoverFromEvent(e);
        if (h) onCommit(h.dayISO, h.startMin, h.endMin);
        else onEndDrag();
      }}
      onClick={(e) => {
        // Click-to-add: tapping an empty spot in a day column routes
        // to /schedule/new with the date AND start time pre-filled
        // to wherever the user clicked (snapped to 30 min). Skip
        // when the click landed on a child element (a card, the
        // overflow pill, or the bottom "+ Add" affordance) — those
        // have their own handlers.
        if (e.target !== e.currentTarget) return;
        if (!colRef.current) return;
        const rect = colRef.current.getBoundingClientRect();
        const yPx = e.clientY - rect.top;
        // Ignore clicks below the slot grid (where the bottom Add pill lives).
        if (yPx > DAY_TOTAL_PX - 30) return;
        const startMin = pxToSnappedMin(yPx);
        const qs = new URLSearchParams({
          date: iso,
          start: minToTime(startMin),
          ...(customerScopeForAdd ? { customer: customerScopeForAdd } : {}),
        });
        router.push(`/schedule/new?${qs.toString()}`);
      }}
      style={{
        position: "relative",
        height: DAY_TOTAL_PX,
        borderLeft: `1px solid ${AC.lineDim}`,
        background: isToday ? "#FAFCFD" : isWeekend ? AC.bg : "#fff",
        cursor: drag ? "default" : "copy",
      }}
    >
      {/* Slot grid lines (decorative — actual hit-testing uses pixel math) */}
      {slots.map((m) => {
        const onTheHour = m % 60 === 0;
        return (
          <div
            key={m}
            style={{
              position: "absolute",
              top: minToTop(m),
              left: 0,
              right: 0,
              height: SLOT_PX,
              borderTop: `1px ${onTheHour ? "solid" : "dashed"} ${
                onTheHour ? AC.lineDim : "#F1F4F7"
              }`,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Shift cards positioned by start_time / duration. Overlapping
          shifts are split into lanes (max 3 visible) so they render
          side-by-side instead of stacking on top of each other. Past
          MAX_VISIBLE_LANES the rightmost slot becomes a "+N more" pill
          showing how many shifts are hidden — clicking it reveals
          them in a popover. */}
      <DayColumnContents
        shifts={shifts}
        repNameMap={repNameMap}
        drag={drag}
        onBeginDrag={onBeginDrag}
        onEndDrag={onEndDrag}
      />

      {/* Hover preview while dragging over this column */}
      {hover && drag && (
        <div
          style={{
            position: "absolute",
            top: minToTop(hover.startMin),
            height: Math.max(
              SLOT_PX - 2,
              (hover.endMin - hover.startMin) * PX_PER_MIN - 2
            ),
            left: 4,
            right: 4,
            borderRadius: 6,
            background: `${AC.brand}1F`,
            border: `1.5px dashed ${AC.brand}`,
            pointerEvents: "none",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 4,
            fontFamily: AC.font,
            fontSize: 10,
            fontWeight: 700,
            color: AC.brandDeep,
            letterSpacing: 0.2,
          }}
        >
          {minToTime(hover.startMin)}–{minToTime(hover.endMin)}
        </div>
      )}

      {/* Bottom-anchored "+ Add" affordance — sits below the slot grid
          so it never collides with a card. */}
      <DayColumnAdd
        iso={iso}
        shifts={shifts}
        customerScopeForAdd={customerScopeForAdd}
      />
    </div>
  );
}

function DayColumnAdd({
  iso,
  shifts,
  customerScopeForAdd,
}: {
  iso: string;
  shifts: ShiftRow[];
  customerScopeForAdd: string | null;
}) {
  const addQs = new URLSearchParams({
    date: iso,
    start: defaultStartTimeFor(iso, shifts),
    ...(customerScopeForAdd ? { customer: customerScopeForAdd } : {}),
  });
  return (
    <Link
      href={`/schedule/new?${addQs.toString()}`}
      aria-label={`Add shift on ${iso}`}
      style={{
        position: "absolute",
        left: 6,
        right: 6,
        bottom: 6,
        height: 24,
        borderRadius: 6,
        border: `1px dashed ${AC.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.55,
        textDecoration: "none",
        color: AC.mute,
        fontFamily: AC.font,
        fontSize: 11,
        fontWeight: 500,
        gap: 4,
        background: "rgba(255,255,255,.7)",
        backdropFilter: "blur(2px)",
      }}
    >
      <AGlyph name="plus" size={11} color={AC.faint} />
      <span>Add</span>
    </Link>
  );
}

/**
 * Position-absolute, draggable shift card used by the Days calendar.
 * Click anywhere except a click-and-drag → navigate to the detail
 * page (Link wrapper). Only state='scheduled' shifts are draggable;
 * everything else is read-only.
 */
function DraggableShiftCard({
  shift,
  repLabel,
  dimmed,
  lane,
  lanes,
  onBeginDrag,
  onEndDrag,
}: {
  shift: ShiftRow;
  repLabel: string;
  dimmed: boolean;
  /** This card's column index within its overlap cluster (0..lanes-1). */
  lane: number;
  /** Total lanes in the cluster. 1 = full width. */
  lanes: number;
  onBeginDrag: (shift: ShiftRow, pickupOffsetMin: number) => void;
  onEndDrag: () => void;
}) {
  const startMin = timeToMin(shift.start_time);
  const endMin = timeToMin(shift.end_time);
  const top = minToTop(startMin);
  const height = Math.max(
    SLOT_PX - 2,
    (endMin - startMin) * PX_PER_MIN - 2
  );
  // Side-by-side layout for overlapping shifts. Each lane gets an even
  // share of the column width with a 2px gap on either side so cards
  // never visually merge.
  const lanePct = (lane / lanes) * 100;
  const remainingPct = ((lanes - lane - 1) / lanes) * 100;
  const c = shift.customers;
  const color = c?.color || "#888";
  const customerName = c?.name || "Unknown customer";
  const stateColors: Record<string, string> = {
    "in-progress": AC.brand,
    complete: AC.ok,
    late: AC.danger,
    scheduled: color,
  };
  const accent = stateColors[shift.state] || color;
  const isComplete = shift.state === "complete";
  const isDraggable = shift.state === "scheduled";

  const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>) => {
    if (!isDraggable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    // Some browsers require dataTransfer to have something set.
    e.dataTransfer.setData("text/plain", shift.id);
    // Pickup offset (minutes) — how far down the card the cursor was.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetPx = e.clientY - rect.top;
    const pickupOffsetMin = Math.max(0, offsetPx / PX_PER_MIN);
    onBeginDrag(shift, pickupOffsetMin);
  };

  return (
    <Link
      href={shiftHref(shift)}
      title={`${repLabel} · ${customerName}${
        isDraggable ? " · drag to move" : ""
      }`}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={onEndDrag}
      style={{
        position: "absolute",
        top,
        height,
        left: `calc(${lanePct}% + 2px)`,
        right: `calc(${remainingPct}% + 2px)`,
        background: `${color}18`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 5,
        padding: "4px 7px",
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        opacity: dimmed ? 0.35 : isComplete ? 0.7 : 1,
        cursor: isDraggable ? "grab" : "pointer",
        overflow: "hidden",
        boxShadow: dimmed ? "none" : "0 1px 2px rgba(10,15,30,.06)",
        // Make sure scheduled (draggable) cards always sit ABOVE
        // complete cards in the rare case they share a lane — defends
        // against the silent "drag does nothing" bug if the layout
        // sweep ever folds a complete card on top of a scheduled one.
        zIndex: isDraggable ? 2 : 1,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 10.5,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textDecoration: isComplete ? "line-through" : "none",
        }}
      >
        {repLabel}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 10.5,
          fontWeight: 600,
          color: color,
          letterSpacing: -0.1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textDecoration: isComplete ? "line-through" : "none",
        }}
      >
        {customerName}
      </div>
      {height >= 44 && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 10,
            color: AC.ink2,
            fontWeight: 500,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "wrap",
          }}
        >
          {formatTime(shift.start_time, { compact: true })}–
          {formatTime(shift.end_time, { compact: true })}
          {shift.state !== "scheduled" && (
            <span
              style={{
                padding: "0 5px",
                borderRadius: 99,
                background: `${accent}22`,
                color: accent,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              {shift.state}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

