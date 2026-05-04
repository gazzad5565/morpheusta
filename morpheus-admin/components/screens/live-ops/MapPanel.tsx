import { AC, type StatusKey } from "@/lib/tokens";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { Btn } from "@/components/ui/Btn";
import { REPS, CUSTOMERS } from "@/lib/mock-data";
import type { Customer, Rep } from "@/lib/types";

const PIN_COLOR: Record<string, string> = {
  onsite: AC.ok,
  travelling: AC.warn,
  late: AC.danger,
  offsite: AC.danger,
  onbreak: "#5447BD",
  offline: AC.faint,
};

export function MapPanel() {
  return (
    <Card padding={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
        }}
      >
        <SectionTitle>Field map · live</SectionTitle>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <Legend color={AC.ok} label="On site" />
          <Legend color={AC.warn} label="Travelling" />
          <Legend color={AC.danger} label="Late / off-site" />
          <Legend color={AC.faint} label="Offline" muted />
          <div style={{ width: 1, height: 14, background: AC.line, margin: "0 4px" }} />
          <RegionTab active>All regions</RegionTab>
          <RegionTab>North</RegionTab>
          <RegionTab>South</RegionTab>
          <RegionTab>East</RegionTab>
          <RegionTab>West</RegionTab>
        </div>
      </div>

      <FauxMap />
    </Card>
  );
}

function RegionTab({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        padding: "4px 9px",
        borderRadius: 6,
        background: active ? AC.ink : "transparent",
        color: active ? "#fff" : AC.mute,
        border: active ? "1px solid transparent" : `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Legend({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 4px" }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: color,
          opacity: muted ? 0.6 : 1,
        }}
      />
      <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

function FauxMap() {
  const pins: { x: number; y: number; status: StatusKey; rep: Rep }[] = [
    { x: 22, y: 30, status: "onsite", rep: REPS[0] },
    { x: 35, y: 22, status: "travelling", rep: REPS[1] },
    { x: 60, y: 70, status: "onsite", rep: REPS[2] },
    { x: 64, y: 75, status: "onbreak", rep: REPS[3] },
    { x: 78, y: 38, status: "late", rep: REPS[4] },
    { x: 80, y: 45, status: "onsite", rep: REPS[5] },
    { x: 14, y: 60, status: "travelling", rep: REPS[6] },
    { x: 18, y: 66, status: "offsite", rep: REPS[7] },
    { x: 50, y: 50, status: "onsite", rep: REPS[9] },
    { x: 25, y: 78, status: "onbreak", rep: REPS[11] },
  ];

  return (
    <div
      style={{
        position: "relative",
        height: 360,
        background: "#F1F4F7",
        backgroundImage: `linear-gradient(${AC.lineDim} 1px, transparent 1px), linear-gradient(90deg, ${AC.lineDim} 1px, transparent 1px)`,
        backgroundSize: "32px 32px",
        overflow: "hidden",
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M5,10 Q15,5 30,8 Q42,12 40,30 Q35,42 22,42 Q10,40 8,30 Z" fill="#E8EDF1" stroke="#D4DAE0" strokeWidth="0.2" />
        <path d="M45,15 Q60,12 78,18 Q90,28 85,45 Q72,52 60,48 Q48,42 45,30 Z" fill="#EAF0EA" stroke="#D7DFD7" strokeWidth="0.2" />
        <path d="M8,55 Q22,52 32,58 Q38,68 32,82 Q20,92 12,85 Q4,72 6,62 Z" fill="#F0EDE7" stroke="#DED9D1" strokeWidth="0.2" />
        <path d="M50,55 Q70,55 88,62 Q92,75 82,88 Q60,92 50,82 Q44,70 48,62 Z" fill="#EBE7F0" stroke="#D7D2DE" strokeWidth="0.2" />
        <path d="M0,40 Q40,38 60,42 Q80,46 100,40" fill="none" stroke="#D4DAE0" strokeWidth="0.4" />
        <path d="M40,0 Q42,30 50,55 Q58,80 60,100" fill="none" stroke="#D4DAE0" strokeWidth="0.4" />
      </svg>

      <RegionLabel x="20%" y="22%" label="NORTH" />
      <RegionLabel x="65%" y="28%" label="EAST" />
      <RegionLabel x="18%" y="72%" label="WEST" />
      <RegionLabel x="68%" y="78%" label="SOUTH" />

      <SiteMarker x={28} y={32} customer={CUSTOMERS[0]} />
      <SiteMarker x={62} y={72} customer={CUSTOMERS[2]} />
      <SiteMarker x={80} y={42} customer={CUSTOMERS[4]} />
      <SiteMarker x={20} y={64} customer={CUSTOMERS[6]} />
      <SiteMarker x={52} y={48} customer={CUSTOMERS[5]} />

      {pins.map((p, i) => (
        <RepPin key={i} {...p} color={PIN_COLOR[p.status]} />
      ))}

      <OffsiteCallout x={18} y={66} rep={REPS[7]} />

      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <MapCtrl glyph="plus" />
        <MapCtrl glyph="x" />
      </div>

      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#fff",
          padding: "5px 9px",
          borderRadius: 7,
          border: `1px solid ${AC.line}`,
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
        }}
      >
        <AGlyph name="clock" size={12} color={AC.mute} />
        Updated 8s ago
      </div>
    </div>
  );
}

function MapCtrl({ glyph }: { glyph: GlyphName }) {
  return (
    <button
      type="button"
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        background: "#fff",
        border: `1px solid ${AC.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <AGlyph name={glyph} size={14} color={AC.ink2} />
    </button>
  );
}

function RegionLabel({ x, y, label }: { x: string; y: string; label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        fontFamily: AC.font,
        fontSize: 10,
        fontWeight: 700,
        color: AC.faint,
        letterSpacing: 1.5,
      }}
    >
      {label}
    </div>
  );
}

