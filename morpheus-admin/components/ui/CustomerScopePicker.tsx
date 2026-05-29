"use client";

/**
 * Reusable "all / specific / multi" customer picker.
 *
 * Used wherever the admin needs to associate something with one or more
 * customers — task creation, library upload, schedule (when creating a
 * recurring/multi-customer shift), etc.
 *
 * Returns:
 *   value === null  → "all customers" (universal)
 *   value === []    → none picked yet (treated as invalid by callers)
 *   value === [...] → these specific customer ids
 *
 * Layout: two big buttons (All / Specific) + a checkbox list when
 * "Specific" is chosen. Select all / Clear shortcuts above the list.
 */

import { useEffect, useMemo, useState } from "react";
import { AC } from "@/lib/tokens";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { FilterSelect } from "@/components/ui/Filters";
import { getRegions, getGroups } from "@/lib/settings-store";
import type { Customer } from "@/lib/types";

export type CustomerScope = null | string[];

interface Props {
  customers: Customer[];
  loading?: boolean;
  /** null = "all", string[] = specific ids */
  value: CustomerScope;
  onChange: (next: CustomerScope) => void;
  /** Hide the "All customers" option (e.g. when "all" doesn't make sense). */
  allowAll?: boolean;
  /** Override the labels shown on the two scope buttons. */
  allLabel?: string;
  allSubLabel?: string;
  specificLabel?: string;
  specificSubLabel?: string;
}

export function CustomerScopePicker({
  customers,
  loading,
  value,
  onChange,
  allowAll = true,
  allLabel = "All customers",
  allSubLabel = "Universal",
  specificLabel = "Specific customers",
  specificSubLabel = "Pick one or many",
}: Props) {
  const isAll = value === null;
  const selectedIds = useMemo(
    () => new Set(Array.isArray(value) ? value : []),
    [value]
  );
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.initials.toLowerCase().includes(q) ||
        String(c.code).includes(q) ||
        (c.region?.toLowerCase().includes(q) ?? false) ||
        (c.address?.toLowerCase().includes(q) ?? false)
    );
  }, [customers, search]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  // "Select all" should mean "select everything I can currently see" so a
  // search-filtered list lets the manager bulk-pick a region without
  // dragging in unrelated customers. Falls back to the full list when
  // the search box is empty.
  const selectAll = () => {
    const ids = visible.length > 0 ? visible.map((c) => c.id) : customers.map((c) => c.id);
    const merged = new Set([...selectedIds, ...ids]);
    onChange(Array.from(merged));
  };
  const clearAll = () => onChange([]);

  // ── Quick-add by region / group (May 28) ────────────────────────
  // Gary: "select by their group or region wherever you pick a
  // customer." These dropdowns bulk-add every customer in the chosen
  // region / group to the selection. The picker's value stays a list
  // of customer IDs (so callers are unchanged), which means this is a
  // STATIC bulk-select — a future customer added to that region won't
  // auto-join.
  //
  // Options come from the Site settings VOCABULARY (getRegions /
  // getGroups), NOT from distinct values on customer rows — Gary
  // (May 28): the dropdown must show what the manager defined in Site
  // settings, never a stale legacy value. Empty vocab → the quick-add
  // row hides itself (nudging the manager to define regions/groups
  // first).
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRegions(), getGroups()]).then(([r, g]) => {
      if (cancelled) return;
      setRegionOptions(r);
      setGroupOptions(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addMatching = (predicate: (c: Customer) => boolean) => {
    const ids = customers.filter(predicate).map((c) => c.id);
    onChange(Array.from(new Set([...selectedIds, ...ids])));
  };

  return (
    <div>
      {allowAll && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <ScopeButton
            active={isAll}
            onClick={() => onChange(null)}
            title={allLabel}
            sub={allSubLabel}
          />
          <ScopeButton
            active={!isAll}
            onClick={() => {
              if (isAll) onChange([]);
            }}
            title={specificLabel}
            sub={specificSubLabel}
          />
        </div>
      )}

      {!isAll && (
        <div
          style={{
            border: `1px solid ${AC.line}`,
            borderRadius: 10,
            background: "#fff",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${AC.lineDim}`,
              background: AC.bg,
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
              }}
            >
              {selectedIds.size} of {customers.length} selected
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={selectAll} style={linkBtn}>
              Select all{search.trim() ? " visible" : ""}
            </button>
            <span style={{ color: AC.faint }}>·</span>
            <button type="button" onClick={clearAll} style={linkBtn}>
              Clear
            </button>
          </div>

          {/* Quick-add by region / group — bulk-selects matching
              customers. Hidden until the tenant has regions/groups
              assigned to customers. */}
          {(regionOptions.length > 0 || groupOptions.length > 0) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderBottom: `1px solid ${AC.lineDim}`,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  color: AC.mute,
                  fontWeight: 600,
                }}
              >
                Quick add:
              </span>
              {regionOptions.length > 0 && (
                <FilterSelect
                  value=""
                  onChange={(region) =>
                    region && addMatching((c) => c.region === region)
                  }
                  allLabel="By region…"
                  title="Add all customers in a region"
                  options={regionOptions.map((r) => ({ value: r, label: r }))}
                />
              )}
              {groupOptions.length > 0 && (
                <FilterSelect
                  value=""
                  onChange={(group) =>
                    group && addMatching((c) => c.customerGroup === group)
                  }
                  allLabel="By group…"
                  title="Add all customers in a group"
                  options={groupOptions.map((g) => ({ value: g, label: g }))}
                />
              )}
            </div>
          )}

          {/* Inline search — same pattern as RepScopePicker. Mirrors the
              search on the customers list page so anywhere a manager
              picks customers the affordance is the same. */}
          {customers.length > 6 && (
            <div
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <input
                type="text"
                placeholder="Filter by name, code, region, or address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  border: `1px solid ${AC.line}`,
                  borderRadius: 8,
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.ink,
                  outline: "none",
                  background: "#fff",
                }}
              />
            </div>
          )}

          {loading ? (
            <Empty text="Loading customers…" />
          ) : customers.length === 0 ? (
            <Empty text="No customers yet. Add one first." />
          ) : visible.length === 0 ? (
            <Empty text={`Nothing matches "${search}".`} />
          ) : (
            visible.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <label
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderBottom: `1px solid ${AC.lineDim}`,
                    cursor: "pointer",
                    background: checked ? AC.brandSoft : "#fff",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                    style={{ width: 16, height: 16, accentColor: AC.brand }}
                  />
                  <CustomerSwatch customer={c} size={22} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: AC.font,
                      fontSize: 13,
                      color: AC.ink,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </span>
                  <span
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11.5,
                      color: AC.mute,
                    }}
                  >
                    #{c.code}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? AC.brandSoft : "#fff",
        border: `1px solid ${active ? AC.brand : AC.line}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 600,
          color: active ? AC.brandInk : AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: active ? AC.brandDeep : AC.mute,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 14,
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.mute,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: AC.font,
  fontSize: 11,
  color: AC.brandDeep,
  fontWeight: 600,
  padding: "2px 4px",
};
