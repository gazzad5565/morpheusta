"use client";

/**
 * Customers map view — drops every customer with coordinates onto a
 * MapLibre map. Click a pin to open that customer's detail page.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl, { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import type { Customer } from "@/lib/types";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249]; // Cape Town
const DEFAULT_ZOOM = 9;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function CustomersMap({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);

  // Init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      // Collapse OSM attribution by default. (i) toggle stays.
      containerRef.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render markers + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const placeable = customers.filter(
      (c) => typeof c.latitude === "number" && typeof c.longitude === "number"
    );

    placeable.forEach((c) => {
      const el = document.createElement("div");
      // House glyph on the customer's brand colour — same visual
      // grammar as the live-ops map so the page reads consistently:
      // rounded-square + house = customer site.
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 6px;
        background: ${c.color}; color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        border: 2px solid #fff;
        cursor: pointer;
      `;
      el.title = `${c.name} — customer site`;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/></svg>`;
      el.addEventListener("click", () => {
        router.push(`/customers/${c.id}`);
      });

      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font-family:${AC.font};font-size:12px;line-height:1.4;cursor:pointer">
           <div style="font-weight:700;color:${AC.ink};">${escapeHtml(c.name)}</div>
           <div style="color:${AC.mute};font-size:11px;margin-top:2px;">${escapeHtml(String(c.code))} · ${escapeHtml(c.region)}</div>
           ${c.address ? `<div style="color:${AC.ink2};font-size:11px;margin-top:4px;max-width:220px;">${escapeHtml(c.address)}</div>` : ""}
         </div>`
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([c.longitude!, c.latitude!])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (placeable.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      placeable.forEach((c) => bounds.extend([c.longitude!, c.latitude!]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
    }
  }, [customers, router]);

  const placeableCount = customers.filter(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number"
  ).length;
  const missingCount = customers.length - placeableCount;

  return (
    <Card padding={0}>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${AC.line}`,
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>
          <b style={{ color: AC.ink }}>{placeableCount}</b> on the map
          {missingCount > 0 && (
            <>
              {" · "}
              <span style={{ color: AC.warn }}>
                {missingCount} need an address
              </span>
            </>
          )}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5 }}>Tap a pin to open the customer.</span>
      </div>
      <div
        ref={containerRef}
        style={{ height: 500, width: "100%", background: "#F1F4F7" }}
      />
    </Card>
  );
}
