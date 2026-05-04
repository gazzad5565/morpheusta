// Inline SVG icon set — direct port of AGlyph from admin-tokens.jsx.
// In production, swap for Lucide React (names map 1:1).

import * as React from "react";

export type GlyphName =
  | "menu" | "search" | "bell" | "plus"
  | "chev-r" | "chev-l" | "chev-d" | "chev-u"
  | "home" | "ops" | "reps" | "customer" | "cal" | "chart"
  | "tasks" | "lib" | "send" | "audit" | "settings" | "pin"
  | "clock" | "play" | "pause" | "check" | "x"
  | "filter" | "sort" | "more" | "eye"
  | "arrow-r" | "arrow-u" | "arrow-d"
  | "warn" | "info" | "dot" | "logout" | "edit" | "trash"
  | "upload" | "download" | "phone" | "mail" | "building";

interface Props {
  name: GlyphName | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function AGlyph({ name, size = 18, color = "currentColor", strokeWidth = 1.7 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "menu":     return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case "search":   return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "bell":     return <svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "plus":     return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "chev-r":   return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "chev-l":   return <svg {...common}><path d="M15 6l-6 6 6 6"/></svg>;
    case "chev-d":   return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case "chev-u":   return <svg {...common}><path d="M6 15l6-6 6 6"/></svg>;
    case "home":     return <svg {...common}><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/></svg>;
    case "ops":      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/><circle cx="12" cy="12" r="3"/></svg>;
    case "reps":     return <svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M14.5 20a5 5 0 0 1 7-4.6"/></svg>;
    case "customer": return <svg {...common}><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/></svg>;
    case "cal":      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case "chart":    return <svg {...common}><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 6-7"/></svg>;
    case "tasks":    return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9l2 2 5-5M8 16l2 2 5-5"/></svg>;
    case "lib":      return <svg {...common}><path d="M4 5a2 2 0 0 1 2-2h7v18H6a2 2 0 0 1-2-2V5z"/><path d="M13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>;
    case "send":     return <svg {...common}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>;
    case "audit":    return <svg {...common}><path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 13h8M8 17h5M8 9h5"/></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "pin":      return <svg {...common}><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "clock":    return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "play":     return <svg {...common}><path d="M6 4l14 8-14 8V4z"/></svg>;
    case "pause":    return <svg {...common}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
    case "check":    return <svg {...common}><path d="M4 12l5 5 11-12"/></svg>;
    case "x":        return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case "filter":   return <svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></svg>;
    case "sort":     return <svg {...common}><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4"/></svg>;
    case "more":     return <svg {...common}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "eye":      return <svg {...common}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "arrow-r":  return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrow-u":  return <svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case "arrow-d":  return <svg {...common}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case "warn":     return <svg {...common}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>;
    case "info":     return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>;
    case "dot":      return <svg {...common}><circle cx="12" cy="12" r="4" fill={color} stroke="none"/></svg>;
    case "logout":   return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>;
    case "edit":     return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>;
    case "trash":    return <svg {...common}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>;
    case "upload":   return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>;
    case "download": return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>;
    case "phone":    return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L7.9 9.8a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>;
    case "mail":     return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>;
    case "building": return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h.01M9 11h.01M9 15h.01M14 7h.01M14 11h.01M14 15h.01M9 21v-4h6v4"/></svg>;
    default:         return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
}
