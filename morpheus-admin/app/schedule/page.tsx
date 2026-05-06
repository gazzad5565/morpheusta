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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { listShiftsInRange, shiftHref, type ShiftRow } from "@/lib/shifts-store";
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
const VIEW_STORAGE_KEY = "schedule-view";
type ViewMode = "days" | "reps";

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
  const [loading, setLoading] = useState(true);

  // View toggle (Days / Reps), persisted to localStorage.
  const [view, setView] = useState<ViewMode>("days");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "reps" || saved === "days") setView(saved);
    } catch {
      /* SSR or storage blocked */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* noop */
    }
  }, [view]);

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

  // Filter once, then index two different ways.
  const filteredShifts = useMemo(
    () =>
      shifts.filter(
        (s) => customerFilter === "All" || s.customer_id === customerFilter
      ),
    [shifts, customerFilter]
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

  // Reps view: { repId-or-unassigned -> dayISO -> shifts[] }
  const byRepDay = useMemo(() => {
    const out = new Map<string, Map<string, ShiftRow[]>>();
    for (const s of filteredShifts) {
      const repKey = s.rep_id ?? UNASSIGNED_KEY;
      if (!out.has(repKey)) out.set(repKey, new Map());
      const dayMap = out.get(repKey)!;
      if (!dayMap.has(s.shift_date)) dayMap.set(s.shift_date, []);
      dayMap.get(s.shift_date)!.push(s);
    }
    for (const dayMap of out.values()) {
      for (const arr of dayMap.values()) {
        arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
      }
    }
    return out;
  }, [filteredShifts]);

  const totalVisible = filteredShifts.length;
  const hasUnassigned = byRepDay.has(UNASSIGNED_KEY);

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
            <ViewToggle view={view} onChange={setView} />
            <div style={{ flex: 1 }} />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${AC.line}`,
                background: "#fff",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.ink,
                cursor: "pointer",
              }}
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

        {/* Body */}
        {view === "days" ? (
          <Card padding={0}>
            <DaysHeader days={days} todayISO={todayISO} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                minHeight: 420,
              }}
            >
              {days.map((d) => {
                const iso = isoDate(d);
                const list = byDay.get(iso) || [];
                return (
                  <DayCell
                    key={iso}
                    iso={iso}
                    isToday={iso === todayISO}
                    shifts={list}
                    repNameMap={repNameMap}
                    customerScopeForAdd={customerFilter === "All" ? null : customerFilter}
                  />
                );
              })}
            </div>
          </Card>
        ) : (
          <Card padding={0}>
            <RepsHeader days={days} todayISO={todayISO} />
            {hasUnassigned && (
              <UnassignedRow
                days={days}
                todayISO={todayISO}
                dayMap={byRepDay.get(UNASSIGNED_KEY) || new Map()}
                repNameMap={repNameMap}
              />
            )}
            {repsForRows.length === 0 && !loading ? (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                }}
              >
                No reps signed up yet.
              </div>
            ) : (
              repsForRows.map((rep) => (
                <RepRow
                  key={rep.id}
                  rep={rep}
                  days={days}
                  todayISO={todayISO}
                  dayMap={byRepDay.get(rep.id) || new Map()}
                  repNameMap={repNameMap}
                  customerScopeForAdd={customerFilter === "All" ? null : customerFilter}
                />
              ))
            )}
          </Card>
        )}

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            textAlign: "center",
          }}
        >
          {view === "days"
            ? "Click a + to add a shift on that day. Click a shift card for its detail page."
            : "Click a + to schedule a shift on that day for that rep. Click a shift card for its detail page."}
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Toolbar: View toggle ───────────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      style={{
        display: "inline-flex",
        background: AC.bg,
        border: `1px solid ${AC.line}`,
        borderRadius: 8,
        padding: 2,
        gap: 2,
      }}
    >
      {(
        [
          { key: "days", label: "Days" },
          { key: "reps", label: "Reps" },
        ] as const
      ).map((opt) => {
        const active = view === opt.key;
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: "none",
              background: active ? "#fff" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(10,15,30,.06)" : "none",
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 600,
              color: active ? AC.ink : AC.mute,
              cursor: "pointer",
              letterSpacing: -0.1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Days view ──────────────────────────────────────────────────────────

function DaysHeader({ days, todayISO }: { days: Date[]; todayISO: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        borderBottom: `1px solid ${AC.line}`,
        background: AC.bg,
      }}
    >
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

function DayCell({
  iso,
  isToday,
  shifts,
  repNameMap,
  customerScopeForAdd,
}: {
  iso: string;
  isToday: boolean;
  shifts: ShiftRow[];
  repNameMap: Record<string, string>;
  customerScopeForAdd: string | null;
}) {
  const isWeekend = (() => {
    const d = new Date(iso);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  })();
  const addQs = new URLSearchParams({
    date: iso,
    start: defaultStartTimeFor(iso, shifts),
    ...(customerScopeForAdd ? { customer: customerScopeForAdd } : {}),
  });
  const addHref = `/schedule/new?${addQs.toString()}`;
  return (
    <div
      style={{
        position: "relative",
        padding: 8,
        borderLeft: `1px solid ${AC.lineDim}`,
        background: isToday ? "#FAFCFD" : isWeekend ? AC.bg : "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // Cap the column height so a busy day doesn't stretch the
        // whole grid row to 50+ cards tall. Shifts beyond what fits
        // become scrollable inside the cell. The "+ Add" stays anchored
        // at the bottom regardless.
        maxHeight: 640,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {shifts.map((s) => {
          const repLabel = s.rep_id ? repNameMap[s.rep_id] || "Rep" : "Unassigned";
          return <ShiftCard key={s.id} shift={s} repLabel={repLabel} />;
        })}
      </div>
      <Link
        href={addHref}
        aria-label={`Add shift on ${iso}`}
        style={{
          minHeight: shifts.length === 0 ? 56 : 28,
          borderRadius: 6,
          border: `1px dashed ${AC.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.6,
          textDecoration: "none",
          color: AC.mute,
          fontFamily: AC.font,
          fontSize: 11,
          fontWeight: 500,
          gap: 4,
          flexShrink: 0,
        }}
      >
        <AGlyph name="plus" size={11} color={AC.faint} />
        {shifts.length === 0 && <span>Add</span>}
      </Link>
    </div>
  );
}

