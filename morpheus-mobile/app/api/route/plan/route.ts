/**
 * /api/route/plan — server-side route planner.
 *
 * Provider-agnostic interface: callers (the mobile /route page) send
 * the rep's origin + an ordered list of shift stops, this route
 * returns ETA + duration per leg + the total. We delegate to one of
 * two providers based on env:
 *
 *   • GOOGLE_ROUTES_API_KEY set → Google Routes API (TRAFFIC_AWARE),
 *     which gives traffic-adjusted ETAs and is the production option.
 *   • Otherwise → a mock provider that estimates from straight-line
 *     haversine distance × an urban speed assumption. Good enough for
 *     UX testing and a usable fallback when nobody's paying Google.
 *
 * Why server-side: the routing provider needs an API key, and shipping
 * that key to the client would leak it to anyone who pops devtools.
 * The mobile page POSTs to this route and never sees the credential.
 *
 * Cost note: Google Routes Compute Routes is ~$5 per 1k requests after
 * the $200/mo free tier. With a typical rep planning their day 1–3×
 * and caching for 5 minutes client-side, that's well under the free
 * tier for a small team.
 */

import { NextResponse } from "next/server";

interface PlanStop {
  /** Stable id — the shift_id from the caller. Echoed back so the
   *  client can match legs to its source rows. */
  id: string;
  lat: number;
  lng: number;
  /** Optional human label for the response (customer name etc). */
  label?: string;
  /** Optional scheduled arrival time in ISO. Used by the client to
   *  compute "Leave by X" — server doesn't need it. */
  scheduledArrival?: string;
}

interface PlanRequestBody {
  origin: { lat: number; lng: number };
  stops: PlanStop[];
  /** When true, the server optimizes the stop order before computing
   *  legs. Defaults to false — we trust the caller's ordering
   *  (typically chronological by scheduled start). */
  optimize?: boolean;
  /** When false, force the mock provider even if GOOGLE_ROUTES_API_KEY
   *  is set. Drives the "Live traffic" toggle on the mobile /route
   *  page — reps who don't trust Google's ETAs (or want the
   *  consistent straight-line estimates) can flip it off and the
   *  server complies. Defaults to true (use Google when configured). */
  traffic?: boolean;
}

export interface PlanLeg {
  toStopId: string;
  toLabel?: string;
  /** Straight-line metres between this leg's two endpoints —
   *  always present, regardless of provider. */
  haversineMeters: number;
  /** Driving distance in metres, when the provider knows it.
   *  Mock provider sets this equal to haversineMeters × 1.4 to
   *  approximate road-network winding. */
  driveMeters: number;
  /** Driving duration in seconds, traffic-adjusted when the provider
   *  supports it (Google Routes TRAFFIC_AWARE_OPTIMAL). */
  driveSeconds: number;
  /** Optional encoded polyline for drawing the leg on a map.
   *  Mock provider doesn't emit this; Google does. */
  polyline?: string;
}

export interface PlanResponse {
  provider: "google" | "mock";
  legs: PlanLeg[];
  totalSeconds: number;
  totalMeters: number;
  /** When optimize=true, the order the server picked (array of stop
   *  ids in chosen visit order). Identical to input.stops.map(.id)
   *  otherwise. */
  order: string[];
  /** When traffic-aware data is unavailable (mock provider or Google
   *  fell back), we tell the client so the UX can hide the "traffic"
   *  pill rather than pretending. */
  trafficAware: boolean;
  /** Set when the route was provided by Google but the API returned
   *  an error or partial result; client falls back to mock. */
  warning?: string;
}

