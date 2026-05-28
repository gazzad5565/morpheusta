"use client";

/**
 * CustomFieldsManager — the custom-field-definitions list + delete,
 * extracted from the old /settings/custom-fields page so it can be
 * embedded as a tab inside Site settings (May 28, Gary: "custom
 * fields should also belong in [site settings]").
 *
 * Self-fetches. The "New field" + per-row "Edit" affordances still
 * route to /settings/fields/new and /settings/fields/[id]/edit (those
 * forms are unchanged); after save they bounce through
 * /settings/custom-fields → /settings/site?tab=custom-fields.
 *
 * Field definitions are polymorphic — each row's `applies_to` decides
 * which entity type it shows up on (customer / rep / shift / task /
 * library_file / organisation).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import {
  listCustomFields,
  deleteCustomField,
  FIELD_ENTITIES,
  FIELD_ENTITY_LABEL,
  FIELD_TYPE_LABEL,
  type CustomField,
  type FieldEntity,
} from "@/lib/custom-fields-store";

const ENTITY_GLYPH: Record<FieldEntity, GlyphName> = {
  customer: "customer",
  rep: "reps",
  shift: "cal",
  task: "tasks",
  library_file: "lib",
  organisation: "building",
};

export function CustomFieldsManager() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    listCustomFields().then((rows) => {
      setFields(rows);
      setLoaded(true);
    });
  };
  useEffect(() => reload(), []);

  const grouped = useMemo(() => {
    const map = new Map<FieldEntity, CustomField[]>();
    for (const e of FIELD_ENTITIES) map.set(e, []);
    for (const f of fields) map.get(f.applies_to)?.push(f);
    return map;
  }, [fields]);

  const onDelete = async (f: CustomField) => {
    if (
      !confirm(
        `Delete the "${f.name}" field?\n\nThis also removes any values stored against this field on every ${FIELD_ENTITY_LABEL[f.applies_to].toLowerCase()}.`
      )
    ) {
      return;
    }
    setBusyId(f.id);
    const r = await deleteCustomField(f.id);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    setFields((arr) => arr.filter((x) => x.id !== f.id));
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
            lineHeight: 1.5,
            flex: 1,
            maxWidth: 560,
          }}
        >
          Add your own fields to any entity (customers, reps, shifts, tasks,
          library files, or your organisation). Pick a type, mark required if
          it must be filled in, and the field appears on that entity&apos;s
          detail page where values are captured.
        </div>
        <Link href="/settings/fields/new" style={{ textDecoration: "none" }}>
          <Btn icon="plus" kind="primary" size="sm">
            New field
          </Btn>
        </Link>
      </div>

      {!loaded ? (
        <Card padding={28}>
          <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute, textAlign: "center" }}>
            Loading fields…
          </div>
        </Card>
      ) : fields.length === 0 ? (
        <Card padding={36}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 14,
              color: AC.ink2,
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            No custom fields yet
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              textAlign: "center",
              marginTop: 6,
            }}
          >
            Click <b style={{ color: AC.ink2 }}>New field</b> to define one.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FIELD_ENTITIES.map((entity) => {
            const list = grouped.get(entity) || [];
            if (list.length === 0) return null;
            return (
              <Card key={entity} padding={0}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: `1px solid ${AC.line}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <AGlyph name={ENTITY_GLYPH[entity]} size={14} color={AC.mute} />
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    {FIELD_ENTITY_LABEL[entity]}
                  </div>
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
                    {list.length}
                  </span>
                </div>
                {list.map((f, i) => (
                  <div
                    key={f.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 1fr 90px 80px",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: i < list.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 13,
                          fontWeight: 600,
                          color: AC.ink,
                        }}
                      >
                        {f.name}
                      </div>
                      {f.field_type === "select" && f.options && f.options.length > 0 && (
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11,
                            color: AC.mute,
                            marginTop: 2,
                          }}
                        >
                          {f.options.slice(0, 4).join(" · ")}
                          {f.options.length > 4 ? ` +${f.options.length - 4}` : ""}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12,
                        color: AC.ink2,
                        fontWeight: 500,
                      }}
                    >
                      {FIELD_TYPE_LABEL[f.field_type]}
                    </div>
                    <div>
                      {f.required && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 99,
                            background: AC.dangerTint,
                            color: AC.danger,
                            fontFamily: AC.font,
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                          }}
                        >
                          Required
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <Link
                        href={`/settings/fields/${f.id}/edit`}
                        title="Edit field"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textDecoration: "none",
                        }}
                      >
                        <AGlyph name="edit" size={14} color={AC.mute} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(f)}
                        disabled={busyId === f.id}
                        title="Delete field"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: "transparent",
                          border: "none",
                          cursor: busyId === f.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: busyId === f.id ? 0.4 : 1,
                        }}
                      >
                        <AGlyph name="x" size={14} color={AC.mute} />
                      </button>
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
