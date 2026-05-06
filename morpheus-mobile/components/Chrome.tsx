"use client";

import * as React from "react";
import { MC } from "@/lib/tokens";
import { Glyph, MorpheusMark, type GlyphName } from "./Glyph";
import { useMenu } from "./MenuShell";

export function AppHeader({
  title,
  onBack,
  withMenu,
  lastSync,
}: {
  title: string;
  onBack?: () => void;
  /**
   * Show the hamburger menu icon. Defaults to true when no onBack is set
   * (left side hamburger), and to false when onBack is set. Pages can pass
   * `withMenu` explicitly to force the menu icon onto the RIGHT side
   * alongside a back button — useful for top-level destinations reached via
   * the side menu (Library, Profile, etc.) so users have both options.
   */
  withMenu?: boolean;
  lastSync?: string;
}) {
  const { setOpen } = useMenu();
  const showLeftBack = !!onBack;
  // Default: show menu when no back button (left side hamburger)
  const wantsMenu = withMenu ?? !onBack;
  const showRightMenu = showLeftBack && wantsMenu;
  const showLeftMenu = !showLeftBack && wantsMenu;
  const onLeftClick = onBack ?? (showLeftMenu ? () => setOpen(true) : undefined);

  return (
    <div
      style={{
        background: MC.header,
        color: MC.headerInk,
        padding: "56px 14px 14px",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 34,
        }}
      >
        <button
          type="button"
          onClick={onLeftClick}
          style={{ ...iconBtnStyle, visibility: onLeftClick ? "visible" : "hidden" }}
          aria-label={showLeftBack ? "Back" : "Menu"}
        >
          <Glyph name={showLeftBack ? "chev-l" : "menu"} size={22} color="#fff" />
        </button>
        <div
          style={{
            fontFamily: MC.font,
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </div>
        {showRightMenu ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={iconBtnStyle}
            aria-label="Menu"
          >
            <Glyph name="menu" size={22} color="#fff" />
          </button>
        ) : (
          // Keep an empty placeholder slot so the title stays centred.
          // The previous "refresh" button was wired to nothing and every
          // page that needs fresh data refetches automatically on mount
          // and on visibilitychange. Removing it.
          <div style={iconBtnStyle} aria-hidden />
        )}
      </div>
      {lastSync && (
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 10.5,
            color: "rgba(255,255,255,.55)",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            position: "absolute",
            right: 16,
            bottom: -18,
          }}
        >
          Last sync · {lastSync}
        </div>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

export function AppFooter() {
  return (
    <div
      style={{
        background: MC.header,
        color: "rgba(255,255,255,.7)",
        padding: "14px 16px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: MC.font,
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}
    >
      <span style={{ opacity: 0.6 }}>Powered by</span>
      <MorpheusMark inverted size={12} />
    </div>
  );
}

type Tone = "brand" | "warn" | "danger" | "ok" | "neutral";

export function StatusChip({
  tone = "brand",
  children,
  icon,
}: {
  tone?: Tone;
  children: React.ReactNode;
  icon?: GlyphName;
}) {
  const tones: Record<Tone, { bg: string; fg: string }> = {
    brand: { bg: MC.brandTint, fg: MC.brandDeep },
    warn: { bg: MC.warnTint, fg: "#8a5d06" },
    danger: { bg: MC.dangerTint, fg: "#9c1a3c" },
    ok: { bg: MC.okTint, fg: "#0d6a45" },
    neutral: { bg: "#EEF0F3", fg: MC.ink2 },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        color: t.fg,
        fontFamily: MC.font,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "4px 9px",
        borderRadius: 999,
      }}
    >
      {icon && <Glyph name={icon} size={12} color={t.fg} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

export function CustomerTile({
  initials,
  color,
  size = 56,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: color,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.2), 0 4px 12px ${color}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: MC.font,
        fontWeight: 700,
        fontSize: size * 0.32,
        letterSpacing: 0.5,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(145deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      <span style={{ position: "relative" }}>{initials}</span>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  icon = "arrow-r",
  disabled = false,
  tone = "brand",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: GlyphName | null;
  disabled?: boolean;
  tone?: "brand" | "ink";
}) {
  const bg = disabled ? "#C9CED4" : tone === "brand" ? MC.brand : MC.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        height: 54,
        borderRadius: 14,
        border: "none",
        background: bg,
        color: "#fff",
        fontFamily: MC.font,
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: -0.1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled
          ? "none"
          : `0 10px 24px ${bg}55, inset 0 1px 0 rgba(255,255,255,.2)`,
        transition: "transform .1s ease",
      }}
    >
      {children}
      {icon && <Glyph name={icon} size={18} color="#fff" strokeWidth={2.2} />}
    </button>
  );
}

export function ReasonChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: selected ? `1.5px solid ${MC.brand}` : `1px solid ${MC.line}`,
        background: selected ? MC.brandTint : "#fff",
        color: selected ? MC.brandInk : MC.ink2,
        padding: "10px 14px",
        borderRadius: 999,
        fontFamily: MC.font,
        fontSize: 13.5,
        fontWeight: selected ? 600 : 500,
        letterSpacing: -0.1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
    >
      {selected && <Glyph name="check" size={13} color={MC.brandDeep} strokeWidth={2.4} />}
      {label}
    </button>
  );
}

export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div
      style={{
        padding: "14px 20px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: MC.font,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: MC.hint,
      }}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          style={{
            background: "#E8EAEE",
            color: MC.mute,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}
