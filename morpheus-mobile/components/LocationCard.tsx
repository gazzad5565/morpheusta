"use client";

/**
 * LocationCard — /profile tile for location-permission state.
 *
 * Why this exists: iOS Safari (and iOS-installed PWAs) doesn't
 * persistently honour the "Allow Once" choice on
 * `navigator.geolocation.getCurrentPosition`. Every new session the
 * OS re-presents the permission prompt, which reps experience as
 * "this thing keeps asking me". The only way to make it stop is for
 * the rep to pick "Allow on Every Visit" on the OS prompt, OR set
 * Settings → Apps → Safari → Location → Morpheus → "Allow" once.
 *
 * We can't bypass that — iOS owns the prompt. But we CAN surface
 * what's going on so the rep understands their options + has a
 * one-tap way to test the current state without us silently
 * triggering yet another prompt elsewhere in the app.
 *
 * The card has three observable states:
 *   1. Allowed (Permissions API returns 'granted') — calm, green.
 *   2. Blocked (returns 'denied') — warn, with iOS Settings deep-
 *      link copy.
 *   3. Asks every visit ('prompt' AND we have a localStorage stamp
 *      from a previous successful fix) — warn-toned with the iOS
 *      "Allow on Every Visit" tip. This is the most common iOS
 *      complaint and the reason the card was built.
 *   4. Not yet asked ('prompt' without prior stamp) — neutral, with
 *      a "Grant location now" button that runs the prompt.
 */

import { useCallback, useEffect, useState } from "react";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";
import {
  getGeolocationStatus,
  requestGeolocationOnce,
  type GeolocationStatus,
} from "@/lib/route-planner";

type BannerTone = "ok" | "warn" | "danger" | "neutral";

interface CardCopy {
  tone: BannerTone;
  glyph: "check-circle" | "warn" | "pin";
  title: string;
  body: string;
  cta?: { label: string; action: "test" | "refresh-status" };
  /** Optional list of iOS-specific steps shown as a numbered list
   *  under the body. Only renders when isIOS is true. */
  iosSteps?: string[];
}

function copyFor(status: GeolocationStatus, testing: boolean): CardCopy {
  if (!status.supported) {
    return {
      tone: "danger",
      glyph: "warn",
      title: "Location not supported",
      body:
        "Your browser doesn't expose location to web apps. Use a recent version of Safari, Chrome, or Edge — and make sure you're on HTTPS.",
    };
  }
  if (status.permission === "denied") {
    return {
      tone: "danger",
      glyph: "warn",
      title: "Location blocked",
      body:
        "You've blocked location access. Check-in geofence + Route ETAs won't work until you re-enable it.",
      iosSteps: status.isIOS
        ? [
            "Open iOS Settings → Apps → Safari (or whichever browser you used).",
            "Tap Location.",
            "Find Morpheus Ops and pick \"Allow\" (or \"Ask Next Time\").",
            "Re-open this page and tap Test location below.",
          ]
        : undefined,
      cta: { label: "Test again", action: "refresh-status" },
    };
  }
  if (status.permission === "granted") {
    return {
      tone: "ok",
      glyph: "check-circle",
      title: "Location allowed",
      body:
        "Check-in, Route and on-site geocoding all use this. We never log your position when you're off-shift.",
      cta: { label: testing ? "Testing…" : "Test location", action: "test" },
    };
  }
  // permission === 'prompt' or 'unknown'
  if (status.isLikelyRePrompting) {
    return {
      tone: "warn",
      glyph: "warn",
      title: "iOS keeps forgetting your choice",
      body:
        "You allowed location once but iOS doesn't remember between sessions. The next time it asks, tap \"Allow on Every Visit\" and the prompt will stop reappearing.",
      iosSteps: [
        "Tap Test location below.",
        "When iOS asks, pick \"Allow on Every Visit\".",
        "From now on, location works silently — no more prompts.",
      ],
      cta: { label: testing ? "Testing…" : "Test location", action: "test" },
    };
  }
  return {
    tone: "neutral",
    glyph: "pin",
    title: "Location not yet allowed",
    body:
      "Tap Grant location to set this up once. You can change it any time in your browser's site settings.",
    cta: { label: testing ? "Asking…" : "Grant location", action: "test" },
  };
}

