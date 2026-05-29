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
  getDateFormat,
  setDateFormat,
} from "@/lib/settings-store";
import { formatDateAs, todayLocalISO, type DateFormat } from "@/lib/format";
import { AC } from "@/lib/tokens";

type Tab =
  | "regions"
  | "groups"
  | "store-types"
  | "custom-fields"
  | "date-format";

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
      t === "custom-fields" ||
      t === "date-format"
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
          { id: "date-format" as const, label: "Date format" },
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

      {tab === "date-format" && (
        <div style={{ maxWidth: 760 }}>
          <DateFormatEditor />
        </div>
      )}
    </SettingsShell>
  );
}

/**
 * Date format picker (G15). Org-wide preference for how numeric dates
 * render across the admin + reports. Each option previews today's date
 * live. "Automatic" keeps the browser-locale textual format. Saving
 * takes effect immediately in the cache; already-open pages pick it up
 * on their next navigation / re-render.
 */
function DateFormatEditor() {
  const [value, setValue] = useState<DateFormat | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getDateFormat().then((f) => {
      if (!cancelled) setValue(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (value === null) return <Loading label="Loading date format…" />;

  const today = todayLocalISO();
  const OPTIONS: { id: DateFormat; label: string; sub: string }[] = [
    { id: "auto", label: "Automatic", sub: "Follows the viewer's browser locale" },
    { id: "DMY", label: "Day / Month / Year", sub: "Numeric — e.g. 31/12/2026" },
    { id: "MDY", label: "Month / Day / Year", sub: "Numeric — e.g. 12/31/2026" },
    { id: "ISO", label: "ISO 8601", sub: "Numeric — e.g. 2026-12-31" },
  ];

  const choose = async (f: DateFormat) => {
    if (f === value || saving) return;
    const prev = value;
    setValue(f); // optimistic: preview + selection update instantly
    setSaving(true);
    const r = await setDateFormat(f);
    setSaving(false);
    if (!r.ok) setValue(prev); // revert on failure (setter already toasted)
  };

  return (
    <div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          color: AC.mute,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        How dates display across the admin console and reports. Times and
        the schedule calendar are unaffected. Each option previews
        today&rsquo;s date.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {OPTIONS.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: active ? AC.brandSoft : "#fff",
                border: `1px solid ${active ? AC.brandDeep : AC.line}`,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 99,
                  border: `2px solid ${active ? AC.brandDeep : AC.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {active && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: AC.brandDeep,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: active ? AC.brandInk : AC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {o.label}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                    marginTop: 2,
                  }}
                >
                  {o.sub}
                </div>
              </div>
              <div
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                  fontWeight: 700,
                  color: active ? AC.brandDeep : AC.ink2,
                  whiteSpace: "nowrap",
                }}
              >
                {formatDateAs(today, o.id)}
              </div>
            </button>
          );
        })}
      </div>
      {saving && (
        <div
          style={{
            marginTop: 10,
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
          }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>{label}</div>
  );
}
