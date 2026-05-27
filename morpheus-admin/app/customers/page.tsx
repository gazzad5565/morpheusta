"use client";

/**
 * Customers — real list with working filters, search, and three views:
 *   - Grid (default): customer cards with real status + counts
 *   - Table: dense row view sortable by name/code
 *   - Map: MapLibre showing every customer with coordinates
 *
 * The previous version had non-functional Active/Tier/Off-site chips and
 * a non-working Grid/Table/Map toggle — all wired up here against the
 * real `customers` table.
 */

import { useEffect, useMemo, useState } from "react";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
import { ListCount } from "@/components/ui/ListCount";
import { useColumnWidths } from "@/lib/use-column-widths";
import { ColumnResizer } from "@/components/ui/ColumnResizer";

// Default column widths for /customers Table view. localStorage takes
// over once the user resizes (key `morpheus.cols.customers-v2.v1`).
// Grid view + Map view don't use these — Grid auto-flows; Map shows pins.
//
// Column order (May 27, late) — Gary's directive:
//   Code | Name | Address | Last visit | Next visit
// Status column dropped (active/inactive flag was rarely scanned in
// table view; live status is more usefully shown via the filter
// chips above). Last + Next visit pair is computed from a parallel
// shift fetch (see ShiftRow aggregation in the page). Key bumped
// from v1 to v2 because the column shape changed — old saved
// widths would land on the wrong columns.
const CUSTOMERS_COLUMNS = [110, 360, 260, 120, 120] as const;
import dynamic from "next/dynamic";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { FilterChip } from "@/components/ui/Filters";
import { AGlyph } from "@/components/ui/AGlyph";
import {
  SortableHeader,
  compareBy,
  type SortState,
} from "@/components/ui/SortableHeader";
import { AC } from "@/lib/tokens";
import {
  listCustomers,
  subscribeCustomers,
  listSeenRepAddedCustomerIds,
} from "@/lib/customers-store";
import { listShiftsInRange } from "@/lib/shifts-store";
import { isoDaysAgo, todayLocalISO, formatDate } from "@/lib/format";
import type { Customer } from "@/lib/types";

type CustomerSortKey =
  | "code"
  | "name"
  | "address"
  | "lastVisit"
  | "nextVisit";

/** Validate a persisted sort key against the current schema. Old
 *  entries that still hold "status" (dropped May 27 when the column
 *  went away) silently fall back to "code". */
function safeCustomerSortKey(v: unknown): CustomerSortKey {
  const allowed: CustomerSortKey[] = [
    "code",
    "name",
    "address",
    "lastVisit",
    "nextVisit",
  ];
  return (allowed as string[]).includes(v as string)
    ? (v as CustomerSortKey)
    : "code";
}

// MapLibre needs `window`; load on client only.
const CustomersMap = dynamic(
  () => import("@/components/CustomersMap").then((m) => m.CustomersMap),
  { ssr: false }
);

type StatusFilter = "all" | "active" | "inactive" | "new";
type ViewMode = "Grid" | "Table" | "Map";

// Window for the "New" filter chip + the "recently added pinned
// to the top of the list" behaviour. 7 days felt about right —
// long enough that a customer added Monday is still surfacing on
// Friday, short enough that the "New" filter isn't a dumping
// ground for months-old entries. Adjust here if managers want a
// different feel.
const NEW_WINDOW_DAYS = 7;
const NEW_WINDOW_MS = NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// localStorage key for /customers UI state — persists across nav so
// going into a customer detail and back doesn't reset the view,
// search, or filters. Bumped via the version suffix if we ever break
// the saved shape so stale state quietly resets instead of crashing.
const LS_KEY = "morpheus.customers_state.v1";

interface PersistedState {
  view?: ViewMode;
  statusFilter?: StatusFilter;
  withAddressOnly?: boolean;
  search?: string;
  sortKey?: CustomerSortKey;
  sortDir?: "asc" | "desc";
}

function readPersisted(): PersistedState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : {};
  } catch {
    return {};
  }
}

