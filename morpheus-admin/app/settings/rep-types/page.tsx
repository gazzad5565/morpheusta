"use client";

/**
 * /settings/rep-types — manage the rep-category vocabulary + per-type
 * capability flags.
 *
 * Each rep type has:
 *   - name     — what shows on profiles, in pickers, and on filter
 *                chips across the admin.
 *   - canCreateCustomers — currently the only capability flag. Drives
 *                whether the mobile app shows the Add Customer
 *                affordance for reps of this type.
 *
 * Renaming a type does NOT cascade to existing profiles.rep_type rows
 * or shifts.claimable_rep_types arrays — those keep the old name and
 * become effectively orphaned (no rep matches; restricted shifts
 * become unclaimable). UI warns before destructive renames in a
 * future polish; today it's manager judgement.
 *
 * Storage: app_settings.rep_types JSON array. Same shape every
 * caller (admin + mobile) parses through getRepTypes() with a
 * defensive reader that tolerates missing capability keys.
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Btn";
import { AGlyph } from "@/components/ui/AGlyph";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getRepTypes,
  setRepTypes,
  type RepTypeConfig,
} from "@/lib/settings-store";

export default function RepTypesPage() {
  const [list, setList] = useState<RepTypeConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCanCreate, setNewCanCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    getRepTypes().then((rows) => {
      setList(rows);
      setLoaded(true);
    });
  }, []);

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
  const toggleAt = (i: number, value: boolean) => {
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
    setSavedAt(Date.now());
  };

  return (
    <SettingsShell
      section="rep-types"
      description="Categorise mobile reps + control what each type can do. Used across /reps filtering, the shift-claim restrictions, and the mobile app's Add Customer affordance."
    >
      <Card padding={20}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <b style={{ color: AC.ink2 }}>Heads up:</b> renaming a type
          doesn&apos;t rename it on existing reps or restricted shifts —
          those keep the old name and become effectively orphaned (no
          rep matches; restricted shifts become unclaimable). Delete is
          fine — reps with a deleted type fall back to allow-all
          capabilities; restricted shifts on a deleted type become
          unclaimable until a manager edits them.
        </div>

        {/* Header row — matches the modal it replaces. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px 32px",
            gap: 10,
            padding: "0 8px 6px 8px",
            fontFamily: AC.font,
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

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {!loaded ? (
            <div style={{ fontSize: 12.5, color: AC.mute, padding: "12px 8px" }}>
              Loading…
            </div>
          ) : list.length === 0 ? (
            <div style={{ fontSize: 12.5, color: AC.mute, padding: "12px 8px" }}>
              No types yet — add at least one below.
            </div>
          ) : (
            list.map((t, i) => (
              <RowEditor
                key={i}
                config={t}
                onRename={(name) => renameAt(i, name)}
                onToggle={(v) => toggleAt(i, v)}
                onRemove={() => removeAt(i)}
              />
            ))
          )}
        </div>

        {/* Add row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px 32px",
            gap: 10,
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
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${newName.trim() ? AC.brandDeep : AC.line}`,
              background: newName.trim() ? AC.brand : "#fff",
              color: newName.trim() ? "#fff" : AC.faint,
              cursor: newName.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph
              name="plus"
              size={14}
              color={newName.trim() ? "#fff" : AC.faint}
            />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              background: AC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 8,
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
          }}
        >
          {savedAt && Date.now() - savedAt < 4000 && (
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.ok,
                fontWeight: 600,
              }}
            >
              ✓ Saved
            </span>
          )}
          <Btn
            kind="primary"
            onClick={save}
            disabled={busy || list.length === 0 || !loaded}
          >
            {busy ? "Saving…" : "Save changes"}
          </Btn>
        </div>
      </Card>
    </SettingsShell>
  );
}

function RowEditor({
  config,
  onRename,
  onToggle,
  onRemove,
}: {
  config: RepTypeConfig;
  onRename: (name: string) => void;
  onToggle: (v: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 180px 32px",
        gap: 10,
        alignItems: "center",
        padding: "8px",
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
          onChange={(e) => onToggle(e.target.checked)}
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
          width: 32,
          height: 32,
          borderRadius: 8,
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
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  fontFamily: AC.font,
  fontSize: 13,
  color: AC.ink,
  boxSizing: "border-box",
};
