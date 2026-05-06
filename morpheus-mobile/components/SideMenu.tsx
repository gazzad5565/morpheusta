"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { Glyph, MorpheusMark, type GlyphName } from "./Glyph";
import { useMenu } from "./MenuShell";
import { signOut } from "@/lib/auth";
import { getMyProfile, type Profile } from "@/lib/profiles-store";

function deriveInitials(name: string | null, email: string): string {
  const src = (name?.trim() || email.split("@")[0] || "?").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "??").toUpperCase();
}

interface Item {
  id: string;
  label: string;
  icon: GlyphName;
  color: string;
  href: string;
}

const ITEMS: Item[] = [
  { id: "shifts",    label: "Today",          icon: "clock", color: MC.brand,  href: "/" },
  { id: "addshift",  label: "Request shift",  icon: "pin",   color: MC.brand,  href: "/add-shift" },
  { id: "library",   label: "Library",        icon: "book",  color: "#5b3da5", href: "/library" },
  { id: "support",   label: "Support",        icon: "mic",   color: "#9c4a2c", href: "/support" },
  { id: "profile",   label: "Profile",        icon: "leave", color: MC.mute,   href: "/profile" },
  { id: "logout",    label: "Log out",        icon: "leave", color: MC.danger, href: "/login" },
];

const SHIFTS_PATHS = ["/", "/shifts", "/check-in", "/active", "/check-out", "/summary"];

function isShiftsCurrent(pathname: string): boolean {
  return SHIFTS_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

export function SideMenu() {
  const { open, setOpen } = useMenu();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    close();
    // Fire-and-forget so a stalled network call can't strand the rep
    // half-logged-out. Wipe Supabase tokens locally as a belt-and-
    // braces, then force a hard reload to /login.
    try {
      void signOut().catch(() => {});
    } catch {
      /* noop */
    }
    try {
      if (typeof window !== "undefined") {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("auth-token"))) {
            window.localStorage.removeItem(k);
          }
        }
      }
    } catch {
      /* noop */
    }
    window.location.href = "/login";
  };

  return (
    <div
      className="mc-menu-overlay"
      onClick={close}
      style={{
        background: "rgba(10,15,30,.45)",
        animation: "mc-fadein .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: MC.card,
          height: "100%",
          width: "78%",
          maxWidth: 320,
          boxShadow: "8px 0 30px rgba(0,0,0,.2)",
          display: "flex",
          flexDirection: "column",
          animation: "mc-slidein .25s ease",
        }}
      >
        {/* Header */}
        <div style={{ background: MC.header, padding: "54px 20px 18px", color: "#fff" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <MorpheusMark inverted size={13} />
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                background: "rgba(255,255,255,.08)",
              }}
            >
              <Glyph name="close" size={18} color="#fff" />
            </button>
          </div>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: MC.brand,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MC.font,
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 0.5,
              }}
            >
              {profile ? deriveInitials(profile.name, profile.email) : "··"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 15,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profile?.name?.trim() ||
                  profile?.email?.split("@")[0] ||
                  "Loading…"}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,.55)",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profile?.email || ""}
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div
          style={{
            flex: 1,
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {ITEMS.map((it) => {
            const isCurrent =
              it.id === "shifts" ? isShiftsCurrent(pathname) : pathname.startsWith(it.href);
            return (
              <Link
                key={it.id}
                href={it.href}
                onClick={it.id === "logout" ? handleLogout : close}
                style={{
                  background: isCurrent ? MC.brandTint : "transparent",
                  borderRadius: 12,
                  padding: "12px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: isCurrent ? "#fff" : MC.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Glyph name={it.icon} size={18} color={it.color} />
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 14.5,
                    fontWeight: isCurrent ? 700 : 500,
                    color: it.id === "logout" ? MC.danger : MC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {it.label}
                </div>
                {isCurrent && (
                  <div
                    style={{
                      marginLeft: "auto",
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: MC.brand,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 16px 20px",
            fontFamily: MC.font,
            fontSize: 11,
            color: MC.hint,
            textAlign: "center",
            borderTop: `1px solid ${MC.line}`,
          }}
        >
          Powered by Morpheus
        </div>
      </div>
    </div>
  );
}
