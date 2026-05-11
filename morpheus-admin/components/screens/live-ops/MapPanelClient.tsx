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
import {
  listShifts,
  subscribeShifts,
  shiftHref,
  type ShiftRow,
} from "@/lib/shifts-store";
import { colorForRep } from "@/components/ui/Avatars";
import type { Customer } from "@/lib/types";

// Tiles: OpenFreeMap (no signup, no API key, OSM-derived vector tiles).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Fallback view when no customers have coordinates yet.
const DEFAULT_CENTER: [number, number] = [18.4241, -33.9249]; // Cape Town
const DEFAULT_ZOOM = 9;

// Reps whose last ping is older than this are considered stale and dimmed.
const STALE_AFTER_MS = 5 * 60 * 1000;

// Inline SVGs for marker glyphs. Keeping them as plain strings means we
// don't have to mount React inside MapLibre's DOM-controlled marker
// elements — innerHTML is enough and avoids reconciler churn on every
// realtime tick. Stroke and viewBox match the icon set so the visual
// is consistent with the rest of the app.
const HOUSE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/></svg>`;
const FACE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;

/**
 * Paint a rep marker element: photo when avatar_url is present, else
 * the generic face glyph on the rep's colour. Used both at first
 * create and on subsequent updates so a rep who just uploaded /
 * removed an avatar gets the new look without a full re-mount.
 */
function applyRepMarker(
  el: HTMLElement,
  r: { avatarUrl: string | null },
  repColor: string
): void {
  if (r.avatarUrl) {
    el.style.background = "#fff";
    el.innerHTML = `<img src="${r.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
  } else {
    el.style.background = repColor;
    el.innerHTML = FACE_SVG;
  }
}

