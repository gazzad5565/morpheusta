import type { NextRequest } from "next/server";

// Typeahead variant of the geocoder — returns up to N matches instead of one.
// Same Nominatim TOS rules apply (descriptive User-Agent, ≤1 req/s/user).

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
      "User-Agent": "morpheusta-admin/0.1 (https://github.com/gazzad5565/morpheusta)",
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
