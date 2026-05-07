"use client";

/**
 * /reports/rep-performance — leaderboard across every rep + manager who
 * worked at least one shift in the period. Compares current period to
 * the previous-equal-length period for a delta column on shifts.
 *
 * Visuals:
 *   - 4 KPIs: Active reps, Total shifts, Avg on-time %, Avg tasks done %
 *   - Bar chart: top 10 reps by shifts this period
 *   - Sortable table: every rep with shifts / completion / on-time /
 *     tasks-done / late-count + Δ column for shifts
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
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
import { localISO, isoDaysAgo, initialsFromNameOrEmail } from "@/lib/format";

type Period = "7" | "30" | "90";
type RepKey =
  | "name"
  | "shifts"
  | "completed"
  | "completionPct"
  | "onTimePct"
  | "tasksDonePct"
  | "lateCount";

interface RepStats {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  shifts: number;
  shiftsPrev: number;
  completed: number;
  completionPct: number;
  onTimePct: number;
  tasksDonePct: number;
  lateCount: number;
}

export default function RepPerformanceReportPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sort, setSort] = useState<SortState<RepKey>>({ key: "shifts", dir: "desc" });

  const days = parseInt(period, 10);

  useEffect(() => {
    let cancelled = false;
    const start = isoDaysAgo(days * 2 - 1); // current + previous in one fetch
    const end = localISO(new Date());
    Promise.all([listShiftsInRange(start, end), listProfiles()]).then(([rows, ps]) => {
      if (cancelled) return;
      setShifts(rows);
      setProfiles(ps);
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const today = useMemo(() => localISO(new Date()), []);
  const startCurrent = useMemo(() => isoDaysAgo(days - 1), [days]);
  const startPrev = useMemo(() => isoDaysAgo(days * 2 - 1), [days]);
  const endPrev = useMemo(() => isoDaysAgo(days), [days]);

  const repStats: RepStats[] = useMemo(() => {
    if (!shifts) return [];
    const cur = shifts.filter(
      (s) => s.shift_date >= startCurrent && s.shift_date <= today && s.rep_id
    );
    const prev = shifts.filter(
      (s) => s.shift_date >= startPrev && s.shift_date <= endPrev && s.rep_id
    );
    const byRepCur = new Map<string, ShiftRow[]>();
    for (const s of cur) {
      if (!byRepCur.has(s.rep_id!)) byRepCur.set(s.rep_id!, []);
      byRepCur.get(s.rep_id!)!.push(s);
    }
    const byRepPrev = new Map<string, ShiftRow[]>();
    for (const s of prev) {
      if (!byRepPrev.has(s.rep_id!)) byRepPrev.set(s.rep_id!, []);
      byRepPrev.get(s.rep_id!)!.push(s);
    }

    // Include any rep with shifts in EITHER period; profiles map provides
    // names, but a rep_id without a profile (deleted user) still appears.
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const repIds = new Set<string>([...byRepCur.keys(), ...byRepPrev.keys()]);

    const out: RepStats[] = [];
    for (const id of repIds) {
      const list = byRepCur.get(id) || [];
      const prevList = byRepPrev.get(id) || [];
      const completed = list.filter((s) => s.state === "complete").length;
      const completionPct = list.length === 0 ? 0 : Math.round((completed / list.length) * 100);
      const profile = profileById.get(id);
      out.push({
        id,
        name: profile ? displayName(profile) : "Deleted user",
        email: profile?.email || "",
        initials: profile
          ? initialsFromNameOrEmail(profile.name, profile.email)
          : "??",
        role: profile?.role || "rep",
        shifts: list.length,
        shiftsPrev: prevList.length,
        completed,
        completionPct,
        onTimePct: onTimePct(list),
        tasksDonePct: avgTaskCompletion(list),
        lateCount: list.filter((s) => s.state === "late").length,
      });
    }
    return out;
  }, [shifts, profiles, startCurrent, today, startPrev, endPrev]);

  const sortedRepStats = useMemo(() => {
    return [...repStats].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return compareBy(a, b, (r) => r.name, sort.dir);
        case "shifts":
          return compareBy(a, b, (r) => r.shifts, sort.dir);
        case "completed":
          return compareBy(a, b, (r) => r.completed, sort.dir);
        case "completionPct":
          return compareBy(a, b, (r) => r.completionPct, sort.dir);
        case "onTimePct":
          return compareBy(a, b, (r) => r.onTimePct, sort.dir);
        case "tasksDonePct":
          return compareBy(a, b, (r) => r.tasksDonePct, sort.dir);
        case "lateCount":
          return compareBy(a, b, (r) => r.lateCount, sort.dir);
      }
    });
  }, [repStats, sort]);

  const topByShifts = useMemo(
    () =>
      [...repStats]
        .sort((a, b) => b.shifts - a.shifts)
        .slice(0, 10)
        .map((r, i) => ({
          label: r.name,
          value: r.shifts,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          sub: `${r.completed}/${r.shifts} done`,
        })),
    [repStats]
  );

  const kpis = useMemo(() => {
    const activeReps = repStats.filter((r) => r.shifts > 0).length;
    const totalShifts = repStats.reduce((acc, r) => acc + r.shifts, 0);
    const avgOnTime =
      activeReps === 0
        ? 0
        : Math.round(
            repStats.reduce((acc, r) => acc + r.onTimePct, 0) /
              Math.max(1, activeReps)
          );
    const avgTasksDone =
      activeReps === 0
        ? 0
        : Math.round(
            repStats.reduce((acc, r) => acc + r.tasksDonePct, 0) /
              Math.max(1, activeReps)
          );
    return { activeReps, totalShifts, avgOnTime, avgTasksDone };
  }, [repStats]);

  const loading = shifts === null;

  return (
    <AdminShell breadcrumbs={["Home", "Reports", "Rep performance"]}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header + period selector */}
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
              Rep performance
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
                ? "Crunching shifts…"
                : `${kpis.activeReps} active rep${
                    kpis.activeReps === 1 ? "" : "s"
                  } · last ${days} days`}
            </div>
          </div>
          <SegTabs
            tabs={["Last 7d", "Last 30d", "Last 90d"]}
            active={`Last ${period}d`}
            onChange={(v) => setPeriod(v.replace(/[^0-9]/g, "") as Period)}
          />
        </div>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <KpiBig
            label="Active reps"
            value={loading ? "…" : String(kpis.activeReps)}
            sub="worked at least one shift"
          />
          <KpiBig
            label="Total shifts"
            value={loading ? "…" : String(kpis.totalShifts)}
            sub="assigned this period"
            tone="brand"
          />
          <KpiBig
            label="Avg on-time"
            value={loading ? "…" : `${kpis.avgOnTime}%`}
            sub="across all reps"
            tone={kpis.avgOnTime >= 80 ? "ok" : "warn"}
          />
          <KpiBig
            label="Avg tasks done"
            value={loading ? "…" : `${kpis.avgTasksDone}%`}
            sub="across all reps"
            tone={kpis.avgTasksDone >= 80 ? "ok" : "warn"}
          />
        </div>

        {/* Top 10 by shifts */}
        <Card padding={20}>
          <SectionTitle>Top reps by shifts worked</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            Volume only — see the full table below for completion / on-time
            quality.
          </div>
          <BarChart rows={topByShifts} />
        </Card>

        {/* Full leaderboard */}
        <Card padding={0}>
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${AC.line}`,
            }}
          >
            <SectionTitle>Leaderboard — all reps</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 4,
              }}
            >
              Click a column header to sort. Δ shows the change in shift count
              vs the previous {days}-day period.
            </div>
          </div>

          <div style={tableHeader()}>
            <SortableHeader k="name" sort={sort} onChange={setSort}>
              Rep
            </SortableHeader>
            <SortableHeader k="shifts" sort={sort} onChange={setSort}>
              Shifts
            </SortableHeader>
            <div style={{ fontWeight: 600, fontSize: 11, color: AC.mute }}>Δ vs prev</div>
            <SortableHeader k="completionPct" sort={sort} onChange={setSort}>
              Completion
            </SortableHeader>
            <SortableHeader k="onTimePct" sort={sort} onChange={setSort}>
              On-time
            </SortableHeader>
            <SortableHeader k="tasksDonePct" sort={sort} onChange={setSort}>
              Tasks done
            </SortableHeader>
            <SortableHeader k="lateCount" sort={sort} onChange={setSort}>
              Late
            </SortableHeader>
          </div>

          {loading ? (
            <Centered padding={28}>Loading…</Centered>
          ) : sortedRepStats.length === 0 ? (
            <Centered padding={36}>No reps have shifts in this period yet.</Centered>
          ) : (
            sortedRepStats.map((r, i) => (
              <Link
                key={r.id}
                href={`/reps/${r.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: TABLE_COLS,
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom:
                    i < sortedRepStats.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  background: "#fff",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <RepAvatar rep={{ initials: r.initials }} size={30} seed={r.id} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 13,
                        fontWeight: 600,
                        color: AC.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.name}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        color: AC.mute,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.email}
                    </div>
                  </div>
                </div>
                <NumberCell value={r.shifts} />
                <DeltaCell now={r.shifts} prev={r.shiftsPrev} />
                <PercentCell value={r.completionPct} />
                <PercentCell value={r.onTimePct} good={80} warn={60} />
                <PercentCell value={r.tasksDonePct} good={80} warn={60} />
                <NumberCell value={r.lateCount} tone={r.lateCount > 0 ? "warn" : "muted"} />
              </Link>
            ))
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

