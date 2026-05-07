"use client";

/**
 * Loading primitives for the rep app — same idea as the admin's
 * LoadingBar / Spinner / Skeleton. Lightweight, no extra deps.
 *
 *   {loading && <LoadingBar />}     ← thin top-of-page cyan bar
 *   <Spinner size={16} />            ← inline circular spinner
 *   <Skeleton height={20} />          ← pulsing placeholder block
 */

import type { CSSProperties } from "react";
import { MC } from "@/lib/tokens";

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
          background: `linear-gradient(90deg, transparent, ${MC.brand}, ${MC.brandDeep}, ${MC.brand}, transparent)`,
          borderRadius: 99,
          animation: "mc-loadbar 1.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes mc-loadbar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(220%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  const c = color ?? MC.brand;
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
        animation: "mc-spin .8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

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
        background: `linear-gradient(90deg, ${MC.bg} 0%, ${MC.line} 50%, ${MC.bg} 100%)`,
        backgroundSize: "200% 100%",
        animation: "mc-skel 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
