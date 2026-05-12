"use client";

/**
 * MiniRouteMap — small inline map for showing a driving route from
 * the rep's current GPS to a single destination.
 *
 * Used in the /shifts page's expanded shift row so the rep can see
 * the same kind of route preview that the home-page Up Next card
 * surfaces, without leaving the list view. Designed to be lazy-
 * mounted: only constructed when the row is expanded, torn down on
 * collapse. With /shifts using a single-value expandedId, at most
 * one MiniRouteMap is alive at any time.
 *
 * What's inside:
 *   - MapLibre canvas (uses the same OpenFreeMap tiles as the
 *     dashboard map, no API key)
 *   - Two markers: rep dot (circular, brand-coloured) + destination
 *     (rounded-square customer-coloured tile with initials)
 *   - The real road-following polyline once planRoute responds.
 *     Falls back to a dashed straight line until then.
 *   - A small "12 min · 5.2 km · live traffic" caption overlaid on
 *     the bottom of the map.
 *
 * Cross-platform: MapLibre + planRoute + requestGeolocationOnce.
 * Identical on iOS Safari, iOS PWA, Android Chrome, Android PWA.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MC } from "@/lib/tokens";
import {
  planRoute,
  requestGeolocationOnce,
  type LatLng,
} from "@/lib/route-planner";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Same Google-polyline decoder as DashboardMap. Inlined to avoid
 *  cross-component coupling — both helpers are small (~25 lines). */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push([lng * 1e-5, lat * 1e-5]);
  }
  return points;
}

interface Props {
  destLat: number;
  destLng: number;
  destLabel: string;
  destInitials: string;
  destColor: string;
  height?: number;
}

interface RouteData {
  polyline: string | null;
  driveSec: number;
  driveM: number;
  trafficAware: boolean;
}

