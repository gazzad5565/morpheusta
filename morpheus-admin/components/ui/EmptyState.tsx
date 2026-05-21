import * as React from "react";
import { AC } from "@/lib/tokens";
import { AGlyph, type GlyphName } from "./AGlyph";
import { Btn } from "./Btn";

interface Props {
  icon?: GlyphName;
  title: string;
  hint?: string;
  actionLabel?: string;
  actionIcon?: GlyphName;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  actionIcon = "plus",
  onAction,
}: Props) {
  return (
    <div
      style={{
        padding: "36px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        fontFamily: AC.font,
      }}
    >
      {icon && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: AC.bg,
            border: `1px solid ${AC.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
          }}
        >
          <AGlyph name={icon} size={20} color={AC.hint} />
        </div>
      )}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: AC.ink2,
          letterSpacing: -0.1,
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 12.5,
            color: AC.mute,
            lineHeight: 1.5,
            textAlign: "center",
            maxWidth: 380,
          }}
        >
          {hint}
        </div>
      )}
      {actionLabel && onAction && (
        <div style={{ marginTop: 6 }}>
          <Btn size="sm" kind="primary" icon={actionIcon} onClick={onAction}>
            {actionLabel}
          </Btn>
        </div>
      )}
    </div>
  );
}

export function TabLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        padding: "36px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 99,
          border: `2px solid ${AC.line}`,
          borderTopColor: AC.brand,
          animation: "spin .8s linear infinite",
          display: "inline-block",
        }}
      />
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
