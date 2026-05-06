"use client";

/**
 * Settings — focused on what's actually wired today: Custom fields.
 *
 * Lists every custom field grouped by entity (Customers / Reps /
 * Shifts / Tasks / Library files). Each row has Edit + Delete inline.
 * "+ New field" goes to /settings/fields/new.
 *
 * Other settings categories (Org / Roles / Notifications / etc) are
 * deferred — they were stub UIs in the previous version. We'll add
 * them as the underlying systems land.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
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
};

export default function SettingsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    listCustomFields().then((rows) => {
      setFields(rows);
      setLoaded(true);
    });
  };
  useEffect(() => {
    reload();
  }, []);

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
    <AdminShell
      breadcrumbs={["Home", "Settings"]}
      actions={
        <Link href="/settings/fields/new" style={{ textDecoration: "none" }}>
          <Btn icon="plus" kind="primary" size="sm">
            New field
          </Btn>
        </Link>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Sub-page nav */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Link
            href="/settings/managers"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card padding={16} style={{ cursor: "pointer", height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: AC.brandSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AGlyph name="reps" size={18} color={AC.brandDeep} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 14,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    Managers
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      marginTop: 2,
                    }}
                  >
                    Promote reps to managers (admin console access).
                  </div>
                </div>
                <AGlyph name="chev-r" size={14} color={AC.mute} />
              </div>
            </Card>
          </Link>
          <div style={{ opacity: 0.55 }}>
            <Card padding={16} style={{ height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: AC.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AGlyph name="settings" size={18} color={AC.mute} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 14,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    Org · Notifications · Billing
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      marginTop: 2,
                    }}
                  >
                    Coming soon.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card padding={16}>
          <SectionTitle>Custom fields</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Add your own fields to any entity (customers, reps, shifts, tasks,
            or library files). Pick a type, mark <b style={{ color: AC.ink }}>required</b> if
            it must be filled in, and the field appears as an extra section
            on that entity's detail page where you can capture and edit values.
          </div>
        </Card>

        {!loaded ? (
          <Card padding={28}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
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
                fontSize: 12.5,
                color: AC.mute,
                textAlign: "center",
                marginTop: 6,
              }}
            >
              Click <b style={{ color: AC.ink2 }}>New field</b> to define one.
            </div>
          </Card>
        ) : (
          FIELD_ENTITIES.map((entity) => {
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
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: AC.brandSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AGlyph
                      name={ENTITY_GLYPH[entity]}
                      size={15}
                      color={AC.brandDeep}
                    />
                  </div>
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
                      gridTemplateColumns: "2fr 130px 100px 100px 90px",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom:
                        i < list.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      background: "#fff",
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
                            fontSize: 11.5,
                            color: AC.mute,
                            marginTop: 3,
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          {f.options.slice(0, 5).map((o) => (
                            <span
                              key={o}
                              style={{
                                padding: "1px 6px",
                                borderRadius: 99,
                                background: AC.bg,
                                border: `1px solid ${AC.line}`,
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: AC.ink2,
                              }}
                            >
                              {o}
                            </span>
                          ))}
                          {f.options.length > 5 && (
                            <span
                              style={{
                                color: AC.mute,
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: "1px 4px",
                              }}
                            >
                              +{f.options.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 99,
                          fontFamily: AC.font,
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          background: AC.bg,
                          border: `1px solid ${AC.line}`,
                          color: AC.ink2,
                        }}
                      >
                        {FIELD_TYPE_LABEL[f.field_type]}
                      </span>
                    </div>
                    <div>
                      {f.required ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 99,
                            fontFamily: AC.font,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: AC.dangerTint,
                            color: AC.danger,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                          }}
                        >
                          Required
                        </span>
                      ) : (
                        <span
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11.5,
                            color: AC.mute,
                          }}
                        >
                          Optional
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.fontMono,
                        fontSize: 11.5,
                        color: AC.mute,
                        fontWeight: 600,
                      }}
                    >
                      Order {f.sort_order}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      <Link
                        href={`/settings/fields/${f.id}/edit`}
                        title="Edit field"
                        style={iconBtn}
                      >
                        <AGlyph name="edit" size={14} color={AC.mute} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDelete(f)}
                        disabled={busyId === f.id}
                        title="Delete field"
                        style={{
                          ...iconBtn,
                          cursor: busyId === f.id ? "not-allowed" : "pointer",
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
          })
        )}
      </div>
    </AdminShell>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  cursor: "pointer",
};
