"use client";

/**
 * ShiftsList — Live Ops table showing today's shifts.
 *
 * Pulls from Supabase via:
 *   - listShifts() → today's shifts (customer joined)
 *   - listProfiles({ role: "rep" }) → reps so we can resolve rep_id → name
 *
 * Filtering is client-side via SegTabs (All / In progress / Travelling /
 * On break / Unassigned / Requested). Sort is by start_time ascending.
 *
 * Note: there used to be an "Issues" tab that filtered to state='late'.
 * Removed because nothing in the app ever writes state='late' — late
 * detection is Phase 4. The STATE_MAP entry for 'late' stays so a
 * future backend write renders correctly without further frontend
 * changes.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { listShifts, subscribeShifts, shiftHref, type ShiftRow } from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { countTasksForCustomers } from "@/lib/tasks-store";
import {
  listPendingRequests,
  subscribeRequests,
  type PendingRequest,
} from "@/lib/requests-store";

const STATE_MAP: Record<string, { label: string; bg: string; ink: string; dot: string }> = {
  "in-progress": { label: "In progress", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
  travelling: { label: "Travelling", bg: AC.warnTint, ink: "#7A560A", dot: AC.warn },
  "on-break": { label: "On break", bg: "#E6E9F8", ink: "#241B5A", dot: "#5447BD" },
  late: { label: "Late", bg: AC.dangerTint, ink: "#6E1430", dot: AC.danger },
  unassigned: { label: "Unassigned", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  scheduled: { label: "Scheduled", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  complete: { label: "Complete", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
};

function deriveInitials(p: Profile): string {
  const source = p.name?.trim() || p.email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatTimeLabel(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

function formatCheckIn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface RepLite {
  id: string;
  name: string;
  initials: string;
}

const TABS = [
  "All",
  "Needs action",
  "In progress",
  "Travelling",
  "On break",
  "Unassigned",
  "Requested",
] as const;

/** A shift "needs action" when the rep has flagged unable-to-attend
 *  and the manager hasn't yet resolved the flag. Used by the
 *  ShiftsList tab + count pill on Live Ops so attention rows show up
 *  in the same place the manager already scans for the day. */
const isNeedsAction = (s: ShiftRow): boolean =>
  s.attention === "unable_to_attend" && !s.attention_resolved_at;

// Discriminated union — request rows are real DB rows from
// requested_shifts (separate table from shifts) but they live in this
// list visually so the manager can see them next to the day's actual
// shifts.
type ListRow =
  | { kind: "shift"; shift: ShiftRow }
  | { kind: "request"; request: PendingRequest };

