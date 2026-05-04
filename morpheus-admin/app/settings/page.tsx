import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

const SETTINGS_NAV: { name: string; glyph: GlyphName; active?: boolean }[] = [
  { name: "Organisation", glyph: "building" },
  { name: "Roles & permissions", glyph: "reps" },
  { name: "Exception rules", glyph: "warn", active: true },
  { name: "Geofence defaults", glyph: "pin" },
  { name: "Working hours", glyph: "clock" },
  { name: "Notifications", glyph: "send" },
  { name: "Integrations", glyph: "lib" },
  { name: "Billing", glyph: "audit" },
  { name: "Data & privacy", glyph: "eye" },
];

export default function SettingsPage() {
  return (
    <AdminShell breadcrumbs={["Home", "Settings", "Exception rules"]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={6}>
          {SETTINGS_NAV.map((s) => (
            <button
              key={s.name}
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 10px",
                borderRadius: 7,
                background: s.active ? AC.brandSoft : "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                marginBottom: 1,
              }}
            >
              <AGlyph name={s.glyph} size={14} color={s.active ? AC.brandDeep : AC.mute} />
              <div
                style={{
                  flex: 1,
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: s.active ? AC.brandInk : AC.ink2,
                  fontWeight: s.active ? 700 : 500,
                  letterSpacing: -0.1,
                }}
              >
                {s.name}
              </div>
            </button>
          ))}
        </Card>

        <Card padding={0}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${AC.line}` }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 17,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.3,
              }}
            >
              Exception rules
            </div>
            <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.mute, marginTop: 4 }}>
              Define when the system flags a shift for review. Rules apply globally; per-customer
              overrides are configured on the customer&apos;s site.
            </div>
          </div>

          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <RuleRow
              title="Late check-in"
              desc="Flag a rep if they haven't checked in by this many minutes after shift start."
              control={<NumberControl value={15} unit="min" />}
              level="High"
            />
            <RuleRow
              title="Late return from break"
              desc="Flag a rep if they don't end their break within this window."
              control={<NumberControl value={10} unit="min" />}
              level="Medium"
            />
            <RuleRow
              title="Off-site check-in"
              desc="Flag if a rep checks in outside the customer's geofence."
              control={<SwitchControl label="Always flag" on />}
              level="High"
            />
            <RuleRow
              title="Early check-out"
              desc="Flag if a rep checks out more than this many minutes before shift end."
              control={<NumberControl value={20} unit="min" />}
              level="Low"
            />
            <RuleRow
              title="Missed required tasks"
              desc="Flag if any required task is unchecked at check-out."
              control={<SwitchControl label="Auto-flag" on />}
              level="High"
            />
            <RuleRow
              title="No-show"
              desc="Auto-cancel shift and notify manager if no check-in occurs."
              control={<NumberControl value={45} unit="min" />}
              level="High"
            />
            <RuleRow
              title="Rep-requested shifts"
              desc="Let reps add unscheduled customers to their day from the mobile app. Requests appear in the rep's Unscheduled list and notify the assigned manager."
              control={<SwitchControl label="Allow requests" on />}
              level="Low"
            />
          </div>

          <div
            style={{
              padding: "14px 20px",
              borderTop: `1px solid ${AC.line}`,
              background: AC.bg,
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderBottomLeftRadius: AC.radiusCard,
              borderBottomRightRadius: AC.radiusCard,
            }}
          >
            <AGlyph name="info" size={14} color={AC.mute} />
            <div style={{ flex: 1, fontFamily: AC.font, fontSize: 12, color: AC.mute }}>
              Changes are versioned in the audit log. Active rules apply to new shifts only.
            </div>
            <Btn size="sm">Discard</Btn>
            <Btn size="sm" kind="primary">Save changes</Btn>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function RuleRow({
  title,
  desc,
  control,
  level,
}: {
  title: string;
  desc: string;
  control: React.ReactNode;
  level: "High" | "Medium" | "Low";
}) {
  const lc = { High: AC.danger, Medium: AC.warn, Low: AC.mute }[level];
  const lbg = { High: AC.dangerTint, Medium: AC.warnTint, Low: AC.bg }[level];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 220px",
        gap: 20,
        padding: 16,
        border: `1px solid ${AC.line}`,
        borderRadius: 10,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 14,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.2,
            }}
          >
            {title}
          </div>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 99,
              background: lbg,
              color: lc,
              fontFamily: AC.font,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {level}
          </span>
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {desc}
        </div>
      </div>
      <div>{control}</div>
    </div>
  );
}

function NumberControl({ value, unit }: { value: number; unit: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          background: "#fff",
          border: `1px solid ${AC.line}`,
          cursor: "pointer",
          fontFamily: AC.font,
          fontSize: 14,
          fontWeight: 700,
          color: AC.ink2,
        }}
      >
        −
      </button>
      <div
        style={{
          flex: 1,
          padding: "7px 10px",
          borderRadius: 7,
          background: "#fff",
          border: `1px solid ${AC.line}`,
          textAlign: "center",
          fontFamily: AC.font,
          fontSize: 14,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.2,
        }}
      >
        {value}{" "}
        <span style={{ color: AC.mute, fontWeight: 500, fontSize: 11.5 }}>{unit}</span>
      </div>
      <button
        type="button"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          background: "#fff",
          border: `1px solid ${AC.line}`,
          cursor: "pointer",
          fontFamily: AC.font,
          fontSize: 14,
          fontWeight: 700,
          color: AC.ink2,
        }}
      >
        +
      </button>
    </div>
  );
}

function SwitchControl({ label, on }: { label: string; on?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 7,
        background: on ? AC.brandSoft : AC.bg,
        border: `1px solid ${on ? AC.brand : AC.line}`,
      }}
    >
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12.5,
          color: on ? AC.brandInk : AC.ink2,
          fontWeight: 700,
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
