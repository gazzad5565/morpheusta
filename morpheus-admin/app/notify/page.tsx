import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Field, inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";

export default function NotifyPage() {
  return (
    <AdminShell
      breadcrumbs={["Home", "Notifications", "Compose"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm">Save draft</Btn>
          <Btn icon="send" kind="primary" size="sm">Send now</Btn>
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
        <Card padding={20}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 16,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.3,
              marginBottom: 4,
            }}
          >
            New broadcast
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginBottom: 16 }}>
            Sent to selected reps via push notification + in-app banner.
          </div>

          <Field label="Audience">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <AudienceChip selected>All on-shift reps</AudienceChip>
              <AudienceChip>+ Region: North</AudienceChip>
              <AudienceChip>+ Customer: Highmark</AudienceChip>
              <button
                type="button"
                style={{
                  padding: "5px 11px",
                  borderRadius: 99,
                  background: "transparent",
                  border: `1px dashed ${AC.line}`,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Add filter
              </button>
            </div>
            <div
              style={{
                marginTop: 8,
                padding: "8px 11px",
                borderRadius: 8,
                background: AC.brandSoft,
                fontFamily: AC.font,
                fontSize: 11.5,
                color: AC.brandInk,
                fontWeight: 600,
              }}
            >
              ● Will reach <b>33 reps</b> right now
            </div>
          </Field>

          <Field label="Channels">
            <div style={{ display: "flex", gap: 8 }}>
              <ChannelToggle on label="Push" sub="Native banner" />
              <ChannelToggle on label="In-app" sub="Top bar" />
              <ChannelToggle label="SMS" sub="Backup" />
              <ChannelToggle label="Email" sub="Summary" />
            </div>
          </Field>

          <Field label="Subject">
            <input
              defaultValue="Heads up: Highmark loading-bay closure today"
              style={inputStyle}
            />
          </Field>

          <Field label="Message">
            <textarea
              rows={5}
              defaultValue={
                "The loading bay at Highmark Retail Site C is closed for maintenance until 14:00 today. Please use the rear entrance and check in via the side gate. Sorry for the disruption!\n\n— Sasha"
              }
              style={{ ...inputStyle, fontFamily: AC.font, resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <SmallChip>B</SmallChip>
                <SmallChip>I</SmallChip>
                <SmallChip>Link</SmallChip>
                <SmallChip>📎 Attach file</SmallChip>
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>187 / 1000</div>
            </div>
          </Field>

          <Field label="Schedule">
            <div style={{ display: "flex", gap: 6 }}>
              <Btn size="sm" kind="primary">Send immediately</Btn>
              <Btn size="sm">Schedule for later</Btn>
              <Btn size="sm">Repeat daily</Btn>
            </div>
          </Field>
        </Card>

        <Card padding={20}>
          <SectionTitle>Preview</SectionTitle>
          <div
            style={{
              background: "#1A1D24",
              borderRadius: 22,
              padding: "14px 12px",
              minHeight: 360,
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px 12px",
              }}
            >
              <div style={{ fontFamily: AC.font, fontSize: 11, color: "#fff", fontWeight: 700 }}>
                9:41
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 10, color: "#fff", opacity: 0.7 }}>
                ● 5G ●●●●
              </div>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "11px 12px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 6,
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, background: AC.brand }} />
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: AC.mute,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  MORPHEUS
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>now</div>
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.2,
                  marginBottom: 4,
                }}
              >
                Heads up: Highmark loading-bay closure today
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.ink2,
                  lineHeight: 1.4,
                }}
              >
                The loading bay at Highmark Retail Site C is closed for maintenance until 14:00
                today…
              </div>
            </div>
            <div
              style={{
                marginTop: 80,
                fontFamily: AC.font,
                fontSize: 10.5,
                color: "#fff",
                opacity: 0.4,
                textAlign: "center",
              }}
            >
              Lock screen preview
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: AC.bg,
              border: `1px solid ${AC.line}`,
            }}
          >
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
                letterSpacing: 0.2,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Last 5 broadcasts
            </div>
            {[
              { sub: "Site closed early — Aria HQ", when: "Yesterday · 14:22", read: 28, total: 31 },
              { sub: "New uniform standards live", when: "2 days ago", read: 81, total: 87 },
              { sub: "Schedule update for week of 6 May", when: "5 May · 18:00", read: 87, total: 87 },
            ].map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: i < 2 ? `1px solid ${AC.lineDim}` : "none",
                }}
              >
                <AGlyph name="send" size={12} color={AC.mute} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.ink,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {b.sub}
                  </div>
                  <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute }}>
                    {b.when}
                  </div>
                </div>
                <div
                  style={{ fontFamily: AC.font, fontSize: 11, color: AC.ok, fontWeight: 700 }}
                >
                  {b.read}/{b.total}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function AudienceChip({
  children,
  selected,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <span
      style={{
        padding: "5px 11px",
        borderRadius: 99,
        background: selected ? AC.ink : "#fff",
        color: selected ? "#fff" : AC.ink2,
        border: `1px solid ${selected ? AC.ink : AC.line}`,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function ChannelToggle({
  label,
  sub,
  on,
}: {
  label: string;
  sub: string;
  on?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: 10,
        borderRadius: 8,
        background: on ? AC.brandSoft : "#fff",
        border: `1px solid ${on ? AC.brand : AC.line}`,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 700,
            color: on ? AC.brandInk : AC.ink2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            width: 28,
            height: 16,
            borderRadius: 99,
            background: on ? AC.brand : AC.bgDeep,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: on ? 14 : 2,
              width: 12,
              height: 12,
              borderRadius: 99,
              background: "#fff",
            }}
          />
        </div>
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

function SmallChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "4px 9px",
        borderRadius: 6,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 11.5,
        color: AC.ink2,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
