"use client";

/**
 * Global error boundary for the mobile app.
 *
 * Catches any uncaught render-time error and shows a recovery UI
 * instead of Next.js's bare "This page couldn't load" fallback.
 * Logs the full error to the console for Web Inspector capture.
 *
 * Was briefly verbose (full stack trace + Copy details button)
 * during the May 14 React-error-#310 hunt on /active. Now trimmed
 * back to a clean rep-facing UI; the stack still goes to the
 * console for debugging, just not on-screen.
 */

import { useEffect } from "react";
import { MC } from "@/lib/tokens";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[mobile global error boundary]", error);
  }, [error]);

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
        justifyContent: "center",
        textAlign: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          fontSize: 44,
          lineHeight: 1,
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
    </div>
  );
}