export function ShiftsList() {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [reps, setReps] = useState<Record<string, RepLite>>({});
  // Live customer-task counts. The shifts.tasks_total column is set
  // once at shift-creation time (or auto-derived from customer_tasks
  // on creation) and never updated after — so when a manager adds a
  // new task to a customer the row stays stuck on the old number.
  // Recompute the count per visible customer and feed it to the
  // progress bar so this number is always honest.
  const [taskCountByCustomer, setTaskCountByCustomer] = useState<
    Map<string, number>
  >(() => new Map());
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("All");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [shiftRows, profileRows, requestRows] = await Promise.all([
        listShifts(),
        listProfiles(),
        listPendingRequests(),
      ]);
      if (cancelled) return;
      const repMap: Record<string, RepLite> = {};
      for (const p of profileRows) {
        repMap[p.id] = {
          id: p.id,
          name: displayName(p),
          initials: deriveInitials(p),
        };
      }
      setReps(repMap);
      setRows(shiftRows);
      setRequests(requestRows);
      setLoading(false);

      // Refresh the per-customer task counts off the visible shifts.
      // This is N+1-safe — countTasksForCustomers does two batched
      // queries regardless of customer count.
      const customerIds = Array.from(
        new Set(shiftRows.map((s) => s.customer_id).filter(Boolean))
      );
      if (customerIds.length > 0) {
        const counts = await countTasksForCustomers(customerIds);
        if (!cancelled) setTaskCountByCustomer(counts);
      } else {
        if (!cancelled) setTaskCountByCustomer(new Map());
      }
    };
    load();
    // Realtime + visibility refetch on BOTH shifts and requested_shifts
    // so the today's-shifts list (which now includes pending requests)
    // stays current without a manual refresh.
    const unsubShifts = subscribeShifts(load);
    const unsubRequests = subscribeRequests(load);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      unsubShifts();
      unsubRequests();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Effective state used both for display & filtering.
  // If rep_id is null we treat it as "unassigned" regardless of stored state.
  const effectiveState = (s: ShiftRow): string => (s.rep_id ? s.state : "unassigned");

  // Combined list: real shifts AND pending requests, in one array. Each
  // is wrapped with a `kind` so the renderer can branch.
  //
  // Hide a pending request whose (rep_id, customer_id) already exists
  // as a real shift today — defends against the realtime-DELETE lag
  // where the requested_shifts row hasn't been removed yet but the
  // approved shift is already in the list. Without this filter, the
  // moment a manager approves a request the table briefly shows the
  // same store assigned to the same rep twice (one Requested row,
  // one Scheduled row) until the DELETE event lands. Supabase
  // realtime DELETEs can lag behind INSERTs by seconds or longer.
  const filtered = useMemo<ListRow[]>(() => {
    const shiftKeys = new Set(
      rows
        .filter((s) => s.rep_id)
        .map((s) => `${s.rep_id}::${s.customer_id}`)
    );
    const dedupedRequests = requests.filter(
      (r) => !shiftKeys.has(`${r.repId}::${r.customerId}`)
    );

    const shiftRows: ListRow[] = rows.map((s) => ({ kind: "shift", shift: s }));
    const reqRows: ListRow[] = dedupedRequests.map((r) => ({
      kind: "request",
      request: r,
    }));

    if (active === "All") return [...reqRows, ...shiftRows];
    if (active === "Requested") return reqRows;
    if (active === "Unassigned")
      return shiftRows.filter((r) => r.kind === "shift" && !r.shift.rep_id);
    if (active === "Needs action") {
      return shiftRows.filter(
        (r) => r.kind === "shift" && isNeedsAction(r.shift)
      );
    }
    const key = active.toLowerCase().replace(" ", "-");
    return shiftRows.filter(
      (r) => r.kind === "shift" && effectiveState(r.shift) === key
    );
  }, [rows, requests, active]);

  // Per-tab counts so each filter shows a tiny "1" / "3" pill next to
  // its label. Subtle when zero, brand-tinted when there's something
  // to handle. Computes off the same dedupedRequests / rows pair the
  // filtered list above already uses.
  const tabCounts = useMemo<Record<string, number>>(() => {
    const shiftKeys = new Set(
      rows.filter((s) => s.rep_id).map((s) => `${s.rep_id}::${s.customer_id}`)
    );
    const dedupedRequests = requests.filter(
      (r) => !shiftKeys.has(`${r.repId}::${r.customerId}`)
    );
    const totalShifts = rows.length;
    const inProgress = rows.filter(
      (s) => effectiveState(s) === "in-progress"
    ).length;
    const travelling = rows.filter(
      (s) => effectiveState(s) === "travelling"
    ).length;
    const onBreak = rows.filter((s) => effectiveState(s) === "on-break").length;
    const unassigned = rows.filter((s) => !s.rep_id).length;
    const needsAction = rows.filter(isNeedsAction).length;
    return {
      All: totalShifts + dedupedRequests.length,
      "Needs action": needsAction,
      "In progress": inProgress,
      Travelling: travelling,
      "On break": onBreak,
      Unassigned: unassigned,
      Requested: dedupedRequests.length,
    };
  }, [rows, requests]);

  return (
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
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          Today&apos;s shifts
        </div>
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 99,
            background: AC.bg,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {filtered.length}
        </span>
        <div style={{ flex: 1 }} />
        <SegTabs
          tabs={TABS}
          active={active}
          onChange={setActive}
          counts={tabCounts}
          urgentTabs={["Needs action"]}
        />
        <div style={{ width: 1, height: 18, background: AC.line }} />
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            fontWeight: 600,
          }}
        >
          <AGlyph name="sort" size={12} color={AC.mute} />
          Start time
        </button>
      </div>

      <div>
        <ShiftRowView header />
        {loading ? (
          <EmptyRow text="Loading shifts…" />
        ) : filtered.length === 0 ? (
          <EmptyRow
            text={
              active === "All"
                ? "No shifts scheduled today. Click 'New shift' to add one."
                : `Nothing matches '${active}' right now.`
            }
          />
        ) : (
          filtered.map((r) =>
            r.kind === "shift" ? (
              <ShiftRowView
                key={`s-${r.shift.id}`}
                row={r.shift}
                rep={r.shift.rep_id ? reps[r.shift.rep_id] : undefined}
                liveTaskTotal={taskCountByCustomer.get(r.shift.customer_id)}
              />
            ) : (
              <RequestRowView key={`r-${r.request.id}`} request={r.request} />
            )
          )
        )}
      </div>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.mute,
        background: "#fff",
      }}
    >
      {text}
    </div>
  );
}

function shiftRowGrid(opts?: { header?: boolean }): CSSProperties {
  const header = opts?.header;
  return {
    display: "grid",
    gridTemplateColumns: "4px 1.4fr 1.6fr 130px 130px 110px 110px 36px",
    gap: 14,
    alignItems: "center",
    padding: header ? "8px 16px" : "12px 16px",
    borderBottom: `1px solid ${header ? AC.line : AC.lineDim}`,
    background: header ? AC.bg : "#fff",
    fontFamily: AC.font,
    fontSize: header ? 11 : 12,
    fontWeight: header ? 600 : 500,
    color: header ? AC.mute : AC.ink2,
    letterSpacing: header ? 0.3 : 0,
    textTransform: header ? "uppercase" : "none",
  };
}