export function MiniRouteMap({
  destLat,
  destLng,
  destLabel,
  destInitials,
  destColor,
  height = 180,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);

  // Map init — runs once on mount; teardown on unmount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [destLng, destLat],
      zoom: 12,
      attributionControl: false,
      interactive: true,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = m;
    m.on("load", () => setLoaded(true));

    // Destination marker — rounded-square with initials, same visual
    // language as the dashboard map's customer pins.
    const destEl = document.createElement("div");
    destEl.style.cssText = `
      width: 32px; height: 32px; border-radius: 9px;
      background: ${destColor};
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-family: ${MC.font}; font-weight: 700; font-size: 11px;
      letter-spacing: 0.4px;
      box-shadow: 0 2px 6px rgba(10,15,30,0.25), inset 0 0 0 1px rgba(255,255,255,.18);
    `;
    destEl.textContent = destInitials;
    destMarkerRef.current = new maplibregl.Marker({ element: destEl })
      .setLngLat([destLng, destLat])
      .addTo(m);

    return () => {
      try {
        m.remove();
      } catch {
        /* already removed */
      }
      mapRef.current = null;
      userMarkerRef.current = null;
      destMarkerRef.current = null;
    };
    // destLabel intentionally not in deps — label changes don't
    // require a full re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destLat, destLng, destColor, destInitials]);

  // Fetch GPS (cached at module level by requestGeolocationOnce).
  useEffect(() => {
    let cancelled = false;
    requestGeolocationOnce().then((pos) => {
      if (!cancelled) setOrigin(pos);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once we have GPS, plot the user dot + fire planRoute for the
  // actual driving polyline. Falls back to a dashed straight line
  // until the response arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !origin) return;

    // User dot — circular pill mirroring DashboardMap's style so the
    // rep recognises the visual language.
    if (userMarkerRef.current) userMarkerRef.current.remove();
    const userEl = document.createElement("div");
    userEl.style.cssText = `
      width: 26px; height: 26px; border-radius: 99px;
      background: ${MC.brand}; border: 3px solid #fff;
      box-shadow: 0 0 0 4px ${MC.brand}33, 0 1px 4px rgba(0,0,0,0.25);
    `;
    userEl.title = "You are here";
    userMarkerRef.current = new maplibregl.Marker({ element: userEl })
      .setLngLat([origin.lng, origin.lat])
      .addTo(map);

    // Fit both endpoints in view immediately (before planRoute lands).
    const bounds = new maplibregl.LngLatBounds()
      .extend([origin.lng, origin.lat])
      .extend([destLng, destLat]);
    map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });

    // Fetch the actual route.
    let cancelled = false;
    planRoute(
      origin,
      [{ id: "dest", lat: destLat, lng: destLng, label: destLabel }],
      { optimize: false }
    )
      .then((r) => {
        if (cancelled || !r.legs[0]) return;
        setRoute({
          polyline: r.legs[0].polyline ?? null,
          driveSec: r.legs[0].driveSeconds,
          driveM: r.legs[0].driveMeters,
          trafficAware: r.trafficAware,
        });
      })
      .catch(() => {
        if (!cancelled) setRoute(null);
      });

    return () => {
      cancelled = true;
    };
  }, [origin, loaded, destLat, destLng, destLabel]);

  // Draw the route line. Uses a real polyline when available;
  // otherwise dashed straight-line fallback so something visible
  // is always on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !origin) return;
    const SRC = "mini-route-src";
    const LYR = "mini-route-lyr";

    const coords: [number, number][] =
      route?.polyline && route.polyline.length > 0
        ? decodePolyline(route.polyline)
        : [
            [origin.lng, origin.lat],
            [destLng, destLat],
          ];
    const hasReal = !!route?.polyline && coords.length >= 2;
    const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates:
              coords.length >= 2
                ? coords
                : [
                    [origin.lng, origin.lat],
                    [destLng, destLat],
                  ],
          },
        },
      ],
    };
    const existing = map.getSource(SRC) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource(SRC, { type: "geojson", data });
      map.addLayer({
        id: LYR,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": MC.brandDeep,
          "line-width": hasReal ? 4 : 3,
          "line-dasharray": hasReal ? [1, 0] : [2, 2],
          "line-opacity": 0.85,
        },
      });
    }
    try {
      map.setPaintProperty(LYR, "line-width", hasReal ? 4 : 3);
      map.setPaintProperty(LYR, "line-dasharray", hasReal ? [1, 0] : [2, 2]);
    } catch {
      /* layer not ready */
    }

    // Re-fit across the polyline vertices when the real route lands
    // so detours are visible.
    if (hasReal) {
      const b = new maplibregl.LngLatBounds()
        .extend([origin.lng, origin.lat])
        .extend([destLng, destLat]);
      for (const c of coords) b.extend(c);
      map.fitBounds(b, { padding: 36, maxZoom: 14, duration: 400 });
    }
  }, [route, origin, loaded, destLng, destLat]);

  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${MC.line}`,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* Drive caption — bottom-left chip overlaid on the map.
          Shows "Calculating route…" until the planner responds. */}
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          padding: "5px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(6px)",
          fontFamily: MC.font,
          fontSize: 11.5,
          fontWeight: 700,
          color: MC.ink,
          letterSpacing: -0.1,
          boxShadow: "0 2px 6px rgba(10,15,30,.15)",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
        title={
          route?.trafficAware
            ? "Based on live traffic"
            : route
            ? "Estimated drive time"
            : "Fetching driving route from your current location"
        }
      >
        {route ? (
          <>
            {Math.max(1, Math.round(route.driveSec / 60))} min
            {route.driveM > 500 && (
              <>
                {" "}
                · {(route.driveM / 1000).toFixed(route.driveM < 10_000 ? 1 : 0)} km
              </>
            )}
            {route.trafficAware && (
              <span style={{ color: MC.mute, fontWeight: 500 }}>
                {" "}
                · live traffic
              </span>
            )}
          </>
        ) : !origin ? (
          <span style={{ color: MC.mute, fontWeight: 500 }}>
            Allow location to see the route
          </span>
        ) : (
          <span style={{ color: MC.mute, fontWeight: 500 }}>
            Calculating route…
          </span>
        )}
      </div>
    </div>
  );
}
