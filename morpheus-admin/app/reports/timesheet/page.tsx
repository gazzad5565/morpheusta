"use client";

/**
 * /reports/timesheet — payroll-grade timesheet across every rep.
 *
 * One row per shift in the period, joined with:
 *   - shifts.check_in_at (real check-in time; from shifts table)
 *   - latest checkout event (from shift_events; CSV of every variant
 *     including auto_checked_out)
 *   - customer name + brand colour
 *   - rep display name
 *
 * Hours = check_out - check_in (rounded to 1 decimal). Falls back to
 * scheduled hours when the shift hasn't checked out yet, with a clear
 * "in progress" pill so the row isn't mistaken for paid time.
 *
 * Filters: period (7/30/90 days), rep dropdown, "hide unworked" toggle
 * to drop scheduled-but-never-checked-in rows. Sortable by every column.
 *
 * Export: one click → CSV download. Headers + rows match the on-screen
 * columns. Filename includes the period + today's date.
 */

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { SegTabs } from "@/components/ui/SegTabs";
import { RepAvatar } from "@/components/ui/Avatars";
import {
  SortableHeader,
  compareBy,
  type SortState,
} from "@/components/ui/SortableHeader";
import { AC } from "@/lib/tokens";
import { KpiBig, BarChart, CHART_PALETTE } from "@/components/ui/charts";
import { listShiftsInRange, type ShiftRow } from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { getCheckoutTimesForShifts } from "@/lib/events-store";
import {
  localISO,
  isoDaysAgo,
  initialsFromNameOrEmail,
  formatDate,
  formatTime,
} from "@/lib/format";

type Period = "7" | "30" | "90";
type SortKey =
  | "date"
  | "rep"
  | "customer"
  | "scheduledStart"
  | "actualIn"
  | "actualOut"
  | "hours"
  | "status";

interface TimesheetRow {
  shiftId: string;
  date: string;            // YYYY-MM-DD
  dateLabel: string;       // "May 6, 2026"
  repId: string | null;
  repName: string;
  repInitials: string;
  customerId: string;
  customerName: string;
  customerColor: string;
  customerInitials: string;
  scheduledStart: string;  // "HH:MM"
  scheduledEnd: string;    // "HH:MM"
  actualInIso: string | null;
  actualOutIso: string | null;
  hoursActual: number | null;
  hoursScheduled: number;
  status: "complete" | "in-progress" | "scheduled" | "missed" | "late" | "other";
  flags: string[];
}

