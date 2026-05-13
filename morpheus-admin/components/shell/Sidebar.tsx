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
import { listPendingRequests, subscribeRequests } from "@/lib/requests-store";
import { listOpenAttentionShifts, subscribeShifts } from "@/lib/shifts-store";
import { nameFromEmail, initialsFromNameOrEmail } from "@/lib/format";

function userDisplayBits(email: string | null | undefined): { name: string; initials: string } {
  return {
    name: nameFromEmail(email),
    initials: initialsFromNameOrEmail(null, email) || "··",
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");
  // Org branding (set under /settings/organisation). Empty strings →
  // fall back to the built-in MORPHEUS / Field Operations Suite block.
  const [orgName, setOrgName] = useState<string>("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>("");
  // Two queues both feed the Live Ops "Needs action" badge:
  //   - Pending rep-requests for NEW shifts (requested_shifts table)
  //   - Open unable-to-attend overlays on EXISTING shifts (shifts.attention)
  // The badge sums them — one number tells the manager exactly how
  // many things still want their attention. Kept live across every
  // page so they see it no matter where they are.
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [attentionCount, setAttentionCount] = useState<number>(0);
  const needsActionCount = pendingCount + attentionCount;
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

  // Pending requests — defence in depth so the sidebar badge can't
  // silently drift to a stale count.
  //   - initial fetch on mount
  //   - realtime sub for live updates (best case, sub-second)
  //   - visibilitychange refetch (covers backgrounded tabs / sleeping
  //     phones where the websocket gets killed)
  //   - 60-second poll (ultimate safety net for the case where
  //     realtime silently drops without firing onError)
  // The sidebar lives at layout level so this runs across every page.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await listPendingRequests();
      if (!cancelled) setPendingCount(rows.length);
    };
    refresh();
    const unsub = subscribeRequests(refresh);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, []);

  // Attention overlay — same defence-in-depth: initial fetch +
  // realtime shifts subscription + visibility refetch + 60s poll.
  // Drives the sidebar badge in lockstep with pendingCount so a
  // rep flagging "I can't make it" lights up Live Ops everywhere.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await listOpenAttentionShifts();
      if (!cancelled) setAttentionCount(rows.length);
    };
    refresh();
    const unsub = subscribeShifts(refresh);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, []);

  // Also refetch on every pathname change — covers the timing window
  // where a request lands while a fresh realtime channel hasn't quite
  // connected, or when the websocket dropped between page nav.
  useEffect(() => {
    listPendingRequests().then((rows) => setPendingCount(rows.length));
    listOpenAttentionShifts().then((rows) => setAttentionCount(rows.length));
  }, [pathname]);

  // Browser tab title alert — prepend "(N) " when something needs
  // attention so the manager notices on a different tab/window.
  // Reverts to the original title when count hits zero.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.title.replace(/^\(\d+\)\s+/, "");
    document.title =
      needsActionCount > 0 ? `(${needsActionCount}) ${original}` : original;
    return () => {
      document.title = original;
    };
  }, [needsActionCount]);
  const { name: userName, initials: userInitials } = userDisplayBits(userEmail);
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
          {/* Subtitle: only show the platform tagline when there's NO
              org name (i.e. brand-new install). Once an org name is
              set the "Powered by Morpheus" attribution lives in the
              footer pill at the bottom of the sidebar — no need to
              double up. */}
          {!orgName && (
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 10,
                color: AC.sideMute,
                letterSpacing: 0.4,
                marginTop: 2,
              }}
            >
              Field Operations Suite
            </div>
          )}
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
        {NAV_ITEMS.map((item) => {
          // Live Ops gets a flashing red badge when there are pending
          // rep requests — the dashboard's Live Feed is where you go
          // to deal with them, so this tells the manager "you have
          // something to handle" from anywhere in the admin.
          //
          // When the badge is HOT (needsActionCount > 0), clicking
          // Live Ops deep-links into the Needs Action tab of the Live
          // Feed panel (the #live-feed-needs-action anchor) so the
          // manager lands directly on the queue they need to clear,
          // not the all-activity feed. When the badge is cold, plain
          // /. Per product (May 13).
          const href =
            item.id === "ops" && needsActionCount > 0
              ? "/#live-feed-needs-action"
              : item.href;
          return (
            <NavItem
              key={item.id}
              href={href}
              label={item.label}
              glyph={item.glyph as GlyphName}
              active={isActive(item.href)}
              comingSoon={"comingSoon" in item ? item.comingSoon : false}
              badgeCount={item.id === "ops" ? needsActionCount : 0}
            />
          );
        })}
      </div>
      {/* Pulse animation for the nav badge — kept here so the keyframe
          is mounted alongside the nav and torn down when the sidebar is. */}
      <style>{`
        @keyframes sb-pulse-kf {
          0%   { box-shadow: 0 0 0 0   rgba(190, 24, 60, 0.55); }
          70%  { box-shadow: 0 0 0 6px rgba(190, 24, 60, 0);    }
          100% { box-shadow: 0 0 0 0   rgba(190, 24, 60, 0);    }
        }
        .sb-pulse { animation: sb-pulse-kf 1.4s ease-out infinite; }
      `}</style>

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

      {/* "Powered by Morpheus TA" — small CTA at the very bottom of the
          sidebar so even white-labelled customers see the platform mark
          subtly. The 'TA' is the Time & Attendance module — distinct
          from the broader Morpheus platform — and gets a brand-tinted
          pill so it pops without shouting. */}
      <a
        href="https://morpheus.app"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          margin: "0 12px 12px",
          padding: "8px 10px",
          borderRadius: 8,
          background: "transparent",
          border: "1px solid #1B2027",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontFamily: AC.font,
          fontSize: 10.5,
          color: "#5C6571",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
        title="Morpheus — Field Operations Suite"
      >
        Powered by{" "}
        <span
          style={{
            color: AC.brand,
            fontWeight: 800,
            letterSpacing: 0.6,
          }}
        >
          Morpheus
        </span>
        <span
          style={{
            padding: "1px 5px",
            borderRadius: 4,
            background: "rgba(36, 173, 217, 0.18)",
            color: AC.brand,
            fontWeight: 800,
            letterSpacing: 0.6,
            fontSize: 9.5,
          }}
        >
          TA
        </span>
      </a>
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
  badgeCount = 0,
}: {
  href: string;
  label: string;
  glyph: GlyphName;
  active: boolean;
  comingSoon?: boolean;
  /** When > 0 a flashing red pill renders on the right of the row. */
  badgeCount?: number;
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
          flex: 1,
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </span>
      {badgeCount > 0 && (
        <span
          className="sb-pulse"
          title={`${badgeCount} item${badgeCount === 1 ? "" : "s"} need${badgeCount === 1 ? "s" : ""} action`}
          style={{
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 700,
            color: "#fff",
            background: AC.danger,
            padding: "1px 7px",
            borderRadius: 99,
            lineHeight: 1.4,
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}
