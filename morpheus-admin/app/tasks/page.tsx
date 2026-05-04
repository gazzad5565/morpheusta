import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { FilterChip, FilterDropdown, CB } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";

const TASKS = [
  { name: "Stock count — back office shelves", cust: "GreenWave Innovations", initials: "GW", color: "#D9493D", frequency: "Every shift", est: "15m", requires: ["Photo"], runs: 124 },
  { name: "Photograph entrance display", cust: "NextGenTech", initials: "NG", color: "#E2A434", frequency: "Daily", est: "5m", requires: ["Photo"], runs: 98 },
  { name: "Inspect cold-storage temp log", cust: "OptimaSolutions", initials: "OS", color: "#2E9C82", frequency: "Every shift", est: "10m", requires: ["Photo", "Signature"], runs: 211 },
  { name: "Refill point-of-sale brochures", cust: "OptimaSolutions", initials: "OS", color: "#2E9C82", frequency: "Weekly", est: "8m", requires: [] as string[], runs: 64 },
  { name: "Verify safety signage in aisle 3", cust: "SiteB Logistics", initials: "SB", color: "#2E4FB8", frequency: "Monthly", est: "12m", requires: ["Photo", "Note"], runs: 18 },
  { name: "Customer feedback form — 5 entries", cust: "Aria Cosmetics", initials: "AC", color: "#8E4ECC", frequency: "Every shift", est: "25m", requires: ["Form"], runs: 156 },
  { name: "Loading-bay sweep & photo", cust: "Highmark Retail", initials: "HM", color: "#1FA971", frequency: "Every shift", est: "6m", requires: ["Photo"], runs: 287 },
  { name: "Replace promotional standee", cust: "Protonix", initials: "PR", color: "#C55A2E", frequency: "Bi-weekly", est: "20m", requires: ["Photo", "Signature"], runs: 28 },
];

export default function TasksPage() {
  return (
    <AdminShell
      breadcrumbs={["Home", "Tasks"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="lib" size="sm">Templates</Btn>
          <Btn icon="plus" kind="primary" size="sm">New task</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FilterChip active>
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· 247</span>
            </FilterChip>
            <FilterChip>Active · 211</FilterChip>
            <FilterChip>Drafts · 8</FilterChip>
            <FilterChip>Archived</FilterChip>
            <div style={{ flex: 1 }} />
            <FilterDropdown label="Customer" value="All" />
            <FilterDropdown label="Frequency" value="Any" />
          </div>
        </Card>

        <Card padding={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "36px 2.4fr 1.4fr 1fr 90px 1fr 90px 36px",
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
            <div>
              <input type="checkbox" style={CB} readOnly />
            </div>
            <div>Task</div>
            <div>Customer</div>
            <div>Frequency</div>
            <div>Est.</div>
            <div>Requires</div>
            <div>Runs (30d)</div>
            <div></div>
          </div>
          {TASKS.map((t, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "36px 2.4fr 1.4fr 1fr 90px 1fr 90px 36px",
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <div>
                <input type="checkbox" style={CB} readOnly />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    background: AC.brandSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AGlyph name="check" size={13} color={AC.brandDeep} />
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {t.name}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: t.color,
                    color: "#fff",
                    fontFamily: AC.font,
                    fontSize: 9,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {t.initials}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.ink2,
                    fontWeight: 500,
                  }}
                >
                  {t.cust}
                </div>
              </div>
              <div
                style={{ fontFamily: AC.font, fontSize: 12, color: AC.ink2, fontWeight: 600 }}
              >
                {t.frequency}
              </div>
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 12,
                  color: AC.ink2,
                  fontWeight: 600,
                }}
              >
                {t.est}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {t.requires.length === 0 && (
                  <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.faint }}>
                    —
                  </span>
                )}
                {t.requires.map((r) => (
                  <span
                    key={r}
                    style={{
                      padding: "1px 6px",
                      borderRadius: 99,
                      background: AC.bg,
                      border: `1px solid ${AC.line}`,
                      color: AC.ink2,
                      fontFamily: AC.font,
                      fontSize: 10.5,
                      fontWeight: 600,
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
              <div
                style={{ fontFamily: AC.font, fontSize: 13, color: AC.ink, fontWeight: 700 }}
              >
                {t.runs}
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
          ))}
        </Card>
      </div>
    </AdminShell>
  );
}
