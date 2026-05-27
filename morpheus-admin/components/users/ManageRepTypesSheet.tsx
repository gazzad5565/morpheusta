"use client";

/**
 * ManageRepTypesSheet — full CRUD modal for the rep-type vocabulary
 * stored in app_settings.rep_types.
 *
 * Shape mirrors ManageCategoriesSheet from /library — same centred
 * modal, name-input rows, add-from-bottom pattern. Difference: each
 * row also has a "Can add customers" checkbox (the first per-type
 * capability flag). Save commits the whole new list to app_settings
 * via setRepTypes().
 *
 * Rows are stable across save (no UUID per row — the name is the
 * identifier). Renaming a type in the vocabulary list does NOT
 * automatically rename it on existing profiles.rep_type rows; those
 * would still hold the old name. A future migration could handle
 * that, but for now the manager owns the rename consequence.
 */

import { useState } from "react";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import { AC } from "@/lib/tokens";
import {
  setRepTypes,
  type RepTypeConfig,
} from "@/lib/settings-store";

export function ManageRepTypesSheet({
  current,
  onClose,
  onSaved,
}: {
  current: RepTypeConfig[];
  onClose: () => void;
  onSaved: (next: RepTypeConfig[]) => void;
}) {
  const [list, setList] = useState<RepTypeConfig[]>(() => [...current]);
  const [newName, setNewName] = useState("");
  const [newCanCreate, setNewCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOne = () => {
    setError(null);
    const name = newName.trim();
    if (!name) return;
    if (list.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already in the list.`);
      return;
    }
    setList([...list, { name, canCreateCustomers: newCanCreate }]);
    setNewName("");
    setNewCanCreate(false);
  };
  const renameAt = (i: number, name: string) => {
    const next = [...list];
    next[i] = { ...next[i], name };
    setList(next);
  };
  const toggleCanCreateAt = (i: number, value: boolean) => {
    const next = [...list];
    next[i] = { ...next[i], canCreateCustomers: value };
    setList(next);
  };
  const removeAt = (i: number) => {
    setList(list.filter((_, j) => j !== i));
  };
  const save = async () => {
    setError(null);
    setBusy(true);
    const r = await setRepTypes(list);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    onSaved(list);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.32)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-label="Manage rep types"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 540,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          background: "#fff",
          border: `1px solid ${AC.line}`,
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(10,15,30,.24)",
          zIndex: 201,
          padding: 22,
          fontFamily: AC.font,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              Rep types
            </div>
            <div style={{ fontSize: 12, color: AC.mute, marginTop: 2 }}>
              Categorise mobile reps so you can filter by type + control which
              types can add customers from the mobile app. Reps with no type
              assigned (or a deleted type) keep all default capabilities.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="x" size={14} color={AC.mute} />
          </button>
        </div>

        {/* Column hints — keeps the row layout readable. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 160px 28px",
            gap: 8,
            padding: "0 8px 6px 8px",
            fontSize: 10.5,
            color: AC.mute,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          <div>Name</div>
          <div>Can add customers?</div>
          <div></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {list.length === 0 ? (
            <div style={{ fontSize: 12.5, color: AC.mute }}>
              No types yet — add at least one below.
            </div>
          ) : (
            list.map((t, i) => (
              <RowEditor
                key={i}
                config={t}
                onRename={(name) => renameAt(i, name)}
                onToggleCanCreate={(v) => toggleCanCreateAt(i, v)}
                onRemove={() => removeAt(i)}
              />
            ))
          )}
        </div>

        {/* Add row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 160px 28px",
            gap: 8,
            alignItems: "center",
            padding: "10px 8px",
            background: AC.brandSoft,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOne();
              }
            }}
            placeholder="New type name (e.g. Driver)"
            style={inputStyle}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: AC.ink2,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={newCanCreate}
              onChange={(e) => setNewCanCreate(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: AC.brand }}
            />
            <span>Can add customers</span>
          </label>
          <button
            type="button"
            onClick={addOne}
            disabled={!newName.trim()}
            title="Add type"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: `1px solid ${newName.trim() ? AC.brandDeep : AC.line}`,
              background: newName.trim() ? AC.brand : "#fff",
              color: newName.trim() ? "#fff" : AC.faint,
              cursor: newName.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="plus" size={14} color={newName.trim() ? "#fff" : AC.faint} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "8px 10px",
              background: AC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 500,
              marginBottom: 10,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn kind="primary" onClick={save} disabled={busy || list.length === 0}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </div>
      </div>
    </>
  );
}

function RowEditor({
  config,
  onRename,
  onToggleCanCreate,
  onRemove,
}: {
  config: RepTypeConfig;
  onRename: (name: string) => void;
  onToggleCanCreate: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 160px 28px",
        gap: 8,
        alignItems: "center",
        padding: "6px 8px",
        background: AC.bg,
        borderRadius: 8,
      }}
    >
      <input
        value={config.name}
        onChange={(e) => onRename(e.target.value)}
        style={inputStyle}
      />
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: AC.ink2,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={config.canCreateCustomers}
          onChange={(e) => onToggleCanCreate(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: AC.brand }}
        />
        <span>Yes</span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${config.name}`}
        aria-label={`Remove ${config.name}`}
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          border: `1px solid ${AC.line}`,
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="x" size={12} color={AC.mute} />
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 7,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  fontFamily: AC.font,
  fontSize: 13,
  color: AC.ink,
  boxSizing: "border-box",
};
