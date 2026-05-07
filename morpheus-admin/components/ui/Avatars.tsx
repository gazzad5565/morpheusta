import { AC } from "@/lib/tokens";
import type { Customer, Rep } from "@/lib/types";

export function CustomerSwatch({ customer, size = 32 }: { customer: Customer; size?: number }) {
  const r = size <= 32 ? 7 : 9;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: customer.color,
        color: "#fff",
        fontFamily: AC.font,
        fontSize: size <= 28 ? 10.5 : 11.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: 0.2,
        flexShrink: 0,
      }}
    >
      {customer.initials}
    </div>
  );
}

/**
 * Stable, vibrant palette for rep avatars. Picked to be visually distinct
 * from the customer-tile palette (more circle-friendly hues, all light
 * enough that white initials read cleanly). Same color always lands on
 * the same rep because we hash by id/initials/name — no flicker between
 * renders.
 */
const REP_PALETTE = [
  "#7C3AED", // violet
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#14B8A6", // teal
  "#8B5CF6", // purple
  "#22C55E", // green
  "#3B82F6", // blue
] as const;

export function colorForRep(seed: string | undefined | null): string {
  const s = (seed || "?").toString();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; // djb2-ish
  }
  return REP_PALETTE[h % REP_PALETTE.length];
}

/**
 * Rep avatar — colored disc with white initials. Color is derived from
 * `seed` (rep id, name, or initials — anything stable per rep), so the
 * same rep always shows up in the same color across the admin app
 * without us having to store a color column on `profiles`.
 */
export function RepAvatar({
  rep,
  size = 32,
  seed,
}: {
  rep: Pick<Rep, "initials">;
  size?: number;
  /** Stable identifier for color hashing. Defaults to initials. */
  seed?: string;
}) {
  const bg = colorForRep(seed ?? rep.initials);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: bg,
        color: "#fff",
        fontFamily: AC.font,
        fontSize: size <= 28 ? 10 : 11.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: 0.2,
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
      }}
    >
      {rep.initials}
    </div>
  );
}
