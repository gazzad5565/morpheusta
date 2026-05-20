"use client";

/**
 * /past-shifts — dedicated archive of completed (and optionally
 * cancelled) shifts. Drill-in to /shifts/[id] for the read-only detail,
 * which already renders rep notes, the task list with who/when each
 * task was ticked off, and any custom fields. Photo evidence is
 * deferred — the schema has photo_count on tasks but there's no
 * task_photos / shift_photos table yet, so we can't surface real photos
 * without a migration. When that lands, the slot drops in next to the
 * tasks card on the detail page.
 *
 * Patterns mirror the gold-standard list page (/reps): filter card row
 * with FilterChips + local search + view toggle, then a body card
 * with either Table or Grid.
 */

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { FilterChip } from "@/components/ui/Filters";
import { SegTabs } from "@/components/ui/SegTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { type SortState, compareBy } from "@/components/ui/SortableHeader";
import { TableView } from "@/components/past-shifts/TableView";
import { GridView } from "@/components/past-shifts/GridView";
import type { PastShiftRow, SortKey } from "@/components/past-shifts/types";
import { AC } from "@/lib/tokens";
import {
  listPastShifts,
  PAST_SHIFTS_DEFAULT_LIMIT,
} from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { todayLocalISO, isoDaysAgo } from "@/lib/format";

type Period = "7" | "30" | "90" | "all";
type ViewMode = "Table" | "Grid";

const PERIOD_LABEL: Record<Period, string> = {
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  all: "All time",
};

