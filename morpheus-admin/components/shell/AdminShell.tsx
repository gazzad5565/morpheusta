import * as React from "react";
import { AC } from "@/lib/tokens";
import { Sidebar } from "./Sidebar";
import { TopBar, type Crumb } from "./TopBar";

interface Props {
  title?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  search?: boolean;
  children: React.ReactNode;
}

export function AdminShell({ title, breadcrumbs, actions, search, children }: Props) {
  return (
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
  );
}
