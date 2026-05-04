import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { CustomerSwatch, RepAvatar } from "@/components/ui/Avatars";
import { StatusPill } from "@/components/ui/StatusPill";
import { AC } from "@/lib/tokens";
import { CUSTOMERS, REPS } from "@/lib/mock-data";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = CUSTOMERS.find((x) => x.id === id);
  if (!c) notFound();

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers", c.name]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="edit" size="sm">Edit</Btn>
          <Btn icon="plus" kind="primary" size="sm">Add site</Btn>
        </div>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <CustomerSwatch customer={c} size={56} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 19,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.4,
                  }}
                >
                  {c.name}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}>
                  Account {c.code} · {c.region} region · {c.sites} sites
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.okTint,
                      color: "#0F5A38",
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    ● Active
                  </span>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.brandSoft,
                      color: AC.brandInk,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Tier · {c.tier || "Standard"}
                  </span>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.bg,
                      color: AC.ink2,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {c.shiftsThisWeek} shifts this week
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  paddingLeft: 24,
                  borderLeft: `1px solid ${AC.line}`,
                }}
              >
                <KvBig label="On-time %" value="94%" />
                <KvBig label="Avg shift" value="3h 52m" />
                <KvBig label="Active reps" value="12" />
              </div>
            </div>
          </Card>

          <Card padding={0}>
            <div style={{ display: "flex", borderBottom: `1px solid ${AC.line}` }}>
              {["Sites & geofence", "Shifts", "Tasks", "Documents", "Contacts"].map((t, i) => (
                <button
                  key={t}
                  type="button"
                  style={{
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: i === 0 ? AC.ink : AC.mute,
                    borderBottom: i === 0 ? `2px solid ${AC.brand}` : "2px solid transparent",
                    marginBottom: -1,
                    letterSpacing: -0.1,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div
              style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}
            >
              <div
                style={{
                  position: "relative",
                  height: 320,
                  borderRadius: 10,
                  background: "#F1F4F7",
                  backgroundImage: `linear-gradient(${AC.lineDim} 1px, transparent 1px), linear-gradient(90deg, ${AC.lineDim} 1px, transparent 1px)`,
                  backgroundSize: "24px 24px",
                  overflow: "hidden",
                  border: `1px solid ${AC.line}`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "40%",
                    top: "38%",
                    width: 90,
                    height: 70,
                    background: "#fff",
                    border: `2px solid ${c.color}`,
                    borderRadius: 4,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 220,
                    height: 220,
                    borderRadius: 99,
                    border: `2px dashed ${c.color}`,
                    background: `${c.color}14`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "calc(50% + 110px)",
                    transform: "translate(-50%, 0)",
                    background: "#fff",
                    padding: "4px 9px",
                    borderRadius: 6,
                    fontFamily: AC.font,
                    fontSize: 11,
                    fontWeight: 700,
                    color: c.color,
                    border: `1px solid ${c.color}`,
                  }}
                >
                  Geofence · {c.geofence}m
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: "calc(40% + 45px)",
                    top: "calc(38% + 35px)",
                    transform: "translate(-50%, -100%)",
                  }}
                >
                  <svg width="22" height="28" viewBox="0 0 22 28">
                    <path
                      d="M11 27 Q4 18 4 11 a7 7 0 1 1 14 0 Q18 18 11 27z"
                      fill={c.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <circle cx="11" cy="11" r="3" fill="#fff" />
                  </svg>
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    background: "#fff",
                    padding: "8px 11px",
                    borderRadius: 8,
                    border: `1px solid ${AC.line}`,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                    }}
                  >
                    SITE A · HQ
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink,
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    1480 Riverside Way
                  </div>
                  <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                    Northgate Industrial Park · 51.5074°N, -0.1278°W
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Geofence radius
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[50, 75, 100, 150].map((v) => (
                      <button
                        key={v}
                        type="button"
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          borderRadius: 6,
                          background: v === c.geofence ? AC.ink : "#fff",
                          color: v === c.geofence ? "#fff" : AC.ink2,
                          border: `1px solid ${v === c.geofence ? AC.ink : AC.line}`,
                          fontFamily: AC.font,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {v}m
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Off-site policy
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 10,
                      border: `1px solid ${AC.line}`,
                      borderRadius: 8,
                    }}
                  >
                    <ToggleRow label="Allow off-site check-in" on />
                    <ToggleRow label="Require photo proof" on />
                    <ToggleRow label="Require manager approval" />
                    <ToggleRow label="Auto-flag in audit log" on />
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Sites · {c.sites}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0,
                      border: `1px solid ${AC.line}`,
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    {[
                      "Site A — HQ",
                      "Site B — Warehouse",
                      "Site C — Showroom",
                      "Site D — Loading",
                    ].map((s, i) => (
                      <div
                        key={s}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderBottom: i < 3 ? `1px solid ${AC.lineDim}` : "none",
                          background: i === 0 ? AC.brandSoft : "#fff",
                        }}
                      >
                        <AGlyph name="pin" size={12} color={c.color} />
                        <div
                          style={{
                            flex: 1,
                            fontFamily: AC.font,
                            fontSize: 12,
                            color: AC.ink,
                            fontWeight: 600,
                          }}
                        >
                          {s}
                        </div>
                        <AGlyph name="chev-r" size={12} color={AC.mute} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={16}>
            <SectionTitle>Primary contact</SectionTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  background: AC.bgDeep,
                  color: AC.ink2,
                  fontFamily: AC.font,
                  fontSize: 12,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                EM
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                  }}
                >
                  Eliza Mauro
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                  Site Manager · {c.name.split(" ")[0]}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <DetailRow icon="mail" label="Email" value="e.mauro@example.com" />
              <DetailRow icon="phone" label="Phone" value="+1 555 0823" />
            </div>
          </Card>
          <Card padding={16}>
            <SectionTitle
              action={
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: AC.brandDeep,
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  View all
                </button>
              }
            >
              Active reps · 12
            </SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {REPS.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <RepAvatar rep={r} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12,
                        color: AC.ink,
                        fontWeight: 600,
                      }}
                    >
                      {r.name}
                    </div>
                    <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>
                      {r.shifts} shifts · {r.region}
                    </div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function KvBig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 22,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.5,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ToggleRow({ label, on }: { label: string; on?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.ink2,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: 32,
          height: 18,
          borderRadius: 99,
          background: on ? AC.brand : AC.bgDeep,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: on ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: 99,
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: GlyphName;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: AC.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name={icon} size={12} color={AC.mute} />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          width: 60,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
