"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { AGlyph } from "@/components/ui/AGlyph";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AC } from "@/lib/tokens";
import {
  createSite,
  updateSite,
  type CustomerSite,
} from "@/lib/sites-store";
import type { Customer } from "@/lib/types";

const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

/** Default geofence radius for a new site (metres). Chosen to cover a
 *  small-to-medium retail footprint without false-positives from across
 *  the street. SiteRow + SiteEditor both fall back to this when a row
 *  has `geofence_radius_m = null`. */
export const DEFAULT_GEOFENCE_M = 100;

/**
 * Inline editor for a customer site. Renders as a two-column panel:
 *   - left: name, address, geofence slider, contact, access notes
 *   - right: live map preview that updates as the manager picks an
 *     address and slides the radius
 *
 * Used by SitesTab in both "create" and "edit" modes. The parent keys
 * this component by site id so swapping which site is being edited
 * cleanly re-mounts and resets local state from `initial`.
 */
export function SiteEditor({
  mode,
  customer,
  initial,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  customer: Customer;
  initial: CustomerSite | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  // Derived from `initial` and stable for the lifetime of this editor
  // instance (the parent keys the SiteEditor by site id and re-mounts
  // on swap), so no state setter is needed — `pickedCoords` below
  // captures any new coordinate the manager picks during this edit.
  const coords: { lat: number; lng: number } | null =
    initial?.latitude != null && initial?.longitude != null
      ? { lat: initial.latitude, lng: initial.longitude }
      : null;
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geofenceM, setGeofenceM] = useState<number>(
    initial?.geofence_radius_m ?? DEFAULT_GEOFENCE_M
  );
  const [contactName, setContactName] = useState(initial?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onSave() {
    if (busy) return;
    setError(null);
    setNote(null);
    if (!name.trim()) {
      setError("Site name is required.");
      return;
    }
    setBusy(true);

    let latitude: number | null = coords?.lat ?? null;
    let longitude: number | null = coords?.lng ?? null;
    const trimmed = address.trim();

    if (trimmed && (mode === "create" || trimmed !== (initial?.address ?? ""))) {
      if (pickedCoords) {
        latitude = pickedCoords.lat;
        longitude = pickedCoords.lng;
      } else {
        // On a geocode miss we keep whatever coords we already had
        // (the original `coords` initialiser) rather than wiping them.
        // Rationale: the manager often tweaks just the street text on
        // an existing site — wiping the pin would force them to re-pick
        // an address on the map for an otherwise correct location. The
        // note tells them the new text is saved but the old pin stands.
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            const data = (await res.json()) as { latitude: number; longitude: number };
            latitude = data.latitude;
            longitude = data.longitude;
          } else if (coords) {
            setNote("Couldn't geocode that address — kept the existing pin.");
          } else {
            setNote("Couldn't geocode that address — saved without coordinates.");
          }
        } catch {
          if (coords) {
            setNote("Geocoder unreachable — kept the existing pin.");
          } else {
            setNote("Geocoder unreachable — saved without coordinates.");
          }
        }
      }
    } else if (!trimmed) {
      latitude = null;
      longitude = null;
    }

    const payload = {
      name: name.trim(),
      address: trimmed || null,
      latitude,
      longitude,
      geofence_radius_m: geofenceM,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    };

    const r =
      mode === "create"
        ? await createSite({ customer_id: customer.id, ...payload })
        : await updateSite(initial!.id, payload);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    await onSaved();
  }

  const liveCoords = pickedCoords ?? coords;

  return (
    <div
      style={{
        background: AC.bgDeep,
        borderBottom: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 0,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            padding: 18,
            borderRight: `1px solid ${AC.line}`,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {mode === "create" ? "New site" : "Edit site"}
          </div>

          <FieldRow label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main store, Warehouse B"
              autoFocus={mode === "create"}
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow
            label="Address"
            hint={
              pickedCoords
                ? `New coordinates: ${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`
                : coords
                ? `Current: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : "Start typing — pick a match to lock coordinates."
            }
          >
            <AddressAutocomplete
              value={address}
              onChange={(v) => {
                setAddress(v);
                if (pickedCoords) setPickedCoords(null);
              }}
              onSelect={(s) => {
                setPickedCoords({ lat: s.latitude, lng: s.longitude });
              }}
              placeholder="e.g. 1480 Riverside Way, Cape Town"
            />
          </FieldRow>

          <FieldRow
            label={`Geofence radius · ${geofenceM} m`}
            hint="Reps must be inside this radius to check in without an off-site exception."
          >
            <input
              type="range"
              min={25}
              max={500}
              step={5}
              value={geofenceM}
              onChange={(e) => setGeofenceM(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {[50, 75, 100, 150, 250].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGeofenceM(m)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    border: `1px solid ${geofenceM === m ? AC.ink : AC.line}`,
                    background: geofenceM === m ? AC.ink : "#fff",
                    color: geofenceM === m ? "#fff" : AC.ink2,
                    fontFamily: AC.font,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {m} m
                </button>
              ))}
            </div>
          </FieldRow>

          <div
            style={{
              borderTop: `1px solid ${AC.line}`,
              paddingTop: 14,
              marginTop: 4,
              marginBottom: 4,
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Contact (optional)
          </div>
          <FieldRow label="Contact name">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Sarah Lewis — Store Manager"
              style={inputStyle}
            />
          </FieldRow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldRow label="Phone" hint="Tappable on mobile.">
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 555 010 1234"
                style={inputStyle}
              />
            </FieldRow>
            <FieldRow label="Email">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="site@example.com"
                style={inputStyle}
              />
            </FieldRow>
          </div>
          <FieldRow
            label="Access notes"
            hint="Where to park, buzzer codes, back-entrance instructions, etc."
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'e.g. "Use back entrance after 6pm. Buzz #1234. Park in lot B."'}
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 64,
                fontFamily: AC.font,
                lineHeight: 1.5,
              }}
            />
          </FieldRow>

          {note && (
            <div
              style={{
                padding: "10px 12px",
                background: "#fff",
                color: AC.ink2,
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 500,
                marginBottom: 12,
                border: `1px solid ${AC.line}`,
              }}
            >
              {note}
            </div>
          )}
          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 500,
                marginBottom: 12,
                display: "flex",
                gap: 8,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Btn>
            <Btn size="sm" kind="primary" icon="check" onClick={onSave} disabled={busy}>
              {busy
                ? "Saving…"
                : mode === "create"
                ? "Create site"
                : "Save changes"}
            </Btn>
          </div>
        </div>

        {/* Live map preview — updates as the manager picks an address
            and slides the geofence. */}
        <div
          style={{
            minHeight: 320,
            background: "#F1F4F7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {liveCoords ? (
            <AddressMap
              lat={liveCoords.lat}
              lng={liveCoords.lng}
              radiusM={geofenceM}
              color={customer.color}
              initials={customer.initials}
              height={320}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                fontFamily: AC.font,
                color: AC.mute,
                fontSize: 12.5,
                padding: 16,
                textAlign: "center",
              }}
            >
              <AGlyph name="pin" size={26} color={AC.faint} />
              <div>Pick an address to preview</div>
              <div style={{ fontSize: 11, color: AC.hint }}>
                The geofence circle updates as you slide.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${AC.line}`,
  fontFamily: AC.font,
  fontSize: 13,
  color: AC.ink,
  background: "#fff",
  outline: "none",
};
