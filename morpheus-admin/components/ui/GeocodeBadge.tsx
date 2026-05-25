"use client";

/**
 * GeocodeBadge — small inline pill showing the background-geocoder
 * status of a customer or site (Phase E, May 25).
 *
 * Renders nothing for 'done' and 'skipped' (the "boring" states) so
 * row UIs stay clean. Shows a soft brand-tinted "Geocoding…" pill
 * for 'pending', and a warn-tinted "Couldn't find this address"
 * for 'failed'. Clicking the failed pill is a no-op — the user fixes
 * it by editing the address, which the Phase E sites-store /
 * customers-store hook automatically flips back to 'pending'.
 */

import { AC } from "@/lib/tokens";

export type GeocodeStatus = "pending" | "done" | "failed" | "skipped" | null | undefined;

export function GeocodeBadge({ status }: { status: GeocodeStatus }) {
  if (status === "pending") {
    return (
      <span
        title="Background geocoder will resolve this address within ~1 minute."
        style={{
          padding: "2px 8px",
          borderRadius: 99,
          background: AC.brandSoft,
          color: AC.brandInk,
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
        📍 Geocoding…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        title="Nominatim couldn't resolve this address. Edit and save to retry."
        style={{
          padding: "2px 8px",
          borderRadius: 99,
          background: "#FFF8EE",
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
        📍 Couldn&apos;t find — edit to retry
      </span>
    );
  }
  return null;
}
