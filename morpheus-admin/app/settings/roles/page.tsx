"use client";

/**
 * /settings/roles — manager + rep type vocabularies in one place.
 *
 * Two tabs:
 *   - Manager types  — canManageSettings, canScheduleShifts
 *                       (light-touch RBAC v1, May 28)
 *   - Rep types      — canCreateCustomers (existing May 27 vocab)
 *
 * Gated by canManageSettings — only managers whose type grants
 * Settings access can edit roles. Self-demote protection lives on
 * /settings/managers/[id]/edit's assignment dropdown (commit 3).
 *
 * Lenient defaults at every check site mean uncategorised managers
 * (the post-migration state for every existing manager) all start
 * with full access — see DESIGN.md §12.
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { RequireCapability } from "@/components/ui/RequireCapability";
import { useManagerCapabilities } from "@/lib/manager-capabilities-context";
import {
  getRepTypes,
  type ManagerTypeConfig,
  type RepTypeConfig,
} from "@/lib/settings-store";
import { ManagerTypesEditor } from "@/components/users/ManagerTypesEditor";
import { RepTypesEditor } from "@/components/users/RepTypesEditor";
import { AC } from "@/lib/tokens";

type TabId = "managers" | "reps";

export default function RolesPage() {
  return (
    <SettingsShell
      section="roles"
      title="Roles & permissions"
      description="Manager + rep type vocabularies. Categorise users and gate what each type can do."
    >
      <RequireCapability
        cap="canManageSettings"
        action="edit roles & permissions"
      >
        <RolesContent />
      </RequireCapability>
    </SettingsShell>
  );
}

function RolesContent() {
  const { profile, managerTypes, refresh: refreshCaps } =
    useManagerCapabilities();
  const [tab, setTab] = useState<TabId>("managers");

  // Manager types are already in the capabilities context — we just
  // mirror them into local state so child editor's "current" stays
  // in sync after a save without a full page round-trip.
  const [managerList, setManagerList] = useState<ManagerTypeConfig[]>(
    managerTypes
  );
  useEffect(() => {
    setManagerList(managerTypes);
  }, [managerTypes]);

  // Rep types live in a separate vocab — fetch on mount.
  const [repList, setRepList] = useState<RepTypeConfig[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRepTypes().then((list) => {
      if (!cancelled) setRepList(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: 14 }}>
        <TabPill
          active={tab === "managers"}
          label="Manager types"
          sublabel={`${managerList.length} ${managerList.length === 1 ? "type" : "types"}`}
          onClick={() => setTab("managers")}
        />
        <TabPill
          active={tab === "reps"}
          label="Rep types"
          sublabel={
            repList === null
              ? "…"
              : `${repList.length} ${repList.length === 1 ? "type" : "types"}`
          }
          onClick={() => setTab("reps")}
        />
      </div>

      <Card padding={22}>
        {tab === "managers" ? (
          <ManagerTypesEditor
            current={managerList}
            ownManagerType={profile?.manager_type ?? null}
            onSaved={(next) => {
              setManagerList(next);
              // Re-fetch the capability set so any cap toggle on the
              // current user's row takes effect immediately (e.g. they
              // just turned ScheduleShifts off on their own type).
              void refreshCaps();
            }}
          />
        ) : repList === null ? (
          <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
            Loading rep types…
          </div>
        ) : (
          <RepTypesEditor
            current={repList}
            onSaved={(next) => setRepList(next)}
          />
        )}
      </Card>
    </div>
  );
}

function TabPill({
  active,
  label,
  sublabel,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 14px",
        background: active ? AC.card : "transparent",
        border: `1px solid ${active ? AC.line : "transparent"}`,
        borderBottom: active ? `1px solid ${AC.card}` : `1px solid ${AC.line}`,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: AC.font,
        position: "relative",
        top: 1,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: active ? AC.ink : AC.mute,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: AC.mute,
          marginTop: 2,
        }}
      >
        {sublabel}
      </div>
    </button>
  );
}