export function LocationCard() {
  const [status, setStatus] = useState<GeolocationStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; lat: number; lng: number } | { ok: false } | null
  >(null);

  const refresh = useCallback(async () => {
    const s = await getGeolocationStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh();
    // Re-read on tab focus so a rep who flipped the iOS setting
    // sees the card update without needing to navigate.
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const onTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const pos = await requestGeolocationOnce({ highAccuracy: false });
    setTesting(false);
    if (pos) {
      setTestResult({ ok: true, lat: pos.lat, lng: pos.lng });
    } else {
      setTestResult({ ok: false });
    }
    // Refresh status — a successful test may have flipped
    // permission to 'granted' on iOS if they tapped "Allow on Every
    // Visit", and any path may have changed the previouslyGranted
    // flag.
    void refresh();
  }, [refresh]);

  if (!status) return null;
  const c = copyFor(status, testing);

  const toneToColors: Record<BannerTone, { bg: string; border: string; ink: string; iconBg: string; iconFg: string }> = {
    ok: {
      bg: MC.okTint,
      border: `${MC.ok}55`,
      ink: "#0d6a45",
      iconBg: "rgba(255,255,255,.6)",
      iconFg: MC.ok,
    },
    warn: {
      bg: MC.warnTint,
      border: `${MC.warn}55`,
      ink: "#7A560A",
      iconBg: "rgba(255,255,255,.7)",
      iconFg: MC.warn,
    },
    danger: {
      bg: MC.dangerTint,
      border: `${MC.danger}55`,
      ink: "#9c1a3c",
      iconBg: "rgba(255,255,255,.7)",
      iconFg: MC.danger,
    },
    neutral: {
      bg: MC.card,
      border: MC.line,
      ink: MC.ink,
      iconBg: MC.brandTint,
      iconFg: MC.brandDeep,
    },
  };
  const t = toneToColors[c.tone];

  return (
    <div style={{ padding: "0 16px 14px" }}>
      <div
        style={{
          background: t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: t.iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph
              name={c.glyph}
              size={18}
              color={t.iconFg}
              strokeWidth={2.2}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 14,
                fontWeight: 700,
                color: t.ink,
                letterSpacing: -0.1,
              }}
            >
              {c.title}
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12.5,
                color: t.ink,
                marginTop: 4,
                lineHeight: 1.5,
                opacity: 0.92,
              }}
            >
              {c.body}
            </div>

            {c.iosSteps && c.iosSteps.length > 0 && (
              <ol
                style={{
                  marginTop: 8,
                  paddingLeft: 18,
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: t.ink,
                  lineHeight: 1.55,
                }}
              >
                {c.iosSteps.map((step, i) => (
                  <li key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>
                    {step}
                  </li>
                ))}
              </ol>
            )}

            {/* Test result line — fires after the Test/Grant button
                runs. Greenish for success, muted for "no fix"
                (denied / timed out). Both states keep the card's
                outer tone so the visual hierarchy doesn't jump
                during a single tap. */}
            {testResult && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,.6)",
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: t.ink,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {testResult.ok ? (
                  <>
                    <Glyph
                      name="check"
                      size={13}
                      color={MC.ok}
                      strokeWidth={2.4}
                    />
                    Got your location ·{" "}
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                      }}
                    >
                      {testResult.lat.toFixed(4)},{" "}
                      {testResult.lng.toFixed(4)}
                    </span>
                  </>
                ) : (
                  <>
                    <Glyph
                      name="warn"
                      size={13}
                      color={MC.warn}
                      strokeWidth={2.4}
                    />
                    Couldn&apos;t read your location. Check the
                    permission and try again.
                  </>
                )}
              </div>
            )}

            {c.cta && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (c.cta?.action === "test") void onTest();
                    else void refresh();
                  }}
                  disabled={testing}
                  style={{
                    minHeight: 36,
                    padding: "0 14px",
                    borderRadius: 999,
                    background: c.tone === "ok" ? "#fff" : MC.brandDeep,
                    color: c.tone === "ok" ? MC.brandDeep : "#fff",
                    border:
                      c.tone === "ok"
                        ? `1px solid ${MC.brand}55`
                        : "none",
                    fontFamily: MC.font,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: testing ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {c.cta.label}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
