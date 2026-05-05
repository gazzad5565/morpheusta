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

import { useMemo } from "react";
import { AC } from "@/lib/tokens";
import { CustomerSwatch } from "@/components/ui/Avatars";
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

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const selectAll = () => onChange(customers.map((c) => c.id));
  const clearAll = () => onChange([]);

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
            maxHeight: 240,
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
              Select all
            </button>
            <span style={{ color: AC.faint }}>·</span>
            <button type="button" onClick={clearAll} style={linkBtn}>
              Clear
            </button>
          </div>

          {loading ? (
            <Empty text="Loading customers…" />
          ) : customers.length === 0 ? (
            <Empty text="No customers yet. Add one first." />
          ) : (
            customers.map((c) => {
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
