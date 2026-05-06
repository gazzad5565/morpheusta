"use client";

/**
 * KpiStrip — top-of-page KPI cards on Live Ops.
 *
 * All values are derived from real data:
 *   - Reps active now    = distinct rep_id where state='in-progress' (today)
 *   - Reps total         = profiles where role='rep'
 *   - Shifts today       = total shifts for today
 *   - Completed          = shifts where state='complete'
 *   - On-time check-ins  = % of checked-in shifts where check_in_at <= start
 *   - Open exceptions    = shifts where state='late' (Phase 4 will add off-site)
 *   - Avg completion     = mean(tasks_done / tasks_total) across today's shifts
 *
 * Sparklines are real 8-day trends computed from shifts in
 * [today-7, today] — same data shape as the dashboard, aggregated by
 * shift_date. See computeSparks() for the per-card formulas.
 */

import { useEffect, useState } from "react";
import { AC } from "@/lib/tokens";
import {
  listShiftsInRange,
  subscribeShifts,
  type ShiftRow,
} from "@/lib/shifts-store";
import { listProfiles } from "@/lib/profiles-store";
import { todayLocalISO, isoDaysAgo } from "@/lib/format";

type Tone = "ok" | "warn" | "danger" | "info";

interface KpiItem {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  spark: number[];
}

interface KpiData {
  repsActive: number;
  repsTotal: number;
  shiftsToday: number;
  shiftsCompleted: number;
  onTimePct: number;
  exceptionsOpen: number;
  exceptionsLate: number;
  avgCompletion: number;
}

interface KpiSparks {
  repsActive: number[];
  shiftsCount: number[];
  onTimePct: number[];
  exceptions: number[];
  avgCompletion: number[];
}

/** Eight ISO dates ending today, oldest → newest. */
function lastEightDays(): string[] {
  const out: string[] = [];
  for (let i = 7; i >= 0; i--) out.push(isoDaysAgo(i));
  return out;
}

function computeKpis(shifts: ShiftRow[], totalReps: number): KpiData {
  const todayShifts = shifts;

  const activeRepIds = new Set(
    todayShifts.filter((s) => s.state === "in-progress" && s.rep_id).map((s) => s.rep_id)
  );

  const completed = todayShifts.filter((s) => s.state === "complete").length;

  // On-time: of shifts with a check_in_at, what % checked in at or before
  // their scheduled start_time.
  const checkedIn = todayShifts.filter((s) => s.check_in_at);
  const onTime = checkedIn.filter((s) => {
    if (!s.check_in_at) return false;
    // start_time is "HH:MM:SS" today; build a Date for today + that time.
    const [hh, mm] = s.start_time.split(":").map((n) => parseInt(n, 10));
    const startToday = new Date();
    startToday.setHours(hh, mm, 0, 0);
    return new Date(s.check_in_at).getTime() <= startToday.getTime();
  }).length;
  const onTimePct = checkedIn.length === 0 ? 0 : Math.round((onTime / checkedIn.length) * 100);

  const late = todayShifts.filter((s) => s.state === "late").length;

  // Avg completion = mean of tasks_done / tasks_total per shift (skip 0-task shifts)
  const withTasks = todayShifts.filter((s) => s.tasks_total > 0);
  const avgCompletion =
    withTasks.length === 0
      ? 0
      : Math.round(
          (withTasks.reduce((sum, s) => sum + s.tasks_done / s.tasks_total, 0) /
            withTasks.length) *
            100
        );

  return {
    repsActive: activeRepIds.size,
    repsTotal: totalReps,
    shiftsToday: todayShifts.length,
    shiftsCompleted: completed,
    onTimePct,
    exceptionsOpen: late,
    exceptionsLate: late,
    avgCompletion,
  };
}

const PLACEHOLDER_KPIS: KpiData = {
  repsActive: 0,
  repsTotal: 0,
  shiftsToday: 0,
  shiftsCompleted: 0,
  onTimePct: 0,
  exceptionsOpen: 0,
  exceptionsLate: 0,
  avgCompletion: 0,
};

const FLAT_SPARK = [0, 0, 0, 0, 0, 0, 0, 0];
const PLACEHOLDER_SPARKS: KpiSparks = {
  repsActive: FLAT_SPARK,
  shiftsCount: FLAT_SPARK,
  onTimePct: FLAT_SPARK,
  exceptions: FLAT_SPARK,
  avgCompletion: FLAT_SPARK,
};

/**
 * Build 8-day trend arrays for each KPI from a window of shifts. Each
 * array is oldest → newest; the rightmost dot in the sparkline is today.
 *
 * Why aggregate from `shifts` rather than `shift_events`? Daily KPIs
 * are about the day's *shifts* — completed, late, on-time — and that
 * lives natively on the shifts table. Events would force us to
 * reconstruct state per shift per day. We can revisit if we ever need
 * KPIs that don't have a shifts-table mirror.
 */
