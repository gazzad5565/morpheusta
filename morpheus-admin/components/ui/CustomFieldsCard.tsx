"use client";

/**
 * Reusable "Custom fields" card for any entity detail page.
 *
 * Pass the entity's id + the entity type. The card fetches all field
 * definitions for that type plus the saved values for this entity, and
 * renders an editable form. "Save" persists; required-but-empty fields
 * are flagged.
 *
 * If no custom fields are defined for the entity type, the card renders
 * a small empty state pointing at /settings/fields/new.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import {
  listCustomFields,
  getValuesForEntity,
  setValuesForEntity,
  type CustomField,
  type CustomFieldValue,
  type FieldEntity,
} from "@/lib/custom-fields-store";

export function CustomFieldsCard({
  entity,
  entityId,
}: {
  entity: FieldEntity;
  entityId: string;
}) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, CustomFieldValue>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCustomFields({ appliesTo: entity }),
      getValuesForEntity(entityId),
    ]).then(([fs, vs]) => {
      if (cancelled) return;
      setFields(fs);
      setValues(vs);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  const missingRequired = useMemo(() => {
    return fields.filter((f) => {
      if (!f.required) return false;
      const v = values[f.id];
      return v === null || v === undefined || v === "";
    });
  }, [fields, values]);

  const setVal = (id: string, v: CustomFieldValue) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  const onSave = async () => {
    setError(null);
    if (missingRequired.length > 0) {
      setError(
        `Required field${missingRequired.length === 1 ? "" : "s"} missing: ${missingRequired
          .map((f) => f.name)
          .join(", ")}`
      );
      return;
    }
    setBusy(true);
    const r = await setValuesForEntity(entityId, fields, values);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    setSavedAt(Date.now());
  };

  if (!loaded) {
    return (
      <Card padding={20}>
        <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.mute }}>
          Loading custom fields…
        </div>
      </Card>
    );
  }

  if (fields.length === 0) {
    return (
      <Card padding={0}>
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${AC.line}`,
          }}
        >
          <SectionTitle>Custom fields</SectionTitle>
        </div>
        <div
          style={{
            padding: 24,
            textAlign: "center",
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
          }}
        >
          No custom fields defined for this entity type yet.
          <div style={{ marginTop: 8 }}>
            <Link
              href={`/settings/fields/new?entity=${entity}`}
              style={{
                color: AC.brandDeep,
                fontWeight: 600,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              + Define one in Settings
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <SectionTitle>Custom fields</SectionTitle>
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 99,
            background: AC.bg,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {fields.length}
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href={`/settings/fields/new?entity=${entity}`}
          style={{
            color: AC.brandDeep,
            fontWeight: 600,
            fontSize: 11.5,
            textDecoration: "none",
            fontFamily: AC.font,
          }}
        >
          + Add field
        </Link>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {fields.map((f) => (
          <FieldRow
            key={f.id}
            field={f}
            value={values[f.id] ?? null}
            onChange={(v) => setVal(f.id, v)}
          />
        ))}
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
            }}
          >
            <AGlyph name="warn" size={14} color="#9c1a3c" />
            <span>{error}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
          }}
        >
          {savedAt && !busy && !error && (
            <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.ok }}>
              Saved
            </span>
          )}
          <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save fields"}
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: CustomFieldValue;
  onChange: (next: CustomFieldValue) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {field.name}
        {field.required && <span style={{ color: AC.danger }}>*</span>}
      </div>
      {renderInput(field, value, onChange)}
    </div>
  );
}

function renderInput(
  field: CustomField,
  value: CustomFieldValue,
  onChange: (next: CustomFieldValue) => void
) {
  switch (field.field_type) {
    case "text":
      return (
        <input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      );
    case "longtext":
      return (
        <textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: AC.font }}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          style={{ ...inputStyle, fontFamily: AC.fontMono }}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value || null)}
          style={inputStyle}
        />
      );
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
            cursor: "pointer",
            fontFamily: AC.font,
            fontSize: 13,
            color: AC.ink,
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: AC.brand }}
          />
          Yes
        </label>
      );
    case "select":
      return (
        <Combobox
          value={(value as string) || null}
          onChange={(v) => onChange(v ?? null)}
          placeholder="— Select —"
          options={(field.options || []).map((o) => ({ value: o, label: o }))}
        />
      );
  }
}
