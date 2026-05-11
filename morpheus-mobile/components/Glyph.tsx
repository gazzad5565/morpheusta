import * as React from "react";

export type GlyphName =
  | "menu" | "refresh"
  | "chev-r" | "chev-l" | "chev-d" | "chev-u"
  | "arrow-r" | "check" | "check-circle"
  | "pin" | "clock" | "warn" | "info"
  | "log" | "leave" | "book" | "target"
  | "close" | "mic" | "camera" | "note"
  | "sparkle" | "house" | "face";

interface Props {
  name: GlyphName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Glyph({ name, size = 22, color = "currentColor", strokeWidth = 1.8 }: Props) {
  const c = color;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: c,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "menu":     return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case "refresh":  return <svg {...common}><path d="M4 12a8 8 0 0 1 14-5.3L21 9"/><path d="M21 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L3 15"/><path d="M3 20v-5h5"/></svg>;
    case "chev-r":   return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "chev-l":   return <svg {...common}><path d="M15 6l-6 6 6 6"/></svg>;
    case "chev-d":   return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case "chev-u":   return <svg {...common}><path d="M6 15l6-6 6 6"/></svg>;
    case "arrow-r":  return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "check":    return <svg {...common}><path d="M4 12l5 5 11-12"/></svg>;
    case "check-circle": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>;
    case "pin":      return <svg {...common}><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "clock":    return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "warn":     return <svg {...common}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>;
    case "info":     return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>;
    case "log":      return <svg {...common}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M14 12h7M17 8l4 4-4 4"/></svg>;
    case "leave":    return <svg {...common}><path d="M3 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M3 21h18"/><path d="M8 11h4M8 7h4"/></svg>;
    case "book":     return <svg {...common}><path d="M4 4h9a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M20 4v12a4 4 0 0 0-4 4"/></svg>;
    case "target":   return <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={c}/></svg>;
    case "close":    return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "mic":      return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>;
    case "camera":   return <svg {...common}><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>;
    case "note":     return <svg {...common}><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
    case "sparkle":  return <svg {...common}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></svg>;
    case "house":    return <svg {...common}><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/></svg>;
    case "face":     return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    default:         return null;
  }
}

// Brand wordmark used in headers/footers
export function MorpheusMark({ inverted = false, size = 14 }: { inverted?: boolean; size?: number }) {
  const dark = inverted ? "#FFFFFF" : "#111418";
  const accent = "#15B4D6";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "Inter, sans-serif",
        fontWeight: 800,
        letterSpacing: 2,
        fontSize: size,
        color: dark,
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: 2,
          background: accent,
          display: "inline-block",
          boxShadow: `0 0 0 2px ${inverted ? "#0B0D10" : "#fff"}, 0 0 0 3px ${accent}`,
        }}
      />
      <span>Morpheus</span>
      <span style={{ color: accent, fontWeight: 700 }}>t&a²</span>
    </div>
  );
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