export default function PastShiftsPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("Table");
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "date",
    dir: "desc",
  });
  const [rows, setRows] = useState<PastShiftRow[] | null>(null);
  // Per-period counts. Only counts for windows that are a subset of
  // the currently-fetched window are accurate — e.g. when viewing
  // "30 days", the 7-day count is exact (subset) but the 90-day and
  // all-time counts can't be derived from the 30-day payload, so we
  // hide them rather than mislead. See `chipCountFor` for the rule.
  const [allCounts, setAllCounts] = useState<{
    "7": number;
    "30": number;
    "90": number;
    all: number;
    cancelled: number;
  }>({ "7": 0, "30": 0, "90": 0, all: 0, cancelled: 0 });

  // Data load. We over-fetch slightly to keep the period chips honest
  // (so toggling between "7 / 30 / 90" doesn't refetch each time). The
  // "all" window is only fetched when the user actively selects it,
  // since on a long-lived org it can be a large payload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      const endISO = todayLocalISO();
      const startISO =
        period === "all" ? "1970-01-01" : isoDaysAgo(parseInt(period) - 1);
      const [shifts, reps] = await Promise.all([
        listPastShifts({ startISO, endISO, includeCancelled }),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      const repsById = new Map<string, Profile>();
      for (const r of reps) repsById.set(r.id, r);

      const enriched: PastShiftRow[] = shifts.map((s) => {
        const rep = (s.rep_id && repsById.get(s.rep_id)) || null;
        const ratio =
          s.tasks_total > 0 ? s.tasks_done / s.tasks_total : 0;
        return {
          shift: s,
          customerName: s.customers?.name || "Unknown",
          customerCode: s.customers?.code != null ? `#${s.customers.code}` : "",
          rep,
          repName: rep
            ? displayName(rep)
            : s.rep_id
            ? "Unknown rep"
            : "Unassigned",
          tasksDoneRatio: ratio,
        };
      });
      setRows(enriched);

      // Compute period counts off the current fetch. Counts for
      // narrower-or-equal windows are exact; wider-window counts are
      // suppressed at render time (see chipCountFor) because the
      // current payload simply doesn't contain those rows.
      const today = todayLocalISO();
      const cutoff7 = isoDaysAgo(6);
      const cutoff30 = isoDaysAgo(29);
      const cutoff90 = isoDaysAgo(89);
      const inWindow = (cut: string, sd: string) => sd >= cut && sd <= today;
      const completeOnly = enriched.filter(
        (r) => r.shift.state === "complete"
      );
      const cancelledInWin = enriched.filter(
        (r) => r.shift.state === "cancelled"
      ).length;
      setAllCounts({
        "7": completeOnly.filter((r) => inWindow(cutoff7, r.shift.shift_date))
          .length,
        "30": completeOnly.filter((r) => inWindow(cutoff30, r.shift.shift_date))
          .length,
        "90": completeOnly.filter((r) => inWindow(cutoff90, r.shift.shift_date))
          .length,
        all: completeOnly.length,
        cancelled: cancelledInWin,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [period, includeCancelled]);

  // Rank periods narrowest-to-widest. We only display a chip count
  // when the chip's window is narrower or equal to the currently-
  // fetched window, otherwise the count would be a misleading lower
  // bound (e.g. showing the 7-day count under a "90 days" chip).
  const periodRank: Record<Period, number> = { "7": 0, "30": 1, "90": 2, all: 3 };
  function chipCountFor(p: Period): number | null {
    return periodRank[p] <= periodRank[period] ? allCounts[p] : null;
  }

  const filtered = useMemo<PastShiftRow[] | null>(() => {
    if (rows === null) return null;
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => {
        if (r.customerName.toLowerCase().includes(q)) return true;
        if (r.customerCode.toLowerCase().includes(q)) return true;
        if (r.repName.toLowerCase().includes(q)) return true;
        if (r.shift.site?.name?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    const sorted = [...out].sort((a, b) => {
      switch (sort.key) {
        case "date":
          return compareBy(
            a,
            b,
            (r) => `${r.shift.shift_date} ${r.shift.start_time}`,
            sort.dir
          );
        case "customer":
          return compareBy(a, b, (r) => r.customerName, sort.dir);
        case "rep":
          return compareBy(a, b, (r) => r.repName, sort.dir);
        case "tasksDone":
          return compareBy(a, b, (r) => r.tasksDoneRatio, sort.dir);
        case "state":
          return compareBy(a, b, (r) => r.shift.state, sort.dir);
        default:
          return 0;
      }
    });
    return sorted;
  }, [rows, search, sort]);

  return (
    <AdminShell breadcrumbs={["Home", "Past Shifts"]}>
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Filter row */}
        <Card padding={12}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <FilterChip
              active={period === "7"}
              onClick={() => setPeriod("7")}
            >
              7 days{chipCountFor("7") !== null ? ` · ${chipCountFor("7")}` : ""}
            </FilterChip>
            <FilterChip
              active={period === "30"}
              onClick={() => setPeriod("30")}
            >
              30 days{chipCountFor("30") !== null ? ` · ${chipCountFor("30")}` : ""}
            </FilterChip>
            <FilterChip
              active={period === "90"}
              onClick={() => setPeriod("90")}
            >
              90 days{chipCountFor("90") !== null ? ` · ${chipCountFor("90")}` : ""}
            </FilterChip>
            <FilterChip
              active={period === "all"}
              onClick={() => setPeriod("all")}
            >
              All time{chipCountFor("all") !== null ? ` · ${chipCountFor("all")}` : ""}
            </FilterChip>
            <FilterChip
              active={includeCancelled}
              onClick={() => setIncludeCancelled((v) => !v)}
            >
              Include cancelled
              {includeCancelled ? ` · ${allCounts.cancelled}` : ""}
            </FilterChip>
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                background: AC.bg,
                border: `1px solid ${AC.line}`,
                borderRadius: 8,
                width: 240,
              }}
            >
              <AGlyph name="search" size={13} color={AC.hint} />
              <input
                placeholder="customer, rep, or site…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.ink,
                  minWidth: 0,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <AGlyph name="x" size={12} color={AC.hint} />
                </button>
              )}
            </div>
            <SegTabs
              tabs={["Table", "Grid"]}
              active={view}
              onChange={(v) => setView(v as ViewMode)}
            />
          </div>
        </Card>

        {/* Truncation banner — `listPastShifts` caps its result at
            PAST_SHIFTS_DEFAULT_LIMIT to keep the "all-time" window
            from pulling a six-figure payload on long-lived orgs. When
            the cap is hit we tell the manager so they don't read the
            partial list as the full archive. */}
        {rows && rows.length >= PAST_SHIFTS_DEFAULT_LIMIT && (
          <Card padding={12}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: "#7d5708",
                background: AC.warnTint,
                padding: "8px 12px",
                borderRadius: 8,
                lineHeight: 1.45,
              }}
            >
              <strong>Showing the most recent {PAST_SHIFTS_DEFAULT_LIMIT.toLocaleString()} shifts.</strong>{" "}
              Narrow the date window or search to see older results — the
              archive may contain more shifts than are listed here.
            </div>
          </Card>
        )}

        {/* Body */}
        {filtered === null ? (
          <Card padding={32}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading past shifts…
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card padding={0}>
            {rows && rows.length === 0 ? (
              <EmptyState
                icon="clock"
                title={`No past shifts in the last ${PERIOD_LABEL[period]}`}
                hint="Completed shifts will appear here once reps wrap up their day. Widen the window if you're expecting older shifts."
              />
            ) : (
              <EmptyState
                icon="search"
                title="No shifts match your filters."
                hint="Try clearing the search or widening the date range."
              />
            )}
          </Card>
        ) : view === "Table" ? (
          <TableView rows={filtered} sort={sort} onSort={setSort} />
        ) : (
          <GridView rows={filtered} />
        )}
      </div>
    </AdminShell>
  );
}

