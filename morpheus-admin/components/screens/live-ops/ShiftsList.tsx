import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar, CustomerSwatch } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { TODAYS_SHIFTS, getRep, getCustomer } from "@/lib/mock-data";
import type { Shift, Rep, Customer } from "@/lib/types";
import type { CSSProperties } from "react";

interface Row extends Shift {
  rep: Rep | undefined;
  customer: Customer | undefined;
}

const STATE_MAP: Record<string, { label: string; bg: string; ink: string; dot: string }> = {
  "in-progress": { label: "In progress", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
  travelling: { label: "Travelling", bg: AC.warnTint, ink: "#7A560A", dot: AC.warn },
  "on-break": { label: "On break", bg: "#E6E9F8", ink: "#241B5A", dot: "#5447BD" },
  late: { label: "Late · 18m", bg: AC.dangerTint, ink: "#6E1430", dot: AC.danger },
  unassigned: { label: "Unassigned", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  scheduled: { label: "Scheduled", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  complete: { label: "Complete", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
};

export function ShiftsList() {
  const rows: Row[] = TODAYS_SHIFTS.map((s) => ({
    ...s,
    rep: getRep(s.repId),
    customer: getCustomer(s.customerId),
  }));

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
          {rows.length}
        </span>
        <div style={{ flex: 1 }} />
        <SegTabs
          tabs={["All", "In progress", "Travelling", "On break", "Issues", "Unassigned"]}
          active="All"
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
        <ShiftRow header />
        {rows.map((r) => (
          <ShiftRow key={r.id} row={r} />
        ))}
      </div>
    </Card>
  );
}

function shiftRowGrid(opts?: { header?: boolean }): CSSProperties {
  const header = opts?.header;
  return {
    display: "grid",
    gridTemplateColumns: "4px 1.4fr 1.6fr 110px 130px 110px 110px 36px",
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

function ShiftRow({ row, header }: { row?: Row; header?: boolean }) {
  if (header) {
    return (
      <div style={shiftRowGrid({ header: true })}>
        <div></div>
        <div>Rep</div>
        <div>Customer · site</div>
        <div>Window</div>
        <div>State</div>
        <div>Tasks</div>
        <div>Check-in</div>
        <div></div>
      </div>
    );
  }
  if (!row) return null;
  const state = STATE_MAP[row.state] || STATE_MAP.scheduled;

  return (
    <div style={shiftRowGrid()}>
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
        {row.rep ? (
          <>
            <RepAvatar rep={row.rep} size={28} />
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
                {row.rep.name}
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
                {row.rep.region}
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
              Assign rep
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        {row.customer && <CustomerSwatch customer={row.customer} size={26} />}
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
            {row.customer?.name}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
            {row.customer?.code} · Site A
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
        {row.start}
        <span style={{ color: AC.faint, padding: "0 2px" }}>—</span>
        {row.end}
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

      <TaskBar done={row.tasksDone} total={row.tasksTotal} />

      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: row.late ? AC.danger : row.checkedIn ? AC.ink2 : AC.mute,
          fontWeight: 600,
        }}
      >
        {row.checkedIn || (row.state === "late" ? "No check-in" : "—")}
        {row.offsite && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 6,
              padding: "1px 6px",
              borderRadius: 99,
              background: AC.dangerTint,
              color: AC.danger,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.2,
            }}
          >
            OFF-SITE
          </span>
        )}
      </div>

      <button
        type="button"
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
    </div>
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
