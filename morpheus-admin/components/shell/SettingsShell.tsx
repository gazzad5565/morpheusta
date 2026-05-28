"use client";

/**
 * SettingsShell — wraps AdminShell for every /settings/* page.
 *
 * Originally rendered a sticky left rail listing every Settings section.
 * That rail was REMOVED on May 27 (late) when the global sidebar
 * (components/shell/Sidebar.tsx) gained an expandable Settings drawer
 * that lists the same sections — keeping both was straight duplication
 * (Gary's call: "we don't need the navigation on the main pages of the
 * settings as well it just has to have a page if you want to go you
 * can use the navigation at the left").
 *
 * The component still owns the page heading + breadcrumbs so each
 * Settings page calls it with a `section` id (used for the title /
 * breadcrumbs / description fallback) and gets a consistent shape.
 *
 * SETTINGS_SECTIONS stays exported here because the sidebar imports
 * it as the single source of truth for the drawer list. Adding a new
 * section is still two lines here plus a new page file under
 * app/settings/<id>/page.tsx — the new drawer entry appears in the
 * sidebar automatically.
 */

import { AdminShell } from "@/components/shell/AdminShell";
import { type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

export interface SettingsSection {
  id: string;
  label: string;
  href: string;
  glyph: GlyphName;
  /** Short help text. Shown as the page subtitle on each section. */
  description: string;
  /** false → renders as a non-clickable greyed item with a SOON pill. */
  available: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "managers",
    // Section label shown in the sidebar rail / hub tiles / page heading.
    // Renamed to "Users" because the page covers both reps and managers
    // (promote / demote / add user / etc). The /settings/managers route
    // is preserved for existing links + breadcrumbs.
    label: "Users",
    href: "/settings/managers",
    glyph: "reps",
    description: "Reps log into the mobile app. Managers log into this console.",
    available: true,
  },
  {
    id: "roles",
    label: "Roles & permissions",
    href: "/settings/roles",
    glyph: "lock",
    description:
      "Manager + rep types — categorise users and gate what each type can do. Only managers with full Settings access can edit.",
    available: true,
  },
  {
    id: "check-in-rules",
    label: "Check-in rules",
    href: "/settings/check-in-rules",
    glyph: "clock",
    description:
      "Thresholds that gate when the mobile app shows an exception card on check-in / check-out.",
    available: true,
  },
  {
    id: "custom-fields",
    label: "Custom fields",
    href: "/settings/custom-fields",
    glyph: "tasks",
    description:
      "Add your own fields to any entity (customers, reps, shifts, tasks, library files).",
    available: true,
  },
  {
    id: "organisation",
    label: "Organisation",
    href: "/settings/organisation",
    glyph: "building",
    description: "Org name and logo, shown in the sidebar and on receipts.",
    available: true,
  },
  {
    id: "notifications",
    // Renamed from "Notifications" May 13 — see lib/mock-data.ts NAV_ITEMS.
    label: "Messaging",
    href: "/settings/notifications",
    glyph: "send",
    description: "Org-wide push notifications on/off. Auto-checkout is independent.",
    available: true,
  },
  {
    // URL stays /settings/import (id unchanged) so existing links +
    // breadcrumbs in app/settings/import/[entity]/page.tsx keep working.
    // Label renamed May 27 (post-very-very-late) — Gary's call: "Import"
    // alone is ambiguous (could mean code imports or anything); "Bulk
    // import" tells you what it is.
    id: "import",
    label: "Bulk import",
    href: "/settings/import",
    glyph: "upload",
    description:
      "Defaults for the bulk import hub — duplicate behaviour and welcome email on user import.",
    available: true,
  },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    glyph: "audit",
    description: "Subscription + invoices.",
    available: false,
  },
];

export function SettingsShell({
  section,
  title,
  description,
  actions,
  children,
}: {
  /** Id of the active section (for nav highlight). */
  section: string;
  /** Page heading. Defaults to the section's label. */
  title?: string;
  /** Optional override for the subtitle. Defaults to section.description. */
  description?: string;
  /** Optional right-aligned action buttons in the AdminShell topbar. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const current = SETTINGS_SECTIONS.find((s) => s.id === section) || SETTINGS_SECTIONS[0];
  const heading = title ?? current.label;
  const sub = description ?? current.description;

  return (
    <AdminShell
      breadcrumbs={["Home", "Settings", current.label]}
      actions={actions}
    >
      {/* Settings page body — no sticky rail anymore (sidebar drawer
          handles inter-section nav). Just a heading + the section's
          own content. Max-width keeps long pages readable on wide
          desktops without forcing every page to set its own. */}
      <div style={{ padding: 20, maxWidth: 1080 }}>
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 22,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.4,
            }}
          >
            {heading}
          </div>
          {sub && (
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                marginTop: 4,
                lineHeight: 1.5,
                maxWidth: 720,
              }}
            >
              {sub}
            </div>
          )}
        </div>
        {children}
      </div>
    </AdminShell>
  );
}
