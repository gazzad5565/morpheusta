"use client";

/**
 * Global error boundary for the mobile app.
 *
 * Next.js shows a minimal "This page couldn't load" UI when a page
 * throws during render — useful for production, useless for
 * debugging. This boundary surfaces the actual error message + the
 * stack so a rep (or a debugging session) can read what went wrong
 * and either Retry or copy-paste the details somewhere helpful.
 *
 * Keep it tiny + dependency-free — if this component itself throws,
 * Next falls back to its own boundary and we get into an infinite
 * "couldn't load" loop.
 *
 * Should be made less verbose once the underlying issue is fixed —
 * full stack traces in front of real reps is debug-only behaviour.
 */

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log to the console so it shows up in Safari Web Inspector / Chrome DevTools.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[mobile global error boundary]", error);
  }, [error]);

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const blob = `${error.name || "Error"}: ${error.message}\n\n${error.stack || ""}\n\nDigest: ${error.digest || "—"}\nURL: ${typeof window !== "undefined" ? window.location.href : "?"}\nUA: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`;
    try {
      await navigator.clipboard.writeText(blob);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — leave the on-screen text visible */
    }
  };

  return (
    <div
      style={{
        padding: "24px 18px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1A1F26",
        background: "#F4F5F7",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        Something went wrong on this page
      </div>
      <div style={{ fontSize: 14, color: "#54616D", marginBottom: 18, lineHeight: 1.45 }}>
        Showing the technical details below so we can fix it. Tap <strong>Copy details</strong> and send them to Gary / Claude.
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E8EC",
          borderRadius: 10,
          padding: 14,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          color: "#9C1A3C",
          marginBottom: 14,
          wordBreak: "break-word",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {error.name || "Error"}: {error.message || "(no message)"}
        </div>
        {error.digest && (
          <div style={{ color: "#5C6571", marginBottom: 6 }}>
            digest: {error.digest}
          </div>
        )}
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            color: "#1A1F26",
            fontSize: 11,
            lineHeight: 1.4,
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {error.stack || "(no stack available)"}
        </pre>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCopy}
          style={{
            padding: "11px 18px",
            background: "#1A1F26",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? "Copied ✓" : "Copy details"}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "11px 18px",
            background: "#fff",
            color: "#1A1F26",
            border: "1px solid #D5D9DE",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "11px 18px",
            background: "#fff",
            color: "#1A1F26",
            border: "1px solid #D5D9DE",
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
