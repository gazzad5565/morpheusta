"use client";

/**
 * Global error boundary for the mobile app.
 *
 * Two modes, controlled by a hidden debug toggle:
 *
 *   • Rep mode (default) — clean recovery UI: icon, message, Retry
 *     + Go home buttons. No technical details on screen. The full
 *     error still goes to console.error so a Web Inspector capture
 *     picks it up.
 *
 *   • Debug mode — full error name, message, digest, stack trace,
 *     and a "Copy details" button that puts the whole blob
 *     (stack + URL + user-agent) on the clipboard. Visible only
 *     after the user activates it. Persists in localStorage so
 *     once you flip it on for an investigation, every subsequent
 *     crash auto-shows details until you flip it back.
 *
 * How to activate debug mode without leaking it to real reps:
 *   • Tap the ⚠️ icon at the top of the error screen 5 times. The
 *     panel below reveals + the preference is saved.
 *   • Or, from any browser DevTools console:
 *         localStorage.setItem("morpheus.debug", "1")
 *   • To turn off: tap "Hide debug" inside the revealed panel, or
 *     clear the localStorage key.
 */

import { useEffect, useRef, useState } from "react";
import { MC } from "@/lib/tokens";

const DEBUG_LS_KEY = "morpheus.debug";

function readDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEBUG_LS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDebugFlag(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(DEBUG_LS_KEY, "1");
    else window.localStorage.removeItem(DEBUG_LS_KEY);
  } catch {
    /* private mode / quota — ignore */
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Console-log for Web Inspector / Chrome DevTools capture.
  // Independent of debug mode — always fires.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[mobile global error boundary]", error);
  }, [error]);

  const [debugOn, setDebugOn] = useState<boolean>(false);
  useEffect(() => {
    setDebugOn(readDebugFlag());
  }, []);

  // Hidden 5-tap activator on the warning icon. Counts taps within a
  // 2-second rolling window; resets to zero if the user pauses or
  // taps somewhere else. Picked 5 (not 7+) so it's still humanly
  // doable on iOS Safari where touch latency makes long sequences
  // annoying.
  const tapCountRef = useRef<number>(0);
  const lastTapRef = useRef<number>(0);
  const onIconTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current > 2000) tapCountRef.current = 0;
    lastTapRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= 5) {
      writeDebugFlag(true);
      setDebugOn(true);
      tapCountRef.current = 0;
    }
  };

  const onHideDebug = () => {
    writeDebugFlag(false);
    setDebugOn(false);
  };

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const blob = `${error.name || "Error"}: ${error.message}\n\n${error.stack || ""}\n\nDigest: ${error.digest || "—"}\nURL: ${typeof window !== "undefined" ? window.location.href : "?"}\nUA: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`;
    try {
      await navigator.clipboard.writeText(blob);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — debug pane still shows the text on screen */
    }
  };

  return (
    <div
      style={{
        padding: "32px 20px",
        fontFamily: MC.font,
        color: MC.ink,
        background: MC.bg,
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        textAlign: "center",
        gap: 14,
      }}
    >
      {/* The warning icon is the hidden activator. role="button" +
          tabIndex makes it a real tap target without an underline. */}
      <div
        role="button"
        tabIndex={-1}
        onClick={onIconTap}
        style={{
          fontSize: 44,
          lineHeight: 1,
          marginTop: 24,
          cursor: "pointer",
          userSelect: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-hidden="true"
      >
        ⚠️
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>
        Something went wrong
      </div>
      <div style={{ fontSize: 14, color: MC.mute, maxWidth: 320, lineHeight: 1.45 }}>
        The page hit an error and couldn&apos;t finish loading. Tap Retry, or head back to the home screen.
      </div>
      {error.digest && (
        <div
          style={{
            fontSize: 11,
            color: MC.hint,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            opacity: 0.7,
          }}
        >
          ref: {error.digest}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "11px 20px",
            background: MC.brand,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: `0 6px 18px ${MC.brand}55`,
          }}
        >
          Retry
        </button>
        <a
          href="/"
          style={{
            padding: "11px 20px",
            background: "#fff",
            color: MC.ink,
            border: `1px solid ${MC.line}`,
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Go home
        </a>
      </div>

      {/* Hidden debug pane. Visible only when:
            • localStorage["morpheus.debug"] === "1"  (set via 5-tap
              activator above, or directly from devtools), AND
            • we have something meaningful to show.
          Sits below the main rep UI so it never gets in the way
          when off, and reads as a separate section when on. */}
      {debugOn && (
        <div
          style={{
            marginTop: 24,
            width: "100%",
            maxWidth: 520,
            background: "#fff",
            border: `1px solid ${MC.line}`,
            borderRadius: 10,
            padding: 14,
            textAlign: "left",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
              fontFamily: MC.font,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: MC.brand,
              }}
            >
              Debug mode
            </div>
            <button
              type="button"
              onClick={onHideDebug}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: MC.mute,
                background: "transparent",
                border: `1px solid ${MC.line}`,
                borderRadius: 6,
                padding: "3px 8px",
                cursor: "pointer",
              }}
            >
              Hide debug
            </button>
          </div>
          <div style={{ fontWeight: 700, color: "#9c1a3c", marginBottom: 6 }}>
            {error.name || "Error"}: {error.message || "(no message)"}
          </div>
          {error.digest && (
            <div style={{ color: MC.mute, marginBottom: 6, fontSize: 11 }}>
              digest: {error.digest}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: MC.ink,
              fontSize: 11,
              lineHeight: 1.4,
              maxHeight: 280,
              overflow: "auto",
            }}
          >
            {error.stack || "(no stack available)"}
          </pre>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={onCopy}
              style={{
                padding: "8px 14px",
                background: MC.ink,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: MC.font,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied ✓" : "Copy details"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
