"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { getUser, signOut } from "@/lib/auth";
import {
  getMyProfile,
  updateMyName,
  updateMyEmail,
  updateMyPassword,
  updateMyAvatar,
  compressAvatar,
  type Profile,
} from "@/lib/profiles-store";

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Avatar upload state — `uploading` for in-flight, `avatarError` for
  // user-visible failure copy. The hidden <input type="file"> is kept
  // as a ref so the visible avatar pill triggers it via .click().
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Edit Account sheet — bottom-sheet modal for editing name + email
  // + password in one place. Mirrors admin /settings/managers/[id]/edit
  // so a manager + rep see the same field set from their respective
  // sides. Reads from the profile state on open and writes back when
  // save succeeds.
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUser(), getMyProfile()]).then(([u, p]) => {
      if (cancelled) return;
      setEmail(u?.email || "");
      setProfile(p);
      setNameDraft(p?.name || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLogout = async () => {
    await signOut();
    // Hard navigation guarantees AuthGate sees a fresh empty session.
    window.location.href = "/login";
  };

  const onSaveName = async () => {
    setSaving(true);
    const result = await updateMyName(nameDraft);
    setSaving(false);
    if (result.ok) {
      setProfile((p) => (p ? { ...p, name: nameDraft.trim() || null } : p));
      setEditingName(false);
    } else {
      alert(`Couldn't save: ${result.error}`);
    }
  };

  const onPickAvatar = () => {
    setAvatarError(null);
    fileInputRef.current?.click();
  };

  const onAvatarFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the SAME file can be re-picked later (browser
    // dedupes change events on identical values otherwise).
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setAvatarError(null);
    const compressed = await compressAvatar(file);
    if (!compressed.ok) {
      setUploading(false);
      setAvatarError(compressed.error);
      return;
    }
    const result = await updateMyAvatar(compressed.dataUrl);
    setUploading(false);
    if (!result.ok) {
      setAvatarError(result.error || "Couldn't save the photo.");
      return;
    }
    setProfile((p) => (p ? { ...p, avatar_url: compressed.dataUrl } : p));
  };

  const onRemoveAvatar = async () => {
    if (!confirm("Remove your profile photo?")) return;
    setUploading(true);
    const result = await updateMyAvatar(null);
    setUploading(false);
    if (!result.ok) {
      setAvatarError(result.error || "Couldn't remove the photo.");
      return;
    }
    setProfile((p) => (p ? { ...p, avatar_url: null } : p));
  };

  const display =
    profile?.name?.trim() || (email ? email.split("@")[0] : "—");

  // Avatar initials prefer name (first letters of words), fall back to email
  const initials = (() => {
    if (profile?.name?.trim()) {
      const words = profile.name.trim().split(/\s+/).filter(Boolean);
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      return words[0].slice(0, 2).toUpperCase();
    }
    if (!email) return "—";
    return email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || email[0].toUpperCase();
  })();

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Profile" onBack={() => router.push("/")} withMenu />

      <div style={{ padding: "24px 16px 0" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          {/* Avatar — tappable. Shows the rep's uploaded photo when
              present, falls back to coloured initials. Tap opens the
              system file picker; on selection we compress to a small
              JPEG and save to profiles.avatar_url. The photo is also
              what shows up on the admin rep list + live-ops map
              marker, so the rep's choice here is the single source. */}
          <button
            type="button"
            onClick={onPickAvatar}
            disabled={uploading}
            aria-label={profile?.avatar_url ? "Change profile photo" : "Add a profile photo"}
            style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: MC.brand,
              color: "#fff",
              fontFamily: MC.font,
              fontSize: 18,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0.5,
              border: "none",
              cursor: uploading ? "wait" : "pointer",
              padding: 0,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt="Profile photo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <span>{initials}</span>
            )}
            {/* Tiny camera badge in the corner so the affordance reads
                as "tap to change photo" rather than as a static avatar.
                Always visible, even before any photo is uploaded. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 22,
                height: 22,
                borderRadius: 99,
                background: "#fff",
                color: MC.brandDeep,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 4px rgba(10,15,30,.18)",
              }}
            >
              <Glyph name="camera" size={12} color={MC.brandDeep} strokeWidth={2.2} />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            // `capture` lets mobile browsers offer "take a photo" alongside
            // "pick from library". Leaving it broad ("environment" would
            // force the back camera) so reps can take a selfie or pick.
            capture="user"
            onChange={onAvatarFileChosen}
            style={{ display: "none" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  style={{
                    width: "100%",
                    fontFamily: MC.fontDisplay,
                    fontSize: 17,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.3,
                    background: MC.bg,
                    border: `1px solid ${MC.line}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={onSaveName}
                    disabled={saving}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 7,
                      background: MC.brand,
                      color: "#fff",
                      border: "none",
                      cursor: saving ? "not-allowed" : "pointer",
                      fontFamily: MC.font,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(profile?.name || "");
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 7,
                      background: "transparent",
                      color: MC.mute,
                      border: `1px solid ${MC.line}`,
                      cursor: "pointer",
                      fontFamily: MC.font,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontFamily: MC.fontDisplay,
                    fontSize: 17,
                    fontWeight: 700,
                    color: MC.ink,
                    letterSpacing: -0.3,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {display}
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    aria-label="Edit name"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Glyph name="info" size={13} color={MC.hint} />
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    color: MC.mute,
                    marginTop: 2,
                  }}
                >
                  {email}
                </div>
                {/* Small avatar status / actions row under the email.
                    Tells the rep what the avatar tap will do, surfaces
                    upload errors inline, and gives a one-tap remove
                    when a photo is already set. */}
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: MC.font,
                    fontSize: 11.5,
                    color: avatarError ? MC.danger : MC.hint,
                  }}
                >
                  {uploading ? (
                    <span>Saving photo…</span>
                  ) : avatarError ? (
                    <span>{avatarError}</span>
                  ) : profile?.avatar_url ? (
                    <>
                      <span>Tap photo to change</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <button
                        type="button"
                        onClick={onRemoveAvatar}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          fontFamily: MC.font,
                          fontSize: 11.5,
                          color: MC.brandDeep,
                          fontWeight: 600,
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span>Tap the avatar to add a photo</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            overflow: "hidden",
          }}
        >
          {/* The three dead rows that used to live here (Notifications,
              Sync status, About) had no handlers and routed nowhere —
              removing them was simpler than building placeholder
              screens. The remaining Account settings row now opens a
              real edit sheet for name / email / password. */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <Glyph name="info" size={18} color={MC.mute} />
            <div
              style={{
                flex: 1,
                fontFamily: MC.font,
                fontSize: 14.5,
                fontWeight: 500,
                color: MC.ink,
              }}
            >
              Account settings
            </div>
            <Glyph name="chev-r" size={16} color={MC.hint} />
          </button>
        </div>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <button
          type="button"
          onClick={onLogout}
          style={{
            display: "block",
            width: "100%",
            background: MC.dangerTint,
            color: "#9c1a3c",
            border: "none",
            padding: "14px 16px",
            borderRadius: 12,
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            letterSpacing: -0.1,
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>

      <AppFooter />

      {editOpen && profile && (
        <EditAccountSheet
          currentName={profile.name ?? ""}
          currentEmail={profile.email}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => {
            setProfile((p) =>
              p
                ? {
                    ...p,
                    name: patch.name ?? p.name,
                    // Email is updated lazily via Supabase confirmation,
                    // so we only optimistically reflect the change if
                    // the new value matches what the user typed and the
                    // confirmation copy will guide them through the rest.
                    email: patch.email ?? p.email,
                  }
                : p
            );
            if (patch.email) setEmail(patch.email);
          }}
        />
      )}
    </div>
  );
}

/**
 * EditAccountSheet — bottom-aligned modal for editing the rep's own
 * name, email, and password. Mirrors the admin /settings/managers/[id]
 * /edit field set so what a manager can see, the rep can also self-
 * service from the app.
 *
 *   - Name change is instant (writes profiles.name + admin sees it
 *     immediately).
 *   - Email change goes through Supabase Auth + confirmation email.
 *     We surface a one-line "check your email to confirm" notice when
 *     the call succeeds.
 *   - Password change is instant (Supabase Auth handles it via the
 *     existing session; no old-password challenge required because
 *     possessing the session IS the proof of identity).
 *
 * Save is per-section: each save button only writes what its section
 * changed, so a flaky email field doesn't block a working name fix.
 */
function EditAccountSheet({
  currentName,
  currentEmail,
  onClose,
  onSaved,
}: {
  currentName: string;
  currentEmail: string;
  onClose: () => void;
  onSaved: (patch: { name?: string; email?: string }) => void;
}) {
  const [name, setName] = useState(currentName);
  const [email, setEmailField] = useState(currentEmail);
  const [pw, setPw] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorBy, setErrorBy] = useState<Record<string, string | null>>({});
  const [okBy, setOkBy] = useState<Record<string, string | null>>({});

  const saveName = async () => {
    setErrorBy((e) => ({ ...e, name: null }));
    setOkBy((o) => ({ ...o, name: null }));
    if (name.trim() === currentName.trim()) {
      setErrorBy((e) => ({ ...e, name: "Nothing to update — name unchanged." }));
      return;
    }
    setSavingKey("name");
    const r = await updateMyName(name);
    setSavingKey(null);
    if (!r.ok) {
      setErrorBy((e) => ({ ...e, name: r.error || "Couldn't save." }));
      return;
    }
    setOkBy((o) => ({ ...o, name: "Saved." }));
    onSaved({ name: name.trim() || undefined });
  };

  const saveEmail = async () => {
    setErrorBy((e) => ({ ...e, email: null }));
    setOkBy((o) => ({ ...o, email: null }));
    setSavingKey("email");
    const r = await updateMyEmail(email);
    setSavingKey(null);
    if (!r.ok) {
      setErrorBy((e) => ({ ...e, email: r.error || "Couldn't save." }));
      return;
    }
    setOkBy((o) => ({
      ...o,
      email: r.confirmationRequired
        ? `Confirmation sent to ${email.trim()} — click the link in that email to finish the change.`
        : "Saved.",
    }));
    onSaved({ email: email.trim() });
  };

  const savePassword = async () => {
    setErrorBy((e) => ({ ...e, pw: null }));
    setOkBy((o) => ({ ...o, pw: null }));
    setSavingKey("pw");
    const r = await updateMyPassword(pw);
    setSavingKey(null);
    if (!r.ok) {
      setErrorBy((e) => ({ ...e, pw: r.error || "Couldn't save." }));
      return;
    }
    setOkBy((o) => ({ ...o, pw: "Password updated." }));
    setPw("");
  };

  // Lock body scroll while the sheet is open — desktop-class fix so
  // a wheel scroll inside the sheet doesn't bleed into the page.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,.45)",
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-label="Edit account"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fff",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: "16px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)",
          zIndex: 201,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 -8px 32px rgba(10,15,30,.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              fontFamily: MC.fontDisplay,
              fontSize: 18,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.3,
            }}
          >
            Account settings
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "none",
              background: MC.bg,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="close" size={14} color={MC.mute} />
          </button>
        </div>

        <SheetSection
          label="Full name"
          hint="Shown on the admin console and in shift activity logs."
          inputType="text"
          value={name}
          onChange={setName}
          onSave={saveName}
          saving={savingKey === "name"}
          error={errorBy.name}
          ok={okBy.name}
          saveLabel="Save name"
        />

        <SheetSection
          label="Email address"
          hint="You'll get a confirmation email at the new address before the change takes effect."
          inputType="email"
          value={email}
          onChange={setEmailField}
          onSave={saveEmail}
          saving={savingKey === "email"}
          error={errorBy.email}
          ok={okBy.email}
          saveLabel="Update email"
        />

        <SheetSection
          label="New password"
          hint="At least 6 characters. Replaces your current password instantly — no old-password check, your active session is the proof."
          inputType="password"
          value={pw}
          onChange={setPw}
          onSave={savePassword}
          saving={savingKey === "pw"}
          error={errorBy.pw}
          ok={okBy.pw}
          saveLabel="Set new password"
          placeholder="Type a new password"
        />
      </div>
    </>
  );
}

function SheetSection({
  label,
  hint,
  inputType,
  value,
  onChange,
  onSave,
  saving,
  error,
  ok,
  saveLabel,
  placeholder,
}: {
  label: string;
  hint: string;
  inputType: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null | undefined;
  ok: string | null | undefined;
  saveLabel: string;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 0",
        borderTop: `1px solid ${MC.line}`,
      }}
    >
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 11,
          color: MC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={
          inputType === "password" ? "new-password" : inputType === "email" ? "email" : "name"
        }
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${MC.line}`,
          background: "#FBFBFC",
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.ink,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 11.5,
          color: error ? MC.danger : ok ? "#0d6a45" : MC.hint,
          marginTop: 6,
          lineHeight: 1.4,
          minHeight: 16,
        }}
      >
        {error || ok || hint}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        style={{
          marginTop: 8,
          padding: "8px 14px",
          borderRadius: 8,
          background: saving ? MC.line : MC.brand,
          color: "#fff",
          border: "none",
          cursor: saving ? "wait" : "pointer",
          fontFamily: MC.font,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
