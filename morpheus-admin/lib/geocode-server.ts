/**
 * Server-only geocoding helper around OpenStreetMap Nominatim.
 *
 * Used by:
 *   - /api/geocode/route.ts (browser-driven address search from the
 *     manual customer/site edit forms)
 *   - /api/cron/geocode-queue/route.ts (Phase E background worker
 *     that drains rows with geocode_status='pending')
 *
 * Nominatim ToS requires a descriptive User-Agent AND no more than
 * 1 req/sec. The User-Agent header is set here; the cron route is
 * the one that enforces the 1 req/sec by sleeping between pulls.
 * The manual search route doesn't sleep because it's user-initiated
 * and one request per save is well under the limit.
 */

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  displayName: string;
}

export async function geocodeAddress(
  query: string
): Promise<GeocodeHit | null> {
  const q = (query || "").trim();
  if (!q) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "morpheus-ops-admin/0.1 (https://github.com/gazzad5565/morpheus-opps)",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim returned ${res.status}`);
  }
  const results = (await res.json()) as NominatimResult[];
  if (!results.length) return null;
  const r = results[0];
  const lat = parseFloat(r.lat);
  const lon = parseFloat(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { latitude: lat, longitude: lon, displayName: r.display_name };
}
