"use client";

/**
 * Settings — sectioned, sticky left nav.
 *
 * Sections (each one is an anchorable region in the right column):
 *   - Managers          → who can sign in to the admin console (link-out)
 *   - Check-in rules    → late grace, early grace, default geofence radius
 *   - Custom fields     → list + create/edit/delete dynamic fields
 *   - Organisation      → placeholder
 *   - Notifications     → placeholder
 *   - Billing           → placeholder
 *
 * Adding a new section is two lines in NAV_SECTIONS + a <Section>
 * block. The left nav scrolls to the matching id and highlights the
 * active section as the user scrolls.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
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
import {
  getLateGraceMinutes,
  setLateGraceMinutes,
  getEarlyGraceMinutes,
  setEarlyGraceMinutes,
  getDefaultGeofenceRadius,
  setDefaultGeofenceRadius,
} from "@/lib/settings-store";
import { listProfiles } from "@/lib/profiles-store";

const ENTITY_GLYPH: Record<FieldEntity, GlyphName> = {
  customer: "customer",
  rep: "reps",
  shift: "cal",
  task: "tasks",
  library_file: "lib",
};

interface NavSection {
  id: string;
  label: string;
  glyph: GlyphName;
  description: string;
  available: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "managers",
    label: "Managers",
    glyph: "reps",
    description: "Who can sign into the admin console.",
    available: true,
  },
  {
    id: "checkin",
    label: "Check-in rules",
    glyph: "clock",
    description: "Late grace, early grace, default geofence radius.",
    available: true,
  },
  {
    id: "fields",
    label: "Custom fields",
    glyph: "tasks",
    description: "Dynamic fields on any entity.",
    available: true,
  },
  {
    id: "organisation",
    label: "Organisation",
    glyph: "building",
    description: "Org name, brand, plan.",
    available: false,
  },
  {
    id: "notifications",
    label: "Notifications",
    glyph: "send",
    description: "Email + push notifications.",
    available: false,
  },
  {
    id: "billing",
    label: "Billing",
    glyph: "audit",
    description: "Subscription + invoices.",
    available: false,
  },
];

export default function SettingsPage() {
  // Custom fields
  const [fields, setFields] = useState<CustomField[]>([]);
  const [fieldsLoaded, setFieldsLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Check-in rules
  const [lateMin, setLateMin] = useState<string>("10");
  const [earlyMin, setEarlyMin] = useState<string>("15");
  const [defaultRadius, setDefaultRadius] = useState<string>("100");
  const [graceLoaded, setGraceLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [graceMessage, setGraceMessage] = useState<string | null>(null);

  // Managers
  const [counts, setCounts] = useState<{ managers: number; reps: number; total: number }>({
    managers: 0,
    reps: 0,
    total: 0,
  });

  // Active nav section (highlights as user scrolls)
  const [activeSection, setActiveSection] = useState<string>("managers");
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const reloadFields = () => {
    listCustomFields().then((rows) => {
      setFields(rows);
      setFieldsLoaded(true);
    });
  };

  useEffect(() => {
    reloadFields();
    Promise.all([
      getLateGraceMinutes(),
      getEarlyGraceMinutes(),
      getDefaultGeofenceRadius(),
      listProfiles(),
    ]).then(([late, early, radius, profiles]) => {
      setLateMin(String(late));
      setEarlyMin(String(early));
      setDefaultRadius(String(radius));
      setGraceLoaded(true);
      const m = profiles.filter((p) => p.role === "manager").length;
      const r = profiles.filter((p) => p.role === "rep").length;
      setCounts({ managers: m, reps: r, total: profiles.length });
    });
  }, []);

  // Highlight the section closest to the top of the viewport.
  useEffect(() => {
    const handler = () => {
      let bestId = NAV_SECTIONS[0].id;
      let bestDist = Infinity;
      for (const s of NAV_SECTIONS) {
        const el = sectionRefs.current.get(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // Anything above 200px from the top wins; if all are below, pick the first.
        if (top <= 200 && top > -el.offsetHeight) {
          const dist = Math.abs(top - 100);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = s.id;
          }
        }
      }
      setActiveSection(bestId);
    };
    const root = document.querySelector("[data-settings-scroll]") as HTMLElement | null;
    const target: HTMLElement | Window = root ?? window;
    target.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => target.removeEventListener("scroll", handler);
  }, [graceLoaded, fieldsLoaded]);

  const grouped = useMemo(() => {
    const map = new Map<FieldEntity, CustomField[]>();
    for (const e of FIELD_ENTITIES) map.set(e, []);
    for (const f of fields) map.get(f.applies_to)?.push(f);
    return map;
  }, [fields]);

  const onDeleteField = async (f: CustomField) => {
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

  const saveLate = async () => {
    setGraceMessage(null);
    const n = parseInt(lateMin, 10);
    if (Number.isNaN(n) || n < 0) return setGraceMessage("Late grace must be a number ≥ 0.");
    setSavingKey("late");
    const r = await setLateGraceMinutes(n);
    setSavingKey(null);
    if (!r.ok) return setGraceMessage(r.error || "Couldn't save.");
    setGraceMessage(`Late grace saved (${n} min).`);
  };
  const saveEarly = async () => {
    setGraceMessage(null);
    const n = parseInt(earlyMin, 10);
    if (Number.isNaN(n) || n < 0) return setGraceMessage("Early grace must be a number ≥ 0.");
    setSavingKey("early");
    const r = await setEarlyGraceMinutes(n);
    setSavingKey(null);
    if (!r.ok) return setGraceMessage(r.error || "Couldn't save.");
    setGraceMessage(`Early grace saved (${n} min).`);
  };
  const saveRadius = async () => {
    setGraceMessage(null);
    const n = parseInt(defaultRadius, 10);
    if (Number.isNaN(n) || n < 1) return setGraceMessage("Radius must be at least 1 m.");
    setSavingKey("radius");
    const r = await setDefaultGeofenceRadius(n);
    setSavingKey(null);
    if (!r.ok) return setGraceMessage(r.error || "Couldn't save.");
    setGraceMessage(`Default radius saved (${n} m).`);
  };

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setRef = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
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
      <div
        data-settings-scroll
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* ─── Sticky left nav ───────────────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            top: 16,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              padding: "6px 10px 8px",
            }}
          >
            Settings
          </div>
          {NAV_SECTIONS.map((s) => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                disabled={!s.available}
                title={s.description}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 8,
                  background: active ? AC.brandSoft : "transparent",
                  border: "none",
                  cursor: s.available ? "pointer" : "not-allowed",
                  color: active ? AC.brandInk : s.available ? AC.ink2 : AC.faint,
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: -0.1,
                  textAlign: "left",
                  position: "relative",
                  opacity: s.available ? 1 : 0.55,
                }}
              >
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      left: -4,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: 99,
                      background: AC.brand,
                    }}
                  />
                )}
                <AGlyph
                  name={s.glyph}
                  size={14}
                  color={active ? AC.brandDeep : s.available ? AC.mute : AC.faint}
                />
                <span style={{ flex: 1 }}>{s.label}</span>
                {!s.available && (
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 99,
                      background: AC.bg,
                      color: AC.mute,
                      fontFamily: AC.font,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Right column: sections ─────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Managers */}
          <Section
            id="managers"
            title="Managers"
            description="Reps log into the mobile app. Managers log into this console. Promote any rep to a manager when they need admin access."
            innerRef={setRef("managers")}
          >
            <Link
              href="/settings/managers"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card padding={16} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: AC.brandSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <AGlyph name="reps" size={20} color={AC.brandDeep} />
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
                      Manage users
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12,
                        color: AC.mute,
                        marginTop: 2,
                      }}
                    >
                      {counts.managers} manager{counts.managers === 1 ? "" : "s"} ·{" "}
                      {counts.reps} rep{counts.reps === 1 ? "" : "s"} ·{" "}
                      {counts.total} total
                    </div>
                  </div>
                  <AGlyph name="chev-r" size={14} color={AC.mute} />
                </div>
              </Card>
            </Link>
          </Section>

          {/* Check-in rules */}
          <Section
            id="checkin"
            title="Check-in rules"
            description="Thresholds that gate when the mobile app shows an exception card on check-in / check-out. Below each threshold no exception UI appears and the rep can proceed straight away."
            innerRef={setRef("checkin")}
          >
            <Card padding={20}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 18,
                }}
              >
                <NumberSetting
                  label="Late check-in grace"
                  unit="min"
                  value={lateMin}
                  onChange={setLateMin}
                  onSave={saveLate}
                  saving={savingKey === "late"}
                  disabled={!graceLoaded}
                  hint={`Reps checking in within ${
                    lateMin || 0
                  } min of the shift's start time see no exception. After that, the late-check-in card appears and a reason is required.`}
                />
                <NumberSetting
                  label="Early check-out grace"
                  unit="min"
                  value={earlyMin}
                  onChange={setEarlyMin}
                  onSave={saveEarly}
                  saving={savingKey === "early"}
                  disabled={!graceLoaded}
                  hint={`Reps checking out within ${
                    earlyMin || 0
                  } min of the scheduled end see no exception. Earlier than that, the early-check-out card appears and a reason is required.`}
                />
              </div>

              <div
                style={{
                  height: 1,
                  background: AC.line,
                  margin: "20px 0",
                }}
              />

              <NumberSetting
                label="Default geofence radius for new customers"
                unit="m"
                value={defaultRadius}
                onChange={setDefaultRadius}
                onSave={saveRadius}
                saving={savingKey === "radius"}
                disabled={!graceLoaded}
                hint={
                  <>
                    Newly added customers start with this radius. You can override it per
                    customer on{" "}
                    <Link
                      href="/customers"
                      style={{ color: AC.brandDeep, textDecoration: "none" }}
                    >
                      each customer's Address tab
                    </Link>
                    . Off-site exceptions on check-in / check-out trigger when the rep's
                    GPS is further than the customer's radius from the store.
                  </>
                }
                full
              />

              {graceMessage && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "8px 10px",
                    background: AC.brandSoft,
                    color: AC.brandInk,
                    borderRadius: 8,
                    fontFamily: AC.font,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {graceMessage}
                </div>
              )}
            </Card>
          </Section>

          {/* Custom fields */}
          <Section
            id="fields"
            title="Custom fields"
            description="Add your own fields to any entity (customers, reps, shifts, tasks, or library files). Pick a type, mark required if it must be filled in, and the field appears on that entity's detail page where you can capture and edit values."
            innerRef={setRef("fields")}
            action={
              <Link href="/settings/fields/new" style={{ textDecoration: "none" }}>
                <Btn size="sm" icon="plus" kind="primary">
                  New field
                </Btn>
              </Link>
            }
          >
            {!fieldsLoaded ? (
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
                            borderBottom:
                              i < list.length - 1 ? `1px solid ${AC.lineDim}` : "none",
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
                            {f.field_type === "select" &&
                              f.options &&
                              f.options.length > 0 && (
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
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              justifyContent: "flex-end",
                            }}
                          >
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
                              onClick={() => onDeleteField(f)}
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
          </Section>

          {/* Coming soon placeholders */}
          {NAV_SECTIONS.filter((s) => !s.available).map((s) => (
            <Section
              key={s.id}
              id={s.id}
              title={s.label}
              description={s.description}
              innerRef={setRef(s.id)}
            >
              <Card padding={28}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    color: AC.mute,
                    textAlign: "center",
                  }}
                >
                  Coming soon.
                </div>
              </Card>
            </Section>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function Section({
  id,
  title,
  description,
  action,
  children,
  innerRef,
}: {
  id: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  innerRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      id={id}
      ref={innerRef as React.RefCallback<HTMLElement>}
      style={{ scrollMarginTop: 16 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 18,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.4,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginTop: 4,
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            {description}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function NumberSetting({
  label,
  unit,
  value,
  onChange,
  onSave,
  saving,
  disabled,
  hint,
  full,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
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
        {label} ({unit})
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          maxWidth: full ? 360 : "100%",
        }}
      >
        <input
          type="number"
          min={0}
          value={value}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          style={{
            flex: 1,
            padding: "9px 11px",
            borderRadius: 10,
            border: `1px solid ${AC.line}`,
            background: "#fff",
            fontFamily: AC.fontMono,
            fontSize: 14,
            color: AC.ink,
          }}
        />
        <Btn size="sm" kind="primary" onClick={onSave} disabled={disabled || saving}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>
      {hint && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
