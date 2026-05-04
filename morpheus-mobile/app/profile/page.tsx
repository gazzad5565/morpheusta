"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { getUser, signOut } from "@/lib/auth";
import { getMyProfile, updateMyName, type Profile } from "@/lib/profiles-store";

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);

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
          <div
            style={{
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
            }}
          >
            {initials}
          </div>
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
          {[
            { label: "Account settings", icon: "info" as const },
            { label: "Notifications", icon: "warn" as const },
            { label: "Sync status", icon: "refresh" as const },
            { label: "About", icon: "book" as const },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderBottom: i < arr.length - 1 ? `1px solid ${MC.line}` : "none",
              }}
            >
              <Glyph name={row.icon} size={18} color={MC.mute} />
              <div
                style={{
                  flex: 1,
                  fontFamily: MC.font,
                  fontSize: 14.5,
                  fontWeight: 500,
                  color: MC.ink,
                }}
              >
                {row.label}
              </div>
              <Glyph name="chev-r" size={16} color={MC.hint} />
            </div>
          ))}
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
    </div>
  );
}
