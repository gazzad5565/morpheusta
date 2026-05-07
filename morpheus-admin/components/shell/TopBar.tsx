"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { listCustomers } from "@/lib/customers-store";
import { listAllTasks, type TaskRow } from "@/lib/tasks-store";
import { SaveIndicator } from "@/components/ui/SaveIndicator";
import type { Customer } from "@/lib/types";

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
  Settings: "/settings",
  Users: "/settings/managers",
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

      {/* Global save status — every page sees the same pill so the user
          never has to guess whether their change actually landed. */}
      <SaveIndicator />

      {search && <SearchBox />}

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

// ─── Search ──────────────────────────────────────────────────────────────

interface ResultItem {
  kind: "rep" | "manager" | "customer" | "task";
  id: string;
  label: string;
  sublabel: string;
  href: string;
  glyph: GlyphName;
}

const MAX_PER_GROUP = 5;

function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Hydrate the searchable corpus once on mount. For now we filter
  // client-side — fine up to a few thousand rows, swap to PostgREST
  // text search if it ever stops feeling instant.
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles(), listCustomers(), listAllTasks()]).then(
      ([ps, cs, ts]) => {
        if (cancelled) return;
        setProfiles(ps);
        setCustomers(cs);
        setTasks(ts);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Cmd+K / Ctrl+K focuses the search input from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside closes the dropdown.
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = React.useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: ResultItem[] = [];

    // Reps
    const repHits = profiles
      .filter((p) => p.role === "rep")
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP)
      .map<ResultItem>((p) => ({
        kind: "rep",
        id: p.id,
        label: displayName(p),
        sublabel: p.email,
        href: `/reps/${p.id}`,
        glyph: "reps",
      }));
    out.push(...repHits);

    // Managers (separate so they're visually distinct)
    const mgrHits = profiles
      .filter((p) => p.role === "manager")
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP)
      .map<ResultItem>((p) => ({
        kind: "manager",
        id: p.id,
        label: displayName(p),
        sublabel: `Manager · ${p.email}`,
        href: `/settings/managers/${p.id}/edit`,
        glyph: "settings",
      }));
    out.push(...mgrHits);

    // Customers
    const custHits = customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          String(c.code).includes(q) ||
          (c.address || "").toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP)
      .map<ResultItem>((c) => ({
        kind: "customer",
        id: c.id,
        label: c.name,
        sublabel: `#${c.code}${c.address ? ` · ${c.address}` : ""}`,
        href: `/customers/${c.id}`,
        glyph: "customer",
      }));
    out.push(...custHits);

    // Tasks
    const taskHits = tasks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP)
      .map<ResultItem>((t) => ({
        kind: "task",
        id: t.id,
        label: t.name,
        sublabel: t.customers?.name
          ? `Task · ${t.customers.name}`
          : "Task · all customers",
        href: `/tasks/${t.id}/edit`,
        glyph: "tasks",
      }));
    out.push(...taskHits);

    return out;
  }, [query, profiles, customers, tasks]);

  // Reset the keyboard cursor whenever the result set changes.
  React.useEffect(() => {
    setActiveIdx(0);
  }, [query, results.length]);

  const go = (item: ResultItem) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) go(item);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          background: AC.bg,
          border: `1px solid ${showDropdown ? AC.brand : AC.line}`,
          borderRadius: 8,
          width: 320,
          transition: "border-color .15s ease",
        }}
      >
        <AGlyph name="search" size={14} color={AC.hint} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search reps, customers, tasks…"
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

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 420,
            maxHeight: 480,
            overflowY: "auto",
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(10,15,30,.12)",
            zIndex: 50,
            padding: 6,
          }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: "16px 12px",
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              No matches for <b style={{ color: AC.ink2 }}>{query}</b>.
            </div>
          ) : (
            <SearchResults
              results={results}
              activeIdx={activeIdx}
              onPick={go}
              onHover={setActiveIdx}
            />
          )}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<ResultItem["kind"], string> = {
  rep: "Reps",
  manager: "Managers",
  customer: "Customers",
  task: "Tasks",
};

function SearchResults({
  results,
  activeIdx,
  onPick,
  onHover,
}: {
  results: ResultItem[];
  activeIdx: number;
  onPick: (r: ResultItem) => void;
  onHover: (i: number) => void;
}) {
  // Group the flat list back into buckets, preserving each item's
  // overall index so keyboard nav still works across groups.
  const groups: { kind: ResultItem["kind"]; items: { item: ResultItem; idx: number }[] }[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    let g = groups.find((x) => x.kind === r.kind);
    if (!g) {
      g = { kind: r.kind, items: [] };
      groups.push(g);
    }
    g.items.push({ item: r, idx: i });
  }
  return (
    <>
      {groups.map((g, gi) => (
        <div key={g.kind}>
          <div
            style={{
              padding: "6px 10px 4px",
              marginTop: gi === 0 ? 0 : 4,
              fontFamily: AC.font,
              fontSize: 10,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {KIND_LABEL[g.kind]}
          </div>
          {g.items.map(({ item, idx }) => {
            const active = idx === activeIdx;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick(item)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: active ? AC.brandSoft : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: active ? "#fff" : AC.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AGlyph name={item.glyph} size={14} color={active ? AC.brandDeep : AC.mute} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13,
                      fontWeight: 600,
                      color: AC.ink,
                      letterSpacing: -0.1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      marginTop: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.sublabel}
                  </div>
                </div>
                {active && (
                  <span
                    style={{
                      fontFamily: AC.fontMono,
                      fontSize: 10,
                      color: AC.brandDeep,
                      fontWeight: 700,
                    }}
                  >
                    ↵
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
