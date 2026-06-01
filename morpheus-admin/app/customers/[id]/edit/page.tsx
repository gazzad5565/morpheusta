"use client";

/**
 * Edit customer — full CRUD form. Earlier versions only let you edit
 * the address; reps + admins kept hitting "I can't change the name."
 * Every field on the customer entity is editable here:
 *   name, code, initials, color swatch, region, address (geocoded),
 *   geofence radius. Save round-trips through updateCustomer.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { CustomerAddressMap } from "@/components/CustomerAddressMap";
import { Combobox } from "@/components/ui/Combobox";
import { inputStyle } from "@/components/ui/Filters";
import { getRegions, getGroups, getStoreTypes } from "@/lib/settings-store";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { Pill } from "@/components/ui/Pill";
import { AC } from "@/lib/tokens";
import {
  getCustomer,
  updateCustomer,
  updateCustomerLogo,
  compressCustomerLogo,
  deleteCustomer,
} from "@/lib/customers-store";
import { initialsFromNameOrEmail } from "@/lib/format";
import type { Customer } from "@/lib/types";

/** Tabs across the top of the customer edit page. Identity first
 *  (most-edited), per-customer exception overrides last (rarely
 *  touched). Contacts is NOT here — full CRUD lives on the detail
 *  page's Contacts tab. */
type EditTab = "identity" | "location" | "exceptions";
const TABS: { key: EditTab; label: string; glyph: GlyphName }[] = [
  { key: "identity", label: "Identity", glyph: "info" },
  { key: "location", label: "Location", glyph: "pin" },
  { key: "exceptions", label: "Check-in exceptions", glyph: "settings" },
];

const SWATCHES = [
  "#D9493D",
  "#E2A434",
  "#2E9C82",
  "#2E4FB8",
  "#C55A2E",
  "#8E4ECC",
  "#1FA971",
  "#5B7DC2",
];
// Customer region is a tenant-managed vocabulary (app_settings.regions,
// edited at Settings → Site settings → Customer regions). The edit-form
// dropdown sources ONLY from that vocab — no hardcoded fallback. A
// legacy value already on the customer (e.g. "North") is preserved via
// the current-value branch in the options builder so editing never
// blanks it. (Jun 1: removed a North/South/East/West fallback that was
// showing as static data when the vocab hadn't loaded — Gary report.)

