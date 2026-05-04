import * as React from "react";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";

interface Props {
  title?: string;
  breadcrumbs?: string[];
  actions?: React.ReactNode;
  search?: boolean;
}

export function TopBar({ title, breadcrumbs, actions, search = true }: Props) {
  return (
    <div
      style={{
        height: AC.topH,
        flexShrink: 0,
        background: AC.topbar,
        borderBottom: `1px solid ${AC.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {breadcrumbs ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
            }}
          >
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <AGlyph name="chev-r" size={11} color={AC.faint} />}
                <span
                  style={{
                    color: i === breadcrumbs.length - 1 ? AC.ink : AC.mute,
                    fontWeight: i === breadcrumbs.length - 1 ? 600 : 500,
                  }}
                >
                  {b}
                </span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 16,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.3,
            }}
          >
            {title}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {search && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            background: AC.bg,
            border: `1px solid ${AC.line}`,
            borderRadius: 8,
            width: 280,
          }}
        >
          <AGlyph name="search" size={14} color={AC.hint} />
          <input
            placeholder="Search reps, customers, shifts…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.ink,
            }}
          />
          <span
            style={{
              fontFamily: AC.fontMono,
              fontSize: 10.5,
              color: AC.hint,
              border: `1px solid ${AC.line}`,
              padding: "1px 5px",
              borderRadius: 4,
              background: "#fff",
            }}
          >
            ⌘K
          </span>
        </div>
      )}

      <button
        type="button"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "transparent",
          border: `1px solid ${AC.line}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <AGlyph name="bell" size={16} color={AC.ink2} />
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: 99,
            background: AC.danger,
            border: "2px solid #fff",
          }}
        />
      </button>

      {actions}
    </div>
  );
}
