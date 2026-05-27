"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { Glyph, MorpheusMark, type GlyphName } from "./Glyph";
import { useMenu } from "./MenuShell";
import { signOut } from "@/lib/auth";
import { getMyProfile, type Profile } from "@/lib/profiles-store";
import { initialsFromNameOrEmail } from "@/lib/format";
import { countMyUnread, subscribeMyInbox } from "@/lib/messaging-store";
import {
  getRepTypes,
  repTypeCan,
  type RepTypeConfig,
} from "@/lib/settings-store";

// Local deriveInitials removed — now uses shared initialsFromNameOrEmail.

interface Item {
  id: string;
  label: string;
  icon: GlyphName;
  color: string;
  href: string;
}

const ITEMS: Item[] = [
  { id: "today",     label: "Today",   icon: "clock", color: MC.brand,  href: "/" },
  // Second slot is Shifts (was Request shift). The /shifts page
  // already carries a "Request" pill in its header, so a dedicated
  // menu item for the request flow was redundant — and "view all my
  // shifts" is a far more frequent destination than "request a new
  // customer". Reps reach /add-shift either via that pill or via the
  // home page's Add affordance.
  { id: "shifts",    label: "Shifts",         icon: "log",   color: MC.brand,  href: "/shifts" },
  // /add-customer is mounted in the side menu only — per Gary
  // (May 13). Not surfaced on /add-shift or anywhere else.
  // Reps either need a NEW customer (this flow) or want to schedule
  // against an EXISTING one (/add-shift).
  { id: "add-customer", label: "Add customer", icon: "house", color: "#10897F", href: "/add-customer" },
  // Messaging (May 13) — manager-to-rep messages with optional
  // push delivery. Unread count appears as a brand-tinted badge
  // alongside the label.
  { id: "messages",  label: "Messages",       icon: "send",  color: MC.brand,  href: "/messages" },
  { id: "library",   label: "Library",         icon: "book",  color: "#5b3da5", href: "/library" },
  { id: "support",   label: "Support",         icon: "mic",   color: "#9c4a2c", href: "/support" },
  // "Profile" used to be a row here. Promoted (May 14, Gary) to the
  // header user block at the top of the menu — the avatar + name +
  // email card is now a tappable Link to /profile with a chev-r
  // affordance so reps can see it's interactive.
  //
  // "Log out" used to be a row here too. Demoted (May 14, Gary) to
  // its own destructive button above the Last Sync / Powered By
  // footer, matching how most native apps surface sign-out. The
  // handleLogout handler lives where it always did; only the
  // placement changed.
];
// "Plan my day" intentionally NOT in the side menu — it's surfaced
// where it's actually useful (home Up Next pill + /shifts header
// pill, both gated on the rep having 2+ stops today). Putting it in
// the global menu would add an always-visible item that's a no-op
// for ~60% of the rep's days, and the user explicitly asked to keep
// the menu tight.

// "Today" covers the dashboard plus every page the rep flows through
// during an active shift (check-in, active, check-out) — they all
// roll up to the dashboard conceptually. /summary was removed
// (May 12) since /check-out's wrap-up overlay now ends on the
// "Checked out!" frame and routes straight back to home — no
// intermediate summary page. /shifts is its own destination (the
// list view), so it stays out of this set and gets highlighted
// independently via a startsWith match on its own item.
const TODAY_PATHS = ["/", "/check-in", "/active", "/check-out", "/add-shift"];

