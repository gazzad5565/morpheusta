"use client";

/**
 * Modal — canonical backdrop + centered card shell (May 29 review #3).
 *
 * The "fixed inset-0 backdrop + stopPropagation card + Escape-to-close"
 * chrome was hand-rolled in at least three places (EmailUserModal, the
 * Add-user modal on /settings/managers, and LibraryFilePreview). This
 * is the single source of truth: handles the backdrop, centering,
 * click-outside-to-close, Escape, z-index, and an optional
 * scroll-capped card (maxHeight → the card becomes a flex column with
 * its own overflow, so a header stays pinned while the body scrolls).
 *
 * NEW modals should use this (+ <ModalHeader>) rather than re-rolling
 * the chrome. EmailUserModal (portal + close-while-busy guard + aria
 * labelling) and the managers Add-user modal are pre-existing bespoke
 * modals flagged to migrate here incrementally — see their TODOs.
 */

import * as React from "react";
import { useEffect } from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";

export function Modal({
  onClose,
  children,
  maxWidth = 480,
  maxHeight,
  zIndex = 50,
  padding = 16,
  backdrop = "rgba(10,15,30,.45)",
  /** Click on the backdrop closes. Pass false to require an explicit
   *  close action (e.g. while a request is in flight). */
  closeOnBackdrop = true,
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  maxHeight?: number | string;
  zIndex?: number;
  padding?: number;
  backdrop?: string;
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        background: backdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth,
          boxShadow: "0 20px 60px rgba(10,15,30,.3)",
          overflow: "hidden",
          ...(maxHeight
            ? { maxHeight, display: "flex", flexDirection: "column" }
            : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Standard modal header: optional leading node + title + close ✕. */
export function ModalHeader({
  title,
  onClose,
  leading,
}: {
  title: React.ReactNode;
  onClose: () => void;
  leading?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${AC.line}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
    >
      {leading}
      <div
        style={{
          minWidth: 0,
          flex: 1,
          fontFamily: AC.font,
          fontSize: 15,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <AGlyph name="x" size={14} color={AC.mute} />
      </button>
    </div>
  );
}
