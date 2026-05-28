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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { RequireCapability } from "@/components/ui/RequireCapability";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { ListCount } from "@/components/ui/ListCount";
import { AGlyph } from "@/components/ui/AGlyph";
import { Combobox } from "@/components/ui/Combobox";
import { TimeCombobox } from "@/components/ui/TimeCombobox";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { AC } from "@/lib/tokens";
import {
  listShiftSeries,
  cancelShiftSeries,
  updateShiftSeries,
  listStandaloneShifts,
  bulkDeleteShifts,
  subscribeShifts,
  type ShiftSeriesSummary,
  type OneOffShiftRow,
} from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { todayLocalISO, initialsFromNameOrEmail } from "@/lib/format";
import { RepAvatar, CustomerSwatch } from "@/components/ui/Avatars";
import type { Customer } from "@/lib/types";

export default function ManageShiftsPage() {
  const [series, setSeries] = useState<ShiftSeriesSummary[]>([]);
  // Pre-`series_id` shifts + any one-off shift created with no
  // recurrence. They're invisible on the series list, so without
  // this list the manager couldn't bulk-clean them up.
  const [standalone, setStandalone] = useState<OneOffShiftRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Series being edited via the Edit-future modal. Null = closed.
  const [editTarget, setEditTarget] = useState<ShiftSeriesSummary | null>(null);

  const refresh = async () => {
    const [s, st, cs, ps] = await Promise.all([
      listShiftSeries(),
      listStandaloneShifts({ upcomingOnly: true }),
      listCustomers(),
      listProfiles(),
    ]);
    setSeries(s);
    setStandalone(st);
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

  const onDeleteStandalone = async (s: OneOffShiftRow) => {
    if (
      !confirm(
        `Delete this shift on ${s.shift_date} (${s.start_time}–${s.end_time}) at ${
          s.customer?.name || "this customer"
        }?`
      )
    ) {
      return;
    }
    setBusyId(`oneoff-${s.id}`);
    const r = await bulkDeleteShifts([s.id]);
    setBusyId(null);
    if (!r.ok) alert(`Couldn't delete: ${r.error}`);
  };

  const onDeleteAllStandalone = async () => {
    if (standalone.length === 0) return;
    if (
      !confirm(
        `Delete all ${standalone.length} standalone upcoming shifts?\n\nOnly state='scheduled' rows are touched. Running and complete shifts are kept. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId("standalone-all");
    const r = await bulkDeleteShifts(standalone.map((s) => s.id));
    setBusyId(null);
    if (!r.ok) alert(`Couldn't delete: ${r.error}`);
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
      <RequireCapability cap="canScheduleShifts" action="manage shifts">
      {loading && <LoadingBar />}
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
          </div>
        </Card>

        {/* Count subtitle — DESIGN.md §8. Replaces the old inline
            "{filtered.length} of {series.length}" so this list matches
            /customers, /reps, /tasks, /library, /past-shifts. */}
        <ListCount visible={filtered.length} total={series.length} noun="series" pluralNoun="series" />

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
                  onEdit={() => setEditTarget(s)}
                  onCancelFuture={() => onCancelFuture(s)}
                  onCancelAll={() => onCancelAll(s)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Standalone (non-series) upcoming shifts. Pre-`series_id`
            shifts and any one-off /schedule/new submission with no
            recurrence end up here — invisible on the series list
            above, so without this section the manager has no way to
            see-or-delete them in bulk. */}
        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.line}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <SectionTitle>Standalone shifts</SectionTitle>
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
              {standalone.length} upcoming
            </span>
            <div style={{ flex: 1 }} />
            {standalone.length > 0 && (
              <Btn
                size="sm"
                kind="danger"
                onClick={onDeleteAllStandalone}
                disabled={busyId === "standalone-all"}
              >
                {busyId === "standalone-all"
                  ? "Deleting…"
                  : `Delete all ${standalone.length}`}
              </Btn>
            )}
          </div>
          {standalone.length === 0 ? (
            <Empty
              text={
                loading
                  ? "Loading…"
                  : "No standalone upcoming shifts. One-offs from /schedule/new with no recurrence (and any pre-series legacy rows) would land here."
              }
            />
          ) : (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1.4fr 1fr 100px 90px 110px",
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
                <div>Customer</div>
                <div>Rep</div>
                <div>Date</div>
                <div>Time</div>
                <div>State</div>
                <div></div>
              </div>
              {standalone.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1.4fr 1fr 100px 90px 110px",
                    gap: 14,
                    alignItems: "center",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${AC.lineDim}`,
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.ink,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {s.customer ? (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: s.customer.color,
                          color: "#fff",
                          fontFamily: AC.font,
                          fontSize: 9.5,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {s.customer.initials}
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: AC.bg,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.customer?.name || "—"}
                    </span>
                  </div>
                  <div style={{ color: AC.ink2 }}>
                    {s.rep_id ? reps[s.rep_id] && displayName(reps[s.rep_id]) : "Unassigned"}
                  </div>
                  <div style={{ color: AC.ink2, fontFamily: AC.fontMono, fontSize: 11.5 }}>
                    {s.shift_date}
                  </div>
                  <div style={{ color: AC.ink2, fontFamily: AC.fontMono, fontSize: 11.5 }}>
                    {s.start_time}–{s.end_time}
                  </div>
                  <div>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 99,
                        background: AC.bg,
                        color: AC.mute,
                        fontFamily: AC.font,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                      }}
                    >
                      {s.state}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn
                      size="sm"
                      kind="danger"
                      onClick={() => onDeleteStandalone(s)}
                      disabled={busyId === `oneoff-${s.id}`}
                    >
                      {busyId === `oneoff-${s.id}` ? "…" : "Delete"}
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* "Reset upcoming schedule" used to live here — a nuclear
            wipe of every still-scheduled shift from today forward.
            Removed because it duplicates what the per-series ⋮ menu
            (Cancel entire series) + the Standalone shifts "Delete all
            N" already do, together. Managers preferred the deliberate
            per-row path and the nuclear button felt risky on a page
            they already use frequently. */}
      </div>

      {editTarget && (
        <EditFutureModal
          series={editTarget}
          customers={customers}
          reps={Object.values(reps)}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            // realtime sub on shifts will refetch the list automatically
            setEditTarget(null);
          }}
        />
      )}
      </RequireCapability>
    </AdminShell>
  );
}

// Column template shared between SeriesHeader and SeriesRow so the
// header always lines up with the rows below it. The action column
// is sized to fit [View] [Edit future] [⋮] on a single line without
// wrapping — old design crammed in two extra destructive buttons that
// fell to a second row and made the page look broken.
// Now includes a Cadence column so the manager can see at a glance
// which series is "Weekdays" / "Mon · Wed · Fri" / "One-off" — the
// most-requested missing context on this page. Action column trimmed
// to keep [View] [Edit future] [⋮] on one line.
// Column widths tuned May 14 — the Shifts column at 78px broke
// "6 upcoming · 1 past" into three ugly lines on a typical row.
// Bumped to 150px so the count + subtitle fit on one line each.
// Time bumped from 80→105 so "14:00–17:00" doesn't squeeze the
// font down. Actions stays at 200 (fits [View] [Edit future] [⋯]
// without wrapping on standard density).
const SERIES_GRID = "1.4fr 1fr 1.1fr 1.1fr 105px 150px 200px";

function SeriesHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: SERIES_GRID,
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
      <div>Cadence</div>
      <div>Date range</div>
      <div>Time</div>
      <div>Shifts</div>
      <div style={{ textAlign: "right" }}>Actions</div>
    </div>
  );
}

function SeriesRow({
  series,
  customerById,
  reps,
  busyKey,
  onEdit,
  onCancelFuture,
  onCancelAll,
}: {
  series: ShiftSeriesSummary;
  customerById: Map<string, Customer>;
  reps: Record<string, Profile>;
  busyKey: string | null;
  onEdit: () => void;
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
        gridTemplateColumns: SERIES_GRID,
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
            customer={
              customerById.get(series.customerIds[0]) ?? {
                color: "#888",
                initials: "?",
              }
            }
            size={26}
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
      {/* Cadence pill — drawn from series.cadenceLabel. The visual
          weight reads as "this is a recurring set" at a glance:
          one-offs get a calm grey pill, recurring patterns get the
          brand tint. Hover reveals the full weekday list for tight
          mixed patterns like "Mon · Wed · Fri". */}
      <div>
        <span
          title={
            series.weekdays.length > 0
              ? `Occurs on: ${series.cadenceLabel}`
              : undefined
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 99,
            background:
              series.cadenceLabel === "One-off" ? AC.bg : AC.brandSoft,
            color:
              series.cadenceLabel === "One-off"
                ? AC.mute
                : AC.brandInk,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {series.cadenceLabel}
        </span>
      </div>
      <div style={{ color: AC.ink2 }}>
        {series.firstDate}
        {series.firstDate !== series.lastDate && ` → ${series.lastDate}`}
      </div>
      <div style={{ color: AC.ink2, fontFamily: AC.fontMono, fontSize: 11.5 }}>
        {series.startTime}–{series.endTime}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, lineHeight: 1.1 }}>
          {series.shiftCount}
        </div>
        <div
          style={{
            fontSize: 11,
            color: AC.mute,
            marginTop: 2,
            // Single line — was wrapping mid-phrase ("6 upcoming · 1"
            // / "past") at the previous narrow column width. We
            // widened the column AND made the subtitle nowrap so
            // even unusually long counts ("12 upcoming · 4 past")
            // stay on one row.
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.25,
          }}
          title={`${series.upcomingCount} upcoming${
            series.pastCount > 0 ? ` · ${series.pastCount} past` : ""
          }`}
        >
          {series.upcomingCount} upcoming
          {series.pastCount > 0 ? ` · ${series.pastCount} past` : ""}
        </div>
      </div>
      {/* Three primary affordances — View (navigate), Edit future
          (the most common edit), and a ⋮ overflow holding the two
          destructive Cancel actions. Eliminates the old layout's
          two bare red buttons (with a confusingly-labelled "All")
          competing for attention on every row. */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
        {/* View jumps to the calendar pre-filtered to the series:
              - date → calendar opens on the week containing the
                first upcoming (or earliest) shift
              - customer → applied when the series is single-customer
              - rep → applied when the series is single-rep (named
                or "__unassigned__")
            Multi-customer / multi-rep series leave the filter on
            "All" since locking down to one wouldn't match all
            their shifts. */}
        <Link
          href={`/schedule?${new URLSearchParams({
            date: series.firstDate,
            ...(series.customerIds.length === 1
              ? { customer: series.customerIds[0] }
              : {}),
            ...(series.repIds.length === 1
              ? {
                  rep:
                    series.repIds[0] === null
                      ? "__unassigned__"
                      : series.repIds[0],
                }
              : {}),
          }).toString()}`}
          style={{ textDecoration: "none" }}
        >
          <Btn size="sm" icon="eye" title="Open this series on the calendar">
            View
          </Btn>
        </Link>
        <Btn
          size="sm"
          kind="primary"
          icon="edit"
          onClick={onEdit}
          disabled={futureBusy || allBusy || noFuture}
          title={
            noFuture
              ? "No upcoming shifts to edit"
              : "Change time / customer / rep across future shifts in this series"
          }
        >
          Edit future
        </Btn>
        <RowActionMenu
          busy={futureBusy || allBusy}
          futureBusy={futureBusy}
          allBusy={allBusy}
          upcomingCount={series.upcomingCount}
          totalCount={series.shiftCount}
          onCancelFuture={onCancelFuture}
          onCancelAll={onCancelAll}
        />
      </div>
    </div>
  );
}

/**
 * Compact overflow menu for the destructive series actions. Sits
 * behind a ⋮ button so the row stays calm-by-default; opens a small
 * popover with the two cancel options spelled out in full ("Cancel
 * upcoming N shifts" / "Cancel entire series — N shifts"). No more
 * one-word "All" button that left managers guessing what it would
 * actually do.
 *
 * Closes on: outside click, escape, or after a menu item runs.
 */
function RowActionMenu({
  busy,
  futureBusy,
  allBusy,
  upcomingCount,
  totalCount,
  onCancelFuture,
  onCancelAll,
}: {
  busy: boolean;
  futureBusy: boolean;
  allBusy: boolean;
  upcomingCount: number;
  totalCount: number;
  onCancelFuture: () => void;
  onCancelAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const noFuture = upcomingCount === 0;
  const noShifts = totalCount === 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Btn
        size="sm"
        icon="more"
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        style={{ padding: "5px 8px" }}
      >
        {busy ? "…" : ""}
      </Btn>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 240,
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(10,15,30,.16)",
            zIndex: 30,
            padding: 4,
            fontFamily: AC.font,
          }}
        >
          <MenuItem
            danger
            disabled={noFuture || futureBusy || allBusy}
            onClick={() => {
              setOpen(false);
              onCancelFuture();
            }}
            label={
              futureBusy
                ? "Cancelling upcoming shifts…"
                : noFuture
                ? "No upcoming shifts to cancel"
                : `Cancel upcoming ${upcomingCount} shift${upcomingCount === 1 ? "" : "s"}`
            }
            sublabel="From today onward · running and complete shifts kept"
          />
          <div style={{ height: 1, background: AC.lineDim, margin: "4px 6px" }} />
          <MenuItem
            danger
            disabled={noShifts || futureBusy || allBusy}
            onClick={() => {
              setOpen(false);
              onCancelAll();
            }}
            label={
              allBusy
                ? "Cancelling entire series…"
                : `Cancel entire series · ${totalCount} shift${totalCount === 1 ? "" : "s"}`
            }
            sublabel="Only state='scheduled' rows are deleted · audit trail kept"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  sublabel,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  sublabel?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: "8px 10px",
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        color: danger ? AC.danger : AC.ink,
        fontFamily: AC.font,
        display: "block",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = AC.bg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>
        {label}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 2,
            fontWeight: 400,
            lineHeight: 1.4,
          }}
        >
          {sublabel}
        </div>
      )}
    </button>
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

/**
 * Edit-future modal — change customer, rep, start time, and/or end
 * time across every still-scheduled shift in the series, from today
 * onward. Running and complete shifts in the series are never
 * touched (audit integrity, mirrors the cancel rules).
 *
 * Designed to be conservative: each field starts blank-but-prefilled
 * with the series's current value, and the manager has to actually
 * change something for Save to fire (no-ops are silently dropped).
 */
function EditFutureModal({
  series,
  customers,
  reps,
  onClose,
  onSaved,
}: {
  series: ShiftSeriesSummary;
  customers: Customer[];
  reps: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Single-customer / single-rep series prefill the dropdowns
  // exactly. Multi- series start the dropdowns blank with a
  // "(unchanged)" placeholder so the manager opts in to a flip.
  const initialCustomer =
    series.customerIds.length === 1 ? series.customerIds[0] : "";
  const initialRep =
    series.repIds.length === 1
      ? series.repIds[0] === null
        ? "__unassigned__"
        : series.repIds[0]
      : "";

  const [customerId, setCustomerId] = useState<string>(initialCustomer);
  const [repId, setRepId] = useState<string>(initialRep ?? "");
  const [startTime, setStartTime] = useState<string>(series.startTime || "");
  const [endTime, setEndTime] = useState<string>(series.endTime || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const onSave = async () => {
    setError(null);
    setSavedNote(null);
    if (startTime && endTime && startTime >= endTime) {
      setError("End time must be after start time.");
      return;
    }

    // Build a patch that ONLY contains fields the user explicitly
    // changed. Treat blank/initial as "leave alone" — no-ops can't
    // accidentally null fields out.
    const patch: Parameters<typeof updateShiftSeries>[1] = {};
    if (customerId && customerId !== initialCustomer) {
      patch.customer_id = customerId;
    }
    if (repId !== "" && repId !== (initialRep ?? "")) {
      patch.rep_id = repId === "__unassigned__" ? null : repId;
    }
    if (startTime && startTime !== series.startTime) {
      patch.start_time = startTime;
    }
    if (endTime && endTime !== series.endTime) {
      patch.end_time = endTime;
    }
    if (Object.keys(patch).length === 0) {
      setError("Nothing to update — change a field first.");
      return;
    }

    setBusy(true);
    const r = await updateShiftSeries(series.series_id, patch, {
      fromDate: todayLocalISO(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    setSavedNote(`Updated ${r.updated ?? 0} shift${r.updated === 1 ? "" : "s"}.`);
    // Auto-close after a moment so the manager sees the confirmation.
    window.setTimeout(onSaved, 600);
  };

  // Sticky overlay using fixed positioning. No portal needed here —
  // the page itself doesn't have transformed ancestors.
  return (
    <>
      <div
        onMouseDown={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.32)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-label="Edit future shifts in series"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 460,
          maxWidth: "calc(100vw - 32px)",
          background: "#fff",
          border: `1px solid ${AC.line}`,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(10,15,30,.24)",
          zIndex: 201,
          padding: 22,
          fontFamily: AC.font,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              Edit future shifts
            </div>
            <div
              style={{
                fontSize: 12,
                color: AC.mute,
                marginTop: 2,
              }}
            >
              Applies to {series.upcomingCount} upcoming{" "}
              {series.upcomingCount === 1 ? "shift" : "shifts"} in this series.
              Past + running shifts are untouched.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="x" size={14} color={AC.mute} />
          </button>
        </div>

        <FormField label="Customer">
          <Combobox
            value={customerId || null}
            onChange={(v) => setCustomerId(v ?? "")}
            triggerIcon="customer"
            placeholder={
              series.customerIds.length === 1
                ? "(unchanged — same customer)"
                : "(unchanged — multiple customers)"
            }
            searchable
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              sublabel: c.code,
              renderLeading: () => <CustomerSwatch customer={c} size={22} />,
            }))}
          />
        </FormField>

        <FormField label="Rep">
          <Combobox
            value={repId || null}
            onChange={(v) => setRepId(v ?? "")}
            triggerIcon="reps"
            placeholder={
              series.repIds.length === 1
                ? "(unchanged — same rep)"
                : "(unchanged — multiple reps)"
            }
            searchable
            options={[
              { value: "__unassigned__", label: "Unassigned", sublabel: "Claimable" },
              ...reps
                .filter((r) => r.role === "rep")
                .map((r) => ({
                  value: r.id,
                  label: displayName(r),
                  sublabel: r.rep_type
                    ? `${r.email} · ${r.rep_type}`
                    : r.email,
                  renderLeading: () => (
                    <RepAvatar
                      rep={{
                        initials: initialsFromNameOrEmail(r.name, r.email),
                        avatarUrl: r.avatar_url,
                      }}
                      size={22}
                      seed={r.id}
                    />
                  ),
                })),
            ]}
          />
        </FormField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Start time">
            <TimeCombobox value={startTime} onChange={setStartTime} />
          </FormField>
          <FormField label="End time">
            <TimeCombobox value={endTime} onChange={setEndTime} />
          </FormField>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: AC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}
        {savedNote && !error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: AC.okTint,
              color: "#0F5A38",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {savedNote}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Btn>
        </div>
      </div>
    </>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// (selectStyle removed — time inputs in the Edit-future modal now
// use the shared TimeCombobox.)
