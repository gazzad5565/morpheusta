import * as React from "react";
import { AC } from "@/lib/tokens";
import { Sidebar } from "./Sidebar";
import { TopBar, type Crumb } from "./TopBar";
import { NeedsActionProvider } from "@/lib/needs-action-context";
import { ManagerCapabilitiesProvider } from "@/lib/manager-capabilities-context";

interface Props {
  title?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  search?: boolean;
  children: React.ReactNode;
}

export function AdminShell({ title, breadcrumbs, actions, search, children }: Props) {
  return (
    // Two shell-level providers:
    //   - NeedsActionProvider: one shared subscription + state for
    //     the sidebar badge, LiveFeedPanel "Needs action" tab, and
    //     the ShiftsList "Needs action" filter. Replaces three
    //     independent copies that drifted on realtime DELETE events
    //     (Gary saw "2 / 1 / 0" on the same screen). See
    //     lib/needs-action-context.tsx.
    //   - ManagerCapabilitiesProvider: one shared load of the current
    //     manager's profile + manager_types vocab so every page can
    //     check `has(cap)` cheaply. Backs the <RequireCapability>
    //     wrapper used to gate /settings/* and /schedule/* etc.
    //     Added May 28 — light-touch RBAC v1.
    <ManagerCapabilitiesProvider>
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
    </ManagerCapabilitiesProvider>
  );
}
