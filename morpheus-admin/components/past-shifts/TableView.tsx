import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { RepAvatar } from "@/components/ui/Avatars";
import { TableColumnHeader } from "@/components/ui/TabHeader";
import {
  SortableHeader,
  type SortState,
} from "@/components/ui/SortableHeader";
import { AC } from "@/lib/tokens";
import { shiftHref } from "@/lib/shifts-store";
import { formatDate, formatTimeRange, initialsFromNameOrEmail } from "@/lib/format";
import { TasksDonePill } from "./TasksDonePill";
import {
  STATE_LABEL,
  STATE_TONE,
  TABLE_COLS,
  type PastShiftRow,
  type SortKey,
} from "./types";

/**
 * Table-style /past-shifts view. One Card per page with the
 * sortable-header row at the top and one anchor-row per shift (the
 * whole row is the click target — shiftHref routes scheduled rows
 * to the edit page and everything else to the read-only detail).
 */
export function TableView({
  rows,
  sort,
  onSort,
}: {
  rows: PastShiftRow[];
  sort: SortState<SortKey>;
  onSort: (s: SortState<SortKey>) => void;
}) {
  return (
    <Card padding={0}>
      <TableColumnHeader columns={TABLE_COLS}>
        <SortableHeader k="customer" sort={sort} onChange={onSort}>
          Customer
        </SortableHeader>
        <SortableHeader k="rep" sort={sort} onChange={onSort}>
          Rep
        </SortableHeader>
        <SortableHeader k="date" sort={sort} onChange={onSort}>
          Date
        </SortableHeader>
        <div>Time</div>
        <SortableHeader k="tasksDone" sort={sort} onChange={onSort}>
          Tasks done
        </SortableHeader>
        <SortableHeader k="state" sort={sort} onChange={onSort}>
          State
        </SortableHeader>
      </TableColumnHeader>

      {rows.map((r, i) => {
        const s = r.shift;
        const tone = STATE_TONE[s.state] || STATE_TONE.complete;
        return (
          <Link
            key={s.id}
            href={shiftHref(s)}
            style={{
              display: "grid",
              gridTemplateColumns: TABLE_COLS,
              alignItems: "center",
              gap: 14,
              padding: "12px 16px",
              borderBottom:
                i < rows.length - 1 ? `1px solid ${AC.lineDim}` : "none",
              background: "#fff",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: s.customers?.color || AC.brand,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                {s.customers?.initials || "??"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
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
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.customerCode}
                  {s.site?.name &&
                    s.site.name !== "Head office" &&
                    ` · ${s.site.name}`}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              {r.rep ? (
                <RepAvatar
                  rep={{
                    initials: initialsFromNameOrEmail(r.rep.name, r.rep.email),
                    avatarUrl: r.rep.avatar_url,
                  }}
                  size={26}
                  seed={r.rep.id}
                />
              ) : (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 99,
                    background: AC.bg,
                    border: `1px dashed ${AC.line}`,
                    flexShrink: 0,
                  }}
                />
              )}
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: r.rep ? AC.ink2 : AC.mute,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {r.repName}
              </div>
            </div>

            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink2,
                fontWeight: 500,
              }}
            >
              {formatDate(s.shift_date)}
            </div>

            <div
              style={{
                fontFamily: AC.fontMono,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              {formatTimeRange(s.start_time, s.end_time)}
            </div>

            <div>
              <TasksDonePill done={s.tasks_done} total={s.tasks_total} />
            </div>

            <div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: tone.bg,
                  color: tone.fg,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {STATE_LABEL[s.state] || s.state}
              </span>
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
