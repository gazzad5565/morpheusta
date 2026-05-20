"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { AC } from "@/lib/tokens";
import { formatTimeRange } from "@/lib/format";
import { displayName, type Profile } from "@/lib/profiles-store";
import { shiftHref, type ShiftRow } from "@/lib/shifts-store";

// Shift rows / column header:
//   Time range | Rep | State
const SHIFT_COLS = "140px 1fr 110px";

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
  return (
    <Card padding={0}>
      <TabHeader
        title="Shifts at this customer (today)"
        count={shifts.length}
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
      <div>
        {shifts.length === 0 ? (
          <EmptyState
            icon="cal"
            title="No shifts scheduled today"
            hint="Schedule a shift here to put a rep on site."
            actionLabel="Schedule a shift"
            onAction={() => router.push(`/schedule/new?customer=${customerId}`)}
          />
        ) : (
          <>
            <TableColumnHeader columns={SHIFT_COLS}>
              <div>Time</div>
              <div>Rep</div>
              <div style={{ textAlign: "right" }}>State</div>
            </TableColumnHeader>
            {shifts.map((s, i) => {
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
                  borderBottom: i < shifts.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  background: "#fff",
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
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
                    <span style={{ color: AC.mute }}>Unassigned · claimable</span>
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
          </>
        )}
      </div>
    </Card>
  );
}
