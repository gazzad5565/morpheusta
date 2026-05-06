"use client";

/**
 * Schedule / Calendar — week view, flat by day.
 *
 * One row of 7 columns (Mon→Sun); each cell stacks every shift scheduled
 * for that day, regardless of which rep it's assigned to. Shift cards
 * show the rep's name + customer + time + state — same as on the Live
 * Ops shifts list — so you can identify a shift without needing a
 * per-rep row.
 *
 * The previous version was a per-rep grid (one row per rep × 7 columns).
 * Gary asked to flatten it: with 30+ reps the table was mostly empty
 * cells. Use the customer filter or the rep detail page if you need a
 * per-rep view.
 *
 *   - Empty day cell  → "+" button to /schedule/new?date=YYYY-MM-DD
 *   - Click a shift   → /shifts/[id]
 *   - Customer filter narrows the visible shifts.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { listShiftsInRange, type ShiftRow } from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { listCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

// ─── Date helpers (week starts Monday) ──────────────────────────────────
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
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
function formatTime(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm}${ampm}`;
}

// State sort: in-progress first (active), then scheduled, then complete (done).
function stateRank(s: ShiftRow): number {
  if (s.state === "in-progress") return 0;
  if (s.state === "late") return 1;
  if (s.state === "scheduled") return 2;
  if (s.state === "complete") return 3;
  return 4;
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [reps, setReps] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayISO = useMemo(() => isoDate(new Date()), []);

  // Initial load: ALL profiles (so manager-as-rep resolves) + customers.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles(), listCustomers()]).then(([rs, cs]) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const r of rs as Profile[]) map[r.id] = displayName(r);
      setReps(map);
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

  // Index by day, applying the customer filter.
  const byDay = useMemo(() => {
    const out = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      if (customerFilter !== "All" && s.customer_id !== customerFilter) continue;
      if (!out.has(s.shift_date)) out.set(s.shift_date, []);
      out.get(s.shift_date)!.push(s);
    }
    // Sort within each day: state-rank first, then by start_time.
    for (const arr of out.values()) {
      arr.sort((a, b) => {
        const r = stateRank(a) - stateRank(b);
        if (r !== 0) return r;
        return a.start_time.localeCompare(b.start_time);
      });
    }
    return out;
  }, [shifts, customerFilter]);

  const totalVisible = useMemo(
    () => Array.from(byDay.values()).reduce((sum, arr) => sum + arr.length, 0),
    [byDay]
  );

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

        {/* Week navigation + filters */}
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

        {/* Grid: header + a single body row of 7 day columns */}
        <Card padding={0}>
          <GridHeader days={days} todayISO={todayISO} />
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
                  reps={reps}
                  customerScopeForAdd={customerFilter === "All" ? null : customerFilter}
                />
              );
            })}
          </div>
        </Card>

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            textAlign: "center",
          }}
        >
          Click a + to schedule a shift on that day. Click a shift card to open
          its detail page.
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function GridHeader({ days, todayISO }: { days: Date[]; todayISO: string }) {
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
  reps,
  customerScopeForAdd,
}: {
  iso: string;
  isToday: boolean;
  shifts: ShiftRow[];
  reps: Record<string, string>;
  /** When the customer filter is active, prefilter /schedule/new to that customer too. */
  customerScopeForAdd: string | null;
}) {
  const isWeekend = (() => {
    const d = new Date(iso);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  })();
  const addQs = new URLSearchParams({
    date: iso,
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
      }}
    >
      {shifts.map((s) => {
        const repLabel = s.rep_id
          ? reps[s.rep_id] || "Rep"
          : "Unassigned";
        return <ShiftCard key={s.id} shift={s} repLabel={repLabel} />;
      })}
      {/* Add-shift button — always visible on every cell, not just empty
          ones, so a manager can stack a new shift on a day that already
          has shifts without having to leave the page. */}
      <Link
        href={addHref}
        aria-label={`Add shift on ${iso}`}
        style={{
          marginTop: shifts.length === 0 ? 0 : "auto",
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
        }}
      >
        <AGlyph name="plus" size={11} color={AC.faint} />
        {shifts.length === 0 && <span>Add</span>}
      </Link>
    </div>
  );
}

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
      href={`/shifts/${shift.id}`}
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
        {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
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
