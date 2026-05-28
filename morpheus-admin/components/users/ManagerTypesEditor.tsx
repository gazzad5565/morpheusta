"use client";

/**
 * ManagerTypesEditor — inline editor for the manager-type vocabulary
 * stored in app_settings.manager_types. Mirrors the rep-types editor
 * shape but with two capability columns (canManageSettings,
 * canScheduleShifts) instead of one.
 *
 * Lives inline on /settings/roles (Manager types tab) — not a modal.
 *
 * Self-row signal: when one of the rows matches the current manager's
 * own manager_type, the row is tagged with an amber hint reminding
 * them that capability changes will affect their own access on save.
 * (Hard self-demote protection lives on the assignment dropdown in
 * /settings/managers/[id]/edit — see commit 3.)
 *
 * Lenient defaults at every reader (parseManagerTypes, managerTypeCan)
 * mean a deleted type doesn't lock anyone out — the affected manager
 * just falls back to allow-all until reassigned.
 */

import { useState } from "react";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import { AC } from "@/lib/tokens";
import {
  setManagerTypes,
  type ManagerTypeConfig,
} from "@/lib/settings-store";

const ROW_COLS = "1fr 140px 140px 28px";

export function ManagerTypesEditor({
  current,
  ownManagerType,
  onSaved,
}: {
  current: ManagerTypeConfig[];
  /** The currently-signed-in manager's manager_type. Used to tag the
   *  matching row so capability tweaks come with a self-affecting
   *  warning. Pass null for non-managers / unset. */
  ownManagerType: string | null | undefined;
  /** Fires with the freshly-saved list so the parent can re-render
   *  with the new vocabulary (without a fresh round-trip). */
  onSaved: (next: ManagerTypeConfig[]) => void;
}) {
  const [list, setList] = useState<ManagerTypeConfig[]>(() => [...current]);
  const [newName, setNewName] = useState("");
  const [newManageSettings, setNewManageSettings] = useState(false);
  const [newScheduleShifts, setNewScheduleShifts] = useState(false);
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
    setList([
      ...list,
      {
        name,
        canManageSettings: newManageSettings,
        canScheduleShifts: newScheduleShifts,
      },
    ]);
    setNewName("");
    setNewManageSettings(false);
    setNewScheduleShifts(false);
    setSaved(false);
  };
  const renameAt = (i: number, name: string) => {
    const next = [...list];
    next[i] = { ...next[i], name };
    setList(next);
    setSaved(false);
  };
  const toggleManageSettingsAt = (i: number, value: boolean) => {
    const next = [...list];
    next[i] = { ...next[i], canManageSettings: value };
    setList(next);
    setSaved(false);
  };
  const toggleScheduleShiftsAt = (i: number, value: boolean) => {
    const next = [...list];
    next[i] = { ...next[i], canScheduleShifts: value };
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
    const r = await setManagerTypes(list);
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
        Categorise managers and decide what each type can do. Capability
        changes save on Save — you can preview them before committing.
        A manager with no type (or a deleted type) keeps all capabilities
        by default — no one gets locked out by an empty vocabulary.
      </div>

      {/* Column hints */}
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
        <div>Settings access?</div>
        <div>Schedule shifts?</div>
        <div></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 12.5, color: AC.mute, padding: "10px 8px" }}>
            No types yet — add at least one below.
          </div>
        ) : (
          list.map((t, i) => {
            const isOwnRow =
              !!ownManagerType &&
              t.name.toLowerCase() === ownManagerType.toLowerCase();
            return (
              <ManagerRow
                key={i}
                config={t}
                isOwnRow={isOwnRow}
                onRename={(name) => renameAt(i, name)}
                onToggleManageSettings={(v) => toggleManageSettingsAt(i, v)}
                onToggleScheduleShifts={(v) => toggleScheduleShiftsAt(i, v)}
                onRemove={() => removeAt(i)}
              />
            );
          })
        )}
      </div>

      {/* Add row */}
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
          placeholder="New type name (e.g. Owner)"
          style={inputStyle}
        />
        <CheckboxCell
          checked={newManageSettings}
          onChange={setNewManageSettings}
        />
        <CheckboxCell
          checked={newScheduleShifts}
          onChange={setNewScheduleShifts}
        />
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
          Manager types saved.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn
          kind="primary"
          onClick={save}
          disabled={busy || list.length === 0 || !dirty}
        >
          {busy ? "Saving…" : "Save manager types"}
        </Btn>
      </div>
    </div>
  );
}

function ManagerRow({
  config,
  isOwnRow,
  onRename,
  onToggleManageSettings,
  onToggleScheduleShifts,
  onRemove,
}: {
  config: ManagerTypeConfig;
  isOwnRow: boolean;
  onRename: (name: string) => void;
  onToggleManageSettings: (v: boolean) => void;
  onToggleScheduleShifts: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLS,
          gap: 8,
          alignItems: "center",
          padding: "6px 8px",
          background: isOwnRow ? AC.warnTint : AC.bg,
          border: isOwnRow ? `1px solid ${AC.warn}` : `1px solid transparent`,
          borderRadius: 8,
        }}
      >
        <input
          value={config.name}
          onChange={(e) => onRename(e.target.value)}
          style={inputStyle}
        />
        <CheckboxCell
          checked={config.canManageSettings}
          onChange={onToggleManageSettings}
        />
        <CheckboxCell
          checked={config.canScheduleShifts}
          onChange={onToggleScheduleShifts}
        />
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
      {isOwnRow && (
        <div
          style={{
            padding: "4px 12px 0 12px",
            fontSize: 11,
            color: "#8E5A0E",
            fontStyle: "italic",
          }}
        >
          This is your current type — capability changes affect your own
          access on save.
        </div>
      )}
    </div>
  );
}

function CheckboxCell({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
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
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 14, height: 14, accentColor: AC.brand }}
      />
      <span>{checked ? "Yes" : "No"}</span>
    </label>
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
