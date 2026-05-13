"use client";

/**
 * MapPreview — small read-only MapLibre map (May 13).
 *
 * Used on /add-customer to show the rep where they just pinned a
 * location, so they can sanity-check before saving. The picked
 * coords + display label come in via props; the map auto-centres
 * on them at street-level zoom and drops a brand-coloured marker.
 *
 * Why MapLibre vs Leaflet vs an iframe:
 *   - maplibre-gl is already in the mobile package.json (admin
 *     reuses it for /customers map view), so no new dependency.
 *   - Vector tiles look great at the zoom levels we want (16-17 for
 *     "show me the building" feel) and the demo tile server is free
 *     for low-traffic apps like this. Locked to read-only / no
 *     controls so the rep can't accidentally pan away and feel lost.
 *
 * The component is intentionally tiny (no popups, no search, no
 * geocoder) — its only job is to confirm the pin. The full
 * customer-management map lives in admin.
 */

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MC } from "@/lib/tokens";

interface Props {
  latitude: number;
  longitude: number;
  /** Optional caption rendered above the marker; e.g. customer
   *  name or address line. Hidden if empty. */
  label?: string | null;
  /** Pixel height — default 180 (good preview size on a phone). */
  height?: number;
}

/** Free OSM-style demo tiles. Same provider admin uses. */
const TILE_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function MapPreview({ latitude, longitude, label, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Init the map once on mount. We don't recreate the map on coord
  // change — instead we flyTo + reposition the marker, which is much
  // smoother than a full re-init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE_URL,
      center: [longitude, latitude],
      zoom: 16,
      interactive: false, // read-only preview
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    // Drop the marker once the style finishes loading — needed
    // because maplibre's mark placement otherwise races against
    // the style-load and ends up below the tile layer on some
    // clients.
    map.on("load", () => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: ${MC.brand};
        border: 3px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.12), 0 6px 14px rgba(10,15,30,0.25);
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([longitude, latitude])
        .addTo(map);
      markerRef.current = marker;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Coords are intentionally NOT in deps — we want init once,
    // then react to coord changes in the effect below via flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre + reposition marker when coords change.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map) return;
    map.flyTo({
      center: [longitude, latitude],
      zoom: 16,
      duration: 600,
    });
    if (marker) {
      marker.setLngLat([longitude, latitude]);
    }
  }, [latitude, longitude]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${MC.line}`,
        background: MC.bg,
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {label && (
        // Top-left chip with the address / customer label so the
        // rep can confirm at a glance what the pin represents.
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            background: "rgba(255,255,255,0.95)",
            border: `1px solid ${MC.line}`,
            borderRadius: 8,
            padding: "6px 10px",
            fontFamily: MC.font,
            fontSize: 12,
            color: MC.ink,
            fontWeight: 600,
            lineHeight: 1.35,
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={label}
        >
          {label}
        </div>
      )}
    </div>
  );
}
