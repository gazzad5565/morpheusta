"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AC } from "@/lib/tokens";
import { Card, SectionTitle } from "@/components/ui/Card";
import { listCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

// Tiles: OpenFreeMap (no signup, no API key, OSM-derived vector tiles).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Fallback view when no customers have coordinates yet.
const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249]; // Cape Town
const DEFAULT_ZOOM = 9;

export function MapPanelClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);

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
    map.on("load", () => setLoaded(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCustomers().then((rows) => {
      if (!cancelled) setCustomers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    // Wipe previous markers before re-rendering.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const placeable = customers.filter(
      (c) =>
        c.active !== false &&
        typeof c.latitude === "number" &&
        typeof c.longitude === "number"
    );

    placeable.forEach((c) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 24px; height: 24px; border-radius: 5px;
        background: ${c.color}; color: #fff;
        font-family: ${AC.font}; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        border: 2px solid #fff;
      `;
      el.textContent = c.initials;

      const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<div style="font-family:${AC.font};font-size:12px;line-height:1.4;">
           <div style="font-weight:700;color:${AC.ink};">${escapeHtml(c.name)}</div>
           <div style="color:${AC.mute};font-size:11px;margin-top:2px;">${escapeHtml(c.code)} · ${escapeHtml(c.region)}</div>
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
  }, [customers, loaded]);

  const activeCustomers = customers.filter((c) => c.active !== false);
  const placeableCount = activeCustomers.filter(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number"
  ).length;
  const missingCount = activeCustomers.length - placeableCount;

  return (
    <Card padding={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <SectionTitle>Customer map · live</SectionTitle>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}>
          {placeableCount} placed{missingCount > 0 ? ` · ${missingCount} need an address` : ""}
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ height: 360, width: "100%", background: "#F1F4F7" }}
      />
    </Card>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
