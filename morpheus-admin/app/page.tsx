import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { KpiStrip } from "@/components/screens/live-ops/KpiStrip";
import { MapPanel } from "@/components/screens/live-ops/MapPanel";
import { LiveFeedPanel } from "@/components/screens/live-ops/LiveFeedPanel";
import { ShiftsList } from "@/components/screens/live-ops/ShiftsList";
import { StaleShiftSweeper } from "@/components/screens/live-ops/StaleShiftSweeper";

export default function LiveOpsPage() {
  return (
    <AdminShell
      title="Live Ops"
      breadcrumbs={["Home", "Live Ops"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="filter" kind="secondary" size="sm">
            Filter
          </Btn>
          <Link href="/schedule/new" style={{ textDecoration: "none" }}>
            <Btn icon="plus" kind="primary" size="sm">
              New shift
            </Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <StaleShiftSweeper />
        <KpiStrip />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <MapPanel />
          <LiveFeedPanel />
        </div>
        <ShiftsList />
      </div>
    </AdminShell>
  );
}
