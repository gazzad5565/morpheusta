import type { CSSProperties } from "react";

/**
 * Square icon-only button used as the per-row "edit" / "trash" affordance
 * across every customer-detail tab. Hand-spec rather than <Btn size="sm">
 * because the per-row context wants tighter padding, transparent
 * background, and no rounded outline — visually a glyph that lights up
 * on hover, not a chunky button.
 */
export const iconBtn: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  cursor: "pointer",
};
