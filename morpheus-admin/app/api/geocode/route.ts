import type { NextRequest } from "next/server";
import { geocodeAddress } from "@/lib/geocode-server";

// Server-side geocoding proxy. Thin wrapper around the shared
// lib/geocode-server.ts helper (Phase E, May 25) — same helper is
// used by /api/cron/geocode-queue to drain background-imported rows.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "Missing 'q' query param" }, { status: 400 });
  }
  try {
    const hit = await geocodeAddress(q);
    if (!hit) {
      return Response.json({ error: "No match found" }, { status: 404 });
    }
    return Response.json(hit);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Geocoder failed" },
      { status: 502 }
    );
  }
}
