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
import { Combobox } from "@/components/ui/Combobox";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { AC } from "@/lib/tokens";
import {
  listShiftSeries,
  cancelShiftSeries,
  updateShiftSeries,
  listStandaloneShifts,
  bulkDeleteShifts,
  deleteAllUpcomingShifts,
  subscribeShifts,
  type ShiftSeriesSummary,
  type OneOffShiftRow,
} from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { todayLocalISO } from "@/lib/format";
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
  const [resetting, setResetting] = useState(false);

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

  const onResetSchedule = async () => {
    // Two-step confirm to dodge an accidental nuke. The button copy
    // already says "Reset upcoming schedule" so the manager knows
    // the scope, but a typed confirm makes it deliberate.
    const typed = window.prompt(
      `This will delete EVERY shift dated today or later — every state, no exceptions (scheduled, in-progress, complete, late, cancelled). Past shifts are kept for history.\n\nThis cannot be undone.\n\nType RESET to confirm.`
    );
    if (typed !== "RESET") return;
    setResetting(true);
    const r = await deleteAllUpcomingShifts();
    setResetting(false);
    if (!r.ok) {
      alert(`Couldn't reset: ${r.error}`);
      return;
    }
    alert(`Schedule reset. ${r.deleted ?? 0} shifts deleted.`);
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

        {/* Nuclear "reset everything" affordance. Kept distinct from
            the per-series / per-row deletes and gated by a typed
            "RESET" prompt because there's no undo. */}
        <Card padding={20}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.1,
                }}
              >
                Reset upcoming schedule
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.mute,
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Deletes every still-scheduled shift from today forward — series
                and standalone, all reps, all customers. Running and complete
                shifts stay put for the audit trail. There&apos;s no undo.
              </div>
            </div>
            <Btn kind="danger" onClick={onResetSchedule} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset upcoming schedule"}
            </Btn>
          </div>
        </Card>
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
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              sublabel: `#${c.code}`,
              color: c.color || undefined,
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
            options={[
              { value: "__unassigned__", label: "Unassigned", sublabel: "Claimable" },
              ...reps
                .filter((r) => r.role === "rep")
                .map((r) => ({ value: r.id, label: displayName(r) })),
            ]}
          />
        </FormField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Start time">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={selectStyle}
            />
          </FormField>
          <FormField label="End time">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={selectStyle}
            />
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

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  fontFamily: AC.font,
  fontSize: 13.5,
  color: AC.ink,
  boxSizing: "border-box",
};