export default function CustomersPage() {
  const persisted = useMemo(() => readPersisted(), []);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  // Default = Table now. Managers wanted parity with /tasks (table only)
  // and /reps (table-first). The Grid view + Map view remain accessible
  // via the toggle; the last-used view is remembered across navigation
  // via localStorage below.
  const [view, setView] = useState<ViewMode>(persisted.view ?? "Table");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    persisted.statusFilter ?? "all"
  );
  const [withAddressOnly, setWithAddressOnly] = useState(
    persisted.withAddressOnly ?? false
  );
  const [search, setSearch] = useState(persisted.search ?? "");
  const [sort, setSort] = useState<SortState<CustomerSortKey>>({
    // safe-key gate so "status" left in localStorage from before May 27
    // doesn't break sort.
    key: safeCustomerSortKey(persisted.sortKey),
    dir: persisted.sortDir ?? "asc",
  });
  // Pagination — 0-indexed. Resets to 0 whenever a filter or sort
  // changes. View switching (Grid ↔ Table) preserves the current
  // page so the user keeps context when comparing layouts. The Map
  // view BYPASSES pagination entirely (showing all pins is the
  // whole point of the view — paginating it would hide context).
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, withAddressOnly, search, sort]);

  // Persist any of the above on change. Write is debounced behind
  // React's batching — every update lands on a single tick.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: PersistedState = {
        view,
        statusFilter,
        withAddressOnly,
        search,
        sortKey: sort.key,
        sortDir: sort.dir,
      };
      window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* quota / disabled */
    }
  }, [view, statusFilter, withAddressOnly, search, sort.key, sort.dir]);

  // Per-manager set of rep-added customer ids that this manager has
  // already opened. Used to suppress the "NEW" badge on rows the
  // manager has already acknowledged. Reload alongside the customer
  // list so realtime inserts of new customers AND the manager's own
  // "I've seen this" marker both feed the badge state.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());

  // Last / Next visit per customer (May 27, late — Gary's redesign).
  // Computed from a parallel shift fetch covering 180 days back +
  // 90 days forward — wide enough for a "when did we last visit"
  // glance + the next upcoming shift. Same client-side filter
  // pattern as the customer detail page Shifts tab. Empty defaults
  // to undefined so the column reads "—" not "Invalid Date".
  const [visitsByCustomer, setVisitsByCustomer] = useState<
    Map<string, { lastVisit?: string; nextVisit?: string }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listCustomers().then((rows) => {
        if (!cancelled) setCustomers(rows);
      });
      void listSeenRepAddedCustomerIds().then((s) => {
        if (!cancelled) setSeenIds(s);
      });
      // Shifts in the window — completed shifts inform "Last visit",
      // future scheduled shifts inform "Next visit". 180d back is
      // far enough to surface long-gap customers; 90d forward
      // covers typical scheduling horizons.
      void listShiftsInRange(isoDaysAgo(180), isoDaysAgo(-90)).then(
        (shifts) => {
          if (cancelled) return;
          const today = todayLocalISO();
          const m = new Map<
            string,
            { lastVisit?: string; nextVisit?: string }
          >();
          for (const s of shifts) {
            const cid = s.customer_id;
            const cur = m.get(cid) || {};
            if (s.shift_date < today && s.state === "complete") {
              // Most-recent completed shift wins.
              if (!cur.lastVisit || s.shift_date > cur.lastVisit) {
                cur.lastVisit = s.shift_date;
              }
            } else if (s.shift_date >= today && s.state === "scheduled") {
              // Soonest upcoming scheduled shift wins.
              if (!cur.nextVisit || s.shift_date < cur.nextVisit) {
                cur.nextVisit = s.shift_date;
              }
            }
            m.set(cid, cur);
          }
          setVisitsByCustomer(m);
        }
      );
    };
    load();
    // Refresh on customer CRUD from any tab/manager — INSERT, UPDATE,
    // soft-delete (active flag flip), hard delete. Previously this
    // list was mount-only so two managers working in parallel could
    // see each other's stale view until a tab refresh.
    const unsub = subscribeCustomers(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  /** "NEW" badge gate: rep-added AND not yet seen by this manager. */
  const isNew = (c: Customer): boolean =>
    !!c.createdByRepId && !seenIds.has(c.id);

  /** Recently-added gate: created within the last NEW_WINDOW_DAYS.
   *  Source-agnostic (manager-added counts too — Gary's "I added
   *  this customer, where is it?" mental model). Drives the new
   *  "New" filter chip + the pin-to-top behaviour below. */
  const now = Date.now();
  const isRecentlyAdded = (c: Customer): boolean => {
    if (!c.createdAt) return false;
    const t = Date.parse(c.createdAt);
    if (Number.isNaN(t)) return false;
    return now - t < NEW_WINDOW_MS;
  };

  const counts = useMemo(() => {
    const total = customers?.length ?? 0;
    const active = customers?.filter((c) => c.active !== false).length ?? 0;
    const inactive = customers?.filter((c) => c.active === false).length ?? 0;
    const withAddr =
      customers?.filter((c) => c.latitude != null && c.longitude != null).length ?? 0;
    const recent = customers?.filter(isRecentlyAdded).length ?? 0;
    return { total, active, inactive, withAddr, recent };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const filtered = useMemo(() => {
    if (!customers) return null;
    let out = customers;
    if (statusFilter === "active") out = out.filter((c) => c.active !== false);
    if (statusFilter === "inactive") out = out.filter((c) => c.active === false);
    if (statusFilter === "new") out = out.filter(isRecentlyAdded);
    if (withAddressOnly) out = out.filter((c) => c.latitude != null && c.longitude != null);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toString().toLowerCase().includes(q) ||
          (c.address || "").toLowerCase().includes(q)
      );
    }
    // Sort — only impacts Table view visually, but the order is stable
    // across views so toggling Grid ↔ Table doesn't shuffle cards.
    //
    // Recently-added customers ALWAYS surface at the top regardless
    // of which sort the user picked. Within the "recent" group + the
    // "older" group, the user's chosen sort applies normally. This
    // resolves Gary's "I added a customer and can't see it" feedback
    // without overriding the sort UI affordances.
    const sorted = [...out].sort((a, b) => {
      const aRecent = isRecentlyAdded(a);
      const bRecent = isRecentlyAdded(b);
      if (aRecent !== bRecent) return aRecent ? -1 : 1;
      switch (sort.key) {
        case "name":
          return compareBy(a, b, (c) => c.name, sort.dir);
        case "code":
          return compareBy(a, b, (c) => c.code, sort.dir);
        case "address":
          return compareBy(a, b, (c) => c.address, sort.dir);
        case "lastVisit":
          // Customers with no visit on file sort to the end (asc) /
          // start (desc) — the manager's "find who I haven't seen
          // recently" path is sort.dir=asc.
          return compareBy(
            a,
            b,
            (c) => visitsByCustomer.get(c.id)?.lastVisit || "",
            sort.dir
          );
        case "nextVisit":
          return compareBy(
            a,
            b,
            (c) => visitsByCustomer.get(c.id)?.nextVisit || "",
            sort.dir
          );
      }
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, statusFilter, withAddressOnly, search, sort, visitsByCustomer]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/settings/import/customer" style={{ textDecoration: "none" }}>
            <Btn icon="upload" size="sm">
              Import
            </Btn>
          </Link>
          <Link href="/customers/new" style={{ textDecoration: "none" }}>
            <Btn icon="plus" kind="primary" size="sm">
              Add customer
            </Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Filter row */}
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChip
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· {counts.total}</span>
            </FilterChip>
            <FilterChip
              active={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
            >
              Active · {counts.active}
            </FilterChip>
            <FilterChip
              active={statusFilter === "inactive"}
              onClick={() => setStatusFilter("inactive")}
            >
              Inactive · {counts.inactive}
            </FilterChip>
            <FilterChip
              active={statusFilter === "new"}
              onClick={() => setStatusFilter("new")}
            >
              New · {counts.recent}
            </FilterChip>
            <FilterChip
              active={withAddressOnly}
              onClick={() => setWithAddressOnly((v) => !v)}
            >
              On the map · {counts.withAddr}
            </FilterChip>
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
                width: 220,
              }}
            >
              <AGlyph name="search" size={13} color={AC.hint} />
              <input
                placeholder="Name, code, or address…"
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
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <AGlyph name="x" size={12} color={AC.hint} />
                </button>
              )}
            </div>
            <SegTabs
              tabs={["Grid", "Table", "Map"]}
              active={view}
              onChange={(v) => setView(v as ViewMode)}
            />
          </div>
        </Card>

        {/* Count subtitle — codified in DESIGN.md §8 (gold-standard list
            page). Pagination shows the same number at the bottom; this
            line keeps it reachable without scrolling. */}
        {filtered !== null && (
          <ListCount visible={filtered.length} total={counts.total} noun="customer" />
        )}

        {/* Body */}
        {filtered === null ? (
          <Card padding={32}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading customers…
            </div>
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
              {counts.total === 0 ? (
                <>
                  No customers yet.{" "}
                  <Link
                    href="/customers/new"
                    style={{ color: AC.brandDeep, fontWeight: 600 }}
                  >
                    Add the first one
                  </Link>
                  .
                </>
              ) : (
                "No customers match your filters."
              )}
            </div>
          </Card>
        ) : view === "Grid" ? (
          <>
            <GridView
              customers={filtered.slice(
                page * DEFAULT_PAGE_SIZE,
                (page + 1) * DEFAULT_PAGE_SIZE
              )}
              seenIds={seenIds}
            />
            <Pagination
              totalItems={filtered.length}
              currentPage={page}
              onPageChange={setPage}
            />
          </>
        ) : view === "Table" ? (
          <>
            <TableView
              customers={filtered.slice(
                page * DEFAULT_PAGE_SIZE,
                (page + 1) * DEFAULT_PAGE_SIZE
              )}
              seenIds={seenIds}
              sort={sort}
              onSort={setSort}
              visitsByCustomer={visitsByCustomer}
            />
            <Pagination
              totalItems={filtered.length}
              currentPage={page}
              onPageChange={setPage}
            />
          </>
        ) : (
          // Map view shows every pin in the filtered set, NOT just
          // the current page's slice — paginating a map view would
          // defeat the "see everywhere" affordance. No pagination
          // bar rendered here.
          <CustomersMap customers={filtered} />
        )}
      </div>
    </AdminShell>
  );
}

