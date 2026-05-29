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
import { RequireCapability } from "@/components/ui/RequireCapability";
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

// Order (May 28 late): Gary's directive — Organisation first
// (org branding is the first thing a new tenant configures),
// Users second (managers + reps live there together), then the
// rest in their existing relative order. Routes / ids unchanged
// so every existing link + breadcrumb keeps working.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    // Organisation = company identity only (name, logo, accent
    // colour, contact details). Its own rail entry — Gary (May 28)
    // keeps it separate from Site settings.
    id: "organisation",
    label: "Organisation",
    href: "/settings/organisation",
    glyph: "building",
    description:
      "Organisation name, logo, accent colour, and contact details — shown in the sidebar and on exports.",
    available: true,
  },
  {
    // Site settings = the site-wide taxonomies + field definitions
    // (May 28 — Gary: "site-wide defaults where they adjust things;
    // customer regions + groups belong there, custom fields too, and
    // slowly currency etc"). Tabbed page: Customer regions · Customer
    // groups · Store types · Custom fields. Future defaults (currency,
    // date format) slot in as new tabs — no new rail entry needed.
    id: "site",
    label: "Site settings",
    href: "/settings/site",
    glyph: "settings",
    description:
      "Site-wide taxonomies + custom fields: customer regions, customer groups, store types, and field definitions. Each in its own tab.",
    available: true,
  },
  {
    id: "managers",
    // Section label shown in the sidebar rail / hub tiles / page heading.
    // Renamed "Users" → "Manage users" (May 28, later) per Gary —
    // active verb matches the other action-oriented sections ("Roles
    // & permissions", "Bulk import") and makes the page's purpose
    // clearer in the rail. The /settings/managers route is preserved
    // for existing links + breadcrumbs.
    label: "Manage users",
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
    // Combined check-in rules + messaging (May 28 later — Gary:
    // "combine check-in rules and messaging it's kind of the same
    // thing... each in a tab"). Both pages still live at their
    // existing URLs (no redirects, no deep-link breakage) and
    // share a top-of-page <RulesTabBar /> for in-page switching;
    // the Settings rail just shows ONE entry now. Default landing
    // is /settings/check-in-rules — the tab bar surfaces
    // Messaging from there.
    id: "rules",
    label: "Check-in & messaging rules",
    href: "/settings/check-in-rules",
    glyph: "clock",
    description:
      "Check-in / out exception thresholds and org-wide messaging policies. Two tabs in one place.",
    available: true,
  },
  {
    // URL stays /settings/import (id unchanged) so existing links +
    // breadcrumbs in app/settings/import/[entity]/page.tsx keep working.
    // Label renamed May 27 (post-very-very-late) — Gary's call: "Import"
    // alone is ambiguous (could mean code imports or anything); "Bulk
    // import" tells you what it is.
    id: "import",
    label: "Bulk imports",
    href: "/settings/import",
    glyph: "upload",
    description:
      "Defaults for the bulk import hub — duplicate behaviour and welcome email on user import.",
    available: true,
  },
  {
    // Audit log (May 28) — Mariska G1 + Rayhaan R1. Browse the
    // shift_events activity trail: who changed what, when. Gated by
    // canManageSettings (sensitive).
    id: "audit",
    label: "Audit log",
    href: "/settings/audit",
    glyph: "audit",
    description: "Who changed what, and when — across shifts, customers, library, tasks, and imports.",
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
      {/* canManageSettings gate — every /settings/* page lives inside
          SettingsShell, so wrapping here covers them all with one
          line. Managers without the capability hit the polite
          block-screen card and the actions slot above is still
          rendered (so the rail is visible but the page body is
          locked). The /settings/roles page used to wrap itself
          too; redundant now, kept anyway as a defence-in-depth in
          case SettingsShell is ever skipped. Light-touch RBAC v1
          — May 28. */}
      <RequireCapability cap="canManageSettings" action="open Settings">
        {/* Settings page body — no sticky rail anymore (sidebar drawer
            handles inter-section nav). Just a heading + the section's
            own content. Full-width like every other AdminShell page
            (Gary, May 29: settings pages looked "limited / boxed-in"
            next to the rest — the old maxWidth:1080 cap made the table
            pages, e.g. Manage users + Audit log, narrower than /reps).
            Form-style pages (organisation, site tabs) set their OWN
            inner max-width (~760) for readability, so they're
            unaffected. */}
        <div style={{ padding: 20 }}>
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
      </RequireCapability>
    </AdminShell>
  );
}
