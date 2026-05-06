"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { NAV_ITEMS } from "@/lib/mock-data";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { getUser, signOut } from "@/lib/auth";
import {
  getOrganisationName,
  getOrganisationLogoUrl,
} from "@/lib/settings-store";

function nameFromEmail(email: string | null | undefined): { name: string; initials: string } {
  if (!email) return { name: "", initials: "··" };
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const name = parts.length
    ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
    : email;
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : (local.slice(0, 2) || "??").toUpperCase();
  return { name, initials };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");
  // Org branding (set under /settings/organisation). Empty strings →
  // fall back to the built-in MORPHEUS / Field Operations Suite block.
  const [orgName, setOrgName] = useState<string>("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    getUser().then((u) => {
      if (!cancelled) setUserEmail(u?.email || "");
    });
    Promise.all([getOrganisationName(), getOrganisationLogoUrl()]).then(([n, u]) => {
      if (cancelled) return;
      setOrgName(n);
      setOrgLogoUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { name: userName, initials: userInitials } = nameFromEmail(userEmail);
  const userRole = userEmail ? "Field Ops Manager" : "";
  const handleLogout = () => {
    // Fire-and-forget so a slow network can't trap the user. Wipe any
    // cached Supabase tokens and hard-reload to /login as a safety net.
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
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    } else {
      router.replace("/login");
    }
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div
      style={{
        width: AC.sideW,
        flexShrink: 0,
        background: AC.side,
        color: AC.sideInk,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid #1B2027`,
      }}
    >
      {/* Brand — org logo + name if set, else default Morpheus mark. */}
      <div
        style={{
          padding: "16px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {orgLogoUrl ? (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={orgLogoUrl}
              alt={orgName || "Organisation logo"}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: AC.brand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 12, height: 12, background: AC.side, borderRadius: 3 }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={orgName || "MORPHEUS"}
          >
            {orgName ? orgName.toUpperCase() : "MORPHEUS"}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10,
              color: AC.sideMute,
              letterSpacing: 0.4,
              marginTop: 2,
            }}
          >
            {orgName ? "Powered by Morpheus" : "Field Operations Suite"}
          </div>
        </div>
      </div>

      {/* Module switcher */}
      <div style={{ padding: "0 12px 10px", borderBottom: `1px solid #1B2027` }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 9.5,
            color: "#5C6571",
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "6px 4px 6px",
          }}
        >
          Module
        </div>
        <button
          type="button"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 10px",
            borderRadius: 8,
            background: AC.brandDeep,
            border: "none",
            cursor: "pointer",
            color: "#fff",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="clock" size={13} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: -0.1,
                lineHeight: 1.1,
              }}
            >
              Time &amp; Attendance
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 10,
                opacity: 0.8,
                marginTop: 1,
              }}
            >
              Active
            </div>
          </div>
          <AGlyph name="chev-d" size={13} color="#fff" />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
          <ModulePeek glyph="building" label="Sales Orders" hint="Q3" />
          <ModulePeek glyph="audit" label="Auditing" hint="Q4" />
        </div>
      </div>

      {/* Org name + logo are shown in the brand block above. The
          previous "Org switcher" pill below the module switcher used
          mock ORG data + we don't have multi-org tenancy yet, so it's
          gone. If we add tenancy later, drop a real switcher here. */}

      {/* Nav */}
      <div style={{ padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            href={item.href}
            label={item.label}
            glyph={item.glyph as GlyphName}
            active={isActive(item.href)}
            comingSoon={"comingSoon" in item ? item.comingSoon : false}
          />
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* User card */}
      <div
        style={{
          margin: 12,
          padding: "10px 12px",
          background: "#171B22",
          border: "1px solid #232932",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 99,
            background: AC.brandDeep,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {userInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 600,
              color: AC.sideInk,
              letterSpacing: -0.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={userEmail}
          >
            {userName}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.sideMute,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {userRole}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <AGlyph name="logout" size={14} color={AC.sideMute} />
        </button>
      </div>
    </div>
  );
}

function ModulePeek({ glyph, label, hint }: { glyph: GlyphName; label: string; hint: string }) {
  return (
    <button
      type="button"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 10px",
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "#5C6571",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: "#171B22",
          border: "1px solid #232932",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name={glyph} size={12} color="#5C6571" />
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 9.5,
          color: "#5C6571",
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          padding: "1px 5px",
          border: "1px solid #232932",
          borderRadius: 4,
        }}
      >
        {hint}
      </div>
    </button>
  );
}

function NavItem({
  href,
  label,
  glyph,
  active,
  comingSoon = false,
}: {
  href: string;
  label: string;
  glyph: GlyphName;
  active: boolean;
  comingSoon?: boolean;
}) {
  // Coming-soon items render as a non-clickable greyed row with a SOON
  // pill so the user knows the feature exists but isn't ready yet.
  if (comingSoon) {
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "8px 12px",
          borderRadius: 8,
          color: "#5C6571",
          opacity: 0.75,
          cursor: "not-allowed",
        }}
        title={`${label} — coming soon`}
      >
        <AGlyph name={glyph} size={17} color="#5C6571" />
        <span
          style={{
            flex: 1,
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.1,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: AC.font,
            fontSize: 9.5,
            color: "#5C6571",
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "1px 5px",
            border: "1px solid #232932",
            borderRadius: 4,
          }}
        >
          Soon
        </span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "8px 12px",
        borderRadius: 8,
        background: active ? "#1B2027" : "transparent",
        textDecoration: "none",
        textAlign: "left",
        color: active ? "#fff" : AC.sideMute,
        position: "relative",
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: -8,
            top: 8,
            bottom: 8,
            width: 3,
            background: AC.brand,
            borderRadius: 99,
          }}
        />
      )}
      <AGlyph name={glyph} size={17} color={active ? AC.brand : AC.sideMute} />
      <span
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </span>
    </Link>
  );
}
