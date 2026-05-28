"use client";

/**
 * /settings/organisation — set up the company using the app.
 *
 * Built around app_settings key/value rows so each field upserts
 * independently:
 *   organisation_name                  — sidebar brand text
 *   organisation_logo_url              — sidebar logo (Storage URL)
 *   organisation_address               — free-text postal address
 *   organisation_address_lat / _lng    — coords from the autocomplete
 *   organisation_phone, _email         — contact
 *   organisation_tax_number            — VAT / EIN / TRN
 *   organisation_website               — URL
 *   organisation_registration_number   — company / charity number
 *
 * Plus a <CustomFieldsCard /> at the bottom so the manager can add any
 * org-specific fields they need (industry, ABN, working hours, etc.) —
 * defined in /settings/fields/new with applies_to="organisation".
 */

import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { StringListEditor } from "@/components/users/StringListEditor";
import {
  getRegions,
  setRegions,
  getGroups,
  setGroups,
} from "@/lib/settings-store";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { CustomerAddressMap } from "@/components/CustomerAddressMap";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import { ORGANISATION_ENTITY_ID } from "@/lib/custom-fields-store";
import { AC } from "@/lib/tokens";
import {
  getOrganisationName,
  setOrganisationName,
  getOrganisationLogoUrl,
  setOrganisationLogoUrl,
  getOrganisationNameColor,
  setOrganisationNameColor,
  uploadOrgLogo,
  getOrganisationDetails,
  setOrganisationAddress,
  setOrganisationAddressCoords,
  setOrganisationPhone,
  setOrganisationEmail,
  setOrganisationTaxNumber,
  setOrganisationWebsite,
  setOrganisationRegistrationNumber,
} from "@/lib/settings-store";

