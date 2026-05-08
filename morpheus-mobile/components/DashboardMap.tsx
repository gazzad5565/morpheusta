"use client";

/**
 * DashboardMap — real MapLibre map for the rep's "today's route" card.
 *
 * - Plots one pin per shift the rep has today using the SHIFT'S SITE
 *   coordinates (post 2026-05-08 sites rollout). Two shifts at the
 *   same customer but different sites pin in two different places.
 * - Falls back to the customer's legacy lat/lng when a shift has no
 *   site_id (pre-rollout rows still in the DB).
 * - Plots the rep's own dot using browser geolocation (no DB write
 *   here — that's the location-tracker's job during an active shift).
 * - Auto-fits the map to all pins on first load.
 *
 * Shifts without resolvable coordinates are skipped (with a small
 * footer hint so the rep knows). With zero placeable shifts the whole
 * component renders nothing — the dashboard already shows the shift
 * count separately.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MC } from "@/lib/tokens";
import { listAllCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/mock-data";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
// Cape Town fallback when nothing has coords yet — same default as admin.
const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249];
const DEFAULT_ZOOM = 10;

interface PlacedShift {
  id: string;
  name: string;
  initials: string;
  color: string;
  state: string;
  latitude: number;
  longitude: number;
}

export function DashboardMap({
  shifts,
}: {
  // Mirrors the DbShift shape the dashboard already has — id is customer id.
  // siteLat/siteLng are preferred when present (post-sites rollout).
  shifts: Array<{
    id: string;
    name: string;
    initials: string;
    color: string;
    state: string;
    siteLat?: number | null;
    siteLng?: number | null;
    siteName?: string | null;
  }>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const customerMarkersRef = useRef<MLMarker[]>([]);
  const userMarkerRef = useRef<MLMarker | null>(null);
  const [placed, setPlaced] = useState<PlacedShift[]>([]);
  const [missing, setMissing] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Resolve each shift's customer to lat/lng. Skip ones without coords.
  useEffect(() => {
    let cancelled = false;
    if (shifts.length === 0) {
      setPlaced([]);
      setMissing(0);
      return;
    }
    listAllCustomers().then((customers) => {
      if (cancelled) return;
      const byId = new Map<string, Customer>();
      for (const c of customers) byId.set(c.id, c);
      const next: PlacedShift[] = [];
      let skipped = 0;
      for (const s of shifts) {
        // Prefer the shift's site coords. Fall back to the customer's
        // legacy lat/lng for shifts that pre-date the sites rollout.
        const siteHasCoords =
          typeof s.siteLat === "number" && typeof s.siteLng === "number";
        const c = byId.get(s.id);
        const customerHasCoords =
          c && typeof c.latitude === "number" && typeof c.longitude === "number";
        if (siteHasCoords) {
          next.push({
            id: s.id,
            name: s.name,
            initials: s.initials,
            color: s.color,
            state: s.state,
            latitude: s.siteLat as number,
            longitude: s.siteLng as number,
          });
        } else if (customerHasCoords) {
          next.push({
            id: s.id,
            name: s.name,
            initials: s.initials,
            color: s.color,
            state: s.state,
            latitude: c!.latitude as number,
            longitude: c!.longitude as number,
          });
        } else {
          skipped += 1;
        }
      }
      setPlaced(next);
      setMissing(skipped);
    });
    return () => {
      cancelled = true;
    };
  }, [shifts]);

  // Init map when we have at least one placeable shift.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (placed.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.on("load", () => setLoaded(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [placed.length]);

  // Render shift markers + fit bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    customerMarkersRef.current.forEach((m) => m.remove());
    customerMarkersRef.current = [];

    if (placed.length === 0) return;

    placed.forEach((s) => {
      const isComplete = s.state === "complete";
      const isInProgress = s.state === "in-progress";
      const el = document.createElement("div");
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 6px;
        background: ${s.color}; color: #fff;
        font-family: ${MC.font}; font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        border: 2px solid #fff;
        opacity: ${isComplete ? 0.55 : 1};
        ${isInProgress ? `outline: 3px solid ${s.color}55;` : ""}
      `;
      el.textContent = s.initials;
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font-family:${MC.font};font-size:12px;line-height:1.4;">
           <div style="font-weight:700;color:${MC.ink};">${escapeHtml(s.name)}</div>
           <div style="color:${MC.mute};font-size:11px;margin-top:2px;text-transform:uppercase;letter-spacing:0.4px;">${escapeHtml(s.state)}</div>
         </div>`
      );
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([s.longitude, s.latitude])
        .setPopup(popup)
        .addTo(map);
      customerMarkersRef.current.push(marker);
    });

    if (placed.length === 1) {
      map.flyTo({
        center: [placed[0].longitude, placed[0].latitude],
        zoom: 13,
        duration: 600,
      });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      placed.forEach((s) => bounds.extend([s.longitude, s.latitude]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [placed, loaded]);

  // User location dot — best-effort, no auto-prompt loop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled || !mapRef.current) return;
        if (userMarkerRef.current) userMarkerRef.current.remove();
        const el = document.createElement("div");
        el.style.cssText = `
          width: 22px; height: 22px; border-radius: 99px;
          background: ${MC.brand}; border: 3px solid #fff;
          box-shadow: 0 0 0 4px ${MC.brand}33, 0 1px 4px rgba(0,0,0,0.25);
        `;
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([pos.coords.longitude, pos.coords.latitude])
          .addTo(mapRef.current);
      },
      () => {
        // Permission denied / unavailable — silently skip.
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30_000 }
    );
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  if (placed.length === 0) {
    // Nothing to plot. If the rep has shifts but no coords, show a hint;
    // otherwise render nothing (the shift count above already covers it).
    if (missing === 0 && shifts.length === 0) return null;
    return (
      <div style={{ padding: "12px 16px 0" }}>
        <div
          style={{
            background: MC.card,
            border: `1px dashed ${MC.line}`,
            borderRadius: MC.radiusCard,
            padding: 16,
            textAlign: "center",
            fontFamily: MC.font,
            fontSize: 13,
            color: MC.mute,
          }}
        >
          {missing > 0
            ? `${missing} shift${missing === 1 ? "" : "s"} today, but the customer${
                missing === 1 ? " hasn't" : "s haven't"
              } got an address yet — ask your manager to add one.`
            : "Today's route shows up here once you have a shift."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div
        style={{
          background: MC.card,
          borderRadius: MC.radiusCard,
          border: `1px solid ${MC.line}`,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(10,15,30,.04)",
        }}
      >
        <div
          ref={containerRef}
          style={{ height: 180, width: "100%", background: "#F1F4F7" }}
        />
        {missing > 0 && (
          <div
            style={{
              padding: "8px 12px",
              borderTop: `1px solid ${MC.line}`,
              fontFamily: MC.font,
              fontSize: 11.5,
              color: MC.mute,
              textAlign: "center",
            }}
          >
            {missing} more shift{missing === 1 ? "" : "s"} not on the map (no address).
          </div>
        )}
      </div>
    </div>
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
