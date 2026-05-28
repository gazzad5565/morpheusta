"use client";

/**
 * Route-level capability gate. Wrap a page's content in this component
 * to render a polite "you don't have permission" block screen when
 * the current manager's manager_type doesn't grant the named
 * capability.
 *
 * Lenient while loading — renders nothing until the capabilities
 * context settles. Avoids flashing the block screen for users who
 * actually do have access.
 *
 * Usage:
 *   <AdminShell>
 *     <RequireCapability cap="canManageSettings" action="open Settings">
 *       <SettingsPage />
 *     </RequireCapability>
 *   </AdminShell>
 *
 * Same posture as `canCreateCustomers` on mobile — see DESIGN.md §12.
 */

import * as React from "react";
import { Card } from "./Card";
import { AGlyph } from "./AGlyph";
import { useManagerCapabilities } from "@/lib/manager-capabilities-context";
import type { ManagerCapability } from "@/lib/settings-store";
import { AC } from "@/lib/tokens";

const CAPABILITY_LABEL: Record<ManagerCapability, string> = {
  canManageSettings:
    "Settings (Roles & permissions, organisation, check-in rules, imports, …)",
  canScheduleShifts:
    "Scheduling shifts + approving requests",
};

interface Props {
  cap: ManagerCapability;
  /** Optional verb phrase for the block screen heading — defaults to
   *  "open this section". Examples: "open Settings", "schedule a
   *  shift", "approve this request". */
  action?: string;
  children: React.ReactNode;
}

export function RequireCapability({ cap, action, children }: Props) {
  const { has, loading } = useManagerCapabilities();
  if (loading) {
    // Don't flash a block screen for a real Owner during the initial
    // capability load. AdminShell's own LoadingBar covers the
    // page-level loading state.
    return null;
  }
  if (has(cap)) {
    return <>{children}</>;
  }
  return <BlockScreen cap={cap} action={action} />;
}

function BlockScreen({
  cap,
  action,
}: {
  cap: ManagerCapability;
  action?: string;
}) {
  return (
    <div
      style={{
        padding: 40,
        maxWidth: 560,
        margin: "0 auto",
        fontFamily: AC.font,
      }}
    >
      <Card padding={28}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: AC.warnTint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="lock" size={20} color="#8E5A0E" />
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.1,
            }}
          >
            You don&apos;t have permission to {action || "open this section"}.
          </div>
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: AC.ink3,
            lineHeight: 1.55,
            marginBottom: 12,
          }}
        >
          Your account&apos;s manager type doesn&apos;t include{" "}
          <b>{CAPABILITY_LABEL[cap]}</b>.
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: AC.mute,
            lineHeight: 1.55,
          }}
        >
          Ask another manager with full access to update your type in{" "}
          <b>Settings → Roles &amp; permissions</b>, or to change the capability
          set on the type you&apos;re currently assigned to.
        </div>
      </Card>
    </div>
  );
}
