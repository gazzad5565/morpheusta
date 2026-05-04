"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { getUser, signOut } from "@/lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    getUser().then((u) => {
      if (!cancelled) setEmail(u?.email || "");
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

  // Take initials from the email's local part (chars before @) for the avatar
  const initials = email
    ? email
        .split("@")[0]
        .split(/[._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join("") || email[0].toUpperCase()
    : "—";

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
            <div
              style={{
                fontFamily: MC.fontDisplay,
                fontSize: 17,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.3,
              }}
            >
              {email || "Loading…"}
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 12.5, color: MC.mute, marginTop: 2 }}>
              Logged in
            </div>
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
