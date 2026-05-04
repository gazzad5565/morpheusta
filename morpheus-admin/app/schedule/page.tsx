import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { FilterDropdown } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { REPS, CUSTOMERS } from "@/lib/mock-data";

const DAYS = ["Mon 13", "Tue 14", "Wed 15", "Thu 16", "Fri 17", "Sat 18", "Sun 19"];

function placeShift(repIdx: number, dayIdx: number) {
  const seed = (repIdx * 7 + dayIdx) % 11;
  if (seed === 3 || seed === 8 || dayIdx === 5 || dayIdx === 6) return null;
  const c = CUSTOMERS[(repIdx + dayIdx) % CUSTOMERS.length];
  const start = ["08:00", "09:00", "13:00"][seed % 3];
  const dur = ["4h", "4h 30m", "6h"][seed % 3];
  return { customer: c, start, dur };
}

export default function SchedulePage() {
  const reps = REPS.slice(0, 8);

  return (
    <AdminShell
      breadcrumbs={["Home", "Schedule"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="upload" size="sm">Import</Btn>
          <Btn icon="plus" kind="primary" size="sm">New shift</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            borderBottom: `1px solid ${AC.line}`,
            padding: "0 4px",
          }}
        >
          {[
            { id: "today", label: "Today's shifts", count: 12 as number | undefined },
            { id: "week", label: "Week planner", count: undefined },
            { id: "month", label: "Month", count: undefined },
            { id: "gantt", label: "Gantt", count: undefined },
          ].map((t) => {
            const active = t.id === "week";
            return (
              <button
                key={t.id}
                type="button"
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${AC.ink}`
                    : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: active ? AC.ink : AC.mute,
                  letterSpacing: -0.2,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {t.label}
                {t.count != null && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 99,
                      background: active ? AC.ink : AC.bgDeep,
                      color: active ? "#fff" : AC.mute,
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn size="sm" icon="chev-l">{""}</Btn>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: AC.ink,
                padding: "0 4px",
                letterSpacing: -0.2,
              }}
            >
              Week of 13 May 2025
            </div>
            <Btn size="sm" icon="chev-r">{""}</Btn>
            <Btn size="sm">This week</Btn>
            <div style={{ flex: 1 }} />
            <FilterDropdown label="Region" value="All" />
            <FilterDropdown label="Customer" value="All" />
            <FilterDropdown label="Group by" value="Rep" />
          </div>
        </Card>

        <Card padding={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px repeat(7, 1fr)",
              borderBottom: `1px solid ${AC.line}`,
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              Rep
            </div>
            {DAYS.map((d, i) => (
              <div
                key={d}
                style={{
                  padding: "10px 12px",
                  borderLeft: `1px solid ${AC.lineDim}`,
                  background: i === 0 ? AC.brandSoft : "transparent",
                }}
              >
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11,
                    color: i === 0 ? AC.brandDeep : AC.mute,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  {d.split(" ")[0]}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: i === 0 ? AC.brandDeep : AC.ink,
                    letterSpacing: -0.2,
                    marginTop: 1,
                  }}
                >
                  {d.split(" ")[1]}
                </div>
              </div>
            ))}
          </div>

          {reps.map((rep, ri) => (
            <div
              key={rep.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px repeat(7, 1fr)",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: AC.bg,
                }}
              >
                <RepAvatar rep={rep} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
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
                  <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>
                    {rep.region}
                  </div>
                </div>
              </div>
              {DAYS.map((_d, di) => {
                const s = placeShift(ri, di);
                return (
                  <div
                    key={di}
                    style={{
                      position: "relative",
                      minHeight: 60,
                      padding: 6,
                      borderLeft: `1px solid ${AC.lineDim}`,
                      background: di === 0 ? "#FAFCFD" : di >= 5 ? AC.bg : "#fff",
                    }}
                  >
                    {s && (
                      <div
                        style={{
                          background: `${s.customer.color}15`,
                          borderLeft: `3px solid ${s.customer.color}`,
                          borderRadius: 5,
                          padding: "5px 7px",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11,
                            fontWeight: 700,
                            color: s.customer.color,
                            letterSpacing: -0.1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.customer.name}
                        </div>
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 10.5,
                            color: AC.ink2,
                            fontWeight: 500,
                            marginTop: 1,
                          }}
                        >
                          {s.start} · {s.dur}
                        </div>
                      </div>
                    )}
                    {!s && di < 5 && (
                      <div
                        style={{
                          height: "100%",
                          minHeight: 48,
                          borderRadius: 5,
                          border: `1px dashed ${AC.line}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.7,
                        }}
                      >
                        <AGlyph name="plus" size={11} color={AC.faint} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      </div>
    </AdminShell>
  );
}
