"use client";

/**
 * /add-customer — rep adds a brand-new customer from the mobile
 * app.
 *
 * Reached from the side menu only (per Gary — May 13). Not surfaced
 * on /add-shift or anywhere else; reps either need a NEW customer
 * (this flow) or want to schedule against an EXISTING one (/add-
 * shift).
 *
 * Minimum-fields form:
 *   - Name        (required)
 *   - Address     (required, becomes the head-office site address)
 *   - Contact     (optional name + phone, saved on the head-office
 *                  site row)
 *
 * Auto-generated server-side: code (max+1), initials (first letters
 * of first two words), brand colour (random from a curated
 * 8-colour palette), active=true, created_by_rep_id (current rep).
 *
 * Auto-created alongside: a head-office customer_sites row with
 * the entered address + contact details. Lat/lng stay null until
 * Feature B's geocode flow fills them in on the rep's next visit.
 *
 * After successful create:
 *   - Navigates to /add-shift?customer=<new-id> so the rep can
 *     immediately schedule against the customer they just added
 *     (one-step "added them so I can visit").
 *   - The shift_events row logged by createCustomer surfaces in
 *     the admin Live Ops feed in real time.
 *   - Admin /customers list shows a "NEW" badge on the row until
 *     a manager opens its detail page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { createCustomer, geocodeAddress } from "@/lib/customers-store";
import { requestGeolocationOnce } from "@/lib/route-planner";

interface Pin {
  /** "gps"     — captured from device GPS at the moment the rep
   *              tapped "Use my current location".
   *  "address" — resolved by Nominatim from the typed address. */
  source: "gps" | "address";
  latitude: number;
  longitude: number;
}

