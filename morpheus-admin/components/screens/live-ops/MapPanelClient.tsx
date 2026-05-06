"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AC } from "@/lib/tokens";
import { Card, SectionTitle } from "@/components/ui/Card";
import { listCustomers } from "@/lib/customers-store";
import {
  listRepLocations,
  subscribeRepLocations,
  type RepLocation,
} from "@/lib/rep-locations-store";
import type { Customer } from "@/lib/types";

// Tiles: OpenFreeMap (no signup, no API key, OSM-derived vector tiles).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Fallback view when no customers have coordinates yet.
const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249]; // Cape Town
const DEFAULT_ZOOM = 9;

// Reps whose last ping is older than this are considered stale and dimmed.
const STALE_AFTER_MS = 5 * 60 * 1000;

export function MapPanelClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const customerMarkersRef = useRef<MLMarker[]>([]);
  const repMarkersRef = useRef<Map<string, MLMarker>>(new Map());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<RepLocation[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Init map
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

    // The map's parent Card stretches to match the Live Feed's height
    // via the dashboard's grid alignItems:stretch. When that height
    // changes (Live Feed loading more items, window resize, etc),
    // MapLibre needs an explicit resize() to re-flow tiles into the
    // new bounds — otherwise the canvas stays at its initial size and
    // we get a band of empty light-grey along the bottom.
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        /* map removed mid-tick — ignore */
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Initial customer load
  useEffect(() => {
    let cancelled = false;
    listCustomers().then((rows) => {
      if (!cancelled) setCustomers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial rep load + realtime subscription
  useEffect(() => {
    let cancelled = false;
    listRepLocations().then((rows) => {
      if (!cancelled) setReps(rows);
    });
    const unsub = subscribeRepLocations((rows) => setReps(rows));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Render customer markers (rebuild on data change)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    customerMarkersRef.current.forEach((m) => m.remove());
    customerMarkersRef.current = [];

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
      customerMarkersRef.current.push(marker);
    });

    if (placeable.length > 0 && repMarkersRef.current.size === 0) {
      const bounds = new maplibregl.LngLatBounds();
      placeable.forEach((c) => bounds.extend([c.longitude!, c.latitude!]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 600 });
    }
  }, [customers, loaded]);

  // Render / update rep markers (in-place updates so the dot smoothly moves)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const now = Date.now();
    const seen = new Set<string>();

    reps.forEach((r) => {
      seen.add(r.repId);
      const isStale = now - new Date(r.recordedAt).getTime() > STALE_AFTER_MS;
      const existing = repMarkersRef.current.get(r.repId);

      if (existing) {
        existing.setLngLat([r.longitude, r.latitude]);
        const el = existing.getElement();
        el.style.opacity = isStale ? "0.45" : "1";
      } else {
        const el = document.createElement("div");
        el.style.cssText = `
          width: 28px; height: 28px; border-radius: 99px;
          background: #1FA971; color: #fff;
          font-family: ${AC.font}; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,0.30);
          opacity: ${isStale ? "0.45" : "1"};
          transition: opacity 200ms ease;
        `;
        el.textContent = r.initials;

        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
          `<div style="font-family:${AC.font};font-size:12px;line-height:1.4;">
             <div style="font-weight:700;color:${AC.ink};">${escapeHtml(r.name)}</div>
             <div style="color:${AC.mute};font-size:11px;margin-top:2px;">${formatAge(now - new Date(r.recordedAt).getTime())} ago${r.accuracyM != null ? ` · ±${r.accuracyM}m` : ""}</div>
           </div>`
        );

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([r.longitude, r.latitude])
          .setPopup(popup)
          .addTo(map);
        repMarkersRef.current.set(r.repId, marker);
      }
    });

    // Remove markers for reps that no longer have any record
    for (const [id, marker] of repMarkersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        repMarkersRef.current.delete(id);
      }
    }
  }, [reps, loaded]);

  const activeCustomers = customers.filter((c) => c.active !== false);
  const placeableCount = activeCustomers.filter(
    (c) => typeof c.latitude === "number" && typeof c.longitude === "number"
  ).length;
  const missingCount = activeCustomers.length - placeableCount;
  const liveRepCount = reps.filter(
    (r) => Date.now() - new Date(r.recordedAt).getTime() <= STALE_AFTER_MS
  ).length;

  return (
    // Card stretches in the parent grid (alignItems: stretch) to match
    // the Live Feed's height. We mirror that with display:flex + column
    // so the map div below can flex-grow into whatever extra space the
    // Card got — eliminates the dead whitespace below the tiles.
    <Card padding={0} style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <SectionTitle>Field map · live</SectionTitle>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}>
          {placeableCount} customers
          {missingCount > 0 ? ` · ${missingCount} need an address` : ""}
          {" · "}
          <span style={{ color: liveRepCount > 0 ? "#1FA971" : AC.mute }}>
            {liveRepCount} rep{liveRepCount === 1 ? "" : "s"} live
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 360,
          width: "100%",
          background: "#F1F4F7",
        }}
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

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
