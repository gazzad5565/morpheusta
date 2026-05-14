import * as React from "react";
import { AC } from "@/lib/tokens";
import { Sidebar } from "./Sidebar";
import { TopBar, type Crumb } from "./TopBar";
import { NeedsActionProvider } from "@/lib/needs-action-context";

interface Props {
  title?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  search?: boolean;
  children: React.ReactNode;
}

export function AdminShell({ title, breadcrumbs, actions, search, children }: Props) {
  return (
    // NeedsActionProvider lives at the shell level so the sidebar
    // badge, the LiveFeedPanel "Needs action" tab, and the
    // ShiftsList "Needs action" filter all read from one shared
    // subscription + one shared state. Replaces three independent
    // copies of the same data that drifted out of sync after
    // realtime DELETE events (Gary saw "2 / 1 / 0" on the same
    // screen). See lib/needs-action-context.tsx for the rationale.
    <NeedsActionProvider>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          background: AC.bg,
          fontFamily: AC.font,
          color: AC.ink,
          overflow: "hidden",
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TopBar title={title} breadcrumbs={breadcrumbs} actions={actions} search={search} />
          <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
        </div>
      </div>
    </NeedsActionProvider>
  );
}
