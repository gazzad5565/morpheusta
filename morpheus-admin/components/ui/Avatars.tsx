import { AC } from "@/lib/tokens";
import type { Customer, Rep } from "@/lib/types";
import { initialsFromNameOrEmail } from "@/lib/format";
import type { Profile } from "@/lib/profiles-store";

/** Structural subset of Customer that the swatch actually reads.
 *  Lets places that only carry a summary (joined task / shift rows)
 *  use the swatch without faking the full Customer shape. */
interface CustomerSwatchLike {
  initials: string;
  color: string;
  logoUrl?: string | null;
}

export function CustomerSwatch({
  customer,
  size = 32,
}: {
  customer: CustomerSwatchLike | Customer;
  size?: number;
}) {
  const r = size <= 32 ? 7 : 9;
  // When the customer has uploaded a logo, render that on a white
  // tile instead of the coloured initials. Keeps every CustomerSwatch
  // call site honest about branding without each one having to know.
  if (customer.logoUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background: "#fff",
          flexShrink: 0,
          overflow: "hidden",
          boxShadow: `0 0 0 1px ${AC.line}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customer.logoUrl}
          alt={customer.initials}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    );
  }
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
 * Rep avatar — uploaded photo if the rep has one, else a coloured disc
 * with white initials. Colour derives from `seed` (rep id / name /
 * initials — anything stable per rep) so the same rep always shows up
 * in the same colour without us having to store a colour column on
 * `profiles`. The photo path uses an <img> sized to fill the disc so
 * it can scale from list-rows (32px) up to profile-card (64px) without
 * style changes per call site.
 */
export function RepAvatar({
  rep,
  size = 32,
  seed,
}: {
  rep: Pick<Rep, "initials"> & { avatarUrl?: string | null };
  size?: number;
  /** Stable identifier for color hashing. Defaults to initials. */
  seed?: string;
}) {
  const bg = colorForRep(seed ?? rep.initials);
  if (rep.avatarUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 99,
          background: "#fff",
          flexShrink: 0,
          overflow: "hidden",
          boxShadow: `0 0 0 1px ${AC.line}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rep.avatarUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }
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

/**
 * RepAvatar wrapped in a span that flags scheduling conflicts with a
 * 2px red outer ring. Used by the Reassign pickers (shift detail +
 * LiveFeedPanel "Needs action") inside the Combobox `renderLeading`
 * slot, where a conflicted rep means "this rep already has an
 * overlapping shift at the same time".
 */
export function RepConflictAvatar({
  rep,
  conflict,
  size = 22,
}: {
  rep: Pick<Profile, "id" | "name" | "email" | "avatar_url">;
  conflict: boolean;
  size?: number;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: 99,
        boxShadow: conflict ? `0 0 0 2px ${AC.danger}` : undefined,
      }}
    >
      <RepAvatar
        rep={{
          initials: initialsFromNameOrEmail(rep.name, rep.email),
          avatarUrl: rep.avatar_url,
        }}
        size={size}
        seed={rep.id}
      />
    </span>
  );
}
