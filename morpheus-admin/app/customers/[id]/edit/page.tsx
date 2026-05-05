"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AC } from "@/lib/tokens";
import { getCustomer, updateCustomer } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await getCustomer(id);
      if (cancelled) return;
      setCustomer(c);
      if (c) {
        setAddress(c.address ?? "");
        if (c.latitude != null && c.longitude != null) {
          setCoords({ lat: c.latitude, lng: c.longitude });
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async () => {
    if (busy) return;
    setError(null);
    setNote(null);
    setBusy(true);

    let latitude: number | null = null;
    let longitude: number | null = null;
    const trimmed = address.trim();

    if (trimmed) {
      if (pickedCoords) {
        latitude = pickedCoords.lat;
        longitude = pickedCoords.lng;
        setCoords({ lat: latitude, lng: longitude });
      } else {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
          if (res.ok) {
            const data = (await res.json()) as { latitude: number; longitude: number };
            latitude = data.latitude;
            longitude = data.longitude;
            setCoords({ lat: latitude, lng: longitude });
          } else {
            setNote("Could not geocode this address — saved without coordinates.");
          }
        } catch {
          setNote("Geocoder unreachable — saved without coordinates.");
        }
      }
    }

    const result = await updateCustomer(id, {
      address: trimmed || null,
      latitude,
      longitude,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Failed to save.");
      return;
    }
    router.push(`/customers/${id}`);
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "Edit"]}>
        <div style={{ padding: 20, color: AC.mute, fontFamily: AC.font }}>Loading…</div>
      </AdminShell>
    );
  }

  if (!customer) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "Edit"]}>
        <div style={{ padding: 20, color: AC.danger, fontFamily: AC.font }}>
          Customer not found.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell breadcrumbs={["Home", "Customers", customer.name, "Edit address"]}>
      <div style={{ padding: 20, maxWidth: 720 }}>
        <Card padding={20}>
          <SectionTitle>Address & location</SectionTitle>
          <div style={{ marginBottom: 12, color: AC.mute, fontFamily: AC.font, fontSize: 12.5 }}>
            Editing <b style={{ color: AC.ink }}>{customer.name}</b> · {customer.code}
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
              autoFocus
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

          {coords && (
            <div
              style={{
                fontFamily: AC.fontMono,
                fontSize: 11,
                color: AC.mute,
                marginBottom: 12,
              }}
            >
              Current coordinates: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </div>
          )}

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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => router.push(`/customers/${id}`)}>Cancel</Btn>
            <Btn kind="primary" icon="check" onClick={onSave}>
              {busy ? "Saving…" : "Save"}
            </Btn>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
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
