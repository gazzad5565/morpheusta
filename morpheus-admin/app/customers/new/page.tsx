"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { initialsFromNameOrEmail } from "@/lib/format";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import { createCustomer } from "@/lib/customers-store";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { CustomerAddressMap } from "@/components/CustomerAddressMap";
import type { Customer } from "@/lib/types";

const SWATCHES = [
  "#D9493D", // GW red
  "#E2A434", // NG amber
  "#2E9C82", // OS teal
  "#2E4FB8", // SB indigo
  "#C55A2E", // PR orange
  "#8E4ECC", // AC purple
  "#1FA971", // HM green
  "#5B7DC2", // accent indigo
];

const REGIONS: Customer["region"][] = ["North", "South", "East", "West"];

// Local deriveInitials removed — use initialsFromNameOrEmail from
// lib/format.ts which handles the same word-split + uppercase logic
// and adds an email fallback. For customer-name input we pass empty
// email; output is identical for non-empty input.
const deriveInitials = (name: string) => initialsFromNameOrEmail(name, "");

export default function NewCustomerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [initials, setInitials] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [region, setRegion] = useState<Customer["region"]>("North");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [code, setCode] = useState<string>(String(Math.floor(Math.random() * 9000) + 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geocodeNote, setGeocodeNote] = useState<string | null>(null);

  // Auto-fill initials from name when user hasn't manually typed any
  const [initialsManuallyEdited, setInitialsManuallyEdited] = useState(false);
  const onChangeName = (v: string) => {
    setName(v);
    if (!initialsManuallyEdited) setInitials(deriveInitials(v));
  };

  const previewCustomer: Customer = {
    id: "preview",
    name: name || "Customer name",
    initials: initials || "??",
    color,
    code: `#${code.padStart(4, "0")}`,
    region,
    sites: 1,
    geofence: 75,
    shiftsThisWeek: 0,
    tier: "Standard",
  };

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    setGeocodeNote(null);
    if (!name.trim()) return setError("Name is required.");
    if (!initials.trim()) return setError("Initials are required.");
    const codeNum = parseInt(code, 10);
    if (Number.isNaN(codeNum)) return setError("Code must be a number.");

    setBusy(true);

    let latitude: number | undefined;
    let longitude: number | undefined;
    const trimmedAddress = address.trim();
    if (trimmedAddress) {
      if (pickedCoords) {
        latitude = pickedCoords.lat;
        longitude = pickedCoords.lng;
      } else {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmedAddress)}`);
          if (res.ok) {
            const data = (await res.json()) as { latitude: number; longitude: number };
            latitude = data.latitude;
            longitude = data.longitude;
          } else {
            setGeocodeNote("Could not geocode address — saving without coordinates.");
          }
        } catch {
          setGeocodeNote("Geocoder unreachable — saving without coordinates.");
        }
      }
    }

    const result = await createCustomer({
      name: name.trim(),
      initials: initials.trim().slice(0, 3).toUpperCase(),
      color,
      code: codeNum,
      region,
      city: city.trim() || undefined,
      address: trimmedAddress || undefined,
      latitude,
      longitude,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Failed to create customer.");
      return;
    }
    router.push("/customers");
  };

  return (
    <AdminShell breadcrumbs={["Home", "Customers", "New customer"]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Customer details</SectionTitle>

          <Field label="Name" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="e.g. Atlas Beverages"
              style={inputStyle}
            />
          </Field>

          <Field label="Initials" required hint="2–3 characters, used in the colored tile.">
            <input
              value={initials}
              onChange={(e) => {
                setInitialsManuallyEdited(true);
                setInitials(e.target.value.toUpperCase().slice(0, 3));
              }}
              placeholder="AB"
              maxLength={3}
              style={{ ...inputStyle, maxWidth: 120, letterSpacing: 1 }}
            />
          </Field>

          <Field label="Brand color">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setColor(s)}
                  aria-label={`Pick color ${s}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: s,
                    border: color === s ? `3px solid ${AC.ink}` : "3px solid transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Region">
              <Combobox
                value={region}
                onChange={(v) => setRegion((v ?? REGIONS[0]) as Customer["region"])}
                triggerIcon="pin"
                clearable={false}
                options={REGIONS.map((r) => ({ value: r, label: r }))}
              />
            </Field>

            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Northgate"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field
            label="Address"
            hint={
              pickedCoords
                ? `Coordinates locked: ${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`
                : "Start typing — pick a match from the list to lock coordinates."
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
          </Field>

          {/* Map preview — appears the moment the manager picks an
              address from the autocomplete list. Locks the
              coordinates visually so they can confirm "yes, that's
              the right spot" before saving. Geofence defaults to
              100m which matches the post-create default on the
              customer_sites head-office row. */}
          {pickedCoords && (
            <div
              style={{
                marginBottom: 16,
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${AC.line}`,
              }}
            >
              <CustomerAddressMap
                lat={pickedCoords.lat}
                lng={pickedCoords.lng}
                radiusM={100}
                color={color}
                initials={(initials || "??").slice(0, 3)}
                showGeofence
                height={240}
              />
            </div>
          )}

          <Field label="Account code" hint="Internal reference number — auto-generated, edit if needed.">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              maxLength={6}
              style={{ ...inputStyle, maxWidth: 160, fontFamily: AC.fontMono }}
            />
          </Field>

          {geocodeNote && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.bg,
                color: AC.ink2,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 12,
                border: `1px solid ${AC.line}`,
              }}
            >
              {geocodeNote}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => router.push("/customers")} disabled={busy}>
              Cancel
            </Btn>
            <Btn kind="primary" icon="check" onClick={onSubmit} disabled={busy}>
              {busy ? "Creating…" : "Create customer"}
            </Btn>
          </div>
        </Card>

        {/* Preview */}
        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.line}`,
            }}
          >
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
          </div>
          <div
            style={{
              height: 64,
              background: `${color}18`,
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", left: 16, bottom: -16 }}>
              <CustomerSwatch customer={previewCustomer} size={44} />
            </div>
          </div>
          <div style={{ padding: "24px 16px 14px" }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              {previewCustomer.name}
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11.5,
                color: AC.mute,
                marginTop: 2,
              }}
            >
              {previewCustomer.code} · {previewCustomer.region}
              {city && ` · ${city}`}
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({
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
    <div style={{ marginBottom: 16 }}>
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
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
