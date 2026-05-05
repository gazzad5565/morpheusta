import type { NextRequest } from "next/server";

// Server-side geocoding proxy to OpenStreetMap Nominatim.
// Nominatim TOS requires a descriptive User-Agent and ≤1 req/s — we set the
// header here (the browser won't), and rely on the call pattern (one geocode
// per customer save) staying well under the rate limit.

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
      "User-Agent": "morpheusta-admin/0.1 (https://github.com/gazzad5565/morpheusta)",
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
