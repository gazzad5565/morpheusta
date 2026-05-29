"use client";

/**
 * Shared presentational primitives for the "scope picker" family —
 * CustomerScopePicker + RepScopePicker. These three helpers were
 * previously copy-pasted, byte-for-byte, into BOTH pickers; extracted
 * here (May 29 review) so the All/Specific button, the empty-state
 * line, and the link-button style have a single source of truth.
 *
 * Pure presentational — no behaviour change. If a third "pick a scope"
 * surface ever appears, it imports these instead of re-rolling them.
 */

import * as React from "react";
import { AC } from "@/lib/tokens";

/** The big "All … / Specific …" toggle button at the top of a picker. */
export function ScopeButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? AC.brandSoft : "#fff",
        border: `1px solid ${active ? AC.brand : AC.line}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 600,
          color: active ? AC.brandInk : AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: active ? AC.brandDeep : AC.mute,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </button>
  );
}

/** Centered muted line shown inside the list area when there's nothing
 *  to show / nothing matches a search. */
export function ScopeEmpty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 14,
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.mute,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

/** Inline "Select all / Clear" text-button style used in the list header. */
export const scopeLinkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: AC.font,
  fontSize: 11,
  color: AC.brandDeep,
  fontWeight: 600,
  padding: "2px 4px",
};
