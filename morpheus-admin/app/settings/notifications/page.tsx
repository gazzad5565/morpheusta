"use client";

/**
 * /settings/notifications — org-wide push notifications controls.
 *
 * Single setting today: `push_notifications_enabled` (default ON).
 * Flipping it OFF immediately silences every Web Push delivery path:
 *   - Shift assigned / reassigned / cancelled (manager actions)
 *   - Running late / EOD checkout reminders (Vercel Cron sweep)
 *   - Rep raised attention flag (mobile → admin broadcast)
 *
 * What this setting DOES NOT touch:
 *   - Auto-checkout sweep (sweepStaleShifts). A rep who forgets to
 *     check out still gets force-completed at app_settings.auto_checkout_time
 *     regardless of this toggle.
 *   - In-app notification banners (the realtime "Needs action" badge
 *     on Live Ops keeps firing — that's a separate channel).
 *   - Push subscription registration. Reps can still opt in / opt
 *     out from /profile on the mobile app while pushes are globally
 *     off, so flipping the switch back on later resumes delivery
 *     without anyone having to re-subscribe.
 *
 * The gate is enforced inside lib/push-send.ts (the bottleneck every
 * push path funnels through) so adding a new event type later can't
 * accidentally bypass it.
 */

import { useEffect, useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getPushNotificationsEnabled,
  setPushNotificationsEnabled,
  getEodReminderBufferMinutes,
  setEodReminderBufferMinutes,
} from "@/lib/settings-store";

