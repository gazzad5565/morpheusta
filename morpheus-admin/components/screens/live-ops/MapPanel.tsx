"use client";

import dynamic from "next/dynamic";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AC } from "@/lib/tokens";

// MapLibre depends on the browser `window`; skip SSR entirely.
const MapPanelClient = dynamic(
  () => import("./MapPanelClient").then((m) => m.MapPanelClient),
  {
    ssr: false,
    loading: () => (
      <Card padding={0}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${AC.line}`,
          }}
        >
          <SectionTitle>Customer map · live</SectionTitle>
        </div>
        <div
          style={{
            height: 360,
            background: "#F1F4F7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
          }}
        >
          Loading map…
        </div>
      </Card>
    ),
  }
);

export function MapPanel() {
  return <MapPanelClient />;
}
