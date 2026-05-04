import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { FilterChip, FilterDropdown } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";

const EVENTS = [
  { ts: "13 May · 09:14", actor: "Sasha Whittle", action: "Approved off-site check-in", target: "Ruth Imani · Highmark Retail", kind: "approve" as const },
  { ts: "13 May · 09:02", actor: "System", action: "Flagged off-site check-in", target: "Ruth Imani · 380m outside geofence", kind: "flag" as const },
  { ts: "13 May · 08:42", actor: "System", action: "Late return from break", target: "Zara Bloom · Aria Cosmetics · 12 min", kind: "flag" as const },
  { ts: "13 May · 08:21", actor: "Marcus Lin", action: "Edited shift task list", target: "Shift #4821 · added \"stock count\"", kind: "edit" as const },
  { ts: "13 May · 08:18", actor: "Sasha Whittle", action: "Reassigned shift", target: "Shift #4838 · Ortiz → Park", kind: "edit" as const },
  { ts: "13 May · 07:55", actor: "Priya Achebe", action: "Started travelling", target: "NextGenTech", kind: "check" as const },
  { ts: "12 May · 17:32", actor: "Sasha Whittle", action: "Updated geofence radius", target: "GreenWave HQ · 50m → 75m", kind: "edit" as const },
  { ts: "12 May · 16:08", actor: "Devon Ortiz", action: "Submitted time-off request", target: "20–24 May · vacation", kind: "request" as const },
  { ts: "12 May · 14:55", actor: "System", action: "Sent broadcast", target: "\"Site closed early — Aria HQ\" → 31 reps", kind: "send" as const },
  { ts: "12 May · 11:11", actor: "Sasha Whittle", action: "Created customer", target: "Protonix Holdings · #1101", kind: "create" as const },
  { ts: "12 May · 09:30", actor: "Anika Felder", action: "Completed shift", target: "Aria Cosmetics · 4/5 tasks · 8m over", kind: "check" as const },
  { ts: "11 May · 19:02", actor: "Sasha Whittle", action: "Exported report", target: "Hours by customer · April 2025", kind: "export" as const },
];

type Kind = (typeof EVENTS)[number]["kind"];

const KIND_MAP: Record<Kind, { color: string; icon: GlyphName }> = {
  approve: { color: AC.ok, icon: "check" },
  flag: { color: AC.danger, icon: "warn" },
  edit: { color: AC.brand, icon: "edit" },
  check: { color: AC.brand, icon: "pin" },
  request: { color: "#5447BD", icon: "cal" },
  send: { color: AC.warn, icon: "send" },
  create: { color: AC.ok, icon: "plus" },
  export: { color: AC.mute, icon: "download" },
};

export default function AuditPage() {
  return (
    <AdminShell
      breadcrumbs={["Home", "Audit log"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="filter" size="sm">Filter</Btn>
          <Btn icon="download" size="sm">Export CSV</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FilterChip active>All events</FilterChip>
            <FilterChip>Approvals</FilterChip>
            <FilterChip>Flags · 8</FilterChip>
            <FilterChip>Edits</FilterChip>
            <FilterChip>System</FilterChip>
            <div style={{ flex: 1 }} />
            <FilterDropdown label="Actor" value="Anyone" />
            <FilterDropdown label="Range" value="Last 7 days" />
          </div>
        </Card>

        <Card padding={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 36px 1.4fr 2fr 2fr 36px",
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
            <div>When</div>
            <div></div>
            <div>Actor</div>
            <div>Action</div>
            <div>Target</div>
            <div></div>
          </div>
          {EVENTS.map((e, i) => {
            const k = KIND_MAP[e.kind];
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 36px 1.4fr 2fr 2fr 36px",
                  gap: 14,
                  alignItems: "center",
                  padding: "11px 16px",
                  borderBottom: `1px solid ${AC.lineDim}`,
                }}
              >
                <div
                  style={{
                    fontFamily: AC.fontMono,
                    fontSize: 11.5,
                    color: AC.mute,
                    fontWeight: 600,
                  }}
                >
                  {e.ts}
                </div>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: `${k.color}1A`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AGlyph name={k.icon} size={12} color={k.color} />
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.ink,
                    fontWeight: 600,
                    letterSpacing: -0.1,
                  }}
                >
                  {e.actor}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.ink2,
                    fontWeight: 500,
                  }}
                >
                  {e.action}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.mute,
                    fontWeight: 500,
                  }}
                >
                  {e.target}
                </div>
                <button
                  type="button"
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
              </div>
            );
          })}
        </Card>
      </div>
    </AdminShell>
  );
}