export default function NotificationsSettingsPage() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [eodBuffer, setEodBuffer] = useState<string>("30");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPushNotificationsEnabled(),
      getEodReminderBufferMinutes(),
    ]).then(([on, buf]) => {
      setEnabled(on);
      setEodBuffer(String(buf));
      setLoaded(true);
    });
  }, []);

  const onToggle = async (next: boolean) => {
    // Optimistic flip so the switch animates immediately; revert if
    // the write fails so the UI never lies.
    setEnabled(next);
    setSavingKey("toggle");
    setMessage(null);
    const r = await setPushNotificationsEnabled(next);
    setSavingKey(null);
    if (!r.ok) {
      setEnabled(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Push notifications enabled — reps + managers will get pushes for shift events and reminders."
        : "Push notifications disabled. Auto-checkout still runs at the scheduled cutoff."
    );
  };

  const saveEodBuffer = async () => {
    setMessage(null);
    const n = parseInt(eodBuffer, 10);
    if (Number.isNaN(n) || n < 0) {
      setMessage("EOD reminder buffer must be a number ≥ 0.");
      return;
    }
    setSavingKey("eodBuffer");
    const r = await setEodReminderBufferMinutes(n);
    setSavingKey(null);
    if (!r.ok) {
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(`EOD reminder buffer saved (${n} min).`);
  };

  return (
    <SettingsShell
      section="notifications"
      description="Org-wide on/off for every Web Push notification. Reps still subscribe / unsubscribe from /profile on the mobile app; this just controls whether the server actually delivers."
    >
      <Card padding={20} style={{ marginBottom: 14 }}>
        <ToggleRow
          title="Send push notifications"
          subtitle="Shift assignments, reassignments, cancellations, running-late nudges, EOD check-out reminders, and rep attention flags. Auto-checkout is not affected by this toggle."
          on={enabled}
          saving={savingKey === "toggle"}
          disabled={!loaded}
          onChange={onToggle}
        />
      </Card>

      {/* Reminder timing card. Two thresholds: late_grace_minutes (lives
          on /settings/check-in-rules because the mobile late-card flow
          uses it too) and eod_reminder_buffer_minutes (lives here
          because it only applies to the EOD push reminder).
          When push notifications are OFF the buffer is moot — the
          card stays editable so the value is set ahead of re-enabling. */}
      <Card padding={20} style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
            marginBottom: 4,
          }}
        >
          Reminder timing
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          How long the cron sweep waits past a shift&apos;s scheduled end
          before nudging the rep to check out. Doesn&apos;t affect
          auto-checkout, which still runs at the cutoff time set on{" "}
          <a
            href="/settings/check-in-rules"
            style={{ color: AC.brandDeep, textDecoration: "underline" }}
          >
            Check-in rules
          </a>
          .
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <label
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              color: AC.ink,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div>EOD check-out reminder buffer</div>
            <div
              style={{
                fontSize: 11.5,
                color: AC.mute,
                fontWeight: 400,
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              Minutes past the shift&apos;s end_time before the &quot;Don&apos;t
              forget to check out&quot; push fires. Default 30.
            </div>
          </label>
          <input
            type="number"
            min={0}
            value={eodBuffer}
            onChange={(e) => setEodBuffer(e.target.value)}
            disabled={!loaded}
            style={{
              width: 76,
              height: 36,
              padding: "0 10px",
              borderRadius: 8,
              border: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 14,
              textAlign: "center",
              opacity: !loaded ? 0.55 : 1,
            }}
          />
          <Btn
            onClick={saveEodBuffer}
            disabled={!loaded || savingKey === "eodBuffer"}
            kind="primary"
          >
            {savingKey === "eodBuffer" ? "Saving…" : "Save"}
          </Btn>
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            lineHeight: 1.5,
            paddingTop: 8,
            borderTop: `1px solid ${AC.lineDim}`,
          }}
        >
          The <strong>running-late</strong> reminder uses the same{" "}
          <a
            href="/settings/check-in-rules"
            style={{ color: AC.brandDeep, textDecoration: "underline" }}
          >
            late grace
          </a>{" "}
          period as the mobile check-in late-card flow (default 10 min). Edit
          it once on Check-in rules and the cron picks it up.
        </div>
      </Card>

      {/* Plain-language explainer card so a non-technical manager can
          read this once and know exactly what flipping the switch
          does (and what it doesn't). */}
      <Card padding={20} style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
            marginBottom: 8,
          }}
        >
          What this toggle covers
        </div>
        <Bullet>New shift assigned to a rep</Bullet>
        <Bullet>Existing shift reassigned to a different rep</Bullet>
        <Bullet>Shift cancelled (manager-actioned or from a rep flag)</Bullet>
        <Bullet>
          Running-late reminder when a rep&apos;s shift start has passed by
          the late-grace period without a check-in
        </Bullet>
        <Bullet>
          Check-out reminder when a rep&apos;s shift end has passed by 30
          minutes and they&apos;re still in-progress
        </Bullet>
        <Bullet>Rep raises an unable-to-attend flag (notifies all managers)</Bullet>
      </Card>

      <Card padding={20}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
            marginBottom: 8,
          }}
        >
          Auto-checkout still runs
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            lineHeight: 1.55,
          }}
        >
          Push notifications are a <strong>nudge layer</strong>. Auto-checkout
          is the <strong>safety net</strong>. If a rep forgets to check out,
          the system force-completes their shift at the cutoff time
          regardless of whether push notifications are on or off. Configure
          the cutoff under{" "}
          <a
            href="/settings/check-in-rules"
            style={{ color: AC.brandDeep, textDecoration: "underline" }}
          >
            Check-in rules → Auto check-out time
          </a>{" "}
          (default 23:59).
        </div>
      </Card>

      {message && (
        <div
          style={{
            marginTop: 12,
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.brandDeep,
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      )}
    </SettingsShell>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.ink2,
        marginBottom: 6,
        lineHeight: 1.5,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: AC.mute,
          marginTop: 7,
          flexShrink: 0,
        }}
      />
      <span>{children}</span>
    </div>
  );
}

/** Mirrors the ToggleRow shape used on /settings/check-in-rules so
 *  the two pages feel identical. Inlined rather than extracted —
 *  it's 80 lines and there are only two consumers. */
function ToggleRow({
  title,
  subtitle,
  on,
  saving,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  saving: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const isOff = !disabled && !on;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => !disabled && !saving && onChange(!on)}
      disabled={disabled || saving}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "8px 4px",
        border: "none",
        background: "transparent",
        cursor: disabled || saving ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13.5,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div
        aria-hidden
        style={{
          width: 42,
          height: 24,
          borderRadius: 99,
          background: on ? AC.brand : isOff ? "#cbd5e1" : AC.line,
          position: "relative",
          transition: "background .2s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            transition: "left .2s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,.18)",
            opacity: saving ? 0.6 : 1,
          }}
        />
      </div>
    </button>
  );
}
