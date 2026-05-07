"use client";

import * as React from "react";
import { AC } from "@/lib/tokens";
import { AGlyph, type GlyphName } from "./AGlyph";

type Kind = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  kind?: Kind;
  size?: "sm" | "md";
  icon?: GlyphName;
  trailingIcon?: GlyphName;
  type?: "button" | "submit" | "reset";
}

export function Btn({
  children,
  kind = "secondary",
  size = "md",
  icon,
  trailingIcon,
  style,
  type = "button",
  ...rest
}: Props) {
  const palette: Record<Kind, { bg: string; ink: string; border: string }> = {
    primary: { bg: AC.brand, ink: "#fff", border: "transparent" },
    secondary: { bg: "#fff", ink: AC.ink, border: AC.line },
    ghost: { bg: "transparent", ink: AC.ink2, border: "transparent" },
    danger: { bg: AC.danger, ink: "#fff", border: "transparent" },
  };
  const p = palette[kind];
  const px = size === "sm" ? "5px 10px" : "7px 13px";
  const fz = size === "sm" ? 12 : 13;
  const isDisabled = !!rest.disabled;

  // Disabled visual: gray-out for primary/danger so the affordance only
  // pops once it's actually usable. Secondary/ghost just dim. Cursor +
  // pointer-events guard against accidental clicks.
  const dStyle = isDisabled
    ? kind === "primary" || kind === "danger"
      ? { background: AC.bg, color: AC.faint, border: `1px solid ${AC.line}` }
      : { color: AC.faint, opacity: 0.65 }
    : null;

  return (
    <button
      type={type}
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: px,
        borderRadius: 8,
        fontFamily: AC.font,
        fontSize: fz,
        fontWeight: 600,
        letterSpacing: -0.1,
        whiteSpace: "nowrap",
        // Base palette → disabled overrides → caller `style` last so
        // page-level overrides still win. All three may set bg/border/
        // color; spreading in this order keeps the precedence
        // unambiguous (and dodges TS's duplicate-key warning).
        background: dStyle?.background ?? p.bg,
        border: dStyle?.border ?? `1px solid ${p.border}`,
        color: dStyle?.color ?? p.ink,
        opacity: dStyle?.opacity,
        cursor: isDisabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {icon && (
        <AGlyph
          name={icon}
          size={fz + 2}
          color={dStyle ? (dStyle.color as string) : p.ink}
        />
      )}
      {children}
      {trailingIcon && (
        <AGlyph
          name={trailingIcon}
          size={fz + 2}
          color={dStyle ? (dStyle.color as string) : p.ink}
        />
      )}
    </button>
  );
}
