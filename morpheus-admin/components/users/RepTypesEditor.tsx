"use client";

/**
 * RepTypesEditor — inline editor for the rep-type vocabulary stored
 * in app_settings.rep_types. Refactor of the original ManageRepTypesSheet
 * modal — same row layout, no overlay. Lives on /settings/roles
 * (Rep types tab).
 *
 * Single capability column today (canCreateCustomers — gates the
 * mobile Add Customer affordance). When future capability flags ship
 * the row grid grows alongside ManagerTypesEditor's pattern.
 */

import { useState } from "react";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import { AC } from "@/lib/tokens";
import {
  setRepTypes,
  type RepTypeConfig,
} from "@/lib/settings-store";

const ROW_COLS = "1fr 160px 28px";

export function RepTypesEditor({
  current,
  onSaved,
}: {
  current: RepTypeConfig[];
  onSaved: (next: RepTypeConfig[]) => void;
}) {
  const [list, setList] = useState<RepTypeConfig[]>(() => [...current]);
  const [newName, setNewName] = useState("");
  const [newCanCreate, setNewCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    JSON.stringify(list) !== JSON.stringify(current) ||
    newName.trim().length > 0;

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
    setSaved(false);
  };
  const renameAt = (i: number, name: string) => {
    const next = [...list];
    next[i] = { ...next[i], name };
    setList(next);
    setSaved(false);
  };
  const toggleCanCreateAt = (i: number, value: boolean) => {
    const next = [...list];
    next[i] = { ...next[i], canCreateCustomers: value };
    setList(next);
    setSaved(false);
  };
  const removeAt = (i: number) => {
    setList(list.filter((_, j) => j !== i));
    setSaved(false);
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
    setSaved(true);
    onSaved(list);
  };

  return (
    <div style={{ fontFamily: AC.font }}>
      <div
        style={{
          padding: "4px 0 14px 0",
          fontSize: 12.5,
          color: AC.mute,
          lineHeight: 1.55,
        }}
      >
        Categorise reps so you can filter by type + control which types
        can add customers from the mobile app. Reps with no type assigned
        (or a deleted type) keep all default capabilities.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLS,
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
          <div style={{ fontSize: 12.5, color: AC.mute, padding: "10px 8px" }}>
            No types yet — add at least one below.
          </div>
        ) : (
          list.map((t, i) => (
            <RepRow
              key={i}
              config={t}
              onRename={(name) => renameAt(i, name)}
              onToggleCanCreate={(v) => toggleCanCreateAt(i, v)}
              onRemove={() => removeAt(i)}
            />
          ))
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLS,
          gap: 8,
          alignItems: "center",
          padding: "10px 8px",
          background: AC.brandSoft,
          borderRadius: 10,
          marginBottom: 14,
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

      {saved && !dirty && !error && (
        <div
          style={{
            padding: "8px 10px",
            background: AC.okTint,
            color: "#0F5A38",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            marginBottom: 10,
          }}
        >
          Rep types saved.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn
          kind="primary"
          onClick={save}
          disabled={busy || list.length === 0 || !dirty}
        >
          {busy ? "Saving…" : "Save rep types"}
        </Btn>
      </div>
    </div>
  );
}

function RepRow({
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
        gridTemplateColumns: ROW_COLS,
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
        <span>{config.canCreateCustomers ? "Yes" : "No"}</span>
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
