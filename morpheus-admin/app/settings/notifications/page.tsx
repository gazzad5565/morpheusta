"use client";

/**
 * /settings/notifications — placeholder. The rail item is marked SOON
 * and rendered as non-clickable, but if someone hits the URL directly
 * we still want a friendly page rather than a 404.
 */

import { Card } from "@/components/ui/Card";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";

export default function NotificationsSettingsPage() {
  return (
    <SettingsShell section="notifications">
      <Card padding={36}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 14,
            color: AC.ink2,
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          Coming soon
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            textAlign: "center",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          Email + push notifications for shift changes, late check-ins, and
          escalations. Stay tuned.
        </div>
      </Card>
    </SettingsShell>
  );
}
