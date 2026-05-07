"use client";

/**
 * /schedule/manage — admin space for "shift series" rather than
 * individual shifts.
 *
 * A series is the group of rows produced by a single /schedule/new
 * submission with recurrence or multi-customer / multi-rep
 * cartesian (everything sharing a series_id). One-off shifts have
 * no series_id and are managed via the calendar instead.
 *
 * Each row of this list shows: customer(s), rep(s), date range,
 * upcoming vs past count, plus actions:
 *   - View on calendar  → /schedule jumped to the series's first date
 *   - Cancel future     → deletes scheduled shifts from today forward
 *   - Cancel all        → deletes every scheduled shift in the series
 *
 * Running / complete shifts are never touched (audit integrity).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import {
  listShiftSeries,
  cancelShiftSeries,
  subscribeShifts,
  type ShiftSeriesSummary,
} from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { todayLocalISO } from "@/lib/format";
import type { Customer } from "@/lib/types";

export default function ManageShiftsPage() {
  const [series, setSeries] = useState<ShiftSeriesSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    const [s, cs, ps] = await Promise.all([
      listShiftSeries(),
      listCustomers(),
      listProfiles(),
    ]);
    setSeries(s);
    setCustomers(cs);
    const repMap: Record<string, Profile> = {};
    for (const p of ps) repMap[p.id] = p;
    setReps(repMap);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // Refetch whenever shifts change so a series we just cancelled
    // disappears immediately and a new series created via
    // /schedule/new shows up without a manual reload.
    const unsub = subscribeShifts(refresh);
    return () => unsub();
  }, []);

  const customerById = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return series;
    return series.filter((s) => {
      const customerNames = s.customerIds
        .map((id) => customerById.get(id)?.name || "")
        .join(" ")
        .toLowerCase();
      const repNames = s.repIds
        .filter((rid): rid is string => !!rid)
        .map((rid) => (reps[rid] ? displayName(reps[rid]).toLowerCase() : ""))
        .join(" ");
      return (
        customerNames.includes(q) ||
        repNames.includes(q) ||
        s.firstDate.includes(q) ||
        s.lastDate.includes(q)
      );
    });
  }, [series, search, customerById, reps]);

  const onCancelFuture = async (s: ShiftSeriesSummary) => {
    if (
      !confirm(
        `Cancel ${s.upcomingCount} upcoming shift${
          s.upcomingCount === 1 ? "" : "s"
        } in this series? Past shifts and any in progress are kept.`
      )
    ) {
      return;
    }
    setBusyId(s.series_id + "-future");
    const r = await cancelShiftSeries(s.series_id, { fromDate: todayLocalISO() });
    setBusyId(null);
    if (!r.ok) alert(`Couldn't cancel: ${r.error}`);
    // refresh fires via subscribeShifts realtime
  };

  const onCancelAll = async (s: ShiftSeriesSummary) => {
    if (
      !confirm(
        `Cancel all ${s.shiftCount} shifts in this series? Only scheduled (not yet started) shifts are deleted — running and complete ones are kept.`
      )
    ) {
      return;
    }
    setBusyId(s.series_id + "-all");
    const r = await cancelShiftSeries(s.series_id);
    setBusyId(null);
    if (!r.ok) alert(`Couldn't cancel: ${r.error}`);
  };

  return (
    <AdminShell
      breadcrumbs={["Home", "Schedule", "Manage shifts"]}
      actions={
        <Link href="/schedule" style={{ textDecoration: "none" }}>
          <Btn size="sm" icon="cal">
            Back to calendar
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
            Manage shifts
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
            {loading ? "…" : `${series.length} series`}
          </span>
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          Every group of shifts created together (recurring weekly,
          multi-customer, or multi-rep) shows up here as one row. Use
          this page to cancel a recurring set in one go instead of
          deleting each shift one-by-one on the calendar. Only the
          shifts that haven&apos;t started yet are touched — anything in
          progress or complete stays put.
        </div>

        {/* Search */}
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AGlyph name="search" size={14} color={AC.hint} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, rep, or date…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.ink,
              }}
            />
            {search && (
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
                <AGlyph name="x" size={13} color={AC.mute} />
              </button>
            )}
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
              }}
            >
              {filtered.length} of {series.length}
            </span>
          </div>
        </Card>

        {/* List */}
        <Card padding={0}>
          {loading ? (
            <Empty text="Loading series…" />
          ) : series.length === 0 ? (
            <Empty
              text="No shift series yet. Create one via Schedule → New shift with weekly recurrence or multiple customers/reps."
              cta={{ href: "/schedule/new", label: "+ New shift" }}
            />
          ) : filtered.length === 0 ? (
            <Empty text={`No series match "${search}".`} />
          ) : (
            <div>
              <SeriesHeader />
              {filtered.map((s) => (
                <SeriesRow
                  key={s.series_id}
                  series={s}
                  customerById={customerById}
                  reps={reps}
                  busyKey={busyId}
                  onCancelFuture={() => onCancelFuture(s)}
                  onCancelAll={() => onCancelAll(s)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function SeriesHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1.2fr 1.4fr 90px 90px 220px",
        gap: 14,
        padding: "10px 16px",
        background: AC.bg,
        borderBottom: `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 11,
        color: AC.mute,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      <div>Customers</div>
      <div>Reps</div>
      <div>Date range</div>
      <div>Time</div>
      <div>Shifts</div>
      <div></div>
    </div>
  );
}

function SeriesRow({
  series,
  customerById,
  reps,
  busyKey,
  onCancelFuture,
  onCancelAll,
}: {
  series: ShiftSeriesSummary;
  customerById: Map<string, Customer>;
  reps: Record<string, Profile>;
  busyKey: string | null;
  onCancelFuture: () => void;
  onCancelAll: () => void;
}) {
  const customerLabel =
    series.customerIds.length === 1
      ? customerById.get(series.customerIds[0])?.name || "1 customer"
      : `${series.customerIds.length} customers`;
  const repLabel = (() => {
    const named = series.repIds.filter((r): r is string => !!r);
    const unassigned = series.repIds.includes(null);
    if (named.length === 0) return "Unassigned";
    if (named.length === 1) {
      return reps[named[0]] ? displayName(reps[named[0]]) : "1 rep";
    }
    return `${named.length} reps${unassigned ? " + unassigned" : ""}`;
  })();
  const futureBusy = busyKey === series.series_id + "-future";
  const allBusy = busyKey === series.series_id + "-all";
  const noFuture = series.upcomingCount === 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1.2fr 1.4fr 90px 90px 220px",
        gap: 14,
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${AC.lineDim}`,
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.ink,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {series.customerIds.length === 1 ? (
          <CustomerSwatch
            color={customerById.get(series.customerIds[0])?.color || "#888"}
            initials={
              customerById.get(series.customerIds[0])?.initials || "?"
            }
          />
        ) : (
          <MultiSwatch />
        )}
        <span
          style={{
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {customerLabel}
        </span>
      </div>
      <div style={{ color: AC.ink2 }}>{repLabel}</div>
      <div style={{ color: AC.ink2 }}>
        {series.firstDate}
        {series.firstDate !== series.lastDate && ` → ${series.lastDate}`}
      </div>
      <div style={{ color: AC.ink2, fontFamily: AC.fontMono, fontSize: 11.5 }}>
        {series.startTime}–{series.endTime}
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>{series.shiftCount}</div>
        <div style={{ fontSize: 11, color: AC.mute, marginTop: 1 }}>
          {series.upcomingCount} upcoming
          {series.pastCount > 0 ? ` · ${series.pastCount} past` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Link
          href={`/schedule?seriesStart=${series.firstDate}`}
          style={{ textDecoration: "none" }}
        >
          <Btn size="sm">View</Btn>
        </Link>
        <Btn
          size="sm"
          kind="danger"
          onClick={onCancelFuture}
          disabled={futureBusy || allBusy || noFuture}
          title={
            noFuture
              ? "No upcoming shifts to cancel"
              : "Cancel scheduled shifts from today forward"
          }
        >
          {futureBusy ? "…" : "Cancel future"}
        </Btn>
        <Btn
          size="sm"
          kind="danger"
          onClick={onCancelAll}
          disabled={futureBusy || allBusy}
          title="Cancel every scheduled shift in the series"
        >
          {allBusy ? "…" : "All"}
        </Btn>
      </div>
    </div>
  );
}

function CustomerSwatch({
  color,
  initials,
}: {
  color: string;
  initials: string;
}) {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        background: color,
        color: "#fff",
        fontFamily: AC.font,
        fontSize: 10.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function MultiSwatch() {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        background: AC.bg,
        border: `1px dashed ${AC.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <AGlyph name="customer" size={12} color={AC.mute} />
    </div>
  );
}

function Empty({
  text,
  cta,
}: {
  text: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: "center",
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
      }}
    >
      <div>{text}</div>
      {cta && (
        <div style={{ marginTop: 12 }}>
          <Link href={cta.href} style={{ textDecoration: "none" }}>
            <Btn kind="primary" size="sm" icon="plus">
              {cta.label}
            </Btn>
          </Link>
        </div>
      )}
    </div>
  );
}
