"use client";

/**
 * /settings — hub. Each section is now its own page; landing on /settings
 * shows a card grid of all sections so the user can pick one. The rail
 * is rendered by SettingsShell so this page also has the nav.
 *
 * Previous version of this file rendered every section inline with a
 * sticky-scroll left rail; the user asked for separate pages, so each
 * section moved to its own route. See:
 *   /settings/managers
 *   /settings/check-in-rules
 *   /settings/custom-fields
 *   /settings/organisation
 *   /settings/notifications  (Soon)
 *   /settings/billing        (Soon)
 */

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import {
  SettingsShell,
  SETTINGS_SECTIONS,
} from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";

export default function SettingsHubPage() {
  return (
    <SettingsShell
      section="managers" /* nothing is "active" on the hub; default highlight */
      title="Settings"
      description="Pick a section on the left, or jump straight to one of these tiles."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {SETTINGS_SECTIONS.map((s) => {
          const inner = (
            <Card padding={16}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  opacity: s.available ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: AC.brandSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AGlyph name={s.glyph} size={18} color={AC.brandDeep} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: AC.font,
                      fontSize: 14,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {s.label}
                    {!s.available && (
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
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      marginTop: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.description}
                  </div>
                </div>
                {s.available && <AGlyph name="chev-r" size={14} color={AC.mute} />}
              </div>
            </Card>
          );
          if (!s.available) return <div key={s.id}>{inner}</div>;
          return (
            <Link
              key={s.id}
              href={s.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </SettingsShell>
  );
}