// ─── Reps view ──────────────────────────────────────────────────────────

function RepsHeader({ days, todayISO }: { days: Date[]; todayISO: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px repeat(7, 1fr)",
        borderBottom: `1px solid ${AC.line}`,
        background: AC.bg,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        Rep / Day
      </div>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        return (
          <div
            key={iso}
            style={{
              padding: "10px 12px",
              borderLeft: `1px solid ${AC.lineDim}`,
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

function RepRow({
  rep,
  days,
  todayISO,
  dayMap,
  repNameMap,
  customerScopeForAdd,
}: {
  rep: Profile;
  days: Date[];
  todayISO: string;
  dayMap: Map<string, ShiftRow[]>;
  repNameMap: Record<string, string>;
  customerScopeForAdd: string | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px repeat(7, 1fr)",
        borderBottom: `1px solid ${AC.lineDim}`,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: AC.bg,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 99,
            background: AC.brandDeep,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {deriveInitials(rep)}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
          title={rep.email}
        >
          {displayName(rep)}
        </div>
      </div>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        const list = dayMap.get(iso) || [];
        const addQs = new URLSearchParams({
          rep: rep.id,
          date: iso,
          start: defaultStartTimeFor(iso, list),
          ...(customerScopeForAdd ? { customer: customerScopeForAdd } : {}),
        });
        return (
          <RepDayCell
            key={iso}
            iso={iso}
            isToday={isToday}
            shifts={list}
            repLabelDefault={displayName(rep)}
            repNameMap={repNameMap}
            addHref={`/schedule/new?${addQs.toString()}`}
          />
        );
      })}
    </div>
  );
}

function UnassignedRow({
  days,
  todayISO,
  dayMap,
  repNameMap,
}: {
  days: Date[];
  todayISO: string;
  dayMap: Map<string, ShiftRow[]>;
  repNameMap: Record<string, string>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px repeat(7, 1fr)",
        borderBottom: `2px solid ${AC.line}`,
        background: "#FFF8F1",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 99,
            border: `1.5px dashed ${AC.warn}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AGlyph name="warn" size={13} color={AC.warn} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 700,
              color: AC.ink,
            }}
          >
            Unassigned
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>
            Claimable by any rep
          </div>
        </div>
      </div>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        const list = dayMap.get(iso) || [];
        return (
          <RepDayCell
            key={iso}
            iso={iso}
            isToday={isToday}
            shifts={list}
            repLabelDefault="Unassigned"
            repNameMap={repNameMap}
            addHref={null}
          />
        );
      })}
    </div>
  );
}

function RepDayCell({
  iso,
  isToday,
  shifts,
  repLabelDefault,
  repNameMap,
  addHref,
}: {
  iso: string;
  isToday: boolean;
  shifts: ShiftRow[];
  repLabelDefault: string;
  repNameMap: Record<string, string>;
  addHref: string | null;
}) {
  const isWeekend = (() => {
    const d = new Date(iso);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  })();
  return (
    <div
      style={{
        position: "relative",
        // Lock every cell in the rep grid to the same height range so
        // a single dense day can't stretch the whole rep row to 5x the
        // height of its empty neighbours. Shifts beyond what fits
        // become scrollable inside the cell.
        minHeight: 78,
        maxHeight: 156,
        padding: 6,
        borderLeft: `1px solid ${AC.lineDim}`,
        background: isToday ? "#FAFCFD" : isWeekend ? AC.bg : "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        overflowY: "auto",
      }}
    >
      {shifts.map((s) => {
        const repLabel = s.rep_id ? repNameMap[s.rep_id] || repLabelDefault : repLabelDefault;
        return <ShiftCard key={s.id} shift={s} repLabel={repLabel} />;
      })}
      {shifts.length === 0 && addHref && (
        <Link
          href={addHref}
          aria-label={`Add shift on ${iso}`}
          style={{
            flex: 1,
            minHeight: 56,
            borderRadius: 5,
            border: `1px dashed ${AC.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.6,
            textDecoration: "none",
          }}
        >
          <AGlyph name="plus" size={11} color={AC.faint} />
        </Link>
      )}
    </div>
  );
}

// ─── Shared shift card ──────────────────────────────────────────────────

function ShiftCard({ shift, repLabel }: { shift: ShiftRow; repLabel: string }) {
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

  return (
    <Link
      href={shiftHref(shift)}
      title={`${repLabel} · ${customerName} · ${shift.state}`}
      style={{
        background: `${color}15`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 5,
        padding: "5px 7px",
        textDecoration: "none",
        display: "block",
        opacity: isComplete ? 0.7 : 1,
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
          marginTop: 1,
          textDecoration: isComplete ? "line-through" : "none",
        }}
      >
        {customerName}
      </div>
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
    </Link>
  );
}
