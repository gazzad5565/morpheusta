import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { RepAvatar } from "@/components/ui/Avatars";
import { AC } from "@/lib/tokens";
import { shiftHref } from "@/lib/shifts-store";
import { formatDate, formatTimeRange, initialsFromNameOrEmail } from "@/lib/format";
import { TasksDonePill } from "./TasksDonePill";
import { STATE_LABEL, STATE_TONE, type PastShiftRow } from "./types";

/**
 * Grid-style /past-shifts view — one Card per shift, three columns
 * wide. Mirrors the Live Ops "card" archetype so the same row reads
 * the same way whether you're skimming an archive or watching today's
 * board.
 */
export function GridView({ rows }: { rows: PastShiftRow[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 14,
      }}
    >
      {rows.map((r) => {
        const s = r.shift;
        const tone = STATE_TONE[s.state] || STATE_TONE.complete;
        return (
          <Card key={s.id} padding={0} style={{ overflow: "hidden" }}>
            <Link
              href={shiftHref(s)}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  height: 56,
                  background: AC.brandSoft,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 16px",
                  gap: 10,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: s.customers?.color || AC.brand,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: AC.font,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                  }}
                >
                  {s.customers?.initials || "??"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13,
                      fontWeight: 700,
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
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: tone.bg,
                    color: tone.fg,
                    fontFamily: AC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {STATE_LABEL[s.state] || s.state}
                </span>
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
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
                        initials: initialsFromNameOrEmail(
                          r.rep.name,
                          r.rep.email
                        ),
                        avatarUrl: r.rep.avatar_url,
                      }}
                      size={24}
                      seed={r.rep.id}
                    />
                  ) : (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 99,
                        background: AC.bg,
                        border: `1px dashed ${AC.line}`,
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
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
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
                      fontSize: 11.5,
                      color: AC.mute,
                    }}
                  >
                    {formatTimeRange(s.start_time, s.end_time)}
                  </div>
                </div>
                <TasksDonePill done={s.tasks_done} total={s.tasks_total} />
              </div>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
