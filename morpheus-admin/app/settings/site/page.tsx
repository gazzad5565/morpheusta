"use client";

/**
 * /settings/site — "Site settings": the site-wide taxonomies +
 * field definitions, each in its own tab. Separate from
 * /settings/organisation (org identity — name, logo, contact),
 * which Gary wants kept as its own rail entry (May 28).
 *
 * Tabs:
 *   - Customer regions  (app_settings.regions)
 *   - Customer groups   (app_settings.groups)
 *   - Store types       (app_settings.store_types)
 *   - Custom fields     (custom-field definitions across entities)
 *
 * Future site-wide defaults (currency, date format, …) slot in as
 * new tabs here — no new rail entry needed.
 */

import { useEffect, useState } from "react";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { StringListEditor } from "@/components/users/StringListEditor";
import { CustomFieldsManager } from "@/components/settings/CustomFieldsManager";
import {
  getRegions,
  setRegions,
  getGroups,
  setGroups,
  getStoreTypes,
  setStoreTypes,
} from "@/lib/settings-store";
import { AC } from "@/lib/tokens";

type Tab = "regions" | "groups" | "store-types" | "custom-fields";

export default function SiteSettingsPage() {
  const [tab, setTab] = useState<Tab>("regions");
  // Deep-link support (e.g. /settings/custom-fields redirect lands
  // here with ?tab=custom-fields). Read via window to dodge the
  // useSearchParams Suspense requirement on this client page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (
      t === "regions" ||
      t === "groups" ||
      t === "store-types" ||
      t === "custom-fields"
    ) {
      setTab(t);
    }
  }, []);

  // Vocab state — null = loading (StringListEditor needs a non-null
  // array).
  const [regions, setRegionsState] = useState<string[] | null>(null);
  const [groups, setGroupsState] = useState<string[] | null>(null);
  const [storeTypes, setStoreTypesState] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRegions(), getGroups(), getStoreTypes()]).then(
      ([r, g, s]) => {
        if (cancelled) return;
        setRegionsState(r);
        setGroupsState(g);
        setStoreTypesState(s);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsShell
      section="site"
      title="Site settings"
      description="Site-wide taxonomies + field definitions: customer regions, customer groups, store types, and custom fields. Each in its own tab."
    >
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 18,
          borderBottom: `1px solid ${AC.line}`,
          maxWidth: 760,
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "regions" as const, label: "Customer regions" },
          { id: "groups" as const, label: "Customer groups" },
          { id: "store-types" as const, label: "Store types" },
          { id: "custom-fields" as const, label: "Custom fields" },
        ].map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px",
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? AC.brandDeep : "transparent",
                cursor: "pointer",
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? AC.brandInk : AC.mute,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "regions" && (
        <div style={{ maxWidth: 760 }}>
          {regions === null ? (
            <Loading label="Loading customer regions…" />
          ) : (
            <StringListEditor
              current={regions}
              noun="customer region"
              hint="Geographic regions you assign customers to (e.g. Gauteng, Western Cape, KZN). Drives the Customer region filter on /customers."
              addPlaceholder="e.g. Gauteng, Western Cape, KZN…"
              onSave={setRegions}
              onSaved={(next) => setRegionsState(next)}
            />
          )}
        </div>
      )}

      {tab === "groups" && (
        <div style={{ maxWidth: 760 }}>
          {groups === null ? (
            <Loading label="Loading customer groups…" />
          ) : (
            <StringListEditor
              current={groups}
              noun="customer group"
              hint="Customer cohorts / segments (e.g. 'Premium', 'Spaza', 'Wholesale'). Drives the Customer group filter on /customers."
              addPlaceholder="e.g. Premium, Spaza, Wholesale…"
              onSave={setGroups}
              onSaved={(next) => setGroupsState(next)}
            />
          )}
        </div>
      )}

      {tab === "store-types" && (
        <div style={{ maxWidth: 760 }}>
          {storeTypes === null ? (
            <Loading label="Loading store types…" />
          ) : (
            <StringListEditor
              current={storeTypes}
              noun="store type"
              hint="How you classify a customer's outlet (e.g. 'Supermarket', 'Spaza', 'Pharmacy', 'Wholesale'). Shows on the customer header + drives the Store type filter on /customers."
              addPlaceholder="e.g. Supermarket, Spaza, Pharmacy…"
              onSave={setStoreTypes}
              onSaved={(next) => setStoreTypesState(next)}
            />
          )}
        </div>
      )}

      {tab === "custom-fields" && (
        <div style={{ maxWidth: 760 }}>
          <CustomFieldsManager />
        </div>
      )}
    </SettingsShell>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>{label}</div>
  );
}