export default function OrganisationSettingsPage() {
  // Tab state (May 28 later — Gary: convert Organisation to tabs).
  // Three tabs: Details (the existing org-branding form), Customer
  // regions (vocab editor), Customer groups (vocab editor). State
  // is local — not persisted to URL — since the typical flow is
  // "open the section, edit one thing, leave." Bookmarkable tabs
  // can come later if managers ask.
  const [tab, setTab] = useState<"details" | "regions" | "groups">("details");
  // Vocab state for the two new tabs. null = loading; the
  // StringListEditor needs a non-null array so we wait.
  const [regions, setRegionsState] = useState<string[] | null>(null);
  const [groups, setGroupsState] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRegions(), getGroups()]).then(([r, g]) => {
      if (cancelled) return;
      setRegionsState(r);
      setGroupsState(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  // Org-name accent colour (hex string). Empty = inherit default.
  // The colour picker writes here on change; an explicit Save below
  // persists to app_settings + bumps the org-change event so the
  // sidebar repaints without a reload.
  const [nameColor, setNameColor] = useState<string>("");

  // Contact / company details — saved together when the user clicks
  // "Save details", so partial typing doesn't generate one toast per
  // field. Address coords come from the autocomplete picker (preferred)
  // or fall back to a server-side /api/geocode call on save.
  const [address, setAddress] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [taxNumber, setTaxNumber] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [registrationNumber, setRegistrationNumber] = useState<string>("");
  // Coords: `coords` is the saved/last-known location (drives the map).
  // `pickedCoords` is what the user just selected from the autocomplete
  // dropdown but hasn't saved yet. On save, picked wins; otherwise we
  // try to geocode the typed address fresh.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [pickedCoords, setPickedCoords] = useState<
    { lat: number; lng: number } | null
  >(null);

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([
      getOrganisationName(),
      getOrganisationLogoUrl(),
      getOrganisationDetails(),
      getOrganisationNameColor(),
    ]).then(([n, u, d, c]) => {
      setName(n);
      setLogoUrl(u);
      setAddress(d.address);
      setPhone(d.phone);
      setEmail(d.email);
      setTaxNumber(d.taxNumber);
      setWebsite(d.website);
      setRegistrationNumber(d.registrationNumber);
      setCoords(d.coords);
      setNameColor(c);
      setLoaded(true);
    });
  }, []);

  const onSaveName = async () => {
    setError(null);
    setMessage(null);
    setSaving(true);
    // Save name + accent colour together — same Save button, one
    // toast, no surprises about which control needs its own button.
    const [rName, rColor] = await Promise.all([
      setOrganisationName(name),
      setOrganisationNameColor(nameColor),
    ]);
    setSaving(false);
    if (!rName.ok) {
      setError(rName.error || "Couldn't save the name.");
      return;
    }
    if (!rColor.ok) {
      setError(rColor.error || "Couldn't save the accent colour.");
      return;
    }
    setMessage("Saved.");
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so picking the same file twice still triggers change.
    e.target.value = "";

    setError(null);
    setMessage(null);
    setUploading(true);
    const up = await uploadOrgLogo(file);
    if (!up.ok || !up.url) {
      setUploading(false);
      setError(up.error || "Upload failed.");
      return;
    }
    const persist = await setOrganisationLogoUrl(up.url);
    setUploading(false);
    if (!persist.ok) {
      setError(persist.error || "Uploaded, but couldn't save the URL.");
      return;
    }
    setLogoUrl(up.url);
    setMessage("Logo updated. The sidebar will pick it up on the next page load.");
  };

  const onSaveDetails = async () => {
    setError(null);
    setMessage(null);
    setSavingDetails(true);

    // Resolve coordinates for the address, in priority order:
    //   1. The user explicitly picked a suggestion → use those coords.
    //   2. Address text is unchanged from saved → keep saved coords.
    //   3. Address text changed but no suggestion picked → fall back to
    //      a server-side /api/geocode lookup. If that fails, save the
    //      address but null out the coords so the map disappears
    //      rather than pointing at a stale location.
    let nextCoords: { lat: number; lng: number } | null = coords;
    let coordNote: string | null = null;
    const trimmed = address.trim();

    if (!trimmed) {
      nextCoords = null;
    } else if (pickedCoords) {
      nextCoords = pickedCoords;
    } else if (coords) {
      // Keep existing coords — user didn't change the address.
      nextCoords = coords;
    } else {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = (await res.json()) as { latitude: number; longitude: number };
          nextCoords = { lat: data.latitude, lng: data.longitude };
        } else {
          coordNote = "Couldn't geocode the address — saved without coordinates.";
          nextCoords = null;
        }
      } catch {
        coordNote = "Geocoder unreachable — saved without coordinates.";
        nextCoords = null;
      }
    }

    // Save every field in parallel. They're independent app_settings
    // rows so a failure in one doesn't block the rest, but we surface
    // the first error we see.
    const results = await Promise.all([
      setOrganisationAddress(address),
      setOrganisationAddressCoords(nextCoords),
      setOrganisationPhone(phone),
      setOrganisationEmail(email),
      setOrganisationTaxNumber(taxNumber),
      setOrganisationWebsite(website),
      setOrganisationRegistrationNumber(registrationNumber),
    ]);
    setSavingDetails(false);
    const firstErr = results.find((r) => !r.ok);
    if (firstErr) {
      setError(firstErr.error || "Couldn't save.");
      return;
    }
    setCoords(nextCoords);
    setPickedCoords(null);
    setMessage(coordNote ? `Saved. ${coordNote}` : "Saved.");
  };

  const onClearLogo = async () => {
    if (!confirm("Remove the organisation logo?")) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    const r = await setOrganisationLogoUrl("");
    setSaving(false);
    if (!r.ok) {
      setError(r.error || "Couldn't clear.");
      return;
    }
    setLogoUrl("");
    setMessage("Logo cleared.");
  };

  // Brand color + initials for the map pin so it visually echoes the
  // sidebar logo. Falls back to the AC brand when no logo is set.
  const orgInitials = (name || "Org")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "OR";

  return (
    <SettingsShell
      section="organisation"
      description="Your organisation's name, logo, contact details, customer regions, and customer groups. Used everywhere the system displays your brand and categorises customers."
    >
      {/* Tab bar — Details / Customer regions / Customer groups.
          Same visual shape as the RulesTabBar so the two tabbed
          Settings surfaces feel like siblings (May 28 later, Gary:
          "tabs... so its clear what its for"). */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 18,
          borderBottom: `1px solid ${AC.line}`,
          maxWidth: 760,
        }}
      >
        {[
          { id: "details" as const, label: "Details" },
          { id: "regions" as const, label: "Customer regions" },
          { id: "groups" as const, label: "Customer groups" },
        ].map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px",
                borderBottom: `2px solid ${isActive ? AC.brandDeep : "transparent"}`,
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? AC.brandDeep : "transparent",
                cursor: "pointer",
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? AC.brandInk : AC.mute,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "regions" && (
        <div style={{ maxWidth: 760 }}>
          {regions === null ? (
            <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
              Loading customer regions…
            </div>
          ) : (
            <StringListEditor
              current={regions}
              noun="customer region"
              hint="Geographic regions you assign customers to (e.g. Gauteng, Western Cape, KZN). Drives the Customer region filter on /customers and audience targeting downstream."
              addPlaceholder="e.g. Gauteng, Western Cape, KZN…"
              onSave={setRegions}
              onSaved={(next) => setRegionsState(next)}
            />
          )}
        </div>
      )}

      {tab === "groups" && (
        <div style={{ maxWidth: 760 }}>
          {groups === null ? (
            <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
              Loading customer groups…
            </div>
          ) : (
            <StringListEditor
              current={groups}
              noun="customer group"
              hint="Customer cohorts / segments (e.g. 'Premium', 'Spaza', 'Wholesale'). Drives the Customer group filter on /customers."
              addPlaceholder="e.g. Premium, Spaza, Wholesale…"
              onSave={setGroups}
              onSaved={(next) => setGroupsState(next)}
            />
          )}
        </div>
      )}

      {tab === "details" && (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
        {/* Name */}
        <Card padding={20}>
          <SectionLabel>Organisation name</SectionLabel>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={name}
              disabled={!loaded || saving}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Field Ops"
              style={{
                flex: 1,
                padding: "9px 11px",
                borderRadius: 10,
                border: `1px solid ${AC.line}`,
                background: "#fff",
                fontFamily: AC.font,
                fontSize: 14,
                color: AC.ink,
              }}
            />
            <Btn
              size="sm"
              kind="primary"
              onClick={onSaveName}
              disabled={!loaded || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Btn>
          </div>
          <Hint>Shown next to the logo in the admin sidebar.</Hint>

          {/* Org-name accent colour. Saved together with the name via
              the Save button above — no separate Save here. Three
              controls: a native colour picker (precise), a hex text
              input (paste-friendly), and a small live preview pill
              showing how the name renders with the chosen colour.
              Empty / clearing the value reverts to the default
              sideInk colour. */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${AC.line}`,
            }}
          >
            <SectionLabel>Accent colour</SectionLabel>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                type="color"
                value={nameColor || "#E6E9EE"}
                disabled={!loaded || saving}
                onChange={(e) => setNameColor(e.target.value)}
                aria-label="Pick a colour for the organisation name"
                style={{
                  width: 44,
                  height: 38,
                  padding: 0,
                  border: `1px solid ${AC.line}`,
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={nameColor}
                disabled={!loaded || saving}
                onChange={(e) => setNameColor(e.target.value)}
                placeholder="#15B4D6 (leave blank for default)"
                style={{
                  flex: "1 1 180px",
                  minWidth: 0,
                  padding: "9px 11px",
                  borderRadius: 10,
                  border: `1px solid ${AC.line}`,
                  background: "#fff",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                  color: AC.ink,
                }}
              />
              {nameColor && (
                <button
                  type="button"
                  onClick={() => setNameColor("")}
                  disabled={!loaded || saving}
                  style={{
                    background: "transparent",
                    color: AC.mute,
                    border: `1px solid ${AC.line}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
              {/* Live preview — same styling treatment the sidebar
                  uses (dark background, uppercase wordmark). Reads
                  exactly the colour the picker emits. */}
              <span
                style={{
                  marginLeft: "auto",
                  background: "#0E1116",
                  color: nameColor || "#E6E9EE",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  textShadow: nameColor ? "0 1px 0 rgba(0,0,0,0.35)" : "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 200,
                }}
                title="Sidebar preview"
              >
                {(name || "MORPHEUS").toUpperCase()}
              </span>
            </div>
            <Hint>
              Applied to the wordmark above the nav. Tap Save to apply.
              Leave blank to use the default.
            </Hint>
          </div>
        </Card>

        {/* Address — autocomplete + map preview, mirroring the customer
            address picker so the affordance is consistent across the
            app. Coords get filled in either by picking a suggestion or
            by a fallback geocode on save. */}
        <Card padding={20}>
          <SectionLabel>Address</SectionLabel>
          <AddressAutocomplete
            value={address}
            onChange={(v) => {
              setAddress(v);
              // If the user edits the field after picking, drop the
              // pickedCoords flag — we'll re-geocode on save.
              if (pickedCoords) setPickedCoords(null);
            }}
            onSelect={(s) => {
              setPickedCoords({ lat: s.latitude, lng: s.longitude });
              setCoords({ lat: s.latitude, lng: s.longitude });
            }}
            placeholder="Start typing your office address…"
          />
          <Hint>
            {pickedCoords
              ? `Coordinates locked: ${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`
              : coords
              ? `Saved coordinates: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}. Edit and save to update.`
              : "Pick a match from the dropdown to lock coordinates."}
          </Hint>

          {coords && (
            <div
              style={{
                marginTop: 12,
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${AC.line}`,
              }}
            >
              <CustomerAddressMap
                lat={coords.lat}
                lng={coords.lng}
                radiusM={0}
                color={AC.brand}
                initials={orgInitials}
                showGeofence={false}
                height={240}
              />
            </div>
          )}
        </Card>

        {/* Other contact + company details. KISS: free-text fields,
            single Save covering address + everything else, no validation
            beyond "trim". */}
        <Card padding={20}>
          <SectionLabel>Contact &amp; company details</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <DetailField
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="+27 21 555 0100"
              disabled={!loaded || savingDetails}
            />
            <DetailField
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="ops@your-co.com"
              type="email"
              disabled={!loaded || savingDetails}
            />
            <DetailField
              label="Website"
              value={website}
              onChange={setWebsite}
              placeholder="https://your-co.com"
              type="url"
              disabled={!loaded || savingDetails}
            />
            <DetailField
              label="Tax number"
              value={taxNumber}
              onChange={setTaxNumber}
              placeholder="VAT / EIN / TRN"
              disabled={!loaded || savingDetails}
            />
            <DetailField
              label="Registration number"
              value={registrationNumber}
              onChange={setRegistrationNumber}
              placeholder="Company / charity number"
              span={2}
              disabled={!loaded || savingDetails}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn
              size="sm"
              kind="primary"
              onClick={onSaveDetails}
              disabled={!loaded || savingDetails}
            >
              {savingDetails ? "Saving…" : "Save details"}
            </Btn>
          </div>
          <Hint>
            One Save button covers address + every field above. All fields are optional.
          </Hint>
        </Card>

        {/* Logo */}
        <Card padding={20}>
          <SectionLabel>Logo</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Preview */}
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 12,
                background: "#fff",
                border: `1px dashed ${AC.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                // Plain img — Storage URL is public, no Next/Image config needed.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Organisation logo"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <AGlyph name="building" size={28} color={AC.faint} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn
                  size="sm"
                  kind="primary"
                  icon="upload"
                  onClick={onPickFile}
                  disabled={uploading}
                >
                  {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
                </Btn>
                {logoUrl && (
                  <Btn size="sm" onClick={onClearLogo} disabled={saving || uploading}>
                    Remove
                  </Btn>
                )}
              </div>
              <Hint>
                PNG, JPG, SVG, or WebP, up to 2&nbsp;MB. Square or wide marks both
                work — the sidebar shows it at 28px high.
              </Hint>
            </div>
          </div>
        </Card>

        {/* Custom fields — same component used on every detail page. The
            "organisation" entity type was added in db migration
            2026_05_07_custom_fields_organisation.sql; define new fields
            via /settings/fields/new?entity=organisation and they'll
            render here automatically. */}
        <CustomFieldsCard entity="organisation" entityId={ORGANISATION_ENTITY_ID} />

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
            }}
          >
            <AGlyph name="warn" size={14} color="#9c1a3c" />
            <span>{error}</span>
          </div>
        )}
        {message && !error && (
          <div
            style={{
              padding: "10px 12px",
              background: AC.brandSoft,
              color: AC.brandInk,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {message}
          </div>
        )}
      </div>
      )}
    </SettingsShell>
  );
}

/** Small uppercase eyebrow used at the top of every Card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 11,
        color: AC.mute,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 11.5,
        color: AC.mute,
        marginTop: 8,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Tiny labelled input used by the contact-details card. `span={2}` lets
 * a field stretch the full grid width (used for fields that read more
 * naturally on one line).
 */
function DetailField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  span = 1,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  span?: 1 | 2;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${AC.line}`,
    background: "#fff",
    fontFamily: AC.font,
    fontSize: 13,
    color: AC.ink,
    outline: "none",
  };
  return (
    <div style={{ gridColumn: span === 2 ? "span 2" : "auto" }}>
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
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, resize: "vertical", minHeight: 56 }}
        />
      ) : (
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}
