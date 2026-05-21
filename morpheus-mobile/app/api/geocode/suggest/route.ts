/**
 * Mobile-side typeahead geocoder.
 *
 * Mirror of morpheus-admin/app/api/geocode/suggest/route.ts —
 * returns up to 6 Nominatim matches for a partial query, used by
 * <AddressAutocomplete /> on /add-customer so the rep can pick a
 * suggestion which captures address + lat/lng in one step.
 *
 * Why not call the admin's endpoint cross-origin: admin runs on a
 * separate Vercel project; a local route is simpler than another
 * CORS allowlist. Nominatim is keyless so nothing to share.
 *
 * Nominatim TOS:
 *   - Descriptive User-Agent — set below.
 *   - ≤1 req/s — observed naturally: debounced 350 ms on the
 *     client side + manual typeahead. One rep at a time.
 */

import type { NextRequest } from "next/server";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  place_id?: number;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return Response.json({ results: [] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "morpheus-ops-mobile/0.1 (https://github.com/gazzad5565/morpheus-opps)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    return Response.json(
      { error: `Geocoder returned ${res.status}`, results: [] },
      { status: 502 }
    );
  }

  const raw = (await res.json()) as NominatimResult[];
  const results = raw.map((r) => ({
    id: r.place_id ?? `${r.lat},${r.lon}`,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    displayName: r.display_name,
  }));

  return Response.json({ results });
}