// Local deriveInitials removed — wraps shared helper from lib/format.ts.
const deriveInitials = (name: string) => initialsFromNameOrEmail(name, "");

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [original, setOriginal] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EditTab>("identity");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [initials, setInitials] = useState("");
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [color, setColor] = useState(SWATCHES[0]);
  // Customer/outlet main phone (Rayhaan R7). Free text.
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState<string>("");
  // Mariska G5a (May 28 later) — Customer region + Customer group
  // are tenant-managed vocabularies. Loaded from app_settings.regions
  // / .groups. Empty array = vocab not populated yet; the dropdowns
  // then show only the customer's current value (if any) — never a
  // hardcoded list — nudging the manager to define them in Site
  // settings.
  const [customerGroup, setCustomerGroup] = useState<string>("");
  // Store type — third customer vocabulary (Rayhaan R7, May 28).
  const [storeType, setStoreType] = useState<string>("");
  const [regionVocab, setRegionVocab] = useState<string[]>([]);
  const [groupVocab, setGroupVocab] = useState<string[]>([]);
  const [storeTypeVocab, setStoreTypeVocab] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geofenceM, setGeofenceM] = useState<number>(100);
  // Per-customer exception overrides. null = inherit org default;
  // true/false = explicit per-customer flip. Driven by the
  // ExceptionInherit3State picker below the geofence slider.
  const [locExceptionsOverride, setLocExceptionsOverride] = useState<
    boolean | null
  >(null);
  const [timeExceptionsOverride, setTimeExceptionsOverride] = useState<
    boolean | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Logo upload: optimistic — we save immediately on file pick so the
  // manager can see the new logo right away without waiting for the
  // full form Save. Cleared (and persisted) via the inline Remove
  // button next to the preview.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-derive initials from name until the user manually edits the
  // initials field. Same behaviour as /customers/new.
  useEffect(() => {
    if (!initialsTouched) setInitials(deriveInitials(name));
  }, [name, initialsTouched]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, regs, grps, stypes] = await Promise.all([
        getCustomer(id),
        getRegions(),
        getGroups(),
        getStoreTypes(),
      ]);
      if (cancelled) return;
      setRegionVocab(regs);
      setGroupVocab(grps);
      setStoreTypeVocab(stypes);
      setOriginal(c);
      if (c) {
        setName(c.name ?? "");
        setCode(c.code ?? "");
        setInitials(c.initials ?? deriveInitials(c.name ?? ""));
        setColor(c.color ?? SWATCHES[0]);
        setPhone(c.phone ?? "");
        setRegion(c.region ?? "");
        setCustomerGroup(c.customerGroup ?? "");
        setStoreType(c.storeType ?? "");
        setAddress(c.address ?? "");
        if (c.latitude != null && c.longitude != null) {
          setCoords({ lat: c.latitude, lng: c.longitude });
        }
        setGeofenceM(c.geofence ?? 100);
        setLocExceptionsOverride(c.locationExceptionsEnabled ?? null);
        setTimeExceptionsOverride(c.timingExceptionsEnabled ?? null);
        setLogoUrl(c.logoUrl ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const previewCustomer = useMemo<Customer | null>(() => {
    if (!original) return null;
    return {
      ...original,
      name: name || original.name,
      code: code || original.code,
      initials: initials || original.initials,
      color,
      logoUrl,
    };
  }, [original, name, code, initials, color, logoUrl]);

  async function onPickLogo(file: File | null | undefined) {
    if (!file) return;
    setLogoError(null);
    setLogoUploading(true);
    const compressed = await compressCustomerLogo(file);
    if (!compressed.ok) {
      setLogoUploading(false);
      setLogoError(compressed.error);
      return;
    }
    const result = await updateCustomerLogo(id, compressed.dataUrl);
    setLogoUploading(false);
    if (!result.ok) {
      setLogoError(result.error || "Couldn't save the logo.");
      return;
    }
    setLogoUrl(compressed.dataUrl);
  }

  async function onRemoveLogo() {
    if (!logoUrl) return;
    if (!confirm("Remove this customer's logo? The initials tile will show again.")) {
      return;
    }
    setLogoUploading(true);
    setLogoError(null);
    const result = await updateCustomerLogo(id, null);
    setLogoUploading(false);
    if (!result.ok) {
      setLogoError(result.error || "Couldn't remove the logo.");
      return;
    }
    setLogoUrl(null);
  }

  async function onSave() {
    if (busy) return;
    setError(null);
    setNote(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);

    let latitude: number | null = coords?.lat ?? null;
    let longitude: number | null = coords?.lng ?? null;
    const trimmed = address.trim();

    if (trimmed && trimmed !== (original?.address ?? "")) {
      // Address changed — re-geocode (or use the picked match).
      if (pickedCoords) {
        latitude = pickedCoords.lat;
        longitude = pickedCoords.lng;
      } else {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            const data = (await res.json()) as { latitude: number; longitude: number };
            latitude = data.latitude;
            longitude = data.longitude;
          } else {
            setNote("Could not geocode the new address — saved without coordinates.");
            latitude = null;
            longitude = null;
          }
        } catch {
          setNote("Geocoder unreachable — saved without coordinates.");
          latitude = null;
          longitude = null;
        }
      }
    } else if (!trimmed) {
      latitude = null;
      longitude = null;
    }

    const result = await updateCustomer(id, {
      name: name.trim(),
      code: code.trim(),
      initials: (initials || deriveInitials(name)).trim().toUpperCase(),
      color,
      region,
      customer_group: customerGroup || null,
      store_type: storeType || null,
      phone: phone.trim() || null,
      address: trimmed || null,
      latitude,
      longitude,
      geofence_radius_m: geofenceM,
      location_exceptions_enabled: locExceptionsOverride,
      timing_exceptions_enabled: timeExceptionsOverride,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Failed to save.");
      return;
    }
    router.push(`/customers/${id}`);
  }

  async function onDelete() {
    if (busy) return;
    const label = original?.name || "this customer";
    if (
      !confirm(
        `Delete ${label}? This removes the customer along with all their sites, tasks, and library files. Past shifts stay for the audit trail. There's no undo.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await deleteCustomer(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Couldn't delete.");
      return;
    }
    router.push("/customers");
  }

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "Edit"]}>
        <div style={{ padding: 20, color: AC.mute, fontFamily: AC.font }}>Loading…</div>
      </AdminShell>
    );
  }
  if (!original) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "Edit"]}>
        <div style={{ padding: 20, color: AC.danger, fontFamily: AC.font }}>
          Customer not found.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers", { label: original.name }, "Edit"]}
    >
      {/* Page shell mirrors /customers/[id]: hero header card on top,
          underline-style tab strip below, then the tab body. Keeps
          the edit view feeling like the same surface as the detail
          view rather than a separate screen. The hero doubles as a
          live preview — swatch / name / code / region update as the
          manager types in the Identity and Location tabs. */}
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Hero — live preview of the in-progress edits. */}
        <Card padding={20}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            {previewCustomer && (
              <CustomerSwatch customer={previewCustomer} size={56} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 19,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name || original.name}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.mute,
                  marginTop: 2,
                }}
              >
                Account #{code || original.code} · {region}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <Pill bg={AC.brandTint} fg={AC.brandDeep}>
                  ● Editing
                </Pill>
              </div>
            </div>
          </div>
        </Card>

        {/* Tab strip — matches /customers/[id] underline style. */}
        <div
          role="tablist"
          aria-label="Customer edit sections"
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${AC.line}`,
            overflowX: "auto",
          }}
        >
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: on
                    ? `2px solid ${AC.ink}`
                    : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: on ? AC.ink : AC.mute,
                  letterSpacing: -0.1,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  whiteSpace: "nowrap",
                }}
              >
                <AGlyph
                  name={t.glyph}
                  size={13}
                  color={on ? AC.ink : AC.mute}
                />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ───── 1. Identity ───────────────────────────────────── */}
        {tab === "identity" && (
          <Card padding={20}>
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Code" hint="Numeric. The # and leading zeros are just display.">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  style={inputStyle}
                />
              </Field>
              <Field label="Initials" hint="Shown on the avatar tile.">
                <input
                  value={initials}
                  onChange={(e) => {
                    setInitialsTouched(true);
                    setInitials(e.target.value.toUpperCase().slice(0, 3));
                  }}
                  style={inputStyle}
                  maxLength={3}
                />
              </Field>
            </div>

            {/* Customer phone — Rayhaan R7. The store's own line; shows
                as a tappable number on the customer header. Distinct
                from a contact person's phone (managed on the Contacts
                tab). */}
            <Field label="Phone" hint="The customer / outlet's main line. Optional.">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 21 555 0123"
                inputMode="tel"
                style={inputStyle}
              />
            </Field>

            <Field label="Avatar colour">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColor(s)}
                    aria-label={s}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: s,
                      cursor: "pointer",
                      border:
                        color === s
                          ? `3px solid ${AC.ink}`
                          : "1px solid rgba(0,0,0,.08)",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </Field>

            {/* Logo upload — overrides the initials tile in the rep app.
                Saves immediately on pick (separate from the form Save
                button) because file uploads are their own commit-step
                UX: managers want to see the new logo land before
                fiddling with the rest of the form. We compress to a
                tiny base64 JPEG so it travels in the same row as the
                customer — no Supabase Storage round-trip per render. */}
            <Field
              label="Customer logo"
              hint={
                logoUrl
                  ? "Replaces the initials tile in the rep app. Compressed automatically to keep mobile data tight."
                  : "Optional. Upload an image to show in place of the initials tile on the rep's device."
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    background: logoUrl ? "#fff" : color,
                    border: `1px solid ${AC.line}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: AC.font,
                    fontWeight: 700,
                    fontSize: 20,
                    letterSpacing: 0.4,
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Customer logo"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <span>{(initials || deriveInitials(name) || "??").slice(0, 3)}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading
                      ? "Uploading…"
                      : logoUrl
                      ? "Replace logo"
                      : "Upload logo"}
                  </Btn>
                  {logoUrl && (
                    <Btn
                      kind="danger"
                      onClick={onRemoveLogo}
                      disabled={logoUploading}
                    >
                      Remove
                    </Btn>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    // Reset so re-picking the same file fires onChange.
                    e.target.value = "";
                    void onPickLogo(file);
                  }}
                  style={{ display: "none" }}
                />
              </div>
              {logoError && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#9c1a3c",
                    fontFamily: AC.font,
                  }}
                >
                  {logoError}
                </div>
              )}
            </Field>
          </Card>
          )}

          {/* ───── 2. Location ───────────────────────────────────── */}
          {tab === "location" && (
          <Card padding={20}>
            {/* Customer region — vocabulary lives in
                app_settings.regions, edited at Settings →
                Organisation → Customer regions. Falls back to the
                legacy hardcoded list when the tenant hasn't
                populated their own vocab yet. We always include the
                CURRENT saved value as an option (even if it's not
                in the vocab) so a legacy "North"/"South"/etc. row
                doesn't get blank-out on save. May 28 (Mariska G5a). */}
            <Field label="Customer region">
              <Combobox
                value={region}
                onChange={(v) => setRegion(v ?? "")}
                triggerIcon="pin"
                clearable={false}
                options={(() => {
                  // Vocab-sourced ONLY (Site settings → Customer
                  // regions) — same as Customer group / Store type
                  // below. Preserve the customer's current saved value
                  // if it's a legacy one not in the active vocab, so
                  // editing never blanks it on save.
                  const set = new Set(regionVocab);
                  if (region && !set.has(region)) {
                    return [region, ...regionVocab].map((r) => ({ value: r, label: r }));
                  }
                  return regionVocab.map((r) => ({ value: r, label: r }));
                })()}
              />
            </Field>

            {/* Customer group — new May 28 column. Hidden when the
                tenant has no group vocab yet AND the customer has
                no saved value (i.e. nothing useful to show). */}
            {(groupVocab.length > 0 || customerGroup) && (
              <Field label="Customer group">
                <Combobox
                  value={customerGroup || null}
                  onChange={(v) => setCustomerGroup(v ?? "")}
                  triggerIcon="customer"
                  clearable
                  options={(() => {
                    const set = new Set(groupVocab);
                    if (customerGroup && !set.has(customerGroup)) {
                      return [customerGroup, ...groupVocab].map((g) => ({
                        value: g,
                        label: g,
                      }));
                    }
                    return groupVocab.map((g) => ({ value: g, label: g }));
                  })()}
                />
              </Field>
            )}

            {/* Store type — Rayhaan R7. Same vocab-or-current-value
                gating as Customer group. */}
            {(storeTypeVocab.length > 0 || storeType) && (
              <Field label="Store type">
                <Combobox
                  value={storeType || null}
                  onChange={(v) => setStoreType(v ?? "")}
                  triggerIcon="building"
                  clearable
                  options={(() => {
                    const set = new Set(storeTypeVocab);
                    if (storeType && !set.has(storeType)) {
                      return [storeType, ...storeTypeVocab].map((s) => ({
                        value: s,
                        label: s,
                      }));
                    }
                    return storeTypeVocab.map((s) => ({ value: s, label: s }));
                  })()}
                />
              </Field>
            )}

            <Field
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
            </Field>

            {/* Map preview — shows whenever we have ANY coordinates
                on file or the manager just picked a new address. We
                prefer pickedCoords (the autocomplete selection just
                made) over coords (the saved location) so the map
                tracks the pending change as the manager edits. The
                geofence circle re-renders live as the slider moves
                below — the manager can see the radius in real metres
                before saving. */}
            {(pickedCoords || coords) && (
              <div
                style={{
                  marginBottom: 16,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${AC.line}`,
                }}
              >
                <CustomerAddressMap
                  lat={(pickedCoords ?? coords)!.lat}
                  lng={(pickedCoords ?? coords)!.lng}
                  radiusM={geofenceM}
                  color={color}
                  initials={
                    (initials || deriveInitials(name) || "??").slice(0, 3)
                  }
                  showGeofence
                  height={260}
                />
              </div>
            )}

            <Field
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
                      borderRadius: 999,
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
            </Field>
          </Card>
          )}

          {/* ───── 3. Check-in exceptions ─────────────────────────
              Per-customer OVERRIDES on top of the org-wide defaults at
              Settings → Check-in rules. The explainer below makes the
              inherit/on/off hierarchy explicit so these don't read as
              standalone toggles. */}
          {tab === "exceptions" && (
          <Card padding={20}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              Override your org-wide defaults for this customer only. Leave
              both on <b style={{ color: AC.ink2 }}>Inherit</b> to use the
              settings from{" "}
              <b style={{ color: AC.ink2 }}>Settings → Check-in rules</b>.
            </div>

            <Field
              label="Off-site exceptions"
              hint="Whether the rep can check in from outside the geofence with a reason."
            >
              <ExceptionOverridePicker
                value={locExceptionsOverride}
                onChange={setLocExceptionsOverride}
              />
            </Field>

            <Field
              label="Late / early exceptions"
              hint="Whether the rep can check in outside the shift's scheduled window with a reason."
            >
              <ExceptionOverridePicker
                value={timeExceptionsOverride}
                onChange={setTimeExceptionsOverride}
              />
            </Field>
          </Card>
          )}

          {/* ───── Status messages + action row ───────────────── */}
          {note && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.card,
                color: AC.ink2,
                borderRadius: AC.radiusCard,
                fontSize: 13,
                fontWeight: 500,
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
                borderRadius: AC.radiusCard,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                border: `1px solid ${AC.danger}33`,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>{error}</span>
            </div>
          )}

          {/* Action row mirrors every other entity edit form: Delete
              left, Cancel + Save right. Lives outside the tab body so
              it reads as a page-level commit, not a field. */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 4,
            }}
          >
            <Btn kind="danger" onClick={onDelete} disabled={busy}>
              Delete customer
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => router.push(`/customers/${id}`)} disabled={busy}>
                Cancel
              </Btn>
              <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Btn>
            </div>
          </div>
      </div>
    </AdminShell>
  );
}

/**
 * Tri-state picker: Inherit (null) | On (true) | Off (false).
 *
 * Used for the per-customer exception overrides. "Inherit" is the
 * default and means "use whatever Settings → Check-in rules says";
 * On / Off force the override regardless of the org default. Pill
 * group rather than a select because three options at this scale
 * read better as side-by-side buttons.
 */
function ExceptionOverridePicker({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: Array<{ key: string; label: string; v: boolean | null }> = [
    { key: "inherit", label: "Inherit org default", v: null },
    { key: "on", label: "Always show", v: true },
    { key: "off", label: "Never show", v: false },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.v)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${active ? AC.ink : AC.line}`,
              background: active ? AC.ink : "#fff",
              color: active ? "#fff" : AC.ink2,
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

