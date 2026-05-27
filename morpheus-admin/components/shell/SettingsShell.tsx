"use client";

/**
 * SettingsShell — wraps AdminShell, adds the sticky left rail with all
 * settings sections.
 *
 * Each settings page calls this and provides a `section` id so the rail
 * highlights the correct item. Replaces the previous single-page
 * sticky-scroll approach where every section lived on /settings — each
 * section now has its own URL and the rail is the nav between them.
 *
 * Adding a new section is two lines in SETTINGS_SECTIONS plus a new
 * page file under app/settings/<id>/page.tsx.
 */

import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
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
    id: "rep-types",
    label: "Rep types",
    href: "/settings/rep-types",
    glyph: "tasks",
    description:
      "Categorise mobile reps (Sales Rep / Merchandiser / Driver / …). Each type controls which app features that rep sees + which claimable shifts they can pick up.",
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
    id: "import",
    label: "Import",
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
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* ─── Sticky left rail ───────────────────────────────────────── */}
        <nav
          style={{
            position: "sticky",
            top: 16,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              padding: "6px 10px 8px",
            }}
          >
            Settings
          </div>
          {SETTINGS_SECTIONS.map((s) => (
            <RailItem key={s.id} section={s} active={s.id === section} />
          ))}
        </nav>

        {/* ─── Section content ───────────────────────────────────────── */}
        <div>
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
      </div>
    </AdminShell>
  );
}

function RailItem({ section, active }: { section: SettingsSection; active: boolean }) {
  const inner = (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        background: active ? AC.brandSoft : "transparent",
        color: active ? AC.brandInk : section.available ? AC.ink2 : AC.faint,
        fontFamily: AC.font,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        letterSpacing: -0.1,
        position: "relative",
        opacity: section.available ? 1 : 0.6,
        cursor: section.available ? "pointer" : "not-allowed",
      }}
      title={section.description}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: -4,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 99,
            background: AC.brand,
          }}
        />
      )}
      <AGlyph
        name={section.glyph}
        size={14}
        color={active ? AC.brandDeep : section.available ? AC.mute : AC.faint}
      />
      <span style={{ flex: 1 }}>{section.label}</span>
      {!section.available && (
        <span
          style={{
            padding: "1px 6px",
            borderRadius: 99,
            background: AC.bg,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Soon
        </span>
      )}
    </div>
  );
  if (!section.available) return inner;
  return (
    <Link href={section.href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}