function isTodayCurrent(pathname: string): boolean {
  return TODAY_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

export function SideMenu() {
  const { open, setOpen } = useMenu();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  // Rep-type vocabulary — needed for the capability check that gates
  // the Add Customer menu item. Default to an empty list while
  // loading; the check falls through to "allow" so the item shows
  // unless we know the rep's type and that type forbids it.
  const [repTypes, setRepTypes] = useState<RepTypeConfig[]>([]);
  // Unread Messages count for the Messages menu badge. Realtime-
  // subscribed so opening the menu always shows a fresh count, and
  // marking a message read elsewhere bumps the badge down live.
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (!cancelled) setProfile(p);
    });
    getRepTypes().then((t) => {
      if (!cancelled) setRepTypes(t);
    });
    const refreshUnread = () => {
      void countMyUnread().then((n) => {
        if (!cancelled) setUnreadMessages(n);
      });
    };
    refreshUnread();
    const unsub = subscribeMyInbox({ onChange: refreshUnread });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Whether this rep can see the Add Customer menu item. Defaults to
  // true while data is loading so an uncategorised rep doesn't briefly
  // lose the option on first render.
  const canAddCustomers = repTypeCan(
    repTypes,
    profile?.rep_type ?? null,
    "canCreateCustomers"
  );

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
          {/* Header user block is now the tappable entry point to
              /profile (May 14, Gary). The whole row is a Link, with
              an avatar tile + name + email and a small chev-r on the
              right hinting interactivity. The previous separate
              "Profile" item in the nav list below was redundant. */}
          <Link
            href="/profile"
            onClick={close}
            aria-label="Open profile"
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 10px",
              marginInline: -10,
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {profile?.avatar_url ? (
              // Profile photo when uploaded — eslint-disable-next-line
              // gates the <img> rule (we deliberately use a plain
              // <img> here since the data URL is small and varies per
              // rep; next/image's bundled-asset pattern doesn't fit).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  objectFit: "cover",
                  background: MC.brand,
                  flexShrink: 0,
                }}
              />
            ) : (
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
                  flexShrink: 0,
                }}
              >
                {profile ? initialsFromNameOrEmail(profile.name, profile.email) : "··"}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* flex:1 + minWidth:0 is what makes the ellipsis below
                  actually trigger. Without flex:1 the wrapper takes
                  intrinsic content width — a long name (or email) would
                  push past the menu's right edge instead of truncating.
                  whiteSpace:nowrap + textOverflow:ellipsis only do their
                  job inside a constrained box. */}
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
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: 0.2,
                }}
              >
                {profile?.email ? `${profile.email} · View profile` : "View profile"}
              </div>
            </div>
            <Glyph name="chev-r" size={16} color="rgba(255,255,255,.55)" />
          </Link>
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
            // Rep-type capability gate. Today only Add Customer is
            // gated; any future capability-controlled item would
            // follow the same pattern.
            if (it.id === "add-customer" && !canAddCustomers) return null;
            // "Today" highlights for the dashboard + every shift-execution
            // page (check-in, active, etc); every other item is a direct
            // path match. /shifts has its own row now, so it lights up
            // only when the rep is actually on the list view.
            const isCurrent =
              it.id === "today" ? isTodayCurrent(pathname) : pathname.startsWith(it.href);
            return (
              <Link
                key={it.id}
                href={it.href}
                onClick={close}
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
                    color: MC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {it.label}
                </div>
                {/* Messages unread badge — brand-tinted pill with the
                    raw count (caps display at 99+). Hidden when 0
                    so the menu stays calm when there's nothing new. */}
                {it.id === "messages" && unreadMessages > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      background: MC.brand,
                      color: "#fff",
                      fontFamily: MC.font,
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      padding: "2px 8px",
                      borderRadius: 999,
                      minWidth: 22,
                      textAlign: "center",
                    }}
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
                {/* Dot indicator for the currently-active page. We
                    suppress it on the Messages row WHEN there's an
                    unread badge already drawing attention there;
                    otherwise (zero unread but currently on /messages)
                    the dot still renders so the menu reflects the
                    current page consistently. */}
                {isCurrent && !(it.id === "messages" && unreadMessages > 0) && (
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

        {/* Log out — its own destructive button, native-app style.
            Sits between the nav list and the brand footer. Wraps the
            same handleLogout that used to power the in-list row, so
            the behaviour is unchanged; only the placement moved.
            Power glyph signals "session end" universally. */}
        <div style={{ padding: "8px 12px 12px" }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              padding: "12px 14px",
              borderRadius: 12,
              background: MC.dangerTint,
              border: `1px solid ${MC.danger}33`,
              cursor: "pointer",
              fontFamily: MC.font,
              fontSize: 14,
              fontWeight: 600,
              color: MC.danger,
              letterSpacing: -0.05,
              appearance: "none",
              WebkitAppearance: "none",
              margin: 0,
            }}
          >
            <Glyph name="power" size={16} color={MC.danger} strokeWidth={2.2} />
            Log out
          </button>
        </div>

        {/* Footer — Last-sync heartbeat indicator was moved here off
            the home page welcome card so the hero stays clean.
            Captures the time the menu was opened (the app is alive
            now → that's all the rep needs to confirm). */}
        <div
          style={{
            padding: "14px 16px 20px",
            fontFamily: MC.font,
            textAlign: "center",
            borderTop: `1px solid ${MC.line}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: MC.hint,
              letterSpacing: 0.4,
            }}
          >
            Last sync · {formatSyncTime(new Date())}
          </div>
          <div
            style={{
              fontSize: 11,
              color: MC.hint,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Powered by{" "}
            <span style={{ fontWeight: 800, color: MC.ink2 }}>MORPHEUS</span>
            {/* Brand-tinted pill matching the admin sidebar footer
                + the AppFooter wordmark — same chip treatment so
                the brand reads identically across every surface. */}
            <span
              style={{
                fontWeight: 800,
                color: MC.brand,
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(21, 180, 214, 0.18)",
              }}
            >
              OPS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "HH:MM AM/PM" — short heartbeat label for the side-menu footer. */
function formatSyncTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
