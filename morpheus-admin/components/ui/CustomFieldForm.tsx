"use client";

/**
 * Shared form for creating + editing custom fields.
 * Used by /settings/fields/new and /settings/fields/[id]/edit.
 */

import { useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import {
  FIELD_ENTITIES,
  FIELD_ENTITY_LABEL,
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  type FieldEntity,
  type FieldType,
} from "@/lib/custom-fields-store";

export interface CustomFieldFormValues {
  applies_to: FieldEntity;
  name: string;
  field_type: FieldType;
  options: string[];
  required: boolean;
  sort_order: number;
}

export function CustomFieldForm({
  initial,
  onSubmit,
  onDelete,
  onCancel,
  saveLabel = "Save",
  busy,
}: {
  initial: CustomFieldFormValues;
  onSubmit: (values: CustomFieldFormValues) => void | Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
  saveLabel?: string;
  busy: boolean;
}) {
  const [values, setValues] = useState<CustomFieldFormValues>(initial);
  const [optionsInput, setOptionsInput] = useState<string>(initial.options.join("\n"));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CustomFieldFormValues>(
    key: K,
    val: CustomFieldFormValues[K]
  ) => setValues((v) => ({ ...v, [key]: val }));

  const handleSubmit = async () => {
    setError(null);
    if (!values.name.trim()) return setError("Give the field a name.");
    const ord = Number.isFinite(values.sort_order) ? values.sort_order : 0;
    let options: string[] = [];
    if (values.field_type === "select") {
      options = optionsInput
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length === 0)
        return setError("Add at least one option for a dropdown.");
    }
    await onSubmit({
      ...values,
      sort_order: ord,
      options,
    });
  };

  return (
    <div
      style={{
        padding: 20,
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 16,
        alignItems: "start",
      }}
    >
      <Card padding={20}>
        <SectionTitle>Field details</SectionTitle>

        <Field label="Where does it apply" required>
          <Combobox
            value={values.applies_to}
            onChange={(v) => set("applies_to", (v ?? FIELD_ENTITIES[0]) as FieldEntity)}
            clearable={false}
            triggerIcon={null}
            options={FIELD_ENTITIES.map((e) => ({
              value: e,
              label: FIELD_ENTITY_LABEL[e],
            }))}
          />
        </Field>

        <Field label="Field name" required>
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Account manager, T-shirt size, Last audit date…"
            style={inputStyle}
          />
        </Field>

        <Field label="Type" required>
          <Combobox
            value={values.field_type}
            onChange={(v) => set("field_type", (v ?? FIELD_TYPES[0]) as FieldType)}
            clearable={false}
            triggerIcon={null}
            options={FIELD_TYPES.map((t) => ({
              value: t,
              label: FIELD_TYPE_LABEL[t],
            }))}
          />
        </Field>

        {values.field_type === "select" && (
          <Field label="Options" required hint="One per line. Reps see this list as a dropdown.">
            <textarea
              value={optionsInput}
              onChange={(e) => setOptionsInput(e.target.value)}
              placeholder={"Option 1\nOption 2\nOption 3"}
              rows={5}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: AC.font,
              }}
            />
          </Field>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Required">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 11px",
                border: `1px solid ${AC.line}`,
                borderRadius: 10,
                background: "#fff",
                cursor: "pointer",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.ink,
              }}
            >
              <input
                type="checkbox"
                checked={values.required}
                onChange={(e) => set("required", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: AC.brand }}
              />
              Must be filled in
            </label>
          </Field>
          <Field label="Order" hint="Lower = shows first.">
            <input
              value={String(values.sort_order)}
              onChange={(e) =>
                set("sort_order", parseInt(e.target.value.replace(/[^0-9-]/g, ""), 10) || 0)
              }
              style={{ ...inputStyle, fontFamily: AC.fontMono }}
            />
          </Field>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              background: AC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 12,
            }}
          >
            <AGlyph name="warn" size={14} color="#9c1a3c" />
            <span>{error}</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {onDelete ? (
            <Btn kind="danger" onClick={onDelete} disabled={busy}>
              Delete
            </Btn>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onCancel} disabled={busy}>
              Cancel
            </Btn>
            <Btn kind="primary" icon="check" onClick={handleSubmit} disabled={busy}>
              {busy ? "Saving…" : saveLabel}
            </Btn>
          </div>
        </div>
      </Card>

      {/* Preview */}
      <Card padding={16}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
            color: AC.mute,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Preview
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            color: AC.ink,
            fontWeight: 600,
          }}
        >
          {values.name || "Field name"}
          {values.required && (
            <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>
          )}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            marginTop: 2,
            marginBottom: 10,
          }}
        >
          {FIELD_ENTITY_LABEL[values.applies_to]} ·{" "}
          {FIELD_TYPE_LABEL[values.field_type]}
        </div>
        <PreviewInput
          type={values.field_type}
          options={
            values.field_type === "select"
              ? optionsInput.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
              : []
          }
        />
      </Card>
    </div>
  );
}

function PreviewInput({ type, options }: { type: FieldType; options: string[] }) {
  switch (type) {
    case "text":
      return <input placeholder="Sample text" disabled style={inputStyle} />;
    case "longtext":
      return (
        <textarea
          placeholder="Long text…"
          disabled
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: AC.font }}
        />
      );
    case "number":
      return <input placeholder="0" disabled style={{ ...inputStyle, fontFamily: AC.fontMono }} />;
    case "date":
      return <input type="date" disabled style={inputStyle} />;
    case "boolean":
      return (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 11px",
            border: `1px solid ${AC.line}`,
            borderRadius: 10,
            background: "#fff",
            fontFamily: AC.font,
            fontSize: 13,
            color: AC.ink,
          }}
        >
          <input
            type="checkbox"
            disabled
            style={{ width: 16, height: 16, accentColor: AC.brand }}
          />
          Yes
        </label>
      );
    case "select":
      return (
        <select disabled style={inputStyle}>
          <option>{options[0] || "Option…"}</option>
          {options.slice(1).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
  }
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
