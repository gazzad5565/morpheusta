"use client";

/**
 * CoordsSourceChip — surfaces WHY a customer / site has its current
 * lat/lng (Mariska B4, May 28).
 *
 * The Phase E forward-geocode cron resolves vague addresses to
 * sometimes-wrong physical places. When a rep then pins their device
 * GPS via the /active geocode-task card, the coords get fixed but
 * the wrong street text lingers and the manager has no signal it's
 * stale. This chip says so out loud.
 *
 * Rendered only for the interesting state — 'rep_pinned'. The other
 * states ('manual', 'address_geocode', null) render nothing so row
 * UIs stay clean. Pair with GeocodeBadge (which surfaces the cron's
 * pending / failed states) — the two are orthogonal and can both
 * appear on the same row.
 */

import { AC } from "@/lib/tokens";

export type CoordsSource =
  | "manual"
  | "address_geocode"
  | "rep_pinned"
  | null
  | undefined;

export function CoordsSourceChip({ source }: { source: CoordsSource }) {
  if (source !== "rep_pinned") return null;
  return (
    <span
      title="A field rep dropped this pin from the mobile app. The GPS is trustworthy, but the street address text may not match. Edit and save to confirm."
      style={{
        padding: "2px 8px",
        borderRadius: 99,
        background: AC.warnTint,
        color: "#8E5A0E",
        fontFamily: AC.font,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      📍 Pinned by rep — confirm address
    </span>
  );
}
