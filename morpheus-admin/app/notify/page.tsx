"use client";

/**
 * /notify — placeholder for the broadcast composer. Earlier this
 * route shipped a static design preview with a dozen dead buttons
 * (Save draft, Send now, channel toggles, etc.) and that violates
 * the project's "no dead buttons" rule. Stubbed out until the
 * feature is actually wired to a notifications backend.
 */

import { AdminShell } from "@/components/shell/AdminShell";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

export default function NotifyPage() {
  return (
    <AdminShell breadcrumbs={["Home", "Notifications"]}>
      <div style={{ padding: 20, maxWidth: 640 }}>
        <Card padding={28}>
          <SectionTitle>Broadcasts</SectionTitle>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: 16,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: AC.brandSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AGlyph name="send" size={20} color={AC.brandDeep} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 15,
                  fontWeight: 700,
                  color: AC.ink,
                }}
              >
                Coming soon.
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.mute,
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Push + in-app broadcasts to selected reps. The composer is on
                the roadmap once a notifications backend is wired up — design
                preview was removed because it had no working actions.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
