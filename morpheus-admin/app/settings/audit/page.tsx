"use client";

/**
 * /settings/audit — the admin Activity / Audit log (Mariska G1 +
 * Rayhaan R1 + the broader half of Keagan K6).
 *
 * Every meaningful action across the app already writes a row to
 * shift_events via logEvent() (lib/events-store.ts) — this page is
 * the browse surface: who did what, when, filterable by category,
 * date window, and free text.
 *
 * Client-side filtering over a recent window (matches the rest of the
 * admin — see "Client-side pagination" in DESIGN.md). If event volume
 * outgrows the window, swap to server-side range + filters.
 *
 * Gated by canManageSettings — same as Roles & permissions, since the
 * audit trail is sensitive.
 */

import { useEffect, useMemo, useState } from "react";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { RequireCapability } from "@/components/ui/RequireCapability";
import { Card } from "@/components/ui/Card";
import { FilterChip } from "@/components/ui/Filters";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
import { ListCount } from "@/components/ui/ListCount";
import { PageLoading } from "@/components/ui/PageLoading";
import { AC } from "@/lib/tokens";
import { listRecentEvents, type ShiftEvent } from "@/lib/events-store";
import { formatRelative, isoDaysAgo } from "@/lib/format";

// How many recent events to pull for the client-side view. Generous
// for current scale; revisit with server-side paging if it grows.
const AUDIT_WINDOW = 1000;

type CategoryKey =
  | "all"
  | "shift"
  | "request"
  | "customer"
  | "library"
  | "task"
  | "import";

const CATEGORY_LABEL: Record<Exclude<CategoryKey, "all">, string> = {
  shift: "Shifts",
  request: "Requests",
  customer: "Customers",
  library: "Library",
  task: "Tasks",
  import: "Imports",
};

const CATEGORY_GLYPH: Record<Exclude<CategoryKey, "all">, GlyphName> = {
  shift: "cal",
  request: "clock",
  customer: "customer",
  library: "lib",
  task: "tasks",
  import: "upload",
};

type DateKey = "today" | "7d" | "30d" | "all";
const DATE_LABEL: Record<DateKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

/** "customer.site_updated" → category "customer". */
function categoryOf(t: string): Exclude<CategoryKey, "all"> {
  const head = t.split(".")[0];
  if (head === "shift" || head === "request" || head === "customer" || head === "library" || head === "task" || head === "import") {
    return head;
  }
  return "shift";
}

/** "customer.site_updated" → "Site updated". The category chip
 *  carries the prefix, so the label only needs the action half. */
