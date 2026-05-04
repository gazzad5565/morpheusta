// Mobile design tokens — direct port of MC from app-tokens.jsx

export const MC = {
  // brand
  brand: "#15B4D6",
  brandDeep: "#0E8FAD",
  brandInk: "#073B47",
  brandTint: "#E3F6FB",

  // neutrals
  ink: "#111418",
  ink2: "#2A2F36",
  mute: "#5B6470",
  hint: "#8A929C",
  line: "#E6E8EC",
  card: "#FFFFFF",
  bg: "#F4F5F7",
  header: "#171A1F",
  headerInk: "#FFFFFF",

  // states
  warn: "#E5A017",
  warnTint: "#FDF1D5",
  danger: "#D9365F",
  dangerTint: "#FDE4EC",
  ok: "#1FA971",
  okTint: "#DEF6EB",

  // customer swatches
  swatch: {
    GW: "#D9493D",
    NG: "#E2A434",
    OS: "#2E9C82",
    SB: "#2E4FB8",
    PR: "#C55A2E",
  } as const,

  // type
  font: '"Inter", -apple-system, system-ui, sans-serif',
  fontDisplay: '"Inter", -apple-system, system-ui, sans-serif',

  // shape
  radiusCard: 18,
  radiusChip: 999,
  radiusInput: 12,
} as const;

export type SwatchKey = keyof typeof MC.swatch;
