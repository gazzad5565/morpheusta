"use client";

/**
 * /reports/operations — system-wide operations dashboard.
 *
 * Pulls every shift in [today-N, today] in one query and computes
 * everything client-side. Period-over-period: compares the current
 * window to the same length window immediately preceding it (so a
 * 30-day view shows "current 30 days vs previous 30 days").
 *
 * Visuals:
 *   - 4 big KPIs with deltas (Shifts completed, On-time %, Tasks done %,
 *     Open exceptions)
 *   - Line chart: daily shifts (scheduled vs completed)
 *   - Line chart: daily on-time check-in rate
 *   - Donut: state breakdown across the period
 *   - Bar chart: top customers by shift count
 */

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Card, SectionTitle } from "@/components/ui/Card";
import { SegTabs } from "@/components/ui/SegTabs";
import { AC } from "@/lib/tokens";
import {
  KpiBig,
  LineChart,
  BarChart,
  DonutChart,
  CHART_PALETTE,
  type LineSeries,
} from "@/components/ui/charts";
import { listShiftsInRange, type ShiftRow } from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";
import { localISO, isoDaysAgo } from "@/lib/format";

type Period = "7" | "30" | "90";
const PERIODS: Period[] = ["7", "30", "90"];

export default function OperationsReportPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const days = parseInt(period, 10);

  // Fetch the full window we need: current period + previous period
  // (for delta comparison) in one round-trip.
  useEffect(() => {
    let cancelled = false;
    const start = isoDaysAgo(days * 2 - 1); // covers prev + current
    const end = localISO(new Date());
    Promise.all([listShiftsInRange(start, end), listCustomers()]).then(
      ([rows, cs]) => {
        if (cancelled) return;
        setShifts(rows);
        setCustomers(cs);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Bucket shifts into current vs previous period.
  const today = useMemo(() => localISO(new Date()), []);
  const startOfCurrent = useMemo(() => isoDaysAgo(days - 1), [days]);
  const startOfPrev = useMemo(() => isoDaysAgo(days * 2 - 1), [days]);
  const endOfPrev = useMemo(() => isoDaysAgo(days), [days]);

  const { current, previous, dayLabels, allDays } = useMemo(() => {
    const all = shifts || [];
    const cur = all.filter((s) => s.shift_date >= startOfCurrent && s.shift_date <= today);
    const prev = all.filter(
      (s) => s.shift_date >= startOfPrev && s.shift_date <= endOfPrev
    );
    const allDays: string[] = [];
    for (let i = days - 1; i >= 0; i--) allDays.push(isoDaysAgo(i));
    const labels = allDays.map((iso) => {
      const d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });
    return { current: cur, previous: prev, dayLabels: labels, allDays };
  }, [shifts, days, startOfCurrent, today, startOfPrev, endOfPrev]);

  // ─── KPIs (current period values + deltas) ─────────────────────────────
  const kpis = useMemo(() => {
    const completed = current.filter((s) => s.state === "complete").length;
    const completedPrev = previous.filter((s) => s.state === "complete").length;

    const onTime = onTimePct(current);
    const onTimePrev = onTimePct(previous);

    const tasksDone = avgTaskCompletion(current);
    const tasksDonePrev = avgTaskCompletion(previous);

    const exceptions = current.filter(
      (s) => s.state === "late"
    ).length;
    const exceptionsPrev = previous.filter((s) => s.state === "late").length;

    return {
      completed,
      completedDelta: deltaCount(completed, completedPrev),
      onTime,
      onTimeDelta: deltaPts(onTime, onTimePrev),
      tasksDone,
      tasksDoneDelta: deltaPts(tasksDone, tasksDonePrev),
      exceptions,
      exceptionsDelta: deltaCount(exceptions, exceptionsPrev),
    };
  }, [current, previous]);

  // ─── Daily timeseries ──────────────────────────────────────────────────
  const dailyShifts = useMemo<LineSeries[]>(() => {
    const scheduledByDay = new Map<string, number>();
    const completedByDay = new Map<string, number>();
    for (const s of current) {
      scheduledByDay.set(s.shift_date, (scheduledByDay.get(s.shift_date) || 0) + 1);
      if (s.state === "complete") {
        completedByDay.set(s.shift_date, (completedByDay.get(s.shift_date) || 0) + 1);
      }
    }
    return [
      {
        name: "Scheduled",
        color: AC.brand,
        values: allDays.map((d) => scheduledByDay.get(d) || 0),
      },
      {
        name: "Completed",
        color: AC.ok,
        values: allDays.map((d) => completedByDay.get(d) || 0),
      },
    ];
  }, [current, allDays]);

  const dailyOnTime = useMemo<LineSeries[]>(() => {
    const byDay = new Map<string, ShiftRow[]>();
    for (const s of current) {
      if (!byDay.has(s.shift_date)) byDay.set(s.shift_date, []);
      byDay.get(s.shift_date)!.push(s);
    }
    return [
      {
        name: "On-time %",
        color: AC.brandDeep,
        values: allDays.map((d) => onTimePct(byDay.get(d) || [])),
      },
    ];
  }, [current, allDays]);

  // ─── State donut ───────────────────────────────────────────────────────
  const stateRows = useMemo(() => {
    const buckets: Record<string, number> = {
      Complete: 0,
      "In progress": 0,
      Scheduled: 0,
      Late: 0,
      Other: 0,
    };
    for (const s of current) {
      const k =
        s.state === "complete"
          ? "Complete"
          : s.state === "in-progress"
          ? "In progress"
          : s.state === "scheduled"
          ? "Scheduled"
          : s.state === "late"
          ? "Late"
          : "Other";
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const colorMap: Record<string, string> = {
      Complete: AC.ok,
      "In progress": AC.brand,
      Scheduled: AC.mute,
      Late: AC.danger,
      Other: AC.faint,
    };
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value, color: colorMap[label] }));
  }, [current]);

  // ─── Top customers by shift count ──────────────────────────────────────
  const topCustomers = useMemo(() => {
    const byCustomer = new Map<string, number>();
    for (const s of current) {
      byCustomer.set(s.customer_id, (byCustomer.get(s.customer_id) || 0) + 1);
    }
    const customerById = new Map(customers.map((c) => [c.id, c]));
    return Array.from(byCustomer.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count], i) => {
        const c = customerById.get(id);
        return {
          label: c?.name || "Unknown customer",
          value: count,
          color: c?.color || CHART_PALETTE[i % CHART_PALETTE.length],
          sub: `${count === 1 ? "shift" : "shifts"}`,
        };
      });
  }, [current, customers]);

  const loading = shifts === null;

  return (
    <AdminShell breadcrumbs={["Home", "Reports", "Operations"]}>
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
              Operations overview
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
                : `Last ${days} days · vs previous ${days} days`}
            </div>
          </div>
          <SegTabs
            tabs={PERIODS.map((p) => `Last ${p}d`)}
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
            label="Shifts completed"
            value={loading ? "…" : String(kpis.completed)}
            sub={`out of ${current.length} this period`}
            delta={loading ? null : kpis.completedDelta}
            tone="ok"
          />
          <KpiBig
            label="On-time check-ins"
            value={loading ? "…" : `${kpis.onTime}%`}
            sub="of all checked-in shifts"
            delta={loading ? null : kpis.onTimeDelta}
            tone={kpis.onTime >= 80 ? "ok" : kpis.onTime >= 60 ? "warn" : "danger"}
          />
          <KpiBig
            label="Avg tasks done"
            value={loading ? "…" : `${kpis.tasksDone}%`}
            sub="of assigned tasks"
            delta={loading ? null : kpis.tasksDoneDelta}
            tone={kpis.tasksDone >= 80 ? "ok" : "warn"}
          />
          <KpiBig
            label="Exceptions"
            value={loading ? "…" : String(kpis.exceptions)}
            sub="late-state shifts"
            delta={loading ? null : kpis.exceptionsDelta}
            tone={kpis.exceptions === 0 ? "ok" : "warn"}
          />
        </div>

        {/* Daily shifts */}
        <Card padding={20}>
          <SectionTitle>Daily shifts — scheduled vs completed</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            Each day's shift volume side-by-side with how many actually
            completed. The closer the green line tracks the brand line,
            the better.
          </div>
          <LineChart
            labels={dayLabels}
            series={dailyShifts}
            height={220}
          />
        </Card>

        {/* On-time + state breakdown */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 14,
          }}
        >
          <Card padding={20}>
            <SectionTitle>On-time check-in rate</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 4,
                marginBottom: 14,
              }}
            >
              % of checked-in shifts where the rep arrived at or before
              the scheduled start.
            </div>
            <LineChart
              labels={dayLabels}
              series={dailyOnTime}
              height={220}
              yMaxOverride={100}
              yFormat={(v) => `${Math.round(v)}%`}
            />
          </Card>

          <Card padding={20}>
            <SectionTitle>Shift states — this period</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 4,
                marginBottom: 14,
              }}
            >
              Breakdown of every shift in the window by current state.
            </div>
            <DonutChart
              rows={stateRows}
              centerLabel={String(current.length)}
              centerSub="shifts"
            />
          </Card>
        </div>

        {/* Top customers */}
        <Card padding={20}>
          <SectionTitle>Top customers by shift volume</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            Where the team's time is going. The bar's colour matches the
            customer's brand swatch.
          </div>
          <BarChart rows={topCustomers} />
        </Card>
      </div>
    </AdminShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Percent of checked-in shifts that arrived at or before start_time. */
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

/** Mean of (tasks_done / tasks_total) across rows that have tasks. */
function avgTaskCompletion(rows: ShiftRow[]): number {
  const withTasks = rows.filter((s) => s.tasks_total > 0);
  if (withTasks.length === 0) return 0;
  const sum = withTasks.reduce((acc, s) => acc + s.tasks_done / s.tasks_total, 0);
  return Math.round((sum / withTasks.length) * 100);
}

/** Format a count delta like "+12" / "-3" / "0". */
function deltaCount(now: number, prev: number): string {
  const d = now - prev;
  if (d === 0) return "0";
  return `${d > 0 ? "+" : ""}${d}`;
}

/** Format a percentage-points delta like "+4 pts" / "-2 pts". */
function deltaPts(now: number, prev: number): string {
  const d = now - prev;
  if (d === 0) return "0 pts";
  return `${d > 0 ? "+" : ""}${d} pts`;
}