function SiteMarker({ x, y, customer }: { x: number; y: number; customer: Customer }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 99,
          background: customer.color,
          opacity: 0.1,
          border: `1px dashed ${customer.color}`,
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: customer.color,
          color: "#fff",
          fontFamily: AC.font,
          fontSize: 9,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          position: "relative",
        }}
      >
        {customer.initials}
      </div>
    </div>
  );
}

function RepPin({ x, y, color, rep }: { x: number; y: number; color: string; rep: Rep }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <svg width="22" height="28" viewBox="0 0 22 28">
        <path
          d="M11 27 Q4 18 4 11 a7 7 0 1 1 14 0 Q18 18 11 27z"
          fill={color}
          stroke="#fff"
          strokeWidth="2"
        />
        <circle cx="11" cy="11" r="3" fill="#fff" />
      </svg>
      <div
        style={{
          position: "absolute",
          top: -2,
          left: 26,
          whiteSpace: "nowrap",
          background: "#fff",
          padding: "2px 6px",
          borderRadius: 5,
          border: `1px solid ${AC.line}`,
          fontFamily: AC.font,
          fontSize: 10,
          color: AC.ink2,
          fontWeight: 600,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          opacity: rep.id === "r1" || rep.id === "r5" ? 1 : 0,
          pointerEvents: "none",
        }}
      >
        {rep.initials}
      </div>
    </div>
  );
}

function OffsiteCallout({ x, y, rep }: { x: number; y: number; rep: Rep }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(20px, -100%)",
        background: "#fff",
        borderRadius: 10,
        border: `1px solid ${AC.danger}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
        padding: "9px 11px",
        minWidth: 200,
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <RepAvatar rep={rep} size={26} />
        <div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.1,
            }}
          >
            {rep.name}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.danger, fontWeight: 600 }}>
            OFF-SITE check-in
          </div>
        </div>
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, lineHeight: 1.4 }}>
        380 m from <b style={{ color: AC.ink2 }}>Highmark Retail</b> · 75 m geofence
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <Btn size="sm" kind="primary">Approve</Btn>
        <Btn size="sm">Flag</Btn>
      </div>
    </div>
  );
}