const TABLE_COLS = "1.6fr 80px 100px 110px 110px 110px 80px";

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

function NumberCell({
  value,
  tone = "default",
}: {
  value: number;
  tone?: "default" | "warn" | "muted";
}) {
  const c = tone === "warn" ? AC.warn : tone === "muted" ? AC.mute : AC.ink2;
  return (
    <div
      style={{
        fontFamily: AC.fontMono,
        fontSize: 12.5,
        fontWeight: 700,
        color: c,
      }}
    >
      {value}
    </div>
  );
}

function DeltaCell({ now, prev }: { now: number; prev: number }) {
  const d = now - prev;
  const tone = d > 0 ? AC.ok : d < 0 ? AC.danger : AC.mute;
  const text = d === 0 ? "—" : `${d > 0 ? "+" : ""}${d}`;
  return (
    <div
      style={{
        fontFamily: AC.fontMono,
        fontSize: 12,
        fontWeight: 700,
        color: tone,
      }}
    >
      {text}
    </div>
  );
}

function PercentCell({
  value,
  good,
  warn,
}: {
  value: number;
  good?: number;
  warn?: number;
}) {
  let color: string = AC.ink2;
  if (good !== undefined && warn !== undefined) {
    color = value >= good ? AC.ok : value >= warn ? AC.warn : AC.danger;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 12.5,
          fontWeight: 700,
          color,
          width: 38,
        }}
      >
        {value}%
      </div>
      <div style={{ flex: 1, height: 5, background: AC.bg, borderRadius: 99 }}>
        <div
          style={{
            width: `${Math.max(2, value)}%`,
            height: "100%",
            background: color,
            borderRadius: 99,
          }}
        />
      </div>
    </div>
  );
}

function Centered({
  children,
  padding,
}: {
  children: React.ReactNode;
  padding: number;
}) {
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

function onTimePct(rows: ShiftRow[]): number {
  const checkedIn = rows.filter((s) => s.check_in_at);
  if (checkedIn.length === 0) return 0;
  const onTime = checkedIn.filter((s) => {
    if (!s.check_in_at) return false;
    const [h, m] = s.start_time.split(":").map((n) => parseInt(n, 10));
    const [Y, M, D] = s.shift_date.split("-").map((n) => parseInt(n, 10));
    const start = new Date(Y, M - 1, D, h, m, 0, 0);
    return new Date(s.check_in_at).getTime() <= start.getTime();
  }).length;
  return Math.round((onTime / checkedIn.length) * 100);
}

function avgTaskCompletion(rows: ShiftRow[]): number {
  const withTasks = rows.filter((s) => s.tasks_total > 0);
  if (withTasks.length === 0) return 0;
  const sum = withTasks.reduce((acc, s) => acc + s.tasks_done / s.tasks_total, 0);
  return Math.round((sum / withTasks.length) * 100);
}
