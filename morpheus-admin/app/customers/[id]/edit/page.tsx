"use client";

/**
 * Edit customer — full CRUD form. Earlier versions only let you edit
 * the address; reps + admins kept hitting "I can't change the name."
 * Every field on the customer entity is editable here:
 *   name, code, initials, color swatch, region, address (geocoded),
 *   geofence radius. Save round-trips through updateCustomer.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { Combobox } from "@/components/ui/Combobox";
import { inputStyle } from "@/components/ui/Filters";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { AC } from "@/lib/tokens";
import { getCustomer, updateCustomer, deleteCustomer } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

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
const REGIONS: Customer["region"][] = ["North", "South", "East", "West"];

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [original, setOriginal] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [initials, setInitials] = useState("");
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [color, setColor] = useState(SWATCHES[0]);
  const [region, setRegion] = useState<Customer["region"]>("North");
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

  // Auto-derive initials from name until the user manually edits the
  // initials field. Same behaviour as /customers/new.
  useEffect(() => {
    if (!initialsTouched) setInitials(deriveInitials(name));
  }, [name, initialsTouched]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await getCustomer(id);
      if (cancelled) return;
      setOriginal(c);
      if (c) {
        setName(c.name ?? "");
        setCode(c.code ?? "");
        setInitials(c.initials ?? deriveInitials(c.name ?? ""));
        setColor(c.color ?? SWATCHES[0]);
        setRegion((c.region as Customer["region"]) ?? "North");
        setAddress(c.address ?? "");
        if (c.latitude != null && c.longitude != null) {
          setCoords({ lat: c.latitude, lng: c.longitude });
        }
        setGeofenceM(c.geofence ?? 100);
        setLocExceptionsOverride(c.locationExceptionsEnabled ?? null);
        setTimeExceptionsOverride(c.timingExceptionsEnabled ?? null);
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
    };
  }, [original, name, code, initials, color]);

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
    <AdminShell breadcrumbs={["Home", "Customers", original.name, "Edit"]}>
      <div
        style={{
          padding: 20,
          maxWidth: 920,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Edit customer</SectionTitle>

          <Field label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Code">
              <input value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
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

          <Field label="Region">
            <Combobox
              value={region}
              onChange={(v) => setRegion((v ?? REGIONS[0]) as Customer["region"])}
              triggerIcon="pin"
              clearable={false}
              options={REGIONS.map((r) => ({ value: r as string, label: r as string }))}
            />
          </Field>

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

          {/* Per-customer exception overrides — tri-state. "Inherit"
              is the default and uses whatever the org's
              /settings/check-in-rules toggle says; On / Off override
              for this customer specifically. Sits below the geofence
              slider because the location override controls whether
              the geofence is even consulted at check-in time. */}
          <Field
            label="Off-site exceptions for this customer"
            hint="Override the org-wide setting. Inherit uses whatever is set on Settings → Check-in rules."
          >
            <ExceptionOverridePicker
              value={locExceptionsOverride}
              onChange={setLocExceptionsOverride}
            />
          </Field>

          <Field
            label="Late / early exceptions for this customer"
            hint="Override the org-wide setting. Inherit uses whatever is set on Settings → Check-in rules."
          >
            <ExceptionOverridePicker
              value={timeExceptionsOverride}
              onChange={setTimeExceptionsOverride}
            />
          </Field>

          {note && (
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

          {/* Button row mirrors every other entity edit form in the
              admin (task, library, shift, user): Delete pinned left,
              Cancel + Save on the right. Managers asked for the same
              layout everywhere so muscle memory transfers between
              entity types. */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              alignItems: "center",
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
        </Card>

        {/* Live preview — mirrors the header card on the detail page. */}
        <Card padding={18}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Preview
          </div>
          {previewCustomer && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CustomerSwatch customer={previewCustomer} size={48} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 16,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {previewCustomer.name}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}>
                  #{previewCustomer.code} · {region}
                </div>
              </div>
            </div>
          )}
        </Card>
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
