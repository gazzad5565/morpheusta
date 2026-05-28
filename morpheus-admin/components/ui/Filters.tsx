"use client";

import * as React from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";

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

export interface FilterSelectOption {
  value: string;
  label: string;
}

/**
 * FilterSelect — a <select> styled to sit in the same filter row as
 * FilterChip without looking like a raw browser dropdown (Gary, May 28:
 * "the drop downs look [different from] no shifts today / with shifts
 * today... I like those buttons"). Pill-shaped (radius 99) to match the
 * chip family, same height + font. When a value is chosen it picks up a
 * brand-tinted "active" treatment, mirroring an active chip. The native
 * select arrow is suppressed (appearance:none) and replaced with a
 * brand chevron so it reads as one of our controls, not an OS widget.
 *
 * DESIGN.md §6 documents this as the canonical filter-row dropdown —
 * every list-page categorical filter should use it, not a bare <select>.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  title,
}: {
  value: string;
  onChange: (next: string) => void;
  options: FilterSelectOption[];
  /** Label for the "no filter" option (e.g. "All regions"). Selecting
   *  it clears the filter (empty value). */
  allLabel: string;
  title?: string;
}) {
  const active = value !== "";
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          padding: "6px 30px 6px 12px",
          height: 30,
          borderRadius: 99,
          background: active ? AC.brandSoft : "#fff",
          color: active ? AC.brandInk : AC.ink2,
          border: `1px solid ${active ? AC.brandDeep : AC.line}`,
          fontFamily: AC.font,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: -0.1,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Custom chevron — positioned over the suppressed native arrow.
          pointerEvents:none so clicks still fall through to the select. */}
      <span
        style={{
          position: "absolute",
          right: 9,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          pointerEvents: "none",
        }}
      >
        <AGlyph name="chev-d" size={13} color={active ? AC.brandDeep : AC.mute} />
      </span>
    </div>
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
