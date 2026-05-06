"use client";

import { Card } from "@/components/ui/Card";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";

export default function BillingSettingsPage() {
  return (
    <SettingsShell section="billing">
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
          Subscription plan, invoices, payment method.
        </div>
      </Card>
    </SettingsShell>
  );
}
