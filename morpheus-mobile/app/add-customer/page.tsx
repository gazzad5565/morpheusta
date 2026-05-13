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
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { MapPreview } from "@/components/MapPreview";

interface Pin {
  /** "gps"        — captured from device GPS at the moment the rep
   *                 tapped "Use my current location".
   *  "address"    — resolved by Nominatim from the typed address
   *                 via the "Geocode address" button.
   *  "suggestion" — captured automatically when the rep picked a
   *                 suggestion from the address-field typeahead.
   *                 Same data quality as "address" but the rep
   *                 didn't have to tap a second button. */
  source: "gps" | "address" | "suggestion";
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
          {/* Location section (May 13 rework) — was previously three
              loose components (address field, two side-by-side pin
              buttons, green chip) that left reps unsure what was
              "the active step". Now grouped into a single bordered
              card with a clear heading and a stacked layout:
                1. Title + status line (Pinned ✓ / Not pinned)
                2. Address typeahead (primary path — autopin)
                3. Two fallback actions, full-width stacked so they
                   read as alternates not "both required"
                4. Pin confirmation strip stays at the bottom of the
                   same card when active. */}
          <div
            style={{
              padding: 14,
              background: pin ? MC.okTint : MC.bg,
              border: `1px solid ${pin ? `${MC.ok}55` : MC.line}`,
              borderRadius: 14,
              transition: "background .2s, border-color .2s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: pin ? "#fff" : "#fff",
                  border: `1px solid ${pin ? `${MC.ok}55` : MC.line}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Glyph
                  name={pin ? "check-circle" : "pin"}
                  size={14}
                  color={pin ? MC.ok : MC.brandDeep}
                  strokeWidth={2.4}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    color: pin ? "#0d6a45" : MC.ink,
                    letterSpacing: -0.05,
                  }}
                >
                  Location {pin ? "pinned" : "·  needed"}
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 11.5,
                    color: pin ? "#0d6a45" : MC.mute,
                    marginTop: 2,
                    lineHeight: 1.35,
                  }}
                >
                  {pin
                    ? "Geofence locked. Rename the address freely below — coords stay."
                    : "Pick a suggestion below to auto-pin, OR use one of the manual options."}
                </div>
              </div>
            </div>

            {/* Primary path — typeahead. Picking a suggestion
                auto-pins, so most reps never need the buttons below. */}
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: MC.hint,
                marginBottom: 6,
              }}
            >
              1 · Type the address
            </div>
            <AddressAutocomplete
              value={address}
              onChange={(v) => {
                setAddress(v);
                // Typing after a suggestion was picked doesn't clear
                // the pin — coords stay locked, the rep can rename
                // the display label freely. They can tap the chip's
                // × to clear if they want to redo the lookup.
              }}
              onSelect={(s) => {
                setPin({
                  source: "suggestion",
                  latitude: s.latitude,
                  longitude: s.longitude,
                });
                setPinError(null);
              }}
              placeholder="Start typing — e.g. 12 Loop St Cape Town"
            />

            {/* Manual fallbacks — only foregrounded when the rep
                hasn't already pinned. Once pinned, this whole block
                collapses into the confirmation strip below to keep
                the form short. */}
            {!pin && (
              <>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: MC.hint,
                    margin: "14px 0 6px",
                  }}
                >
                  2 · …or pin it manually
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={pinViaGps}
                    disabled={!!pinning}
                    style={{
                      minHeight: 42,
                      padding: "0 14px",
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
                      gap: 8,
                      opacity: pinning === "gps" ? 0.7 : 1,
                    }}
                  >
                    <Glyph name="target" size={15} color="#fff" strokeWidth={2.4} />
                    {pinning === "gps"
                      ? "Pinning your location…"
                      : "Use my current GPS"}
                  </button>
                  <button
                    type="button"
                    onClick={pinViaAddress}
                    disabled={!!pinning || address.trim().length === 0}
                    style={{
                      minHeight: 42,
                      padding: "0 14px",
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
                      gap: 8,
                      opacity:
                        pinning === "address" || address.trim().length === 0
                          ? 0.55
                          : 1,
                    }}
                  >
                    <Glyph
                      name="pin"
                      size={15}
                      color={MC.brandDeep}
                      strokeWidth={2.4}
                    />
                    {pinning === "address"
                      ? "Looking up the address…"
                      : "Geocode what I typed"}
                  </button>
                </div>
              </>
            )}

            {/* Live map preview (May 13) — renders only when pinned
                so the rep can sanity-check the pin before saving.
                Read-only; full pan/zoom would let them wander away
                and feel lost. */}
            {pin && (
              <div style={{ marginTop: 12 }}>
                <MapPreview
                  latitude={pin.latitude}
                  longitude={pin.longitude}
                  label={address.trim() || name.trim() || null}
                  height={170}
                />
              </div>
            )}

            {pin && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "#fff",
                border: `1px solid ${MC.ok}55`,
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
                {pin.source === "gps"
                  ? " (your GPS)"
                  : pin.source === "suggestion"
                  ? " (from suggestion)"
                  : " (from address)"}
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
                marginTop: 8,
                fontFamily: MC.font,
                fontSize: 11.5,
                color: "#9c1a3c",
                lineHeight: 1.4,
              }}
            >
              {pinError}
            </div>
          )}
          </div>{/* end location card */}
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
