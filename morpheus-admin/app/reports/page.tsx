import { AdminShell } from "@/components/shell/AdminShell";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

/**
 * /reports — placeholder. The previous version rendered mock KPIs and a
 * top-performers table seeded from /lib/mock-data. Now that every other
 * surface in the app reads from Supabase, the mocks have been removed.
 *
 * When this page is built out, source from:
 *   - shifts (counts, on-time %, completion %)
 *   - shift_events (timeline / activity)
 *   - shift_task_completions (per-rep task throughput)
 */
export default function ReportsPage() {
  return (
    <AdminShell breadcrumbs={["Home", "Reports"]}>
      <div style={{ padding: 20 }}>
        <Card padding={36}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: AC.brandSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <AGlyph name="chart" size={26} color={AC.brandDeep} />
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 17,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.3,
              }}
            >
              Reports — coming soon
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                marginTop: 8,
                lineHeight: 1.55,
                maxWidth: 520,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Hours logged, on-time %, shift completion %, off-site flags,
              top-performing reps. All sourced from real shift + event data.
              The KPI strip on Live Ops already shows the today snapshot.
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
