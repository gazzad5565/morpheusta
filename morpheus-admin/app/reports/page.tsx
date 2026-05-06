"use client";

import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

/**
 * /reports — hub of available reports. Each tile links to a real
 * data-driven report page underneath. Add a new report:
 *   1. Drop a page at /reports/<slug>/page.tsx
 *   2. Add an entry to REPORTS below.
 */

const REPORTS: {
  slug: string;
  title: string;
  blurb: string;
  glyph: GlyphName;
  tone: string;
  toneInk: string;
}[] = [
  {
    slug: "operations",
    title: "Operations overview",
    blurb:
      "30-day shift completion, on-time rate, exception volume, and customer load. Compares the current period to the previous one.",
    glyph: "chart",
    tone: "#E6F0FA",
    toneInk: "#1F3F66",
  },
  {
    slug: "rep-performance",
    title: "Rep performance",
    blurb:
      "Leaderboard across every rep — shifts worked, on-time rate, tasks completed, exceptions. Sortable, period-over-period deltas.",
    glyph: "reps",
    tone: AC.brandSoft,
    toneInk: AC.brandDeep,
  },
  {
    slug: "timesheet",
    title: "Timesheet",
    blurb:
      "Payroll-grade hours per rep per shift, computed from real check-in / check-out timestamps. Filter by rep, sort any column, export to CSV.",
    glyph: "clock",
    tone: "#FEF3D6",
    toneInk: "#7A560A",
  },
];

export default function ReportsHubPage() {
  return (
    <AdminShell breadcrumbs={["Home", "Reports"]}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 22,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.4,
            }}
          >
            Reports
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.mute,
              marginTop: 4,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Pick a report to dig in. Every number on every report comes
            from the live database — no caches, no rollup tables. Reload
            the page to refresh.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {REPORTS.map((r) => (
            <Link
              key={r.slug}
              href={`/reports/${r.slug}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card padding={20} style={{ height: "100%" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: r.tone,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <AGlyph name={r.glyph} size={22} color={r.toneInk} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 16,
                          fontWeight: 700,
                          color: AC.ink,
                          letterSpacing: -0.3,
                        }}
                      >
                        {r.title}
                      </div>
                      <AGlyph name="chev-r" size={14} color={AC.mute} />
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: AC.mute,
                        marginTop: 4,
                        lineHeight: 1.55,
                      }}
                    >
                      {r.blurb}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
