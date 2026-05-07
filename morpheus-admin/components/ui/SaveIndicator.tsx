"use client";

/**
 * Top-bar "Saved" pill. Subscribes to the global save-status bus and
 * fades in/out as mutations land. Lives in TopBar so it shows on every
 * admin page automatically — no per-page wiring needed.
 */

import { useEffect, useState } from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";
import {
  getSaveStatus,
  subscribeSaveStatus,
  type SaveSnapshot,
} from "@/lib/save-status";

const SAVED_FADE_MS = 3500;
const ERROR_TTL_MS = 12_000; // long enough to read, but not forever

export function SaveIndicator() {
  const [snap, setSnap] = useState<SaveSnapshot>(() => getSaveStatus());
  const [, force] = useState(0);

  useEffect(() => subscribeSaveStatus(setSnap), []);

  // Drive a periodic re-render so we can fade the "saved" pill once
  // SAVED_FADE_MS has elapsed since the last snapshot — without this the
  // pill would stay stuck on "Saved" forever after one mutation.
  useEffect(() => {
    if (snap.status !== "saved" && snap.status !== "error") return;
    const t = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [snap.status, snap.at]);

  // Resolve effective state based on age of the snapshot.
  const ageMs = Date.now() - snap.at;
  let effective: "idle" | "saving" | "saved" | "error" = snap.status;
  if (snap.status === "saved" && ageMs > SAVED_FADE_MS) effective = "idle";
  if (snap.status === "error" && ageMs > ERROR_TTL_MS) effective = "idle";

  // Idle: render nothing. The previous "Auto-saved" pill was actively
  // misleading — many pages still require explicit Save buttons (any
  // form-based editor, the org settings, the schedule create form,
  // etc.) so claiming "auto-saved" while the user has unsaved typing
  // in front of them was wrong. We now only surface feedback during
  // and just after a real mutation.
  if (effective === "idle") return null;

  if (effective === "saving") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 99,
          background: AC.bg,
          color: AC.ink2,
          fontFamily: AC.font,
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: 0.1,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            border: `2px solid ${AC.line}`,
            borderTopColor: AC.brand,
            animation: "save-spin 0.8s linear infinite",
            display: "inline-block",
          }}
        />
        {snap.label ? `Saving ${snap.label}…` : "Saving…"}
        <style>{`@keyframes save-spin{to{transform:rotate(360deg)}}`}</style>
      </span>
    );
  }

  if (effective === "saved") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 99,
          background: AC.okTint,
          color: "#0F5A38",
          fontFamily: AC.font,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          animation: "save-pop .25s cubic-bezier(.22, 1, .36, 1) both",
        }}
      >
        <AGlyph name="check" size={12} color="#0F5A38" />
        Saved
        <style>{`
          @keyframes save-pop {
            0%   { transform: scale(.86); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </span>
    );
  }

  // error
  return (
    <span
      title={snap.error || "Save failed"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 99,
        background: AC.dangerTint,
        color: "#9c1a3c",
        fontFamily: AC.font,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.2,
        maxWidth: 260,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <AGlyph name="warn" size={12} color="#9c1a3c" />
      Couldn&apos;t save{snap.error ? `: ${snap.error}` : ""}
    </span>
  );
}
