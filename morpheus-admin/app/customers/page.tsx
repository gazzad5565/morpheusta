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
import { listCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

type CustomerSortKey = "name" | "code" | "address" | "status";

// MapLibre needs `window`; load on client only.
const CustomersMap = dynamic(
  () => import("@/components/CustomersMap").then((m) => m.CustomersMap),
  { ssr: false }
);

type StatusFilter = "all" | "active" | "inactive";
type ViewMode = "Grid" | "Table" | "Map";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [view, setView] = useState<ViewMode>("Grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [withAddressOnly, setWithAddressOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<CustomerSortKey>>({
    key: "name",
    dir: "asc",
  });

  useEffect(() => {
    let cancelled = false;
    listCustomers().then((rows) => {
      if (!cancelled) setCustomers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const total = customers?.length ?? 0;
    const active = customers?.filter((c) => c.active !== false).length ?? 0;
    const inactive = customers?.filter((c) => c.active === false).length ?? 0;
    const withAddr =
      customers?.filter((c) => c.latitude != null && c.longitude != null).length ?? 0;
    return { total, active, inactive, withAddr };
  }, [customers]);

  const filtered = useMemo(() => {
    if (!customers) return null;
    let out = customers;
    if (statusFilter === "active") out = out.filter((c) => c.active !== false);
    if (statusFilter === "inactive") out = out.filter((c) => c.active === false);
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
    const sorted = [...out].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return compareBy(a, b, (c) => c.name, sort.dir);
        case "code":
          return compareBy(a, b, (c) => c.code, sort.dir);
        case "address":
          return compareBy(a, b, (c) => c.address, sort.dir);
        case "status":
          return compareBy(a, b, (c) => (c.active === false ? "inactive" : "active"), sort.dir);
      }
    });
    return sorted;
  }, [customers, statusFilter, withAddressOnly, search, sort]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
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
          <GridView customers={filtered} />
        ) : view === "Table" ? (
          <TableView customers={filtered} sort={sort} onSort={setSort} />
        ) : (
          <CustomersMap customers={filtered} />
        )}
      </div>
    </AdminShell>
  );
}

// ─── Views ──────────────────────────────────────────────────────────────

function GridView({ customers }: { customers: Customer[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
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
                }}
              >
                {c.name}
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
  sort,
  onSort,
}: {
  customers: Customer[];
  sort: SortState<CustomerSortKey>;
  onSort: (s: SortState<CustomerSortKey>) => void;
}) {
  return (
    <Card padding={0}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 1fr 1.6fr 90px 90px",
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
        <SortableHeader k="name" sort={sort} onChange={onSort}>
          Name
        </SortableHeader>
        <SortableHeader k="code" sort={sort} onChange={onSort}>
          Code
        </SortableHeader>
        <SortableHeader k="address" sort={sort} onChange={onSort}>
          Address
        </SortableHeader>
        <SortableHeader k="status" sort={sort} onChange={onSort}>
          Status
        </SortableHeader>
        <div></div>
      </div>
      {customers.map((c, i) => (
        <Link
          key={c.id}
          href={`/customers/${c.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.4fr 1fr 1.6fr 90px 90px",
              gap: 14,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: i < customers.length - 1 ? `1px solid ${AC.lineDim}` : "none",
              background: "#fff",
              opacity: c.active === false ? 0.6 : 1,
              cursor: "pointer",
            }}
          >
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
                }}
              >
                {c.name}
              </div>
            </div>
            <div
              style={{
                fontFamily: AC.fontMono,
                fontSize: 12,
                color: AC.ink2,
                fontWeight: 600,
              }}
            >
              {c.code}
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
            <div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 99,
                  fontFamily: AC.font,
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: c.active === false ? AC.bg : AC.okTint,
                  color: c.active === false ? AC.mute : "#0F5A38",
                  border: `1px solid ${c.active === false ? AC.line : AC.okTint}`,
                }}
              >
                ● {c.active === false ? "Inactive" : "Active"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <AGlyph name="chev-r" size={14} color={AC.mute} />
            </div>
          </div>
        </Link>
      ))}
    </Card>
  );
}
