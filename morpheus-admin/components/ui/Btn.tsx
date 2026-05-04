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
        background: p.bg,
        color: p.ink,
        border: `1px solid ${p.border}`,
        fontFamily: AC.font,
        fontSize: fz,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon && <AGlyph name={icon} size={fz + 2} color={p.ink} />}
      {children}
      {trailingIcon && <AGlyph name={trailingIcon} size={fz + 2} color={p.ink} />}
    </button>
  );
}
