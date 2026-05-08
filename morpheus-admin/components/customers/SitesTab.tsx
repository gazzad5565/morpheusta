"use client";

/**
 * Sites tab on the customer detail page. Lists every site (location)
 * belonging to a customer with full CRUD: add, rename, edit address,
 * change geofence, deactivate / reactivate / delete.
 *
 *   - Single-site customer: one card, no fanfare. Editing it is
 *     equivalent to the old "Address & geofence" tab.
 *   - Multi-site customer: one card per site. Add another with the
 *     "Add site" button. Each card has its own map + geofence slider.
 *
 * Hard-delete is blocked when shifts reference the site (FK is
 * ON DELETE SET NULL but we don't want to silently lose attribution).
 * Manager can still soft-delete via Deactivate.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { Spinner } from "@/components/ui/LoadingBar";
import { AC } from "@/lib/tokens";
import {
  listSitesForCustomer,
  createSite,
  updateSite,
  deactivateSite,
  reactivateSite,
  deleteSite,
  type CustomerSite,
} from "@/lib/sites-store";
import type { Customer } from "@/lib/types";

const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

const DEFAULT_GEOFENCE_M = 100;

export function SitesTab({ customer }: { customer: Customer }) {
  const [sites, setSites] = useState<CustomerSite[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const reload = async () => {
    const rows = await listSitesForCustomer(customer.id, { includeInactive: true });
    setSites(rows);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id]);

  const visible = useMemo(() => {
    const all = sites ?? [];
    return showInactive ? all : all.filter((s) => s.active);
  }, [sites, showInactive]);

  const inactiveCount = (sites ?? []).filter((s) => !s.active).length;

  if (sites === null) {
    return (
      <Card padding={28}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 13,
          }}
        >
          <Spinner size={14} />
          Loading sites…
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            color: AC.mute,
            fontWeight: 600,
          }}
        >
          {visible.length} site{visible.length === 1 ? "" : "s"}
          {inactiveCount > 0 && !showInactive && (
            <button
              type="button"
              onClick={() => setShowInactive(true)}
              style={{
                marginLeft: 10,
                padding: 0,
                background: "transparent",
                border: "none",
                color: AC.brandDeep,
                cursor: "pointer",
                fontFamily: AC.font,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              + show {inactiveCount} inactive
            </button>
          )}
          {showInactive && inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive(false)}
              style={{
                marginLeft: 10,
                padding: 0,
                background: "transparent",
                border: "none",
                color: AC.brandDeep,
                cursor: "pointer",
                fontFamily: AC.font,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              hide inactive
            </button>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <Btn
          icon="plus"
          kind="primary"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          Add site
        </Btn>
      </div>

      {/* New-site form */}
      {adding && (
        <SiteEditor
          mode="create"
          customer={customer}
          initial={null}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {/* Existing sites */}
      {visible.length === 0 && !adding && (
        <Card padding={28}>
          <div
            style={{
              textAlign: "center",
              color: AC.mute,
              fontFamily: AC.font,
              fontSize: 13,
            }}
          >
            No sites yet. Click <b>Add site</b> to attach the customer&apos;s first location.
          </div>
        </Card>
      )}

      {visible.map((s) =>
        editingId === s.id ? (
          <SiteEditor
            key={s.id}
            mode="edit"
            customer={customer}
            initial={s}
            onCancel={() => setEditingId(null)}
            onSaved={async () => {
              setEditingId(null);
              await reload();
            }}
          />
        ) : (
          <SiteCard
            key={s.id}
            site={s}
            customer={customer}
            onEdit={() => setEditingId(s.id)}
            onChanged={reload}
          />
        )
      )}
    </div>
  );
}

function SiteCard({
  site,
  customer,
  onEdit,
  onChanged,
}: {
  site: CustomerSite;
  customer: Customer;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const hasCoords = site.latitude != null && site.longitude != null;
  const radius = site.geofence_radius_m ?? DEFAULT_GEOFENCE_M;

  async function onToggleActive() {
    setBusy(true);
    if (site.active) {
      await deactivateSite(site.id);
    } else {
      await reactivateSite(site.id);
    }
    setBusy(false);
    await onChanged();
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete site "${site.name}"?\n\nThis is a hard delete. If any shifts are attached, the operation will fail and you'll need to deactivate the site instead.`
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await deleteSite(site.id);
    setBusy(false);
    if (!r.ok) {
      alert(r.error || "Couldn't delete this site.");
      return;
    }
    await onChanged();
  }

  return (
    <Card padding={0}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 0,
          alignItems: "stretch",
          opacity: site.active ? 1 : 0.6,
        }}
      >
        <div
          style={{
            borderRight: `1px solid ${AC.lineDim}`,
            minHeight: 240,
            overflow: "hidden",
            borderTopLeftRadius: 14,
            borderBottomLeftRadius: 14,
          }}
        >
          {hasCoords ? (
            <AddressMap
              lat={site.latitude!}
              lng={site.longitude!}
              radiusM={radius}
              color={customer.color}
              initials={customer.initials}
              height={240}
            />
          ) : (
            <div
              style={{
                height: 240,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                fontFamily: AC.font,
                color: AC.mute,
                fontSize: 13,
                gap: 8,
                background: "#F1F4F7",
              }}
            >
              <AGlyph name="pin" size={26} color={AC.faint} />
              <div>No coordinates yet</div>
            </div>
          )}
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 16,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              {site.name}
              {!site.active && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: AC.mute,
                    background: AC.bg,
                    padding: "2px 8px",
                    borderRadius: 99,
                  }}
                >
                  Inactive
                </span>
              )}
            </div>
            {site.address ? (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.ink2,
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {site.address}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.mute,
                  marginTop: 4,
                  fontStyle: "italic",
                }}
              >
                No address yet — edit to add one.
              </div>
            )}
            {hasCoords && (
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 11,
                  color: AC.mute,
                  marginTop: 4,
                }}
              >
                {site.latitude!.toFixed(5)}, {site.longitude!.toFixed(5)}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.ink2,
              marginTop: 4,
            }}
          >
            <AGlyph name="pin" size={12} color={AC.mute} />
            Geofence · {radius} m
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Btn size="sm" icon="edit" onClick={onEdit} disabled={busy}>
              Edit
            </Btn>
            <Btn size="sm" onClick={onToggleActive} disabled={busy}>
              {site.active ? "Deactivate" : "Reactivate"}
            </Btn>
            <Btn size="sm" kind="danger" onClick={onDelete} disabled={busy}>
              Delete
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SiteEditor({
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { lat: initial.latitude, lng: initial.longitude }
      : null
  );
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geofenceM, setGeofenceM] = useState<number>(
    initial?.geofence_radius_m ?? DEFAULT_GEOFENCE_M
  );
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
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            const data = (await res.json()) as { latitude: number; longitude: number };
            latitude = data.latitude;
            longitude = data.longitude;
          } else {
            setNote("Couldn't geocode that address — saved without coordinates.");
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

    const payload = {
      name: name.trim(),
      address: trimmed || null,
      latitude,
      longitude,
      geofence_radius_m: geofenceM,
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

  return (
    <Card padding={18}>
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

      {note && (
        <div
          style={{
            padding: "10px 12px",
            background: AC.bg,
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
          {busy ? "Saving…" : mode === "create" ? "Add site" : "Save"}
        </Btn>
      </div>
    </Card>
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

const inputStyle: React.CSSProperties = {
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
