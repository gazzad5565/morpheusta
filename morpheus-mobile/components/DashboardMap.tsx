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
import { getMyProfile } from "@/lib/profiles-store";
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

export interface DirectionsPreview {
  /** Destination latitude. */
  lat: number;
  /** Destination longitude. */
  lng: number;
  /** Customer / site label shown on the floating overlay. */
  label: string;
  /** Full deep-link URL to launch turn-by-turn in the OS map app. */
  openUrl: string;
}

export function DashboardMap({
  shifts,
  preview,
  onClosePreview,
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
  /** When set, the map draws a dashed line between the rep's GPS and
   *  this destination + shows a floating "Open in Maps" button. Null
   *  hides the overlay entirely. Replaces the previous "tap Directions
   *  to open Google Maps in a new tab" flow with an in-app preview;
   *  the rep can then choose to launch full turn-by-turn. */
  preview?: DirectionsPreview | null;
  /** Called by the floating Close button on the map preview. */
  onClosePreview?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const customerMarkersRef = useRef<MLMarker[]>([]);
  const userMarkerRef = useRef<MLMarker | null>(null);
  const [placed, setPlaced] = useState<PlacedShift[]>([]);
  const [missing, setMissing] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // The rep's last-known GPS position, lifted to state so the
  // directions-preview effect below can draw a polyline between
  // here and the destination without reaching into the marker ref.
  // Updated whenever navigator.geolocation fires.
  const [userPosition, setUserPosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // The rep's own avatar (base64 data URL) — fetched once on mount.
  // Drives the look of the user-location marker: avatar photo if one's
  // uploaded, otherwise a small face glyph on the brand colour. We do
  // NOT re-fetch on every geolocation tick — the avatar rarely changes.
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (cancelled) return;
      setMyAvatarUrl(p?.avatar_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          // Only count OUTSTANDING (non-complete) shifts in the
          // "N shifts not on the map" footer. A rep who has finished
          // every shift today doesn't need to see "1 shift not on
          // the map" for the address-less completed one — the message
          // is actionable info, not a static count. Managers asked
          // for this — the footer should reflect what's actually
          // outstanding right now.
          if (s.state !== "complete") {
            skipped += 1;
          }
        }
      }
      setPlaced(next);
      setMissing(skipped);
    });
    return () => {
      cancelled = true;
    };
  }, [shifts]);

  // Init the map immediately on first render, regardless of whether
  // any shifts have loaded yet. The map being always-on (vs popping
  // in once data arrives) keeps the home page from doing a big
  // visual reflow every time the rep opens the app. Pins layer in
  // separately as shifts data arrives; user-location dot runs
  // independently.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      setLoaded(true);
      // Collapse the OSM attribution by default — the (i) button stays
      // so anyone curious can still tap to expand, but the small map
      // tile doesn't waste a third of its width on "© OpenStreetMap"
      // text on first paint. MapLibre opens compact-mode by default;
      // we just remove the show class to flip that.
      const attrib = containerRef.current?.querySelector(
        ".maplibregl-ctrl-attrib"
      );
      attrib?.classList.remove("maplibregl-compact-show");
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      // Customer site marker = small house glyph on the customer's
      // brand colour. Reads instantly as "a place" vs the user-location
      // dot. Matches the admin map symbology so a rep who's also a
      // manager sees the same visual vocabulary across both apps.
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 6px;
        background: ${s.color}; color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        border: 2px solid #fff;
        opacity: ${isComplete ? 0.55 : 1};
        ${isInProgress ? `outline: 3px solid ${s.color}55;` : ""}
      `;
      el.title = `${s.name} — customer site`;
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/></svg>`;
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
        // Lift to state so the directions-preview effect below can
        // draw a polyline between here and the destination.
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        if (userMarkerRef.current) userMarkerRef.current.remove();
        const el = document.createElement("div");
        // User-location marker = circular avatar pill so it visually
        // contrasts with the rounded-square house customer markers.
        // Photo if uploaded, generic face glyph as the fallback. The
        // glowing brand-tint halo around it carries forward — that's
        // the "you are here" signal regardless of which inner visual
        // renders.
        el.style.cssText = `
          width: 30px; height: 30px; border-radius: 99px;
          background: ${MC.brand}; border: 3px solid #fff;
          box-shadow: 0 0 0 4px ${MC.brand}33, 0 1px 4px rgba(0,0,0,0.25);
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        `;
        el.title = "You are here";
        if (myAvatarUrl) {
          el.innerHTML = `<img src="${myAvatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
        } else {
          el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
        }
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
  }, [loaded, myAvatarUrl]);

  // Directions preview — draws a dashed line between the rep's GPS
  // and the destination shift's coords. Replaces the previous "tap
  // Directions to leave the app for Google Maps" flow with an in-app
  // overview; the rep gets a high-altitude sense of where the store
  // is, and the floating "Open in Maps" button below the map then
  // hands off to the OS map app for turn-by-turn when they want it.
  //
  // Source/layer is created on first preview, then just updated via
  // setData on subsequent previews. Removing the layer + source on
  // cleanup keeps the map clean once the rep closes the preview.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const SRC = "morpheus-directions-route";
    const LYR = "morpheus-directions-route-line";

    const removeRoute = () => {
      try {
        if (map.getLayer(LYR)) map.removeLayer(LYR);
      } catch {
        /* layer not present */
      }
      try {
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch {
        /* source not present */
      }
    };

    if (!preview || !userPosition) {
      removeRoute();
      return;
    }

    const route: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [userPosition.lng, userPosition.lat],
              [preview.lng, preview.lat],
            ],
          },
        },
      ],
    };
    const existing = map.getSource(SRC) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(route);
    } else {
      map.addSource(SRC, { type: "geojson", data: route });
      map.addLayer({
        id: LYR,
        type: "line",
        source: SRC,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": MC.brandDeep,
          "line-width": 3,
          "line-dasharray": [2, 2],
          "line-opacity": 0.85,
        },
      });
    }
    // Re-fit so both endpoints are comfortably visible. Skipped
    // when the destination and the rep are extremely close to avoid
    // a jarring zoom-in on tiny distances.
    const dx = preview.lng - userPosition.lng;
    const dy = preview.lat - userPosition.lat;
    if (Math.hypot(dx, dy) > 0.0005) {
      const bounds = new maplibregl.LngLatBounds()
        .extend([userPosition.lng, userPosition.lat])
        .extend([preview.lng, preview.lat]);
      map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 500 });
    }

    return () => {
      removeRoute();
    };
  }, [preview, userPosition, loaded]);

  // The map container ALWAYS renders. When there are no shifts (or
  // no placeable shifts yet), the map still shows — defaulted to
  // Cape Town with just the rep's location dot. As shifts load, pins
  // layer in without any "popping in" reflow. Keeps the home screen
  // visually stable when the app cold-starts.
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
        <div style={{ position: "relative" }}>
          <div
            ref={containerRef}
            style={{ height: 180, width: "100%", background: "#F1F4F7" }}
          />
          {/* Directions-preview overlay — visible only when the home
              page's Directions button is active. Shows the destination
              label + a primary "Open in Maps" CTA that hands off to
              the OS map app for turn-by-turn, plus a close affordance
              to dismiss the preview without leaving the home screen.
              Anchored bottom of the map so the route polyline above is
              never hidden by it. */}
          {preview && (
            <div
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px 8px 12px",
                background: "rgba(255,255,255,.96)",
                borderRadius: 12,
                boxShadow: "0 6px 18px rgba(10,15,30,.18)",
                border: `1px solid ${MC.line}`,
                backdropFilter: "blur(6px)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: MC.brandDeep,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Route to
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 1,
                  }}
                  title={preview.label}
                >
                  {preview.label}
                </div>
              </div>
              <a
                href={preview.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 10,
                  background: MC.brand,
                  color: "#fff",
                  textDecoration: "none",
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: -0.1,
                  boxShadow: `0 4px 10px ${MC.brand}55`,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Open in Maps
                <span style={{ fontSize: 14, lineHeight: 1 }}>↗</span>
              </a>
              {onClosePreview && (
                <button
                  type="button"
                  onClick={onClosePreview}
                  aria-label="Close route preview"
                  title="Close route preview"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "transparent",
                    border: `1px solid ${MC.line}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 14, color: MC.mute, lineHeight: 1 }}>✕</span>
                </button>
              )}
            </div>
          )}
        </div>
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
