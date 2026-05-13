/**
 * Geo helpers (mobile) — May 13.
 *
 * Shared utility functions for distance + coordinate math. Previously
 * `haversineMeters` was defined locally in three separate files
 * (/check-in, /check-out, shifts-store). Each was a copy-paste with
 * minor parameter shape differences; this module unifies them so a
 * fix to the math (or a switch to a different formula) lands in one
 * place.
 */

/**
 * Great-circle distance between two lat/lng pairs in METRES, using
 * the Haversine formula. Earth radius taken as 6,371,000 m (mean
 * radius — good to ~0.5% over typical field-rep distances; we don't
 * need WGS84 precision for "is the rep on-site?" checks).
 *
 * Accepts loose argument shape for backwards-compat with the call
 * sites that previously took four scalar args:
 *
 *   haversineMeters(latA, lngA, latB, lngB)            // scalars
 *   haversineMeters({lat: A, lng: A}, {lat: B, lng: B}) // points
 *
 * Both forms produce identical results.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineMeters(
  a: LatLng,
  b: LatLng
): number;
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number;
export function haversineMeters(
  ...args: [LatLng, LatLng] | [number, number, number, number]
): number {
  let lat1: number;
  let lon1: number;
  let lat2: number;
  let lon2: number;
  if (typeof args[0] === "object") {
    lat1 = (args[0] as LatLng).lat;
    lon1 = (args[0] as LatLng).lng;
    lat2 = (args[1] as LatLng).lat;
    lon2 = (args[1] as LatLng).lng;
  } else {
    [lat1, lon1, lat2, lon2] = args as [number, number, number, number];
  }
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

/** Human-friendly distance string. Under 1km → metres, 1–10km → 2dp
 *  km, otherwise 1dp km. Used on the check-in screen + a couple of
 *  banner copy paths. */
export function formatDistanceMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
