/**
 * Mobile-side geocoding proxy.
 *
 * Mirror of morpheus-admin/app/api/geocode/route.ts — proxies to
 * OpenStreetMap Nominatim. No API key needed. Used by the
 * /active geocode-task card when a rep needs to convert a
 * customer's typed address into lat/lng.
 *
 * Why a mobile-side endpoint instead of calling admin cross-
 * origin: admin runs on a separate Vercel project with its own
 * Root Directory + auth gate. A local endpoint is simpler than
 * setting up another CORS path. Nominatim is keyless so there's
 * no duplicated secret either.
 *
 * Nominatim TOS requires:
 *   - Descriptive User-Agent — set below.
 *   - ≤1 req/s — observed naturally: one call per rep per shift
 *     when geocoding a customer's site, which is rare.
 *
 * Response shape matches the admin endpoint for symmetry so
 * future shared helpers can target either origin transparently.
 */

import type { NextRequest } from "next/server";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "Missing 'q' query param" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "morpheus-ops-mobile/0.1 (https://github.com/gazzad5565/morpheus-opps)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    return Response.json(
      { error: `Geocoder returned ${res.status}` },
      { status: 502 }
    );
  }

  const results = (await res.json()) as NominatimResult[];
  if (!results.length) {
    return Response.json({ error: "No match found" }, { status: 404 });
  }

  const r = results[0];
  return Response.json({
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    displayName: r.display_name,
  });
}