export default function AddCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // Pinned coords — independent of the address text. The rep can
  // edit the address freely after pinning (e.g. rename to "Bob's
  // place — corner unit") while the geofence stays locked to the
  // captured coords.
  const [pin, setPin] = useState<Pin | null>(null);
  const [pinning, setPinning] = useState<"gps" | "address" | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Either address text OR a pin is enough — both work too. Name is
  // always required.
  const canSave =
    name.trim().length > 0 &&
    (address.trim().length > 0 || pin !== null) &&
    !saving;

  const onSave = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    const r = await createCustomer({
      name: name.trim(),
      address: address.trim() || undefined,
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
    if (!r.ok) {
      setSaving(false);
      setError(r.error || "Couldn't save — try again.");
      return;
    }
    // Jump straight to /add-shift pre-filled with the new customer
    // so the rep can immediately schedule against them. Common
    // path: rep is on-site at a new prospect, adds them, books
    // their visit — one flow.
    router.replace(`/add-shift?customer=${encodeURIComponent(r.id || "")}`);
  };

  /** Capture the rep's current GPS as the pin. Address text is
   *  preserved so the rep can keep their custom display label. */
  const pinViaGps = async () => {
    setPinError(null);
    setPinning("gps");
    const pos = await requestGeolocationOnce();
    setPinning(null);
    if (!pos) {
      setPinError(
        "Couldn't read your location. Make sure Morpheus has permission to use your device's location."
      );
      return;
    }
    setPin({ source: "gps", latitude: pos.lat, longitude: pos.lng });
  };

  /** Resolve the typed address via the local /api/geocode (Nominatim)
   *  proxy. Falls back with a friendly error if no match. */
  const pinViaAddress = async () => {
    setPinError(null);
    const q = address.trim();
    if (!q) {
      setPinError("Type the address first, then tap Geocode.");
      return;
    }
    setPinning("address");
    const hit = await geocodeAddress(q);
    setPinning(null);
    if (!hit) {
      setPinError("Couldn't find that address. Try GPS, or refine the text.");
      return;
    }
    setPin({ source: "address", latitude: hit.latitude, longitude: hit.longitude });
  };

  const clearPin = () => {
    setPin(null);
    setPinError(null);
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader title="Add customer" onBack={() => router.push("/")} withMenu />

      <div style={{ padding: "20px 16px 100px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header explainer — a single line so it doesn't compete
            with the form. */}
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 13,
            color: MC.mute,
            lineHeight: 1.5,
          }}
        >
          Adds the customer to the admin&apos;s list immediately. Your manager
          will see it in their live feed. Pin the location now if you&apos;re
          on-site — it makes the next check-in geofenced.
        </div>

        {/* Form */}
        <div
          style={{
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: 16,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Field
            label="Customer name"
            required
            value={name}
            onChange={setName}
            placeholder="e.g. GreenWave Innovations"
            autoFocus
          />
          <Field
            label="Address"
            value={address}
            onChange={setAddress}
            placeholder="Street, suburb, city — or leave empty and pin below"
            multiline
            hint={
              pin
                ? "Pinned — you can rename this freely; the geofence stays locked to the pin."
                : "Type it, or pin the location below. One of the two is needed."
            }
          />

          {/* Pin buttons — let the rep capture coords either from
              their current GPS (most accurate when actually on-site)
              or from the typed address (good when adding a customer
              they're not currently at). After pinning, the rep can
              rename the address freely while coords stay locked. */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={pinViaGps}
              disabled={!!pinning}
              style={{
                flex: 1,
                minHeight: 40,
                padding: "0 12px",
                borderRadius: 10,
                background: MC.brandDeep,
                color: "#fff",
                border: "none",
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 700,
                cursor: pinning ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: pinning === "gps" ? 0.7 : 1,
              }}
            >
              <Glyph name="target" size={14} color="#fff" strokeWidth={2.4} />
              {pinning === "gps" ? "Pinning…" : "Use my GPS"}
            </button>
            <button
              type="button"
              onClick={pinViaAddress}
              disabled={!!pinning || address.trim().length === 0}
              style={{
                flex: 1,
                minHeight: 40,
                padding: "0 12px",
                borderRadius: 10,
                background: "#fff",
                color: MC.brandDeep,
                border: `1px solid ${MC.brand}55`,
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 700,
                cursor:
                  pinning || address.trim().length === 0
                    ? "not-allowed"
                    : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: pinning === "address" || address.trim().length === 0 ? 0.6 : 1,
              }}
            >
              <Glyph name="pin" size={14} color={MC.brandDeep} strokeWidth={2.4} />
              {pinning === "address" ? "Looking up…" : "Geocode address"}
            </button>
          </div>

          {pin && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: MC.okTint,
                border: `1px solid ${MC.ok}33`,
                borderRadius: 10,
                fontFamily: MC.font,
                fontSize: 12,
                color: "#0d6a45",
              }}
            >
              <Glyph
                name="check-circle"
                size={14}
                color={MC.ok}
                strokeWidth={2.4}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                Location pinned ·{" "}
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}>
                  {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                </span>
                {pin.source === "gps" ? " (your GPS)" : " (from address)"}
              </span>
              <button
                type="button"
                onClick={clearPin}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#0d6a45",
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                aria-label="Clear pin"
              >
                <Glyph name="close" size={12} color="#0d6a45" />
              </button>
            </div>
          )}
          {pinError && (
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: "#9c1a3c",
                lineHeight: 1.4,
                marginTop: -4,
              }}
            >
              {pinError}
            </div>
          )}
          <div style={{ height: 1, background: MC.line, margin: "2px 0" }} />
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: MC.hint,
            }}
          >
            Contact (optional)
          </div>
          <Field
            label="Contact name"
            value={contactName}
            onChange={setContactName}
            placeholder="Who's the person there?"
          />
          <Field
            label="Contact phone"
            value={contactPhone}
            onChange={setContactPhone}
            placeholder="+27 …"
            inputMode="tel"
          />
        </div>

        {error && (
          <div
            style={{
              background: MC.dangerTint,
              border: `1px solid ${MC.danger}33`,
              borderRadius: 12,
              padding: "10px 12px",
              color: "#9c1a3c",
              fontFamily: MC.font,
              fontSize: 13,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <Glyph name="warn" size={16} color={MC.danger} strokeWidth={2.2} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          style={{
            height: 50,
            borderRadius: 14,
            background: canSave ? MC.brandDeep : MC.line,
            color: "#fff",
            border: "none",
            fontFamily: MC.font,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: -0.1,
            cursor: canSave ? "pointer" : "not-allowed",
            boxShadow: canSave ? `0 6px 16px ${MC.brand}44` : "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Glyph name="check" size={17} color="#fff" strokeWidth={2.4} />
              Add customer
            </>
          )}
        </button>

        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.hint,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          We&apos;ll auto-pick the colour, initials, and customer code.
          Your manager can rename or adjust those later.
        </div>
      </div>

      <AppFooter />
    </div>
  );
}

// ─── Inline form-field component ──────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  multiline,
  inputMode,
  autoFocus,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: "text" | "tel" | "email" | "url";
  autoFocus?: boolean;
  hint?: string;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: multiline ? "10px 12px" : "0 12px",
    height: multiline ? "auto" : 44,
    minHeight: multiline ? 56 : undefined,
    fontSize: 15,
    fontFamily: MC.font,
    color: MC.ink,
    background: "#fff",
    border: `1px solid ${MC.line}`,
    borderRadius: 11,
    outline: "none",
    resize: multiline ? "vertical" : "none",
    lineHeight: multiline ? 1.45 : undefined,
  };
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: MC.font,
          fontSize: 12.5,
          fontWeight: 700,
          color: MC.ink2,
          marginBottom: 6,
          letterSpacing: -0.05,
        }}
      >
        {label}
        {required && <span style={{ color: MC.danger, marginLeft: 4 }}>*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoFocus={autoFocus}
          style={inputStyle}
        />
      )}
      {hint && (
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.hint,
            marginTop: 6,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
