"use client";

/**
 * Reusable "unassigned / specific / multi" rep picker.
 *
 * Same UX as CustomerScopePicker (two scope buttons + checkbox list when
 * "Specific" is chosen, with select-all / clear shortcuts) so the
 * scheduling form feels consistent across the rep + customer dimensions.
 *
 * Returns:
 *   value === null  → "Unassigned (claimable by any rep)" — leaves
 *                     rep_id NULL on the created shifts.
 *   value === []    → none picked yet; callers treat this as invalid.
 *   value === [...] → these specific rep ids. When multiple are picked
 *                     the schedule form creates one shift per rep
 *                     (cartesian product with selected customers + dates).
 *
 * The reps prop should already be sorted to taste (the schedule form
 * sorts role='rep' first, then by display name).
 */

import { useEffect, useMemo, useState } from "react";
import { AC } from "@/lib/tokens";
import { RepAvatar } from "@/components/ui/Avatars";
import { displayName, type Profile } from "@/lib/profiles-store";
import { initialsFromNameOrEmail } from "@/lib/format";
import { getRepTypes, type RepTypeConfig } from "@/lib/settings-store";
import { FilterSelect } from "@/components/ui/Filters";

export type RepScope = null | string[];

interface Props {
  reps: Profile[];
  loading?: boolean;
  /** null = "Unassigned (claimable)", string[] = specific ids */
  value: RepScope;
  onChange: (next: RepScope) => void;
  /** Hide the "Unassigned" option (e.g. when an unassigned shift doesn't make sense). */
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  unassignedSubLabel?: string;
  specificLabel?: string;
  specificSubLabel?: string;
}

export function RepScopePicker({
  reps,
  loading,
  value,
  onChange,
  allowUnassigned = true,
  unassignedLabel = "Unassigned",
  unassignedSubLabel = "Claimable by any rep",
  specificLabel = "Specific reps",
  specificSubLabel = "Pick one or many",
}: Props) {
  const isUnassigned = value === null;
  const selectedIds = useMemo(
    () => new Set(Array.isArray(value) ? value : []),
    [value]
  );
  const [search, setSearch] = useState("");
  // Type-filter drill-down (May 28). Lets the scheduler narrow the
  // rep list by rep_type before picking individuals — e.g. assigning
  // a customer to "all Sales Reps" no longer requires scrolling 30
  // names. Only rep_types live here; manager_types aren't relevant
  // since shifts are claimed/done by reps, not managers.
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [repTypes, setRepTypes] = useState<RepTypeConfig[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getRepTypes().then((rs) => {
      if (!cancelled) setRepTypes(rs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    let out = reps;
    if (typeFilter) {
      const want = typeFilter.toLowerCase();
      out = out.filter((r) => (r.rep_type || "").toLowerCase() === want);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q) ||
          (r.rep_type || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [reps, search, typeFilter]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const selectAll = () => onChange(reps.map((r) => r.id));
  const clearAll = () => onChange([]);

  return (
    <div>
      {allowUnassigned && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <ScopeButton
            active={isUnassigned}
            onClick={() => onChange(null)}
            title={unassignedLabel}
            sub={unassignedSubLabel}
          />
          <ScopeButton
            active={!isUnassigned}
            onClick={() => {
              if (isUnassigned) onChange([]);
            }}
            title={specificLabel}
            sub={specificSubLabel}
          />
        </div>
      )}

      {!isUnassigned && (
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
              {selectedIds.size} of {reps.length} selected
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

          {/* Type-filter drill-down (May 28). Lets the scheduler
              narrow by rep_type before picking individuals + offers
              a one-tap "Add all matching" shortcut so assigning to
              "every Sales Rep" isn't a wall of checkbox taps. */}
          {repTypes.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <FilterSelect
                value={typeFilter}
                onChange={setTypeFilter}
                allLabel="All rep types"
                title="Narrow by rep type"
                options={repTypes.map((t) => ({ value: t.name, label: t.name }))}
              />
              <div style={{ flex: 1 }} />
              {typeFilter && visible.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Union current selection with everyone matching
                    // the filter — additive, doesn't blow away the
                    // selection if the scheduler had already ticked
                    // a few people manually.
                    const next = new Set(selectedIds);
                    for (const r of visible) next.add(r.id);
                    onChange(Array.from(next));
                  }}
                  title={`Add all ${visible.length} matching reps`}
                  style={{
                    padding: "7px 11px",
                    borderRadius: 8,
                    border: `1px solid ${AC.brand}`,
                    background: AC.brandSoft,
                    color: AC.brandDeep,
                    fontFamily: AC.font,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add all ({visible.length})
                </button>
              )}
            </div>
          )}

          {/* Inline search — useful once you have 20+ reps */}
          {reps.length > 6 && (
            <div
              style={{
                padding: "8px 12px",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <input
                type="text"
                placeholder="Filter by name, email, or role…"
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
            <Empty text="Loading reps…" />
          ) : reps.length === 0 ? (
            <Empty text="No reps yet. Reps appear here once they create an account on the mobile app." />
          ) : visible.length === 0 ? (
            <Empty text={`Nothing matches "${search}".`} />
          ) : (
            visible.map((r) => {
              const checked = selectedIds.has(r.id);
              const initials = initialsFromNameOrEmail(r.name, r.email);
              return (
                <label
                  key={r.id}
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
                    onChange={() => toggle(r.id)}
                    style={{ width: 16, height: 16, accentColor: AC.brand }}
                  />
                  <RepAvatar rep={{ initials }} size={26} seed={r.id} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 13,
                        color: AC.ink,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        letterSpacing: -0.1,
                      }}
                    >
                      {displayName(r)}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        color: AC.mute,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: 1,
                      }}
                    >
                      {r.email}
                      {r.role !== "rep" ? ` · ${r.role}` : ""}
                      {r.role === "rep" && r.rep_type
                        ? ` · ${r.rep_type}`
                        : ""}
                    </div>
                  </div>
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