function computeSparks(allShifts: ShiftRow[]): KpiSparks {
  const days = lastEightDays();
  const byDay = new Map<string, ShiftRow[]>();
  for (const d of days) byDay.set(d, []);
  for (const s of allShifts) {
    const arr = byDay.get(s.shift_date);
    if (arr) arr.push(s);
  }

  const repsActive: number[] = [];
  const shiftsCount: number[] = [];
  const onTimePct: number[] = [];
  const exceptions: number[] = [];
  const avgCompletion: number[] = [];

  for (const d of days) {
    const dayShifts = byDay.get(d) || [];

    // distinct reps that worked at least one in-progress / complete shift that day
    const reps = new Set(
      dayShifts
        .filter((s) => s.rep_id && (s.state === "in-progress" || s.state === "complete"))
        .map((s) => s.rep_id)
    );
    repsActive.push(reps.size);

    shiftsCount.push(dayShifts.length);

    // on-time % within that day's checked-in shifts. We don't know the
    // local-tz "scheduled start" precisely from shift_date alone, but
    // start_time is local-clock. Build a Date from shift_date + start_time
    // and compare to check_in_at.
    const checkedIn = dayShifts.filter((s) => s.check_in_at);
    const onTime = checkedIn.filter((s) => {
      if (!s.check_in_at) return false;
      const [hh, mm] = s.start_time.split(":").map((n) => parseInt(n, 10));
      const [Y, M, D] = s.shift_date.split("-").map((n) => parseInt(n, 10));
      const startLocal = new Date(Y, M - 1, D, hh, mm, 0, 0);
      return new Date(s.check_in_at).getTime() <= startLocal.getTime();
    }).length;
    onTimePct.push(checkedIn.length === 0 ? 0 : Math.round((onTime / checkedIn.length) * 100));

    exceptions.push(dayShifts.filter((s) => s.state === "late").length);

    const withTasks = dayShifts.filter((s) => s.tasks_total > 0);
    avgCompletion.push(
      withTasks.length === 0
        ? 0
        : Math.round(
            (withTasks.reduce((sum, s) => sum + s.tasks_done / s.tasks_total, 0) /
              withTasks.length) *
              100
          )
    );
  }

  return { repsActive, shiftsCount, onTimePct, exceptions, avgCompletion };
}

export function KpiStrip() {
  const [k, setK] = useState<KpiData>(PLACEHOLDER_KPIS);
  const [sparks, setSparks] = useState<KpiSparks>(PLACEHOLDER_SPARKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const today = todayLocalISO();
      const start = isoDaysAgo(7);
      const [windowShifts, reps] = await Promise.all([
        listShiftsInRange(start, today),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      const todayShifts = windowShifts.filter((s) => s.shift_date === today);
      setK(computeKpis(todayShifts, reps.length));
      setSparks(computeSparks(windowShifts));
      setLoading(false);
    };
    load();
    // Recompute on every shifts change so the KPIs reflect reality live.
    const unsub = subscribeShifts(load);
    // Also refetch on tab-becomes-visible so KPIs flip to "today" if
    // the admin left the dashboard open across midnight.
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const items: KpiItem[] = [
    {
      label: "Reps active now",
      value: loading ? "…" : `${k.repsActive}`,
      sub: `of ${k.repsTotal} on roster`,
      tone: "ok",
      spark: sparks.repsActive,
    },
    {
      label: "Shifts today",
      value: loading ? "…" : `${k.shiftsToday}`,
      sub: `${k.shiftsCompleted} completed`,
      tone: "info",
      spark: sparks.shiftsCount,
    },
    {
      label: "On-time check-ins",
      value: loading ? "…" : `${k.onTimePct}%`,
      sub: "of all checked-in shifts",
      tone: k.onTimePct >= 80 ? "ok" : k.onTimePct >= 60 ? "warn" : "danger",
      spark: sparks.onTimePct,
    },
    {
      label: "Open exceptions",
      value: loading ? "…" : `${k.exceptionsOpen}`,
      sub: k.exceptionsOpen === 0 ? "all clear" : `${k.exceptionsLate} late`,
      tone: k.exceptionsOpen === 0 ? "ok" : "warn",
      spark: sparks.exceptions,
    },
    {
      label: "Avg shift completion",
      value: loading ? "…" : `${k.avgCompletion}%`,
      sub: "tasks done today",
      tone: k.avgCompletion >= 80 ? "ok" : "warn",
      spark: sparks.avgCompletion,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {items.map((it, i) => (
        <KpiCard key={i} {...it} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub, tone, spark }: KpiItem) {
  const toneColor: Record<Tone, string> = {
    ok: AC.ok,
    warn: AC.warn,
    danger: AC.danger,
    info: AC.brand,
  };
  const c = toneColor[tone];
  // Guard the all-zero case (fresh DB, empty range) so the divisor below
  // doesn't NaN and the line still draws as a flat baseline.
  const max = Math.max(1, ...spark);

  return (
    <div
      style={{
        background: AC.card,
        border: `1px solid ${AC.line}`,
        borderRadius: AC.radiusCard,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 102,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 28,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.8,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            fontWeight: 500,
            letterSpacing: -0.1,
          }}
        >
          {sub}
        </div>
        <svg width="60" height="22" viewBox="0 0 60 22">
          {spark.map((v, i) => {
            const x = i * (60 / (spark.length - 1));
            const y = 22 - (v / max) * 18 - 2;
            const next = spark[i + 1];
            if (next === undefined) return null;
            const x2 = (i + 1) * (60 / (spark.length - 1));
            const y2 = 22 - (next / max) * 18 - 2;
            return (
              <line
                key={i}
                x1={x}
                y1={y}
                x2={x2}
                y2={y2}
                stroke={c}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
          <circle
            cx={60}
            cy={22 - (spark[spark.length - 1] / max) * 18 - 2}
            r="2.2"
            fill={c}
          />
        </svg>
      </div>
    </div>
  );
}