const EARTH_M = 6371000;
function haversineM(a: PlanStop | { lat: number; lng: number }, b: PlanStop | { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}

/**
 * Mock provider — estimates driving time from haversine distance
 * × a 30 km/h urban average speed (Cape Town-ish numbers, generous
 * for the slowest moment of the day). Road-network winding is
 * approximated as 1.4× the straight-line distance — a common heuristic
 * for urban driving. Not accurate enough for real ETAs at scale, but
 * fine for showing the UX shape without burning Google quota.
 */
function planMock(origin: PlanRequestBody["origin"], stops: PlanStop[]): PlanResponse {
  const URBAN_MPS = 30_000 / 3600; // 30 km/h → m/s
  const WINDING = 1.4;
  let prev: { lat: number; lng: number } = origin;
  let totalMeters = 0;
  let totalSeconds = 0;
  const legs: PlanLeg[] = [];
  for (const s of stops) {
    const haversine = haversineM(prev, s);
    const driveMeters = haversine * WINDING;
    const driveSeconds = driveMeters / URBAN_MPS;
    legs.push({
      toStopId: s.id,
      toLabel: s.label,
      haversineMeters: Math.round(haversine),
      driveMeters: Math.round(driveMeters),
      driveSeconds: Math.round(driveSeconds),
    });
    totalMeters += driveMeters;
    totalSeconds += driveSeconds;
    prev = s;
  }
  return {
    provider: "mock",
    legs,
    totalSeconds: Math.round(totalSeconds),
    totalMeters: Math.round(totalMeters),
    order: stops.map((s) => s.id),
    trafficAware: false,
  };
}

/**
 * Google Routes API — Compute Routes (intermediates + traffic-aware).
 * Posts to v2 endpoint with a fieldMask requesting only what we
 * render to keep the response small. Returns the same PlanResponse
 * shape so the client doesn't care which provider fulfilled the
 * request.
 *
 * Failure modes are converted into a mock fallback so the UI
 * doesn't break — the client just sees provider="mock" and a
 * warning field they can surface as a non-blocking pill.
 */
async function planGoogle(
  origin: PlanRequestBody["origin"],
  stops: PlanStop[],
  apiKey: string
): Promise<PlanResponse> {
  if (stops.length === 0) {
    return {
      provider: "google",
      legs: [],
      totalSeconds: 0,
      totalMeters: 0,
      order: [],
      trafficAware: true,
    };
  }
  // Body shape per https://developers.google.com/maps/documentation/routes/compute_route_directions
  const intermediates = stops.slice(0, -1).map((s) => ({
    location: { latLng: { latitude: s.lat, longitude: s.lng } },
  }));
  const destination = stops[stops.length - 1];
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    intermediates,
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    polylineQuality: "OVERVIEW",
    units: "METRIC",
    languageCode: "en-US",
  };
  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return {
        ...planMock(origin, stops),
        warning: `Google Routes ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    type GoogleResp = {
      routes?: Array<{
        duration?: string; // "1234s"
        distanceMeters?: number;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          duration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
        }>;
      }>;
    };
    const data = (await res.json()) as GoogleResp;
    const route = data.routes?.[0];
    if (!route || !route.legs || route.legs.length !== stops.length) {
      return {
        ...planMock(origin, stops),
        warning: "Google Routes returned an unexpected shape; using fallback.",
      };
    }
    const parseSec = (s?: string): number => {
      if (!s) return 0;
      const m = /^(\d+(?:\.\d+)?)s$/.exec(s);
      return m ? Math.round(parseFloat(m[1])) : 0;
    };
    let totalMeters = 0;
    let totalSeconds = 0;
    const legs: PlanLeg[] = route.legs.map((leg, i) => {
      const stop = stops[i];
      const prev =
        i === 0
          ? origin
          : { lat: stops[i - 1].lat, lng: stops[i - 1].lng };
      const driveMeters = leg.distanceMeters ?? 0;
      const driveSeconds = parseSec(leg.duration);
      totalMeters += driveMeters;
      totalSeconds += driveSeconds;
      return {
        toStopId: stop.id,
        toLabel: stop.label,
        haversineMeters: Math.round(haversineM(prev, stop)),
        driveMeters,
        driveSeconds,
        polyline: leg.polyline?.encodedPolyline,
      };
    });
    return {
      provider: "google",
      legs,
      totalSeconds,
      totalMeters,
      order: stops.map((s) => s.id),
      trafficAware: true,
    };
  } catch (err) {
    return {
      ...planMock(origin, stops),
      warning: `Google Routes fetch failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Greedy nearest-neighbour ordering — picks the closest remaining
 * stop after each step. Not optimal in general (TSP is NP-hard) but
 * for the typical 3–8 stops a rep visits in a day it gets within
 * 5–10 % of optimal in practice, and the user can always re-arrange
 * in admin if they have a specific sequence in mind. O(n²) which is
 * trivial at these sizes.
 */
function optimizeOrder(
  origin: PlanRequestBody["origin"],
  stops: PlanStop[]
): PlanStop[] {
  const remaining = [...stops];
  const out: PlanStop[] = [];
  let prev: { lat: number; lng: number } = origin;
  while (remaining.length > 0) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(prev, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const picked = remaining.splice(bestI, 1)[0];
    out.push(picked);
    prev = picked;
  }
  return out;
}

export async function POST(req: Request) {
  let body: PlanRequestBody;
  try {
    body = (await req.json()) as PlanRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.origin || typeof body.origin.lat !== "number" || typeof body.origin.lng !== "number") {
    return NextResponse.json({ error: "origin.lat/lng required" }, { status: 400 });
  }
  if (!Array.isArray(body.stops)) {
    return NextResponse.json({ error: "stops[] required" }, { status: 400 });
  }
  const cleanStops = body.stops.filter(
    (s) =>
      s &&
      typeof s.id === "string" &&
      typeof s.lat === "number" &&
      typeof s.lng === "number"
  );
  // Hard cap. Anything more than ~25 stops is well past a single rep's
  // realistic day AND past Google's free-tier sweet spot. Truncate
  // rather than error — the response still works for the first N.
  const stops = cleanStops.slice(0, 25);
  const ordered = body.optimize ? optimizeOrder(body.origin, stops) : stops;

  // `traffic` is the client's opt-in to the Google provider. Default
  // is true (preserve prior behaviour where the route was always
  // Google when a key was configured). Setting it explicitly to
  // false forces the mock path even when GOOGLE_ROUTES_API_KEY is
  // available — used by the mobile /route page's "Live traffic"
  // toggle to let reps fall back to the simpler estimates on demand.
  const useTraffic = body.traffic !== false;
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  const response = useTraffic && apiKey
    ? await planGoogle(body.origin, ordered, apiKey)
    : planMock(body.origin, ordered);
  // Override the order on the response with the actual visit
  // order (may differ from input when optimize=true).
  response.order = ordered.map((s) => s.id);
  return NextResponse.json(response);
}