function humanizeEvent(t: string): string {
  const tail = t.includes(".") ? t.slice(t.indexOf(".") + 1) : t;
  const words = tail.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function AuditLogPage() {
  return (
    <SettingsShell
      section="audit"
      title="Audit log"
      description="Who changed what, and when — across shifts, customers, library, tasks, and imports. Filter by category, date, or search."
    >
      <RequireCapability cap="canManageSettings" action="view the audit log">
        <AuditContent />
      </RequireCapability>
    </SettingsShell>
  );
}

function AuditContent() {
  const [events, setEvents] = useState<ShiftEvent[] | null>(null);
  const [category, setCategory] = useState<CategoryKey>("all");
  const [dateFilter, setDateFilter] = useState<DateKey>("30d");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listRecentEvents(AUDIT_WINDOW).then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [category, dateFilter, search]);

  const counts = useMemo(() => {
    const total = events?.length ?? 0;
    const byCat: Record<string, number> = {};
    for (const e of events ?? []) {
      const c = categoryOf(e.event_type);
      byCat[c] = (byCat[c] ?? 0) + 1;
    }
    return { total, byCat };
  }, [events]);

  const filtered = useMemo(() => {
    if (!events) return null;
    let out = events;
    if (category !== "all") {
      out = out.filter((e) => categoryOf(e.event_type) === category);
    }
    if (dateFilter !== "all") {
      const days = dateFilter === "today" ? 0 : dateFilter === "7d" ? 7 : 30;
      const cutoff = isoDaysAgo(days); // YYYY-MM-DD; ISO created_at compares lexically
      out = out.filter((e) => (e.created_at || "") >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (e) =>
          (e.actor_label || "").toLowerCase().includes(q) ||
          (e.message || "").toLowerCase().includes(q) ||
          humanizeEvent(e.event_type).toLowerCase().includes(q) ||
          e.event_type.toLowerCase().includes(q)
      );
    }
    return out;
  }, [events, category, dateFilter, search]);

  const pageItems = filtered
    ? filtered.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE)
    : [];

  const CATEGORIES: CategoryKey[] = [
    "all",
    "shift",
    "customer",
    "library",
    "task",
    "import",
    "request",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter row */}
      <Card padding={12}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? (
                <>All <span style={{ color: AC.mute, fontWeight: 500 }}>· {counts.total}</span></>
              ) : (
                <>
                  {CATEGORY_LABEL[c]}
                  {counts.byCat[c] ? ` · ${counts.byCat[c]}` : ""}
                </>
              )}
            </FilterChip>
          ))}
          <div style={{ width: 1, height: 20, background: AC.line, margin: "0 2px" }} />
          {(Object.keys(DATE_LABEL) as DateKey[]).map((d) => (
            <FilterChip
              key={d}
              active={dateFilter === d}
              onClick={() => setDateFilter(d)}
            >
              {DATE_LABEL[d]}
            </FilterChip>
          ))}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              background: AC.bg,
              border: `1px solid ${AC.line}`,
              borderRadius: 8,
              width: 240,
            }}
          >
            <AGlyph name="search" size={13} color={AC.hint} />
            <input
              placeholder="Who, what, or detail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
          </div>
        </div>
      </Card>

      {filtered !== null && (
        <ListCount visible={filtered.length} total={counts.total} noun="event" />
      )}

      {/* Body */}
      {filtered === null ? (
        <Card padding={0}>
          <PageLoading label="Loading audit log…" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding={36}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.mute,
              textAlign: "center",
            }}
          >
            {counts.total === 0
              ? "No activity recorded yet."
              : "No events match these filters."}
          </div>
        </Card>
      ) : (
        <>
          <Card padding={0} style={{ overflow: "hidden" }}>
            {pageItems.map((e, i) => (
              <AuditRow key={e.id} event={e} isLast={i === pageItems.length - 1} />
            ))}
          </Card>
          <Pagination
            totalItems={filtered.length}
            currentPage={page}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function AuditRow({ event, isLast }: { event: ShiftEvent; isLast: boolean }) {
  const cat = categoryOf(event.event_type);
  const absolute = (() => {
    try {
      return new Date(event.created_at).toLocaleString();
    } catch {
      return event.created_at;
    }
  })();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 160px 1fr 120px",
        gap: 14,
        alignItems: "center",
        padding: "11px 16px",
        borderBottom: isLast ? "none" : `1px solid ${AC.lineDim}`,
        background: "#fff",
      }}
    >
      {/* Event — category chip + humanized action */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: AC.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title={CATEGORY_LABEL[cat]}
        >
          <AGlyph name={CATEGORY_GLYPH[cat]} size={12} color={AC.mute} />
        </span>
        <span
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 600,
            color: AC.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {humanizeEvent(event.event_type)}
        </span>
      </div>

      {/* Who */}
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.ink2,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={event.actor_label ?? "System"}
      >
        {event.actor_label ?? <span style={{ color: AC.mute }}>System</span>}
      </div>

      {/* Detail */}
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.mute,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={event.message ?? ""}
      >
        {event.message ?? "—"}
      </div>

      {/* When */}
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          textAlign: "right",
        }}
        title={absolute}
      >
        {formatRelative(event.created_at, " ago")}
      </div>
    </div>
  );
}