function ShiftRowView({
  row,
  rep,
  header,
  liveTaskTotal,
}: {
  row?: ShiftRow;
  rep?: RepLite;
  /** Live count of customer_tasks rows for this shift's customer
   *  (specific + universal). Falls back to row.tasks_total when
   *  unknown. The shifts.tasks_total column is set once at creation
   *  and never refreshed; this prop keeps the progress bar honest
   *  when a customer's task list grows after the shift was scheduled. */
  liveTaskTotal?: number;
  header?: boolean;
}) {
  if (header) {
    return (
      <div style={shiftRowGrid({ header: true })}>
        <div></div>
        <div>Rep</div>
        <div>Customer</div>
        <div>Window</div>
        <div>State</div>
        <div>Tasks</div>
        <div>Check-in</div>
        <div></div>
      </div>
    );
  }
  if (!row) return null;

  const stateKey = row.rep_id ? row.state : "unassigned";
  const state = STATE_MAP[stateKey] || STATE_MAP.scheduled;
  const checkIn = formatCheckIn(row.check_in_at);

  // Make the row a link to the shift detail page. The trailing "more"
  // button stops propagation so it doesn't trigger navigation.
  return (
    <a
      href={shiftHref(row)}
      style={{
        ...shiftRowGrid(),
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 3,
          alignSelf: "stretch",
          background: state.dot,
          borderRadius: 2,
          margin: "4px 0",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        {rep ? (
          <>
            <RepAvatar rep={{ initials: rep.initials }} size={28} seed={rep.id} />
            <div style={{ minWidth: 0 }}>
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
                }}
              >
                {rep.name}
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
                Rep
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                border: `1.5px dashed ${AC.faint}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AGlyph name="plus" size={12} color={AC.mute} />
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: -0.1,
              }}
            >
              Unassigned
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        {row.customers && (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: row.customers.color,
              color: "#fff",
              fontFamily: AC.font,
              fontSize: 10.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0.2,
              flexShrink: 0,
            }}
          >
            {row.customers.initials}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
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
            }}
          >
            {row.customers?.name || "—"}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
            #{row.customers?.code ?? ""}
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.ink2,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        {formatTimeLabel(row.start_time)}
        <span style={{ color: AC.faint, padding: "0 2px" }}>—</span>
        {formatTimeLabel(row.end_time)}
      </div>

      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 99,
            background: state.bg,
            color: state.ink,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 99, background: state.dot }} />
          {state.label}
        </span>
      </div>

      <TaskBar
        done={row.tasks_done}
        total={liveTaskTotal ?? row.tasks_total}
      />

      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: checkIn ? AC.ink2 : AC.mute,
          fontWeight: 600,
        }}
      >
        {checkIn || "—"}
      </div>

      <button
        type="button"
        onClick={(e) => {
          // Don't navigate to /shifts/[id] when the menu trigger is tapped.
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="more" size={16} color={AC.mute} />
      </button>
    </a>
  );
}

function TaskBar({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 5,
          borderRadius: 99,
          background: AC.bgDeep,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct === 100 ? AC.ok : AC.brand,
            borderRadius: 99,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 11,
          color: AC.ink2,
          fontWeight: 600,
          minWidth: 26,
        }}
      >
        {done}/{total}
      </div>
    </div>
  );
}

/**
 * Request row variant — drawn in the same grid as ShiftRowView so it
 * lines up cell-for-cell, but visually distinct (orange-tinted dashed
 * left rail, "Requested" pill in the State column). Click → /requests
 * for approve / decline.
 */
function RequestRowView({ request: r }: { request: PendingRequest }) {
  return (
    <Link
      href="/requests"
      style={{
        ...shiftRowGrid(),
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        background: "#FFF8F1",
      }}
      title={`${r.repName} requested ${r.customerName} — click to approve / decline`}
    >
      <div
        style={{
          width: 3,
          alignSelf: "stretch",
          background: AC.warn,
          borderRadius: 2,
          margin: "4px 0",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            background: AC.warnTint,
            color: AC.warn,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {r.repName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
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
            }}
          >
            {r.repName}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
            wants a shift
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: r.customerColor,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: 0.2,
            flexShrink: 0,
          }}
        >
          {r.customerInitials}
        </div>
        <div style={{ minWidth: 0 }}>
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
            }}
          >
            {r.customerName}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
            #{r.customerCode}
          </div>
        </div>
      </div>

      {/* No window for a request — show a dash */}
      <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, fontWeight: 500 }}>—</div>

      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 99,
            background: AC.warnTint,
            color: "#7A560A",
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 99, background: AC.warn }} />
          Requested
        </span>
      </div>

      {/* No tasks / check-in for an unscheduled request */}
      <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute }}>—</div>
      <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute }}>—</div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          width: 26,
          height: 26,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="more" size={16} color={AC.mute} />
      </button>
    </Link>
  );
}
