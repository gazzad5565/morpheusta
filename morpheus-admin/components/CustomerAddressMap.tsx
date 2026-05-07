"use client";

/**
 * Map for the customer detail Address tab. Drops the customer's pin and
 * draws a real-meters geofence circle around it. The circle re-renders
 * when the radius changes so the slider feels live.
 */

import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AC } from "@/lib/tokens";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const CIRCLE_SOURCE_ID = "geofence-source";
const CIRCLE_FILL_ID = "geofence-fill";
const CIRCLE_LINE_ID = "geofence-line";

/** Approximate a circle of `radiusMeters` around (lat,lng) as a 64-vertex polygon. */
function geofenceFeature(
  lat: number,
  lng: number,
  radiusMeters: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const earth = 6371000;
  const latRad = (lat * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = Math.cos(angle) * radiusMeters;
    const dy = Math.sin(angle) * radiusMeters;
    const dLat = (dy / earth) * (180 / Math.PI);
    const dLng = (dx / (earth * Math.cos(latRad))) * (180 / Math.PI);
    coords.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

export function CustomerAddressMap({
  lat,
  lng,
  radiusM,
  color,
  initials,
  showGeofence = true,
  height = 360,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  color: string;
  initials: string;
  /**
   * Whether to draw the geofence circle. Customers always want it
   * (that's the point of this view), but the Organisation settings
   * page reuses the map purely as an "address pinned here" preview
   * with no geofence concept — pass false to hide the circle.
   */
  showGeofence?: boolean;
  /** Pixel height for the map container. */
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const loadedRef = useRef(false);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [lng, lat],
      zoom: 15,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      loadedRef.current = true;
      if (showGeofence) {
        // Geofence layer — only added when the caller wants it. Org
        // address preview skips this since "office location" isn't a
        // geofence concept.
        map.addSource(CIRCLE_SOURCE_ID, {
          type: "geojson",
          data: geofenceFeature(lat, lng, radiusM),
        });
        map.addLayer({
          id: CIRCLE_FILL_ID,
          type: "fill",
          source: CIRCLE_SOURCE_ID,
          paint: {
            "fill-color": color,
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: CIRCLE_LINE_ID,
          type: "line",
          source: CIRCLE_SOURCE_ID,
          paint: {
            "line-color": color,
            "line-width": 2,
            "line-dasharray": [2, 2],
          },
        });
      }
    });

    // Pin
    const el = document.createElement("div");
    el.style.cssText = `
      width: 28px; height: 28px; border-radius: 6px;
      background: ${color}; color: #fff;
      font-family: ${AC.font}; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      border: 2px solid #fff;
    `;
    el.textContent = initials;
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update circle when radius (or coords) change. Skip entirely when
  // the geofence is hidden — the source layer doesn't exist.
  useEffect(() => {
    if (!showGeofence) return;
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource(CIRCLE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geofenceFeature(lat, lng, radiusM));
    }
  }, [lat, lng, radiusM, showGeofence]);

  // Re-center marker if coords change.
  useEffect(() => {
    if (markerRef.current) markerRef.current.setLngLat([lng, lat]);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 600 });
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", background: "#F1F4F7" }}
    />
  );
}
