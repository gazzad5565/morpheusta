"use client";

/**
 * PageLoading — the one shared "this page is loading" treatment.
 *
 * Gary (May 28): a list page people open every day shouldn't show a
 * bare "Loading…" — give it something quick, classy, on-brand (the
 * Morpheus / Matrix cyan), but NOT in your face. Edit it HERE and
 * every list page's loading state updates.
 *
 * The mark: a slim indeterminate "scan" bar — a brand-cyan segment
 * sweeping across a faint track — under a small monospace, letter-
 * spaced label (a quiet nod to the Matrix terminal aesthetic). Calm,
 * fast, unmistakably "loading", gone before it can annoy.
 *
 * Usage: drop in place of a page's loading text. Works standalone or
 * inside an existing Card.
 *
 *   {loading ? <PageLoading label="Loading customers…" /> : <List/>}
 */

import { AC } from "@/lib/tokens";

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "48px 24px",
      }}
    >
      {/* Indeterminate scan bar — brand-cyan segment sweeping a faint
          track. Keyframes scoped via the unique animation name so
          this never collides with other on-page animations. */}
      <div
        style={{
          position: "relative",
          width: 132,
          height: 3,
          borderRadius: 99,
          background: AC.line,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 44,
            borderRadius: 99,
            background: `linear-gradient(90deg, transparent, ${AC.brand}, transparent)`,
            animation: "morpheus-scan 1.15s ease-in-out infinite",
          }}
        />
      </div>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: AC.mute,
          animation: "morpheus-scan-pulse 1.6s ease-in-out infinite",
        }}
      >
        {label}
      </div>
      <style>{`
        @keyframes morpheus-scan {
          0%   { transform: translateX(-46px); }
          100% { transform: translateX(132px); }
        }
        @keyframes morpheus-scan-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
