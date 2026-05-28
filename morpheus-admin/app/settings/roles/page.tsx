"use client";

/**
 * /settings/roles — manager + rep type vocabularies + tag vocabs
 * (regions, groups) in one place.
 *
 * Four tabs:
 *   - Manager types  — canManageSettings, canScheduleShifts
 *                       (light-touch RBAC v1, May 28)
 *   - Rep types      — canCreateCustomers (existing May 27 vocab)
 *   - Regions        — plain string tags (Mariska G2, May 28)
 *   - Groups         — plain string tags (Mariska G2, May 28)
 *
 * Regions + Groups are tags without per-tag capabilities — they
 * drive filters and audience pickers but don't gate anything. The
 * StringListEditor handles both.
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
  getRegions,
  getGroups,
  setRegions,
  setGroups,
  type ManagerTypeConfig,
  type RepTypeConfig,
} from "@/lib/settings-store";
import { ManagerTypesEditor } from "@/components/users/ManagerTypesEditor";
import { RepTypesEditor } from "@/components/users/RepTypesEditor";
import { StringListEditor } from "@/components/users/StringListEditor";
import { AC } from "@/lib/tokens";

type TabId = "managers" | "reps" | "regions" | "groups";

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

  // Rep types + regions + groups — three separate vocabs, fetched
  // once on mount. Each is null until loaded so the tab can show
  // "…" instead of "0" before the network round-trip resolves.
  const [repList, setRepList] = useState<RepTypeConfig[] | null>(null);
  const [regions, setRegionsState] = useState<string[] | null>(null);
  const [groups, setGroupsState] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRepTypes(), getRegions(), getGroups()]).then(
      ([r, rg, gr]) => {
        if (cancelled) return;
        setRepList(r);
        setRegionsState(rg);
        setGroupsState(gr);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Small helper to render the count sublabel for a vocab tab — "…"
  // while loading, "N type(s)" / "N tag(s)" once loaded.
  const countLabel = (
    list: { length: number } | null,
    singular: string,
    plural: string
  ): string => {
    if (list === null) return "…";
    return `${list.length} ${list.length === 1 ? singular : plural}`;
  };

  return (
    <div style={{ padding: 20, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: 14, flexWrap: "wrap" }}>
        <TabPill
          active={tab === "managers"}
          label="Manager types"
          sublabel={countLabel(managerList, "type", "types")}
          onClick={() => setTab("managers")}
        />
        <TabPill
          active={tab === "reps"}
          label="Rep types"
          sublabel={countLabel(repList, "type", "types")}
          onClick={() => setTab("reps")}
        />
        <TabPill
          active={tab === "regions"}
          label="Regions"
          sublabel={countLabel(regions, "region", "regions")}
          onClick={() => setTab("regions")}
        />
        <TabPill
          active={tab === "groups"}
          label="Groups"
          sublabel={countLabel(groups, "group", "groups")}
          onClick={() => setTab("groups")}
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
        ) : tab === "reps" ? (
          repList === null ? (
            <Loading label="Loading rep types…" />
          ) : (
            <RepTypesEditor
              current={repList}
              onSaved={(next) => setRepList(next)}
            />
          )
        ) : tab === "regions" ? (
          regions === null ? (
            <Loading label="Loading regions…" />
          ) : (
            <StringListEditor
              current={regions}
              noun="region"
              hint="Drives the Region filter on /reps and audience targeting on /notify. Assign a region to each user via Settings → Users → edit."
              addPlaceholder="e.g. Gauteng, Western Cape, KZN…"
              onSave={setRegions}
              onSaved={(next) => setRegionsState(next)}
            />
          )
        ) : (
          // groups tab
          groups === null ? (
            <Loading label="Loading groups…" />
          ) : (
            <StringListEditor
              current={groups}
              noun="group"
              hint="Work groups / teams (e.g. 'Cape route', 'Bakery merchandisers'). Same surfaces as Regions — list filters + notification audience picker."
              addPlaceholder="e.g. Cape route, Bakery team…"
              onSave={setGroups}
              onSaved={(next) => setGroupsState(next)}
            />
          )
        )}
      </Card>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
      {label}
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
