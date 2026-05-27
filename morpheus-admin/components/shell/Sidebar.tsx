"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { NAV_ITEMS } from "@/lib/mock-data";
import { SETTINGS_SECTIONS } from "@/components/shell/SettingsShell";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { getUser, signOut } from "@/lib/auth";
import {
  getOrganisationName,
  getOrganisationLogoUrl,
  getOrganisationNameColor,
  subscribeOrgChanges,
} from "@/lib/settings-store";
import { useNeedsAction } from "@/lib/needs-action-context";
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
  //
  // Initial values come from localStorage so the brand block paints
  // the LAST KNOWN logo + name instantly on mount — no half-second
  // flicker of the fallback brand cube while the DB fetch is in
  // flight. The useEffect below revalidates against the DB and
  // writes any changes back to the cache.
  const [orgName, setOrgName] = useState<string>(() => readCachedOrg().name);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>(() => readCachedOrg().logoUrl);
  // Optional accent colour for the org name — set in
  // /settings/organisation. Empty string = inherit the default
  // sideInk colour (#E6E9EE). Cached alongside name + logo so the
  // first paint doesn't flash from default to coloured.
  const [orgNameColor, setOrgNameColor] = useState<string>(
    () => readCachedOrg().nameColor
  );
  // True once the network fetch has resolved at least once. Used to
  // keep the branded fallback cube hidden until we KNOW whether the
  // org has a real logo set — first-ever visit shows a neutral
  // skeleton during the in-flight fetch rather than the brand cube
  // (which the user otherwise sees and reads as "wrong logo").
  const [orgLoaded, setOrgLoaded] = useState<boolean>(() => readCachedOrg().hasCache);
  // Needs Action count now comes from the shared NeedsActionContext
  // (provided at AdminShell level). One subscription, one source of
  // truth — the previous three independent subscribers drifted out of
  // sync after realtime DELETE events (Gary saw 2 / 1 / 0 on the same
  // screen). See lib/needs-action-context.tsx for the rationale.
  const { count: needsActionCount, refresh: refreshNeedsAction } = useNeedsAction();

  // Tasks sub-nav expansion. Defaults open when the user is on a
  // /tasks route (auto-expand on arrival), but a click on the Tasks
  // parent while ALREADY on /tasks toggles it closed — and vice
  // versa. Without this manual override, a parent re-click was a
  // no-op navigation that left the sub-nav stuck open.
  const [tasksExpanded, setTasksExpanded] = useState<boolean>(() =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/tasks")
  );
  // Auto-open when the user navigates INTO /tasks from elsewhere.
  // We don't auto-close when they leave — leaves room for the
  // "I'm planning a Tasks visit" reading where the sub-nav stays
  // visible after they nav away. Cheap to expand back on return.
  useEffect(() => {
    if (pathname.startsWith("/tasks")) setTasksExpanded(true);
  }, [pathname]);

  // Settings sub-nav — same expand/collapse pattern as Tasks but with
  // symmetric auto-close. Gary's directive (May 27 late):
  //   - clicking Settings navigates to /settings AND opens the drawer
  //   - while on /settings/* the drawer stays open
  //   - the moment the user navigates OUT of /settings/* the drawer
  //     auto-closes (no stale duplicate of nav lingering on customer
  //     / rep / etc pages)
  // Tasks doesn't auto-close — that's intentional asymmetry: Settings
  // is a top-level section the user enters and exits; Tasks is a
  // section with sub-modes the user often returns to.
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(() =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/settings")
  );
  useEffect(() => {
    setSettingsExpanded(pathname.startsWith("/settings"));
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    getUser().then((u) => {
      if (!cancelled) setUserEmail(u?.email || "");
    });
    const fetchOrg = () => {
      Promise.all([
        getOrganisationName(),
        getOrganisationLogoUrl(),
        getOrganisationNameColor(),
      ]).then(([n, u, c]) => {
        if (cancelled) return;
        setOrgName(n);
        setOrgLogoUrl(u);
        setOrgNameColor(c);
        setOrgLoaded(true);
        writeCachedOrg(n, u, c);
      });
    };
    fetchOrg();
    // Re-fetch when the manager saves a new name/logo on
    // /settings/organisation. Custom event fires from the setters
    // in lib/settings-store.ts — no page reload needed.
    const unsubOrg = subscribeOrgChanges(fetchOrg);
    return () => {
      cancelled = true;
      unsubOrg();
    };
  }, []);

  // Refetch the shared needs-action data on every pathname change —
  // covers the timing window where a request landed during nav
  // transitions and the websocket reconnected just after.
  useEffect(() => {
    refreshNeedsAction();
  }, [pathname, refreshNeedsAction]);

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
        // Vertical gradient — top stays the original sidebar dark
        // (AC.side = #0E1116) and fades to a slightly warmer
        // #11151B at the bottom. Net effect on tall displays: the
        // dead-space between the nav and the user card stops
        // reading as a flat void. Subtle enough that on shorter
        // displays where there's no void, the gradient blends
        // into the rest of the chrome.
        background:
          "linear-gradient(180deg, #0E1116 0%, #0E1116 40%, #11151B 100%)",
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
        ) : !orgLoaded ? (
          // First-ever visit, fetch in flight. Neutral skeleton so we
          // don't flash a branded cube the user reads as the "wrong"
          // logo. Subsequent visits hit the localStorage cache and
          // skip this state entirely.
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "#1B2027",
              border: "1px solid #232932",
              flexShrink: 0,
            }}
            aria-label="Loading organisation logo"
          />
        ) : (
          // Loaded, no logo set in /settings/organisation. Render the
          // generic brand cube — this is a legitimate default, not a
          // loading state.
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
              // Org-name accent — pulled from /settings/organisation.
              // Empty string falls through to the inherited sideInk
              // colour, so brand-new installs look unchanged.
              color: orgNameColor || undefined,
              // Subtle text-shadow when a custom colour is in play —
              // some brand reds / yellows look washed out on a dark
              // sidebar without a little ink-tone glow. Skipped when
              // colour is default so the wordmark stays clean.
              textShadow: orgNameColor
                ? "0 1px 0 rgba(0,0,0,0.35)"
                : undefined,
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

      {/* Tagline strip. May 14 — replaced the legacy module switcher
          (Time & Attendance / Sales Orders / Auditing). "Morpheus
          Ops" branding is already in the footer pill at the bottom
          of the sidebar, so we don't repeat it here — just the
          tagline, which reminds the user what the platform does
          without competing with the org name above.

          The shimmer below fires every ~7s for ~2s then rests — a
          subtle "platform is alive" pulse. CSS-only, gradient
          sweeps across the text using background-clip: text.
          prefers-reduced-motion users see a static line. */}
      <div style={{ padding: "0 14px 12px", borderBottom: `1px solid #1B2027` }}>
        <div
          style={{
            fontFamily: AC.font,
            // Single-line guarantee at the 240px sidebar width — the
            // earlier 12.5px size made "Workforce Operations. [In real
            // time]" wrap to two lines. 11px reads correctly on
            // standard-DPR + retina without feeling tiny since the
            // wordmark above is already the focal point.
            fontSize: 11,
            letterSpacing: -0.05,
            lineHeight: 1.4,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexWrap: "nowrap",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span
            className="sb-tagline"
            style={{
              color: "#8A95A4",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            Workforce Operations.
          </span>
          {/* "In real time" treated as a brand pill — mirrors the
              "OPS" chip in the footer wordmark + the admin's
              MORPHEUS Ops sidebar pill, so the platform's two-tone
              brand treatment lands consistently across surfaces.
              The shimmer animation still sweeps across the muted
              text via the wrapper class below; the pill background
              stays static, only the gradient on the text fill moves.
              flexShrink:0 stops the pill collapsing first when the
              row is tight — the prefix truncates with an ellipsis
              instead, which preserves the brand cue. */}
          <span
            className="sb-tagline-pill"
            style={{
              padding: "1px 6px",
              borderRadius: 4,
              background: "rgba(36, 173, 217, 0.18)",
              color: AC.brand,
              fontWeight: 700,
              letterSpacing: 0.2,
              flexShrink: 0,
            }}
          >
            In real time
          </span>
        </div>
      </div>
      {/* Tagline shimmer keyframes. Kept inline with the sidebar so
          the rule lives next to its only consumer. The animation
          spends 70% of each cycle parked off-screen-right then
          sweeps to off-screen-left over 30%, then a brief pause
          before the cycle restarts — produces a "shimmer sometimes,
          mostly still" rhythm. Total cycle 7s. */}
      <style>{`
        @keyframes sb-tagline-shimmer {
          0%, 70% { background-position: 200% center; }
          100%   { background-position: -200% center; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .sb-tagline {
            background: linear-gradient(
              90deg,
              #8A95A4 0%,
              #8A95A4 42%,
              #C8E4F2 50%,
              #8A95A4 58%,
              #8A95A4 100%
            );
            background-size: 200% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
            animation: sb-tagline-shimmer 7s ease-in-out infinite;
          }
        }
      `}</style>

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
          const parentActive = isActive(item.href);
          const isTasks = item.id === "tasks";
          const isSettings = item.id === "settings";
          // Items that own a sub-nav drawer get a trailing caret +
          // toggle-on-re-click behaviour. Currently Tasks + Settings.
          const hasSubNav = isTasks || isSettings;
          const subNavOpen = isTasks ? tasksExpanded : isSettings ? settingsExpanded : false;
          return (
            <React.Fragment key={item.id}>
              <NavItem
                href={href}
                label={item.label}
                glyph={item.glyph as GlyphName}
                active={parentActive}
                comingSoon={
                  "comingSoon" in item
                    ? (item as { comingSoon?: boolean }).comingSoon ?? false
                    : false
                }
                badgeCount={item.id === "ops" ? needsActionCount : 0}
                trailingCaret={hasSubNav}
                caretOpen={subNavOpen}
                onClick={
                  hasSubNav
                    ? (e) => {
                        // Re-click while already on the section's
                        // route = toggle the sub-nav. Without this
                        // the re-click was a no-op navigation (user
                        // tried to "close" the drawer and nothing
                        // happened). Otherwise let Next.js navigate;
                        // the useEffect on pathname auto-expands when
                        // the user lands on the section.
                        if (isTasks && pathname.startsWith("/tasks")) {
                          e.preventDefault();
                          setTasksExpanded((v) => !v);
                        } else if (isSettings && pathname.startsWith("/settings")) {
                          e.preventDefault();
                          setSettingsExpanded((v) => !v);
                        }
                      }
                    : undefined
                }
              />
              {/* Tasks sub-nav. Three options:
                    - Tasks (Core, active when on /tasks)
                    - Advanced Auditing (Pro — locked)
                    - Sales Orders (Pro — locked)
                  Locked items aren't separate top-level nav per
                  product direction — they live as upgradeable
                  capabilities inside Tasks.
                  Animation: outer wrapper does max-height + opacity
                  transition; inner content slides down from the top
                  via a tiny translateY. Cubic-bezier(.22, 1, .36, 1)
                  is the "soft overshoot" curve I use elsewhere — feels
                  more like a click landing than a generic ease. */}
              {isTasks && (
                <div
                  aria-hidden={!tasksExpanded}
                  style={{
                    overflow: "hidden",
                    maxHeight: tasksExpanded ? 160 : 0,
                    opacity: tasksExpanded ? 1 : 0,
                    transition:
                      "max-height .32s cubic-bezier(.22, 1, .36, 1), opacity .22s ease-out, margin .22s ease-out",
                    marginTop: tasksExpanded ? 2 : 0,
                    marginBottom: tasksExpanded ? 4 : 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      marginLeft: 16,
                      paddingLeft: 12,
                      borderLeft: `1px solid #232932`,
                      // Inner slide — each row eases in from -6px.
                      transform: tasksExpanded
                        ? "translateY(0)"
                        : "translateY(-6px)",
                      transition:
                        "transform .32s cubic-bezier(.22, 1, .36, 1)",
                    }}
                  >
                    <SubNavItem
                      label="Tasks"
                      href="/tasks"
                      active={pathname === "/tasks"}
                    />
                    <SubNavItem
                      label="Advanced Auditing"
                      locked
                      onLockedClick={() =>
                        alert(
                          "Advanced Auditing is part of Morpheus Ops Pro — coming soon.\n\nTalk to us if you'd like early access."
                        )
                      }
                    />
                    <SubNavItem
                      label="Sales Orders"
                      locked
                      onLockedClick={() =>
                        alert(
                          "Sales Orders is part of Morpheus Ops Pro — coming soon.\n\nTalk to us if you'd like early access."
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {/* Settings sub-nav. One row per SETTINGS_SECTIONS entry
                  so adding a new settings page automatically appears
                  in the sidebar drawer too. Unavailable sections (e.g.
                  Billing) render as locked rows with the "Soon" pill.
                  Animation matches Tasks — same cubic-bezier curve,
                  same translateY entry — so the two drawers feel
                  identical. */}
              {isSettings && (
                <div
                  aria-hidden={!settingsExpanded}
                  style={{
                    overflow: "hidden",
                    // Generous max-height for the longer settings list
                    // (currently 7 entries × ~30px). Bump if more get
                    // added.
                    maxHeight: settingsExpanded ? 360 : 0,
                    opacity: settingsExpanded ? 1 : 0,
                    transition:
                      "max-height .32s cubic-bezier(.22, 1, .36, 1), opacity .22s ease-out, margin .22s ease-out",
                    marginTop: settingsExpanded ? 2 : 0,
                    marginBottom: settingsExpanded ? 4 : 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      marginLeft: 16,
                      paddingLeft: 12,
                      borderLeft: `1px solid #232932`,
                      transform: settingsExpanded
                        ? "translateY(0)"
                        : "translateY(-6px)",
                      transition:
                        "transform .32s cubic-bezier(.22, 1, .36, 1)",
                    }}
                  >
                    {SETTINGS_SECTIONS.map((s) =>
                      s.available ? (
                        <SubNavItem
                          key={s.id}
                          label={s.label}
                          href={s.href}
                          active={pathname === s.href || pathname.startsWith(s.href + "/")}
                        />
                      ) : (
                        <SubNavItem
                          key={s.id}
                          label={s.label}
                          locked
                          // Use the existing locked path but the alert
                          // copy explains it's coming, not paywalled —
                          // matches the SOON pill on the in-page rail.
                          onLockedClick={() =>
                            alert(
                              `${s.label} is coming soon.\n\nTalk to us if you'd like early access.`
                            )
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
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

      {/* "Powered by Morpheus Ops" — small CTA at the very bottom of
          the sidebar so even white-labelled customers see the platform
          mark subtly. Renamed from "Morpheus TA" (Time & Attendance)
          to "Morpheus Ops" on May 13 — the product scope outgrew the
          original TA framing, so the brand pill follows. */}
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
        title="Morpheus Ops — Field Operations Suite"
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
          Ops
        </span>
      </a>
    </div>
  );
}

function NavItem({
  href,
  label,
  glyph,
  active,
  comingSoon = false,
  badgeCount = 0,
  onClick,
  trailingCaret,
  caretOpen,
}: {
  href: string;
  label: string;
  glyph: GlyphName;
  active: boolean;
  comingSoon?: boolean;
  /** When > 0 a flashing red pill renders on the right of the row. */
  badgeCount?: number;
  /** Optional click interceptor — fires BEFORE Next.js navigates. The
   *  handler can call e.preventDefault() to cancel the nav (e.g. the
   *  Tasks parent uses this to toggle its sub-nav when already on
   *  /tasks instead of re-navigating). */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  /** When set, renders a chevron at the trailing edge of the row to
   *  signal "this item expands inline". Rotates based on caretOpen. */
  trailingCaret?: boolean;
  caretOpen?: boolean;
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
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        // Slightly bigger tap target — the previous 8/12 pad made
        // the row feel cramped at 13px label. With 14px labels +
        // 18px icons we want the row to breathe a little more.
        padding: "10px 12px",
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
            top: 10,
            bottom: 10,
            width: 3,
            background: AC.brand,
            borderRadius: 99,
          }}
        />
      )}
      <AGlyph name={glyph} size={18} color={active ? AC.brand : AC.sideMute} />
      <span
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 14,
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
      {trailingCaret && (
        // Disclosure caret for items with an inline sub-nav. Rotates
        // 90° when the sub-nav is open so the affordance reads as a
        // chevron pointing INTO the open content. The whole row stays
        // a Link (so URL still navigates); the caret is purely visual.
        // Wrapped in a span because AGlyph itself doesn't accept a
        // style prop — the rotation lives on the wrapper.
        <span
          style={{
            display: "inline-flex",
            transition: "transform .25s cubic-bezier(.22,1,.36,1)",
            transform: caretOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <AGlyph
            name="chev-r"
            size={13}
            color={active ? AC.brand : AC.sideMute}
          />
        </span>
      )}
    </Link>
  );
}

/**
 * Sub-row under a parent nav item. Two visual modes:
 *   - Linkable (`href` set) → renders as a small <Link>. Goes muted
 *     unless `active`, where it brightens.
 *   - Locked (`locked` true) → renders as a button with a lock glyph
 *     and a muted tone. onClick opens a placeholder modal until real
 *     Pro billing exists.
 *
 * Indentation comes from the parent wrapper (marginLeft + borderLeft);
 * the row itself sits flush so the active highlight reads cleanly.
 */
function SubNavItem({
  label,
  href,
  active = false,
  locked = false,
  onLockedClick,
}: {
  label: string;
  href?: string;
  active?: boolean;
  locked?: boolean;
  onLockedClick?: () => void;
}) {
  const baseStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 10px",
    borderRadius: 6,
    textDecoration: "none",
    fontFamily: AC.font,
    fontSize: 12.5,
    letterSpacing: -0.05,
    textAlign: "left",
    border: "none",
    background: active ? "#1B2027" : "transparent",
    color: active ? "#fff" : locked ? "#5C6571" : AC.sideMute,
    fontWeight: active ? 600 : 500,
    cursor: locked ? "pointer" : "pointer",
  };
  const body = (
    <>
      <span style={{ flex: 1 }}>{label}</span>
      {locked && (
        <>
          <span
            style={{
              fontFamily: AC.font,
              fontSize: 9,
              fontWeight: 700,
              color: AC.brand,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              padding: "1px 5px",
              background: `${AC.brand}22`,
              borderRadius: 3,
            }}
          >
            Pro
          </span>
          <AGlyph name="lock" size={12} color="#5C6571" />
        </>
      )}
    </>
  );

  if (locked) {
    return (
      <button
        type="button"
        onClick={onLockedClick}
        title={`${label} — Morpheus Ops Pro (coming soon)`}
        style={baseStyle}
      >
        {body}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} style={baseStyle}>
      {body}
    </Link>
  );
}

/**
 * Local cache of the org name + logo URL so the brand block paints
 * instantly on every page load after the first. Plain localStorage —
 * org branding is small (~10–20 KB max for the base64 logo), the
 * data is non-sensitive, and a stale cache only costs a single
 * frame before the network revalidation lands and overwrites it.
 *
 * Keyed by version. Bumped to v2 (May 14 evening) to add nameColor.
 * Old v1 entries are silently ignored on read — the next save
 * rewrites under v2 + the network revalidation fills the gap. No
 * migration needed.
 */
const ORG_CACHE_KEY = "morpheus.org.cache.v2";

function readCachedOrg(): {
  name: string;
  logoUrl: string;
  nameColor: string;
  hasCache: boolean;
} {
  const empty = { name: "", logoUrl: "", nameColor: "", hasCache: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(ORG_CACHE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        name: typeof parsed.name === "string" ? parsed.name : "",
        logoUrl: typeof parsed.logoUrl === "string" ? parsed.logoUrl : "",
        nameColor:
          typeof parsed.nameColor === "string" ? parsed.nameColor : "",
        hasCache: true,
      };
    }
  } catch {
    /* corrupt cache — ignore */
  }
  return empty;
}

function writeCachedOrg(
  name: string,
  logoUrl: string,
  nameColor: string
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ORG_CACHE_KEY,
      JSON.stringify({ name, logoUrl, nameColor, savedAt: Date.now() })
    );
  } catch {
    /* quota / private mode — ignore */
  }
}
