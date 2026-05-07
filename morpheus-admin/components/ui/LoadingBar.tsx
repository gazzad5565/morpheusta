"use client";

/**
 * LoadingBar — thin animated cyan bar pinned to the top of the
 * AdminShell content area. The clearest universal "yes, the page
 * is fetching" cue: tiny enough to ignore, obvious enough to spot.
 *
 * Pages opt in by rendering it conditionally:
 *
 *   {loading && <LoadingBar />}
 *
 * The bar uses a CSS animation that loops left-to-right indefinitely;
 * no JS timer or setInterval, so it's free.
 *
 * Spinner — small inline glyph for places where a bar would be lost
 * in the layout (inside cards, next to text). Same style language.
 */

import { CSSProperties } from "react";
import { AC } from "@/lib/tokens";

export function LoadingBar({ style }: { style?: CSSProperties }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "transparent",
        overflow: "hidden",
        zIndex: 200,
        pointerEvents: "none",
        ...style,
      }}
    >
      <div
        style={{
          width: "30%",
          height: "100%",
          background: `linear-gradient(90deg, transparent, ${AC.brand}, ${AC.brandDeep}, ${AC.brand}, transparent)`,
          borderRadius: 99,
          animation: "ac-loadbar 1.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes ac-loadbar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(220%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  const c = color ?? AC.brand;
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${c}33`,
        borderTopColor: c,
        borderRadius: "50%",
        animation: "ac-spin .8s linear infinite",
        flexShrink: 0,
      }}
    >
      <style>{`
        @keyframes ac-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}

/** Skeleton block — pulsing grey rectangle as a content placeholder. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${AC.bg} 0%, ${AC.lineDim} 50%, ${AC.bg} 100%)`,
        backgroundSize: "200% 100%",
        animation: "ac-skel 1.4s ease-in-out infinite",
        ...style,
      }}
    >
      <style>{`
        @keyframes ac-skel {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </span>
  );
}
