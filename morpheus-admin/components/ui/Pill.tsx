import type { CSSProperties, ReactNode } from "react";
import { AC } from "@/lib/tokens";

/**
 * Tiny rounded badge used across the admin UI for status chips, counts,
 * and role labels. Two visual variants:
 *   - "solid"   — filled background, no border (default; status chips,
 *                 KPI counts on the customer header card)
 *   - "outline" — neutral background with a hairline border (role
 *                 labels, "Inactive" markers, anywhere the pill sits
 *                 inside a busy row and needs a subtle outline)
 */
export function Pill({
  children,
  bg,
  fg,
  variant = "solid",
  uppercase,
  style,
}: {
  children: ReactNode;
  bg?: string;
  fg?: string;
  variant?: "solid" | "outline";
  uppercase?: boolean;
  style?: CSSProperties;
}) {
  const isOutline = variant === "outline";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: isOutline ? "1px 7px" : "3px 9px",
        borderRadius: 99,
        background: bg ?? (isOutline ? AC.bg : AC.bg),
        color: fg ?? (isOutline ? AC.mute : AC.ink2),
        border: isOutline ? `1px solid ${AC.line}` : "none",
        fontFamily: AC.font,
        fontSize: isOutline ? 10.5 : 11,
        fontWeight: isOutline ? 600 : 700,
        letterSpacing: uppercase ? 0.5 : undefined,
        textTransform: uppercase ? "uppercase" : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