// ─── Views ──────────────────────────────────────────────────────────────

function GridView({
  customers,
  seenIds,
}: {
  customers: Customer[];
  seenIds: Set<string>;
}) {
  const isNew = (c: Customer) =>
    !!c.createdByRepId && !seenIds.has(c.id);
  return (
    // minmax(0, 1fr) instead of 1fr — `1fr` is `minmax(auto, 1fr)` which
    // lets a cell grow past its share to fit min-content (e.g. an address
    // with whiteSpace:nowrap). Result was the column with the longest
    // address ballooning while the other two squashed. minmax(0, 1fr)
    // forces equal widths regardless of content.
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
      {customers.map((c) => (
        <Link
          key={c.id}
          href={`/customers/${c.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <Card
            padding={0}
            style={{
              overflow: "hidden",
              height: "100%",
              opacity: c.active === false ? 0.55 : 1,
            }}
          >
            <div
              style={{
                height: 64,
                background: `${c.color}18`,
                position: "relative",
              }}
            >
              <div style={{ position: "absolute", left: 16, bottom: -16 }}>
                <CustomerSwatch customer={c} size={44} />
              </div>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: 12,
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: "#fff",
                  color: c.active === false ? AC.mute : AC.ok,
                  fontFamily: AC.font,
                  fontSize: 10.5,
                  fontWeight: 700,
                  border: `1px solid ${AC.line}`,
                }}
              >
                ● {c.active === false ? "Inactive" : "Active"}
              </span>
            </div>
            <div style={{ padding: "24px 16px 14px" }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 14,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.2,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{c.name}</span>
                {isNew(c) && <NewByRepBadge />}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.mute,
                  marginTop: 2,
                }}
              >
                {c.code} · {c.region}
              </div>
              {c.address ? (
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.ink2,
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={c.address}
                >
                  <AGlyph name="pin" size={11} color={AC.mute} />
                  {c.address}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11,
                    color: AC.warn,
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <AGlyph name="warn" size={10} color={AC.warn} />
                  No address set
                </div>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function TableView({
  customers,
  seenIds,
  sort,
  onSort,
  visitsByCustomer,
}: {
  customers: Customer[];
  seenIds: Set<string>;
  sort: SortState<CustomerSortKey>;
  onSort: (s: SortState<CustomerSortKey>) => void;
  visitsByCustomer: Map<string, { lastVisit?: string; nextVisit?: string }>;
}) {
  const isNew = (c: Customer) =>
    !!c.createdByRepId && !seenIds.has(c.id);
  // Hook lives inside TableView since this is its only consumer.
  // Grid view + Map view don't have columns to resize.
  // Key bumped to "customers-v2" (May 27) — column shape changed
  // when Status was dropped and Last/Next visit added; old saved
  // widths would land on the wrong columns.
  const cols = useColumnWidths("customers-v2", CUSTOMERS_COLUMNS);
  const today = todayLocalISO();
  return (
    <Card padding={0} style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols.gridTemplateColumns,
          gap: 14,
          padding: "10px 16px",
          background: AC.bg,
          borderBottom: `1px solid ${AC.line}`,
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        <div style={{ position: "relative" }}>
          <SortableHeader k="code" sort={sort} onChange={onSort}>
            Code
          </SortableHeader>
          <ColumnResizer index={0} cols={cols} />
        </div>
        <div style={{ position: "relative" }}>
          <SortableHeader k="name" sort={sort} onChange={onSort}>
            Name
          </SortableHeader>
          <ColumnResizer index={1} cols={cols} />
        </div>
        <div style={{ position: "relative" }}>
          <SortableHeader k="address" sort={sort} onChange={onSort}>
            Address
          </SortableHeader>
          <ColumnResizer index={2} cols={cols} />
        </div>
        <div style={{ position: "relative" }}>
          <SortableHeader k="lastVisit" sort={sort} onChange={onSort}>
            Last visit
          </SortableHeader>
          <ColumnResizer index={3} cols={cols} />
        </div>
        <SortableHeader k="nextVisit" sort={sort} onChange={onSort}>
          Next visit
        </SortableHeader>
      </div>
      {customers.map((c, i) => {
        const v = visitsByCustomer.get(c.id);
        return (
          <Link
            key={c.id}
            href={`/customers/${c.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: cols.gridTemplateColumns,
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < customers.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                background: "#fff",
                opacity: c.active === false ? 0.6 : 1,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 12,
                  color: AC.ink2,
                  fontWeight: 700,
                }}
              >
                #{c.code}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <CustomerSwatch customer={c} size={28} />
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                  {isNew(c) && <NewByRepBadge />}
                </div>
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: c.address ? AC.ink2 : AC.mute,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={c.address || ""}
              >
                {c.address || "—"}
              </div>
              <VisitCell date={v?.lastVisit} today={today} kind="past" />
              <VisitCell date={v?.nextVisit} today={today} kind="future" />
            </div>
          </Link>
        );
      })}
    </Card>
  );
}

