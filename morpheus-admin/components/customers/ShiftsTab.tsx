"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { FilterChip } from "@/components/ui/Filters";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
import { AC } from "@/lib/tokens";
import {
  formatDate,
  formatTimeRange,
  todayLocalISO,
} from "@/lib/format";
import { displayName, type Profile } from "@/lib/profiles-store";
import { shiftHref, type ShiftRow } from "@/lib/shifts-store";

// Shift rows / column header (May 27 — expanded to show all shifts
// not just today's, per Gary's feedback). Date column added; rest of
// the columns unchanged.
//   Date | Time range | Rep | State
const SHIFT_COLS = "110px 130px 1fr 110px";

type ShiftFilter = "all" | "today" | "past" | "upcoming";

/**
 * Shifts at this customer — last 90 days through one year forward.
 *
 * Filter chips (default "All") let the manager narrow to Today / Past /
 * Upcoming. Sorted newest-first so a manager scanning for "what just
 * happened here" lands on it without scrolling. Paginated (50 per page)
 * using the same Pagination component as the list pages, so a customer
 * with hundreds of shifts in the window stays manageable.
 */
export function ShiftsTab({
  shifts,
  reps,
  customerId,
}: {
  shifts: ShiftRow[];
  reps: Profile[];
  customerId: string;
}) {
  const router = useRouter();
  const repsById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const r of reps) m.set(r.id, r);
    return m;
  }, [reps]);

  const [filter, setFilter] = useState<ShiftFilter>("all");
  const [page, setPage] = useState(0);

  // Reset to page 0 whenever the filter changes — without this the
  // user could land on an empty page after narrowing the set.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  const today = todayLocalISO();

  // Counts per bucket — drives the filter-chip badges so the manager
  // can see "Today · 2 · Past · 47 · Upcoming · 12" at a glance.
  const counts = useMemo(() => {
    let pastN = 0;
    let todayN = 0;
    let upcomingN = 0;
    for (const s of shifts) {
      if (s.shift_date < today) pastN += 1;
      else if (s.shift_date === today) todayN += 1;
      else upcomingN += 1;
    }
    return { all: shifts.length, today: todayN, past: pastN, upcoming: upcomingN };
  }, [shifts, today]);

  // Apply filter, then sort newest-first by date then by start time.
  const filtered = useMemo(() => {
    let out = shifts;
    if (filter === "today") out = out.filter((s) => s.shift_date === today);
    else if (filter === "past") out = out.filter((s) => s.shift_date < today);
    else if (filter === "upcoming")
      out = out.filter((s) => s.shift_date > today);
    return [...out].sort((a, b) => {
      if (a.shift_date !== b.shift_date) {
        return a.shift_date < b.shift_date ? 1 : -1;
      }
      return a.start_time < b.start_time ? 1 : -1;
    });
  }, [shifts, filter, today]);

  const pageItems = filtered.slice(
    page * DEFAULT_PAGE_SIZE,
    (page + 1) * DEFAULT_PAGE_SIZE
  );

  return (
    <Card padding={0}>
      <TabHeader
        title="Shifts at this customer"
        count={filtered.length}
        action={
          shifts.length > 0 ? (
            <Link
              href={`/schedule/new?customer=${customerId}`}
              style={{ textDecoration: "none" }}
            >
              <Btn size="sm" kind="primary" icon="plus">
                Schedule
              </Btn>
            </Link>
          ) : null
        }
      />

      {/* Filter chips — counts mirror the same shape used on /reps,
          /customers, /tasks (the live admin's filter-row convention). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: `1px solid ${AC.lineDim}`,
          flexWrap: "wrap",
        }}
      >
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span style={{ color: AC.mute, fontWeight: 500 }}>· {counts.all}</span>
        </FilterChip>
        <FilterChip active={filter === "today"} onClick={() => setFilter("today")}>
          Today · {counts.today}
        </FilterChip>
        <FilterChip active={filter === "past"} onClick={() => setFilter("past")}>
          Past · {counts.past}
        </FilterChip>
        <FilterChip
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
        >
          Upcoming · {counts.upcoming}
        </FilterChip>
      </div>

      <div>
        {shifts.length === 0 ? (
          <EmptyState
            icon="cal"
            title="No shifts in the last 90 days"
            hint="Schedule a shift here to put a rep on site."
            actionLabel="Schedule a shift"
            onAction={() => router.push(`/schedule/new?customer=${customerId}`)}
          />
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.mute,
            }}
          >
            No shifts match this filter.
          </div>
        ) : (
          <>
            <TableColumnHeader columns={SHIFT_COLS}>
              <div>Date</div>
              <div>Time</div>
              <div>Rep</div>
              <div style={{ textAlign: "right" }}>State</div>
            </TableColumnHeader>
            {pageItems.map((s, i) => {
              const go = () => router.push(shiftHref(s));
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      go();
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: SHIFT_COLS,
                    gap: 14,
                    alignItems: "center",
                    padding: "10px 16px",
                    borderBottom:
                      i < pageItems.length - 1
                        ? `1px solid ${AC.lineDim}`
                        : "none",
                    background: "#fff",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: s.shift_date === today ? AC.brandDeep : AC.ink2,
                      fontWeight: s.shift_date === today ? 700 : 600,
                    }}
                  >
                    {s.shift_date === today ? "Today" : formatDate(s.shift_date)}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.ink2,
                      fontWeight: 600,
                    }}
                  >
                    {formatTimeRange(s.start_time, s.end_time)}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink,
                      fontWeight: 500,
                    }}
                  >
                    {s.rep_id ? (
                      <Link
                        href={`/reps/${s.rep_id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: AC.brandDeep,
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {repsById.get(s.rep_id)
                          ? displayName(repsById.get(s.rep_id)!)
                          : "Rep"}
                      </Link>
                    ) : (
                      <span style={{ color: AC.mute }}>
                        Unassigned · claimable
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        s.state === "complete"
                          ? AC.ok
                          : s.state === "in-progress"
                          ? AC.brandDeep
                          : AC.mute,
                      textTransform: "capitalize",
                      textAlign: "right",
                    }}
                  >
                    {s.state.replace("-", " ")}
                  </div>
                </div>
              );
            })}
            <div style={{ padding: "0 12px" }}>
              <Pagination
                totalItems={filtered.length}
                currentPage={page}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
