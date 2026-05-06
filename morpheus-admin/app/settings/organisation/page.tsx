"use client";

/**
 * /settings/organisation — set the org name + logo. The logo is uploaded
 * to the public `org_assets` Storage bucket; we save its public URL in
 * app_settings.organisation_logo_url and the Sidebar reads that on
 * mount to brand the admin console.
 */

import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getOrganisationName,
  setOrganisationName,
  getOrganisationLogoUrl,
  setOrganisationLogoUrl,
  uploadOrgLogo,
} from "@/lib/settings-store";

export default function OrganisationSettingsPage() {
  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([getOrganisationName(), getOrganisationLogoUrl()]).then(([n, u]) => {
      setName(n);
      setLogoUrl(u);
      setLoaded(true);
    });
  }, []);

  const onSaveName = async () => {
    setError(null);
    setMessage(null);
    setSaving(true);
    const r = await setOrganisationName(name);
    setSaving(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
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

  return (
    <SettingsShell
      section="organisation"
      description="Your organisation's name and logo. The logo shows in the sidebar of the admin console for everyone in your team."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        {/* Name */}
        <Card padding={20}>
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
            Organisation name
          </div>
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
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            Shown next to the logo in the admin sidebar.
          </div>
        </Card>

        {/* Logo */}
        <Card padding={20}>
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
            Logo
          </div>
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
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.mute,
                  marginTop: 8,
                  lineHeight: 1.45,
                }}
              >
                PNG, JPG, SVG, or WebP, up to 2&nbsp;MB. Square or wide marks both
                work — the sidebar shows it at 28px high.
              </div>
            </div>
          </div>
        </Card>

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
    </SettingsShell>
  );
}