/**
 * VisitCell — renders a date as either "Today", "3d ago", "in 5d",
 * or `formatDate(date)` for older / further-out values. Faint dash
 * when no date is known. Tone goes amber when a customer hasn't
 * been visited in 30+ days — surfaces stale relationships at a
 * scan-glance.
 */
function VisitCell({
  date,
  today,
  kind,
}: {
  date: string | undefined;
  today: string;
  kind: "past" | "future";
}) {
  if (!date) {
    return (
      <span
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.faint,
        }}
      >
        —
      </span>
    );
  }
  // Day-diff: positive = future, negative = past, 0 = today. Build
  // from the ISO strings to avoid timezone drift.
  const dayMs = 24 * 60 * 60 * 1000;
  const t = Date.parse(date + "T00:00:00");
  const t0 = Date.parse(today + "T00:00:00");
  const days = Math.round((t - t0) / dayMs);
  let label: string;
  let tone: string = AC.ink2;
  if (days === 0) {
    label = "Today";
    tone = AC.brandDeep;
  } else if (kind === "past") {
    const ago = -days;
    label = ago === 1 ? "Yesterday" : ago < 30 ? `${ago}d ago` : formatDate(date);
    // Stale customer warning — amber after a month without a visit.
    if (ago >= 30) tone = AC.warn;
  } else {
    label =
      days === 1 ? "Tomorrow" : days < 30 ? `in ${days}d` : formatDate(date);
  }
  return (
    <span
      style={{
        fontFamily: AC.font,
        fontSize: 12,
        color: tone,
        fontWeight: days === 0 ? 700 : 500,
      }}
      title={date}
    >
      {label}
    </span>
  );
}

/** Small "NEW" pill rendered next to a customer name on the list
 *  when:
 *    - The row was created by a rep (created_by_rep_id IS NOT NULL)
 *    - AND the current manager has not yet opened its detail page
 *
 *  Clears for THIS manager when they open the detail page
 *  (markCustomerSeen() is called on /customers/[id] mount). Other
 *  managers still see the badge until each of them opens it. */
function NewByRepBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 999,
        background: AC.brand,
        color: "#fff",
        fontFamily: AC.font,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        flexShrink: 0,
        boxShadow: `0 1px 3px ${AC.brand}55`,
      }}
      title="Added by a rep on the mobile app — open the customer's detail page to dismiss this badge"
    >
      New
    </span>
  );
}
