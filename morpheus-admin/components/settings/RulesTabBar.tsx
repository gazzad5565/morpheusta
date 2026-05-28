"use client";

/**
 * RulesTabBar — shared two-tab strip rendered at the top of the
 * /settings/check-in-rules and /settings/notifications pages.
 *
 * Gary's directive (May 28 later): "combine check-in rules and
 * messaging it's kind of the same thing... each in a tab."
 *
 * Both pages stay at their existing URLs (no redirects, no
 * deep-link breakage) but the Settings rail now lists a single
 * combined "Check-ins & messaging" entry. The tab bar handles
 * the in-page switch via Link navigation — same client-side
 * routing as the rail itself, so the transition feels instant.
 *
 * Active tab is brand-tinted; inactive picks up a subtle hover.
 * Visual matches the TabPill on /settings/roles so the two
 * tabbed Settings surfaces feel like siblings.
 */

import Link from "next/link";
import { AC } from "@/lib/tokens";

export type RulesTab = "check-ins" | "messaging";

const TABS: { id: RulesTab; label: string; href: string }[] = [
  { id: "check-ins", label: "Check-ins", href: "/settings/check-in-rules" },
  { id: "messaging", label: "Messaging", href: "/settings/notifications" },
];

export function RulesTabBar({ active }: { active: RulesTab }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        marginBottom: 18,
        borderBottom: `1px solid ${AC.line}`,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            style={{
              textDecoration: "none",
              padding: "10px 16px",
              borderBottom: `2px solid ${isActive ? AC.brandDeep : "transparent"}`,
              marginBottom: -1,
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? AC.brandInk : AC.mute,
              letterSpacing: -0.1,
              transition: "color .12s ease",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
