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
import { createCustomer } from "@/lib/customers-store";

export default function AddCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && address.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    const r = await createCustomer({
      name: name.trim(),
      address: address.trim(),
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
          will see it in their live feed. You can book a shift for them
          right after.
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
            required
            value={address}
            onChange={setAddress}
            placeholder="Street, suburb, city"
            multiline
            hint="Pasting the full address from Google Maps works fine — your manager can clean it up later."
          />
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
