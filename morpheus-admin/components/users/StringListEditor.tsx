"use client";

/**
 * StringListEditor — inline editor for a plain string-vocabulary
 * stored in app_settings (e.g. regions, groups).
 *
 * Parallel of RepTypesEditor / ManagerTypesEditor but simpler — no
 * per-row capability columns since regions + groups are tags, not
 * gates. Same row layout (label cell + trash button) so the four
 * tabs on /settings/roles feel like one consistent surface.
 *
 * Mariska G2 (May 28).
 */

import { useState } from "react";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import { AC } from "@/lib/tokens";

const ROW_COLS = "1fr 28px";

export interface StringListEditorProps {
  /** Current vocabulary (already loaded from the store by the caller). */
  current: string[];
  /** Persist callback — fires when the manager hits Save. Returns ok
   *  / error so the editor can render an inline failure. */
  onSave: (next: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Called with the persisted list after a successful save so the
   *  parent can update its mirror state. */
  onSaved: (next: string[]) => void;
  /** Singular noun for the placeholder + heading copy ("region" /
   *  "group"). Pluralised by appending "s". */
  noun: string;
  /** Optional hint shown above the list explaining what the values
   *  drive (e.g. "Drives the Region filter on /reps and audience
   *  targeting on /notify"). */
  hint?: string;
  /** Placeholder for the "add new" input. */
  addPlaceholder?: string;
}

export function StringListEditor({
  current,
  onSave,
  onSaved,
  noun,
  hint,
  addPlaceholder,
}: StringListEditorProps) {
  const [list, setList] = useState<string[]>(() => [...current]);
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const plural = `${noun}s`;
  const dirty =
    JSON.stringify(list) !== JSON.stringify(current) ||
    newValue.trim().length > 0;

  const addOne = () => {
    setError(null);
    const value = newValue.trim();
    if (!value) return;
    if (list.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setError(`"${value}" is already in the list.`);
      return;
    }
    setList((prev) => [...prev, value]);
    setNewValue("");
  };

  const removeOne = (idx: number) => {
    setError(null);
    setList((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    // Fold any pending "add new" value into the list on save so the
    // manager doesn't have to click + then Save.
    const final = newValue.trim()
      ? list.some((v) => v.toLowerCase() === newValue.trim().toLowerCase())
        ? list
        : [...list, newValue.trim()]
      : list;
    const r = await onSave(final);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || `Couldn't save ${plural}.`);
      return;
    }
    setList(final);
    setNewValue("");
    setSaved(true);
    onSaved(final);
    // Clear the green "Saved" flash after 2s — keeps the button
    // honest as the dirty state changes.
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          color: AC.ink2,
          fontWeight: 600,
          marginBottom: hint ? 4 : 14,
        }}
      >
        {plural[0].toUpperCase() + plural.slice(1)}
      </div>
      {hint && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            lineHeight: 1.5,
            marginBottom: 14,
            maxWidth: 600,
          }}
        >
          {hint}
        </div>
      )}

      {list.length === 0 && (
        <div
          style={{
            padding: "12px 14px",
            background: AC.bg,
            border: `1px dashed ${AC.line}`,
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
            marginBottom: 12,
          }}
        >
          No {plural} yet. Add the first one below.
        </div>
      )}

      {list.map((value, idx) => (
        <div
          key={`${value}-${idx}`}
          style={{
            display: "grid",
            gridTemplateColumns: ROW_COLS,
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setList((prev) =>
                prev.map((existing, i) => (i === idx ? v : existing))
              );
            }}
            style={{
              padding: "9px 11px",
              borderRadius: 8,
              border: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.ink,
              outline: "none",
              background: "#fff",
            }}
          />
          <button
            type="button"
            onClick={() => removeOne(idx)}
            title={`Remove "${value}"`}
            aria-label={`Remove ${value}`}
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
      ))}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLS,
          gap: 8,
          alignItems: "center",
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${AC.lineDim}`,
        }}
      >
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOne();
            }
          }}
          placeholder={addPlaceholder || `Add a new ${noun}…`}
          style={{
            padding: "9px 11px",
            borderRadius: 8,
            border: `1px solid ${AC.line}`,
            fontFamily: AC.font,
            fontSize: 13,
            color: AC.ink,
            outline: "none",
            background: "#fff",
          }}
        />
        <button
          type="button"
          onClick={addOne}
          disabled={!newValue.trim()}
          aria-label={`Add ${noun}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${AC.brand}`,
            background: newValue.trim() ? AC.brandSoft : AC.bg,
            cursor: newValue.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: newValue.trim() ? 1 : 0.5,
          }}
        >
          <AGlyph name="plus" size={12} color={AC.brandDeep} />
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "9px 12px",
            background: AC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 8,
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
        }}
      >
        {saved && !busy && (
          <span
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.ok,
              fontWeight: 600,
            }}
          >
            ✓ Saved
          </span>
        )}
        <Btn kind="primary" icon="check" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : `Save ${plural}`}
        </Btn>
      </div>
    </div>
  );
}