export default function TimesheetReportPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [checkoutTimes, setCheckoutTimes] = useState<Map<string, string>>(
    () => new Map()
  );
  const [repFilter, setRepFilter] = useState<string>("all");
  const [hideUnworked, setHideUnworked] = useState<boolean>(false);
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "date",
    dir: "desc",
  });

  const days = parseInt(period, 10);

  useEffect(() => {
    let cancelled = false;
    const start = isoDaysAgo(days - 1);
    const end = localISO(new Date());
    Promise.all([listShiftsInRange(start, end), listProfiles()]).then(
      async ([rows, ps]) => {
        if (cancelled) return;
        setShifts(rows);
        setProfiles(ps);
        const ids = rows.map((r) => r.id);
        const times = await getCheckoutTimesForShifts(ids);
        if (cancelled) return;
        setCheckoutTimes(times);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [days]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const rows: TimesheetRow[] = useMemo(() => {
    if (!shifts) return [];
    return shifts.map((s) => {
      const profile = s.rep_id ? profileById.get(s.rep_id) : null;
      const repName = profile ? displayName(profile) : s.rep_id ? "Deleted user" : "Unassigned";
      const repInitials = profile
        ? initialsFromNameOrEmail(profile.name, profile.email)
        : "—";
      // Prefer the new shifts.check_out_at column (cheap, direct).
      // Fall back to the events log lookup for rows from before the
      // 2026_05_06_shifts_check_out_at backfill landed.
      const actualOutIso = s.check_out_at ?? checkoutTimes.get(s.id) ?? null;
      const hoursScheduled = computeScheduledHours(s.start_time, s.end_time);
      const hoursActual = computeActualHours(s.check_in_at, actualOutIso);
      const flags = collectFlags(s);
      return {
        shiftId: s.id,
        date: s.shift_date,
        dateLabel: formatDate(s.shift_date),
        repId: s.rep_id,
        repName,
        repInitials,
        customerId: s.customer_id,
        customerName: s.customers?.name || "Unknown customer",
        customerColor: s.customers?.color || "#888",
        customerInitials: s.customers?.initials || "??",
        scheduledStart: (s.start_time || "").slice(0, 5),
        scheduledEnd: (s.end_time || "").slice(0, 5),
        actualInIso: s.check_in_at,
        actualOutIso,
        hoursActual,
        hoursScheduled,
        status: deriveStatus(s, actualOutIso),
        flags,
      };
    });
  }, [shifts, profileById, checkoutTimes]);

  const filtered = useMemo(() => {
    let out = rows;
    if (repFilter !== "all") out = out.filter((r) => r.repId === repFilter);
    if (hideUnworked) out = out.filter((r) => r.actualInIso !== null);
    return [...out].sort((a, b) => {
      switch (sort.key) {
        case "date":
          return compareBy(a, b, (r) => `${r.date}T${r.scheduledStart}`, sort.dir);
        case "rep":
          return compareBy(a, b, (r) => r.repName, sort.dir);
        case "customer":
          return compareBy(a, b, (r) => r.customerName, sort.dir);
        case "scheduledStart":
          return compareBy(a, b, (r) => `${r.date}T${r.scheduledStart}`, sort.dir);
        case "actualIn":
          return compareBy(a, b, (r) => r.actualInIso, sort.dir);
        case "actualOut":
          return compareBy(a, b, (r) => r.actualOutIso, sort.dir);
        case "hours":
          return compareBy(a, b, (r) => r.hoursActual ?? r.hoursScheduled, sort.dir);
        case "status":
          return compareBy(a, b, (r) => r.status, sort.dir);
      }
    });
  }, [rows, repFilter, hideUnworked, sort]);

  // ─── KPIs ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const worked = filtered.filter((r) => r.hoursActual !== null);
    const totalHoursActual = worked.reduce((acc, r) => acc + (r.hoursActual || 0), 0);
    const totalHoursScheduled = filtered.reduce((acc, r) => acc + r.hoursScheduled, 0);
    const completedShifts = filtered.filter((r) => r.status === "complete").length;
    const repsActive = new Set(
      filtered.filter((r) => r.actualInIso).map((r) => r.repId)
    ).size;
    return {
      totalHoursActual,
      totalHoursScheduled,
      completedShifts,
      repsActive,
    };
  }, [filtered]);

  // Top reps by actual hours worked.
  const topByHours = useMemo(() => {
    const byRep = new Map<string, { name: string; hours: number; shifts: number }>();
    for (const r of filtered) {
      if (!r.repId || r.hoursActual === null) continue;
      const cur = byRep.get(r.repId) || { name: r.repName, hours: 0, shifts: 0 };
      cur.hours += r.hoursActual;
      cur.shifts += 1;
      byRep.set(r.repId, cur);
    }
    return Array.from(byRep.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
      .map((r, i) => ({
        label: r.name,
        value: Math.round(r.hours * 10) / 10,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        sub: `${r.shifts} shift${r.shifts === 1 ? "" : "s"}`,
      }));
  }, [filtered]);

  const onExport = () => {
    const csv = buildCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-last-${days}d-${localISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loading = shifts === null;

  return (
    <AdminShell
      breadcrumbs={["Home", "Reports", "Timesheet"]}
      actions={
        <Btn
          icon="download"
          kind="primary"
          size="sm"
          onClick={onExport}
          disabled={loading || filtered.length === 0}
        >
          Export CSV
        </Btn>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 22,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.4,
              }}
            >
              Timesheet
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                marginTop: 4,
              }}
            >
              {loading
                ? "Loading shifts…"
                : `${filtered.length} shift${
                    filtered.length === 1 ? "" : "s"
                  } · last ${days} days · hours computed from real check-in / check-out timestamps`}
            </div>
          </div>
          <SegTabs
            tabs={["Last 7d", "Last 30d", "Last 90d"]}
            active={`Last ${period}d`}
            onChange={(v) => setPeriod(v.replace(/[^0-9]/g, "") as Period)}
          />
        </div>

        {/* Toolbar */}
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${AC.line}`,
                background: "#fff",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.ink,
                cursor: "pointer",
                minWidth: 200,
              }}
            >
              <option value="all">All reps</option>
              {profiles
                .filter((p) => p.role === "rep")
                .sort((a, b) => displayName(a).localeCompare(displayName(b)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)} · {p.email}
                  </option>
                ))}
            </select>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink2,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={hideUnworked}
                onChange={(e) => setHideUnworked(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: AC.brand }}
              />
              Hide shifts that never checked in
            </label>
          </div>
        </Card>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <KpiBig
            label="Hours worked"
            value={loading ? "…" : kpis.totalHoursActual.toFixed(1)}
            sub={`vs ${kpis.totalHoursScheduled.toFixed(1)} scheduled`}
            tone="brand"
          />
          <KpiBig
            label="Completed shifts"
            value={loading ? "…" : String(kpis.completedShifts)}
            sub="of all visible rows"
            tone="ok"
          />
          <KpiBig
            label="Active reps"
            value={loading ? "…" : String(kpis.repsActive)}
            sub="checked in at least once"
          />
          <KpiBig
            label="Avg hours / shift"
            value={
              loading
                ? "…"
                : kpis.completedShifts === 0
                ? "—"
                : (kpis.totalHoursActual / kpis.completedShifts).toFixed(1)
            }
            sub="actual, on completed shifts"
          />
        </div>

        {/* Top reps by hours */}
        {!loading && topByHours.length > 0 && (
          <Card padding={20}>
            <SectionTitle>Hours worked by rep</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 4,
                marginBottom: 14,
              }}
            >
              Top {topByHours.length} reps by total actual hours in this period.
            </div>
            <BarChart
              rows={topByHours}
              valueLabel={(n) => `${n.toFixed(1)}h`}
            />
          </Card>
        )}

        {/* Table */}
        <Card padding={0}>
          <div style={tableHeader()}>
            <SortableHeader k="date" sort={sort} onChange={setSort}>Date</SortableHeader>
            <SortableHeader k="rep" sort={sort} onChange={setSort}>Rep</SortableHeader>
            <SortableHeader k="customer" sort={sort} onChange={setSort}>Customer</SortableHeader>
            <SortableHeader k="scheduledStart" sort={sort} onChange={setSort}>Scheduled</SortableHeader>
            <SortableHeader k="actualIn" sort={sort} onChange={setSort}>Check-in</SortableHeader>
            <SortableHeader k="actualOut" sort={sort} onChange={setSort}>Check-out</SortableHeader>
            <SortableHeader k="hours" sort={sort} onChange={setSort}>Hours</SortableHeader>
            <SortableHeader k="status" sort={sort} onChange={setSort}>Status</SortableHeader>
          </div>

          {loading ? (
            <Centered padding={28}>Loading…</Centered>
          ) : filtered.length === 0 ? (
            <Centered padding={36}>
              No shifts in this period match your filters.
            </Centered>
          ) : (
            filtered.map((r, i) => (
              <div
                key={r.shiftId}
                style={{
                  display: "grid",
                  gridTemplateColumns: TABLE_COLS,
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom:
                    i < filtered.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12,
                    fontWeight: 600,
                    color: AC.ink2,
                  }}
                >
                  {r.dateLabel}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <RepAvatar rep={{ initials: r.repInitials }} size={26} />
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: AC.ink,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.repName}
                  >
                    {r.repName}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: r.customerColor,
                      color: "#fff",
                      fontFamily: AC.font,
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {r.customerInitials}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.customerName}
                  >
                    {r.customerName}
                  </div>
                </div>
                <Mono>
                  {formatTime(r.scheduledStart, { compact: true })}–
                  {formatTime(r.scheduledEnd, { compact: true })}
                </Mono>
                <Mono tone={r.actualInIso ? "ink" : "muted"}>
                  {r.actualInIso ? formatClock(r.actualInIso) : "—"}
                </Mono>
                <Mono tone={r.actualOutIso ? "ink" : "muted"}>
                  {r.actualOutIso ? formatClock(r.actualOutIso) : "—"}
                </Mono>
                <Mono tone="bold">
                  {r.hoursActual !== null
                    ? `${r.hoursActual.toFixed(1)}h`
                    : "—"}
                </Mono>
                <StatusCell row={r} />
              </div>
            ))
          )}

          {/* Footer total row */}
          {!loading && filtered.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: TABLE_COLS,
                gap: 12,
                padding: "12px 16px",
                background: AC.bg,
                borderTop: `1px solid ${AC.line}`,
                fontFamily: AC.font,
                fontSize: 12,
                fontWeight: 700,
                color: AC.ink,
              }}
            >
              <div style={{ gridColumn: "1 / 7", color: AC.mute }}>
                Total ({filtered.length} shift{filtered.length === 1 ? "" : "s"})
              </div>
              <Mono tone="bold">{kpis.totalHoursActual.toFixed(1)}h</Mono>
              <div style={{ fontSize: 11, color: AC.mute, fontWeight: 500 }}>
                {kpis.totalHoursScheduled.toFixed(1)}h scheduled
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

const TABLE_COLS = "120px 1.2fr 1.2fr 130px 100px 100px 70px 110px";

function tableHeader(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: TABLE_COLS,
    gap: 12,
    alignItems: "center",
    padding: "10px 16px",
    background: AC.bg,
    borderBottom: `1px solid ${AC.line}`,
    fontFamily: AC.font,
    fontSize: 11,
    fontWeight: 600,
    color: AC.mute,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
}

function Mono({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "muted" | "bold";
}) {
  const c = tone === "muted" ? AC.mute : tone === "bold" ? AC.ink : AC.ink2;
  return (
    <div
      style={{
        fontFamily: AC.fontMono,
        fontSize: 12,
        fontWeight: tone === "bold" ? 700 : 500,
        color: c,
      }}
    >
      {children}
    </div>
  );
}

function StatusCell({ row }: { row: TimesheetRow }) {
  const map: Record<TimesheetRow["status"], { bg: string; fg: string; label: string }> = {
    complete: { bg: AC.okTint, fg: "#0F5A38", label: "Complete" },
    "in-progress": { bg: AC.brandTint, fg: AC.brandDeep, label: "In progress" },
    scheduled: { bg: AC.bg, fg: AC.mute, label: "Scheduled" },
    missed: { bg: AC.dangerTint, fg: "#9c1a3c", label: "Missed" },
    late: { bg: AC.warnTint, fg: "#7A560A", label: "Late" },
    other: { bg: AC.bg, fg: AC.mute, label: row.status },
  };
  const t = map[row.status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 99,
          background: t.bg,
          color: t.fg,
          fontFamily: AC.font,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {t.label}
      </span>
      {row.flags.map((f) => (
        <span
          key={f}
          title={f}
          style={{
            padding: "1px 6px",
            borderRadius: 4,
            background: AC.dangerTint,
            color: "#9c1a3c",
            fontFamily: AC.font,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          {f}
        </span>
      ))}
    </div>
  );
}

function Centered({ children, padding }: { children: React.ReactNode; padding: number }) {
  return (
    <div
      style={{
        padding,
        textAlign: "center",
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
      }}
    >
      {children}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function computeScheduledHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map((n) => parseInt(n, 10));
  const [eh, em] = end.split(":").map((n) => parseInt(n, 10));
  const mins = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, mins / 60);
}

function computeActualHours(
  inIso: string | null,
  outIso: string | null
): number | null {
  if (!inIso || !outIso) return null;
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round((ms / 3600000) * 10) / 10;
}

function deriveStatus(
  s: ShiftRow,
  actualOutIso: string | null
): TimesheetRow["status"] {
  if (s.state === "complete") return "complete";
  if (s.state === "in-progress" || s.state === "travelling" || s.state === "on-break")
    return "in-progress";
  if (s.state === "late") return "late";
  if (s.state === "scheduled") {
    // Past-dated scheduled with no check-in = missed.
    const today = localISO(new Date());
    if (s.shift_date < today && !s.check_in_at) return "missed";
    return "scheduled";
  }
  if (actualOutIso) return "complete";
  return "other";
}

function collectFlags(s: ShiftRow): string[] {
  const flags: string[] = [];
  // Late / off-site flags inferred from check_in_at vs scheduled start.
  if (s.check_in_at && s.start_time) {
    const [h, m] = s.start_time.split(":").map((n) => parseInt(n, 10));
    const [Y, M, D] = s.shift_date.split("-").map((n) => parseInt(n, 10));
    const start = new Date(Y, M - 1, D, h, m, 0, 0);
    const lateMins = (new Date(s.check_in_at).getTime() - start.getTime()) / 60000;
    if (lateMins > 10) flags.push("late");
  }
  return flags;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function buildCsv(rows: TimesheetRow[]): string {
  const headers = [
    "Date",
    "Rep",
    "Customer",
    "Scheduled start",
    "Scheduled end",
    "Check-in",
    "Check-out",
    "Hours actual",
    "Hours scheduled",
    "Status",
    "Flags",
  ];
  const escape = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.repName,
        r.customerName,
        r.scheduledStart,
        r.scheduledEnd,
        r.actualInIso ? new Date(r.actualInIso).toISOString() : "",
        r.actualOutIso ? new Date(r.actualOutIso).toISOString() : "",
        r.hoursActual === null ? "" : r.hoursActual.toFixed(2),
        r.hoursScheduled.toFixed(2),
        r.status,
        r.flags.join("|"),
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}
