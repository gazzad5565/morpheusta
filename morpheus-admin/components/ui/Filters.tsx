"use client";

import * as React from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "./AGlyph";

export function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 99,
        background: active ? AC.ink : "#fff",
        color: active ? "#fff" : AC.ink2,
        border: `1px solid ${active ? AC.ink : AC.line}`,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function FilterDropdown({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      style={{
        padding: "6px 11px",
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${AC.line}`,
        color: AC.ink2,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
    >
      <span style={{ color: AC.mute, fontWeight: 500 }}>{label}:</span> {value}
      <AGlyph name="chev-d" size={11} color={AC.mute} />
    </button>
  );
}

export const CB: React.CSSProperties = { width: 14, height: 14, accentColor: AC.brand };

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: `1px solid ${AC.line}`,
  fontFamily: AC.font,
  fontSize: 13,
  color: AC.ink,
  outline: "none",
  background: "#fff",
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 10,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 15,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.3,
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