export function MapPanelClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const customerMarkersRef = useRef<MLMarker[]>([]);
  const repMarkersRef = useRef<Map<string, MLMarker>>(new Map());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<RepLocation[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Mirror state into refs so the marker-creation effect (which captures
  // these closures once per rep) can always look up the freshest data
  // when a popup is rendered. The popup HTML is built lazily on click.
  const customersRef = useRef<Customer[]>([]);
  const shiftsRef = useRef<ShiftRow[]>([]);

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
    map.on("load", () => {
      setLoaded(true);
      // Collapse OSM attribution by default. (i) toggle stays.
      containerRef.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
    });
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
      if (!cancelled) {
        setCustomers(rows);
        customersRef.current = rows;
      }
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

  // Today's shifts — used for rep popups so we can show what each rep
  // is currently doing (which customer + state) and link straight to
  // the shift detail page. Realtime sub keeps the popup fresh as state
  // transitions happen (scheduled → in-progress → complete).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await listShifts();
      if (cancelled) return;
      setShifts(rows);
      shiftsRef.current = rows;
    };
    load();
    const unsub = subscribeShifts(load);
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
      // Customer marker = small house glyph (SVG) on the customer's
      // colour. Reads as "a building / shop / site" at a glance vs.
      // the rep markers, which are circular face/avatar pills. Same
      // colour-coding as before so the manager can still tell the
      // brands apart on a busy map.
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 6px;
        background: ${c.color}; color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        border: 2px solid #fff;
      `;
      el.title = `${c.name} — customer site`;
      el.innerHTML = HOUSE_SVG;

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
      const repColor = colorForRep(r.repId);

      if (existing) {
        existing.setLngLat([r.longitude, r.latitude]);
        const el = existing.getElement();
        el.style.opacity = isStale ? "0.45" : "1";
        // Re-apply the marker visual in case the rep just uploaded /
        // removed an avatar between renders. Keeping this in one
        // place beats branching here vs. on first-create.
        applyRepMarker(el, r, repColor);
        // Refresh the popup HTML so the customer/state stays current
        // even when the existing rep marker just moved.
        const popup = existing.getPopup();
        if (popup) popup.setHTML(buildRepPopupHTML(r, customersRef.current, shiftsRef.current));
      } else {
        const el = document.createElement("div");
        // Rep marker = circular pill, photo if uploaded else generic
        // face glyph. The shape (circle) deliberately contrasts with
        // the rounded-square house markers above so the manager can
        // tell at a glance which dots are sites and which are people.
        el.style.cssText = `
          width: 32px; height: 32px; border-radius: 99px;
          background: ${repColor}; color: #fff;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 0 2px #fff, 0 1px 6px rgba(0,0,0,0.30);
          opacity: ${isStale ? "0.45" : "1"};
          transition: opacity 200ms ease;
          cursor: pointer;
          overflow: hidden;
        `;
        el.title = `${r.name} — field rep`;
        applyRepMarker(el, r, repColor);

        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
          buildRepPopupHTML(r, customersRef.current, shiftsRef.current)
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

  // When the shift list refreshes (state transitions, new shifts, etc),
  // re-render the popup HTML for each currently-mounted rep marker so a
  // popup that's already open updates without needing to re-click.
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);
  useEffect(() => {
    shiftsRef.current = shifts;
    for (const [repId, marker] of repMarkersRef.current.entries()) {
      const r = reps.find((x) => x.repId === repId);
      if (!r) continue;
      const popup = marker.getPopup();
      if (popup) popup.setHTML(buildRepPopupHTML(r, customers, shifts));
    }
    // We intentionally read `reps` and `customers` here without listing
    // them as deps — when those change, the marker effect above will
    // re-run anyway. This effect is purely about reacting to shift
    // changes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts]);

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

/**
 * Pick the most-relevant shift for `repId` from today's list. Priority:
 *   1. in-progress (the rep is actually at a customer right now)
 *   2. travelling (manager wants to know they're en-route)
 *   3. on-break / late
 *   4. scheduled (next up)
 *   5. complete (most recently finished)
 * Falls back to undefined when the rep has no shifts today at all
 * (e.g. ad-hoc check-in elsewhere).
 */
function pickRelevantShift(repId: string, shifts: ShiftRow[]): ShiftRow | undefined {
  const mine = shifts.filter((s) => s.rep_id === repId);
  if (mine.length === 0) return undefined;
  const order: Record<string, number> = {
    "in-progress": 0,
    travelling: 1,
    "on-break": 2,
    late: 3,
    scheduled: 4,
    complete: 5,
  };
  return [...mine].sort(
    (a, b) => (order[a.state] ?? 99) - (order[b.state] ?? 99)
  )[0];
}

const STATE_LABEL: Record<string, { label: string; bg: string; ink: string }> = {
  "in-progress": { label: "In progress", bg: AC.okTint, ink: "#0F5A38" },
  travelling: { label: "Travelling", bg: AC.warnTint, ink: "#7A560A" },
  "on-break": { label: "On break", bg: "#E6E9F8", ink: "#241B5A" },
  late: { label: "Late", bg: AC.dangerTint, ink: "#6E1430" },
  scheduled: { label: "Scheduled", bg: AC.bg, ink: AC.mute },
  complete: { label: "Complete", bg: AC.okTint, ink: "#0F5A38" },
};

function formatHHMM(t: string | null | undefined): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

/**
 * Build the rep marker popup. Shows:
 *   - rep name
 *   - last GPS ping age (+ accuracy when known)
 *   - current/next customer (initials swatch + name + code)
 *   - current shift state pill
 *   - "Open shift →" link routed via shiftHref so scheduled shifts go
 *     to the editor and in-progress / late / complete shifts go to the
 *     read-only detail page (consistent with the rest of the app).
 *   - "View location" link to keep the older fallback when there's no
 *     shift today.
 */
function buildRepPopupHTML(
  r: RepLocation,
  customers: Customer[],
  shifts: ShiftRow[]
): string {
  const ageMs = Date.now() - new Date(r.recordedAt).getTime();
  const accuracy = r.accuracyM != null ? ` · ±${r.accuracyM}m` : "";
  const shift = pickRelevantShift(r.repId, shifts);
  const customer = shift
    ? customers.find((c) => c.id === shift.customer_id) ||
      (shift.customers
        ? {
            id: shift.customer_id,
            name: shift.customers.name,
            initials: shift.customers.initials,
            color: shift.customers.color,
            code: shift.customers.code,
          }
        : null)
    : null;
  const state = shift ? STATE_LABEL[shift.state] || STATE_LABEL.scheduled : null;

  // Avatar pill matches the rep marker visual — photo if uploaded,
  // else generic face glyph on the rep's colour.
  const avatarPill = r.avatarUrl
    ? `<div style="
         width:26px;height:26px;border-radius:99px;
         background:#fff;border:1px solid ${AC.line};
         overflow:hidden;display:flex;align-items:center;justify-content:center;
       "><img src="${r.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
    : `<div style="
         width:26px;height:26px;border-radius:99px;
         background:${colorForRep(r.repId)};color:#fff;
         display:flex;align-items:center;justify-content:center;
       ">${FACE_SVG}</div>`;

  const headerRow = `
    <div style="display:flex;align-items:center;gap:8px;">
      ${avatarPill}
      <div style="font-weight:700;color:${AC.ink};font-size:13px;letter-spacing:-.1px;">${escapeHtml(r.name)}</div>
    </div>
    <div style="color:${AC.mute};font-size:11px;margin-top:4px;">
      Last seen ${formatAge(ageMs)} ago${accuracy}
    </div>
  `;

  if (!shift || !customer) {
    return `
      <div style="font-family:${AC.font};font-size:12px;line-height:1.4;min-width:200px;">
        ${headerRow}
        <div style="margin-top:8px;color:${AC.mute};font-size:11.5px;font-style:italic;">
          No shift scheduled today.
        </div>
      </div>
    `;
  }

  const window = shift.start_time && shift.end_time
    ? `${formatHHMM(shift.start_time)}–${formatHHMM(shift.end_time)}`
    : "";

  return `
    <div style="font-family:${AC.font};font-size:12px;line-height:1.4;min-width:240px;max-width:280px;">
      ${headerRow}

      <div style="
        margin-top:10px;padding:8px 10px;
        border:1px solid ${AC.lineDim};border-radius:8px;background:#fff;
        display:flex;align-items:center;gap:8px;
      ">
        <div style="
          width:26px;height:26px;border-radius:7px;flex-shrink:0;
          background:${customer.color};color:#fff;
          font-family:${AC.font};font-size:10.5px;font-weight:700;
          display:flex;align-items:center;justify-content:center;letter-spacing:.2px;
        ">${escapeHtml(customer.initials)}</div>
        <div style="min-width:0;flex:1;">
          <div style="
            font-weight:600;color:${AC.ink};font-size:12.5px;letter-spacing:-.1px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          ">${escapeHtml(customer.name)}</div>
          <div style="color:${AC.mute};font-size:11px;margin-top:1px;">#${escapeHtml(String(customer.code))}${window ? ` · ${escapeHtml(window)}` : ""}</div>
        </div>
      </div>

      ${state ? `
        <div style="margin-top:8px;">
          <span style="
            display:inline-flex;align-items:center;gap:5px;
            padding:3px 8px;border-radius:99px;
            background:${state.bg};color:${state.ink};
            font-size:11px;font-weight:600;
          ">${escapeHtml(state.label)}</span>
        </div>
      ` : ""}

      <a href="${escapeHtml(shiftHref(shift))}" style="
        display:flex;align-items:center;justify-content:center;gap:6px;
        margin-top:10px;padding:8px 10px;border-radius:8px;
        background:${AC.brand};color:#fff;text-decoration:none;
        font-family:${AC.font};font-size:12px;font-weight:600;letter-spacing:-.1px;
      ">Open shift →</a>
    </div>
  `;
}
