import * as React from "react";
import Link from "next/link";
import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";

/**
 * Each breadcrumb segment can be either a plain string (which gets a
 * default href looked up from CRUMB_HREF) or an explicit { label, href }
 * tuple. The last segment never links — it's the current page.
 *
 * Pass `{ label: "Some Name" }` (no href) for a non-clickable segment
 * even if it's not last (e.g. the rep's name in "Home > Reps > Jane Smith").
 */
export type Crumb = string | { label: string; href?: string };

interface Props {
  title?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  search?: boolean;
}

// Default href for known crumb labels. Add new ones here if a route is
// missing — keeps page-level call sites short.
const CRUMB_HREF: Record<string, string> = {
  Home: "/",
  "Live Ops": "/",
  Reps: "/reps",
  Customers: "/customers",
  Schedule: "/schedule",
  "New shift": "/schedule/new",
  Requests: "/requests",
  Tasks: "/tasks",
  "New task": "/tasks/new",
  Reports: "/reports",
  Library: "/library",
  Notifications: "/notify",
  "Audit log": "/audit",
  Settings: "/settings",
};

function resolveCrumb(c: Crumb): { label: string; href: string | null } {
  if (typeof c === "string") {
    return { label: c, href: CRUMB_HREF[c] ?? null };
  }
  return { label: c.label, href: c.href ?? null };
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
            {breadcrumbs.map((raw, i) => {
              const { label, href } = resolveCrumb(raw);
              const isLast = i === breadcrumbs.length - 1;
              const linkable = !isLast && href !== null;
              const content = (
                <span
                  style={{
                    color: isLast ? AC.ink : linkable ? AC.brandDeep : AC.mute,
                    fontWeight: isLast ? 600 : 500,
                    cursor: linkable ? "pointer" : "default",
                  }}
                >
                  {label}
                </span>
              );
              return (
                <React.Fragment key={i}>
                  {i > 0 && <AGlyph name="chev-r" size={11} color={AC.faint} />}
                  {linkable ? (
                    <Link href={href!} style={{ textDecoration: "none" }}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </React.Fragment>
              );
            })}
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
