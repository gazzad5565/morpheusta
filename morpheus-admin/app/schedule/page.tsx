"use client";

/**
 * Schedule (week planner) — real data.
 *
 * A 7-day grid: rows are reps (plus an "Unassigned" row at the top for
 * claimable shifts), columns are Mon-Sun of the visible week. Each cell
 * shows the rep's shifts on that day; empty cells get a + button that
 * opens /schedule/new pre-filled with the rep id + the date.
 *
 * Week navigation: ← / Today / →. Customer filter narrows visible shifts.
 *
 * Click a shift cell to open the customer detail page (a future step
 * could be a "shift detail" page; for v1 we just route to the customer).
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
  // getDay() is 0..6 with Sunday = 0; we want Monday = 0 offset
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
  const src = p.name?.trim() || p.email.split("@")[0] || "?";
  const parts = src.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}
function formatTime(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm}${ampm}`;
}

const UNASSIGNED_KEY = "__unassigned__";

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [reps, setReps] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayISO = useMemo(() => isoDate(new Date()), []);

  // Initial load: reps + customers (don't depend on the week).
  useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles({ role: "rep" }), listCustomers()]).then(
      ([rs, cs]) => {
        if (cancelled) return;
        setReps(rs);
        setCustomers(cs);
      }
    );
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

  // Index: { repId-or-unassigned -> dayISO -> shifts[] }
  const byRepDay = useMemo(() => {
    const out = new Map<string, Map<string, ShiftRow[]>>();
    for (const s of shifts) {
      if (customerFilter !== "All" && s.customer_id !== customerFilter) continue;
      const repKey = s.rep_id ?? UNASSIGNED_KEY;
      if (!out.has(repKey)) out.set(repKey, new Map());
      const dayMap = out.get(repKey)!;
      if (!dayMap.has(s.shift_date)) dayMap.set(s.shift_date, []);
      dayMap.get(s.shift_date)!.push(s);
    }
    return out;
  }, [shifts, customerFilter]);

  // Total shifts visible this week (after customer filter), shown as a header pill.
  const totalVisible = useMemo(
    () => Array.from(byRepDay.values()).reduce(
      (sum, m) => sum + Array.from(m.values()).reduce((s, arr) => s + arr.length, 0),
      0
    ),
    [byRepDay]
  );

  const hasUnassigned = byRepDay.has(UNASSIGNED_KEY);

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goThisWeek = () => setWeekStart(startOfWeekMonday(new Date()));

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const startMonth = weekStart.toLocaleDateString(undefined, { month: "short" });
    const endMonth = end.toLocaleDateString(undefined, { month: "short" });
    if (weekStart.getMonth() === end.getMonth()) {
      return `${startMonth} ${weekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Schedule"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/schedule/new" style={{ textDecoration: "none" }}>
            <Btn icon="plus" kind="primary" size="sm">
              New shift
            </Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Heading + total */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 18,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.3,
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

        {/* Grid */}
        <Card padding={0}>
          <GridHeader days={days} todayISO={todayISO} />

          {/* Unassigned row (if any) */}
          {hasUnassigned && (
            <UnassignedRow
              days={days}
              todayISO={todayISO}
              dayMap={byRepDay.get(UNASSIGNED_KEY) || new Map()}
            />
          )}

          {/* Rep rows */}
          {reps.length === 0 && !loading ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
              }}
            >
              No reps signed up yet. Reps appear here once they create an account on the mobile
              app.
            </div>
          ) : (
            reps.map((rep) => (
              <RepRow
                key={rep.id}
                rep={rep}
                days={days}
                todayISO={todayISO}
                dayMap={byRepDay.get(rep.id) || new Map()}
              />
            ))
          )}
        </Card>

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            textAlign: "center",
          }}
        >
          Click a + to schedule a shift on that day for that rep. Click a shift to open the
          customer.
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

function UnassignedRow({
  days,
  todayISO,
  dayMap,
}: {
  days: Date[];
  todayISO: string;
  dayMap: Map<string, ShiftRow[]>;
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
            color: AC.warn,
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
              letterSpacing: -0.1,
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
          <Cell
            key={iso}
            iso={iso}
            isToday={isToday}
            shifts={list}
            // unassigned cells DON'T have a quick-add (use the global New shift CTA)
            addHref={null}
            repLabel="Unassigned"
          />
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
}: {
  rep: Profile;
  days: Date[];
  todayISO: string;
  dayMap: Map<string, ShiftRow[]>;
}) {
  const initials = deriveInitials(rep);
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
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 600,
              color: AC.ink,
              letterSpacing: -0.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName(rep)}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {rep.email}
          </div>
        </div>
      </div>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayISO;
        const list = dayMap.get(iso) || [];
        const addHref = `/schedule/new?rep=${rep.id}&date=${iso}`;
        return (
          <Cell
            key={iso}
            iso={iso}
            isToday={isToday}
            shifts={list}
            addHref={addHref}
            repLabel={displayName(rep)}
          />
        );
      })}
    </div>
  );
}

function Cell({
  iso,
  isToday,
  shifts,
  addHref,
  repLabel,
}: {
  iso: string;
  isToday: boolean;
  shifts: ShiftRow[];
  addHref: string | null;
  /** Rep name to display on each shift card. "Unassigned" for the unassigned row. */
  repLabel: string;
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
        minHeight: 70,
        padding: 6,
        borderLeft: `1px solid ${AC.lineDim}`,
        background: isToday ? "#FAFCFD" : isWeekend ? AC.bg : "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {shifts.map((s) => (
        <ShiftCell key={s.id} shift={s} repLabel={repLabel} />
      ))}
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

function ShiftCell({ shift, repLabel }: { shift: ShiftRow; repLabel: string }) {
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
      {/* Rep name — top line so the card is identifiable when the
          row's left rep column is hidden / the table is scrolled. */}
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
      {/* Customer name — second line in the customer's brand colour. */}
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
