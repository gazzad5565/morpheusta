// Design tokens — direct port of admin-tokens.jsx from the design handoff.
// Keep this in sync with the spec; consumers reference AC.* by name.

export const AC = {
  // Brand
  brand: "#15B4D6",
  brandDeep: "#0E8FAD",
  brandInk: "#073B47",
  brandTint: "#E3F6FB",
  brandSoft: "#F0FAFD",

  // Neutrals
  ink: "#0F1216",
  ink2: "#22272E",
  ink3: "#3D4651",
  mute: "#5C6571",
  hint: "#8B939E",
  faint: "#B6BCC5",

  line: "#E4E7EB",
  lineDim: "#EEF0F3",
  card: "#FFFFFF",
  bg: "#F7F8FA",
  bgDeep: "#EEF1F4",
  side: "#0E1116",
  sideInk: "#E6E9EE",
  sideMute: "#8C95A2",
  sideHover: "#1B2027",
  topbar: "#FFFFFF",

  // States
  ok: "#1FA971",
  okTint: "#DEF6EB",
  warn: "#E5A017",
  warnTint: "#FDF1D5",
  danger: "#D9365F",
  dangerTint: "#FDE4EC",
  info: "#15B4D6",
  infoTint: "#E3F6FB",

  // Status pills
  status: {
    offline: { bg: "#EFF1F4", dot: "#9AA3AE", ink: "#3D4651", label: "Offline" },
    travelling: { bg: "#FFF4D8", dot: "#E5A017", ink: "#7A560A", label: "Travelling" },
    onsite: { bg: "#DEF6EB", dot: "#1FA971", ink: "#0F5A38", label: "On site" },
    onbreak: { bg: "#E6E9F8", dot: "#5447BD", ink: "#241B5A", label: "On break" },
    late: { bg: "#FDE4EC", dot: "#D9365F", ink: "#6E1430", label: "Late" },
    offsite: { bg: "#FDF1D5", dot: "#E5A017", ink: "#7A560A", label: "Off-site" },
  } as const,

  // Customer swatches
  swatch: {
    GW: "#D9493D",
    NG: "#E2A434",
    OS: "#2E9C82",
    SB: "#2E4FB8",
    PR: "#C55A2E",
    AC: "#8E4ECC",
    HM: "#1FA971",
  } as const,

  // Type
  font: '"Inter", -apple-system, system-ui, sans-serif',
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",

  // Shape
  radiusCard: 14,
  radiusInput: 10,
  radiusChip: 999,

  // Layout
  sideW: 240,
  sideWMini: 64,
  topH: 56,
} as const;

export type StatusKey = keyof typeof AC.status;
export type SwatchKey = keyof typeof AC.swatch;
