"use client";

/**
 * /reps — list every rep + manager. Mirrors the Customers list page so
 * both feel like the same product:
 *
 *   - Filter chips (All / With shifts today / No shifts today / Managers)
 *   - Search box (name, email, role)
 *   - View toggle: Grid (cards) | Table (dense, sortable)
 *   - Click a rep → /reps/[id]
 *
 * Sortable columns in Table view: Name, Role, Joined, Shifts today.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { FilterChip } from "@/components/ui/Filters";
import {
  SortableHeader,
  compareBy,
  type SortState,
} from "@/components/ui/SortableHeader";
import { AC } from "@/lib/tokens";
import { listProfiles, subscribeProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { listShifts } from "@/lib/shifts-store";
import { initialsFromNameOrEmail, formatDate } from "@/lib/format";
import type { CSSProperties } from "react";

interface RepWithStats extends Profile {
  displayName: string;
  initials: string;
  joinedLabel: string;
  joinedTs: number; // numeric timestamp for sorting
  shiftsToday: number;
}

type StatusFilter = "all" | "with-shifts" | "no-shifts" | "managers";
type ViewMode = "Grid" | "Table";
type RepSortKey = "name" | "email" | "role" | "joined" | "shiftsToday";

export default function RepsPage() {
  const [reps, setReps] = useState<RepWithStats[] | null>(null);
  const [view, setView] = useState<ViewMode>("Table");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<RepSortKey>>({
    key: "name",
    dir: "asc",
  });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([listProfiles(), listShifts()]).then(([profiles, shifts]) => {
        if (cancelled) return;
        const shiftsByRep = new Map<string, number>();
        for (const s of shifts) {
          if (s.rep_id) {
            shiftsByRep.set(s.rep_id, (shiftsByRep.get(s.rep_id) || 0) + 1);
          }
        }
        const enriched: RepWithStats[] = profiles.map((p) => ({
          ...p,
          displayName: displayName(p),
          initials: initialsFromNameOrEmail(p.name, p.email),
          joinedLabel: formatDate(p.created_at?.slice(0, 10) || ""),
          joinedTs: p.created_at ? new Date(p.created_at).getTime() : 0,
          shiftsToday: shiftsByRep.get(p.id) || 0,
        }));
        setReps(enriched);
      });
    load();
    // Refresh on any profiles change — new user invited, name/role
    // changed in /settings/managers, avatar uploaded from the mobile
    // app, account deleted. Previously this list only ran once on
    // mount so concurrent admin edits showed stale data.
    const unsub = subscribeProfiles(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const counts = useMemo(() => {
    const total = reps?.length ?? 0;
    const withShifts = reps?.filter((r) => r.shiftsToday > 0).length ?? 0;
    const noShifts = reps?.filter((r) => r.shiftsToday === 0).length ?? 0;
    const managers = reps?.filter((r) => r.role === "manager").length ?? 0;
    return { total, withShifts, noShifts, managers };
  }, [reps]);

  const filtered = useMemo(() => {
    if (!reps) return null;
    let out = reps;
    if (statusFilter === "with-shifts") out = out.filter((r) => r.shiftsToday > 0);
    if (statusFilter === "no-shifts") out = out.filter((r) => r.shiftsToday === 0);
    if (statusFilter === "managers") out = out.filter((r) => r.role === "manager");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q)
      );
    }
    // Sort
    const sorted = [...out].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return compareBy(a, b, (r) => r.displayName, sort.dir);
        case "email":
          return compareBy(a, b, (r) => r.email, sort.dir);
        case "role":
          return compareBy(a, b, (r) => r.role, sort.dir);
        case "joined":
          return compareBy(a, b, (r) => r.joinedTs, sort.dir);
        case "shiftsToday":
          return compareBy(a, b, (r) => r.shiftsToday, sort.dir);
      }
    });
    return sorted;
  }, [reps, statusFilter, search, sort]);

  return (
    <AdminShell
      breadcrumbs={["Home", "Reps"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/import/rep" style={{ textDecoration: "none" }}>
            <Btn icon="upload" size="sm">
              Import
            </Btn>
          </Link>
          <Link href="/schedule/manage" style={{ textDecoration: "none" }}>
            <Btn icon="settings" size="sm">
              Manage shifts
            </Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Filter row */}
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· {counts.total}</span>
            </FilterChip>
            <FilterChip
              active={statusFilter === "with-shifts"}
              onClick={() => setStatusFilter("with-shifts")}
            >
              With shifts today · {counts.withShifts}
            </FilterChip>
            <FilterChip
              active={statusFilter === "no-shifts"}
              onClick={() => setStatusFilter("no-shifts")}
            >
              No shifts today · {counts.noShifts}
            </FilterChip>
            <FilterChip
              active={statusFilter === "managers"}
              onClick={() => setStatusFilter("managers")}
            >
              Managers · {counts.managers}
            </FilterChip>
            <div style={{ flex: 1 }} />
            <SearchBox value={search} onChange={setSearch} />
            <SegTabs
              tabs={["Grid", "Table"]}
              active={view}
              onChange={(v) => setView(v as ViewMode)}
            />
          </div>
        </Card>

        {/* Body */}
        {filtered === null ? (
          <Card padding={32}>
            <Centered>Loading reps…</Centered>
          </Card>
        ) : filtered.length === 0 ? (
          <Card padding={36}>
            <Centered>
              {counts.total === 0
                ? "No reps signed up yet. They'll appear here when they create an account on the mobile app."
                : "No reps match your filters."}
            </Centered>
          </Card>
        ) : view === "Grid" ? (
          <GridView reps={filtered} />
        ) : (
          <TableView reps={filtered} sort={sort} onSort={setSort} />
        )}
      </div>
    </AdminShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
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
        placeholder="Name, email, or role…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
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
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute, textAlign: "center" }}>
      {children}
    </div>
  );
}

function ShiftsTodayPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span style={{ fontFamily: AC.font, fontSize: 12, color: AC.faint }}>None today</span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        borderRadius: 99,
        background: AC.okTint,
        color: "#0F5A38",
        fontFamily: AC.font,
        fontSize: 11.5,
        fontWeight: 700,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: AC.ok }} />
      {count} today
    </span>
  );
}

function RolePill({ role }: { role: string }) {
  const isManager = role === "manager";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 99,
        background: isManager ? AC.brandSoft : AC.bg,
        color: isManager ? AC.brandInk : AC.ink2,
        fontFamily: AC.font,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        textTransform: "capitalize",
      }}
    >
      {role}
    </span>
  );
}

// ─── Grid view ──────────────────────────────────────────────────────────

function GridView({ reps }: { reps: RepWithStats[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
      {reps.map((r) => (
        <Link key={r.id} href={`/reps/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <Card padding={0} style={{ overflow: "hidden", height: "100%" }}>
            <div
              style={{
                height: 64,
                background: AC.brandSoft,
                position: "relative",
              }}
            >
              <div style={{ position: "absolute", left: 16, bottom: -16 }}>
                <RepAvatar rep={{ initials: r.initials, avatarUrl: r.avatar_url }} size={44} seed={r.id} />
              </div>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: 12,
                }}
              >
                <RolePill role={r.role} />
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
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.displayName}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.mute,
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={r.email}
              >
                {r.email}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.ink2,
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ color: AC.mute }}>Joined {r.joinedLabel}</span>
                <ShiftsTodayPill count={r.shiftsToday} />
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ─── Table view ─────────────────────────────────────────────────────────

const TABLE_COLS = "1.5fr 1.5fr 110px 140px 130px";

function TableView({
  reps,
  sort,
  onSort,
}: {
  reps: RepWithStats[];
  sort: SortState<RepSortKey>;
  onSort: (s: SortState<RepSortKey>) => void;
}) {
  return (
    <Card padding={0}>
      <div style={tableHeader()}>
        <SortableHeader k="name" sort={sort} onChange={onSort}>
          Name
        </SortableHeader>
        <SortableHeader k="email" sort={sort} onChange={onSort}>
          Email
        </SortableHeader>
        <SortableHeader k="role" sort={sort} onChange={onSort}>
          Role
        </SortableHeader>
        <SortableHeader k="joined" sort={sort} onChange={onSort}>
          Joined
        </SortableHeader>
        <SortableHeader k="shiftsToday" sort={sort} onChange={onSort}>
          Shifts today
        </SortableHeader>
      </div>

      {reps.map((r, i) => (
        <Link
          key={r.id}
          href={`/reps/${r.id}`}
          style={{
            display: "grid",
            gridTemplateColumns: TABLE_COLS,
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            borderBottom: i < reps.length - 1 ? `1px solid ${AC.lineDim}` : "none",
            background: "#fff",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <RepAvatar rep={{ initials: r.initials, avatarUrl: r.avatar_url }} size={32} seed={r.id} />
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
                minWidth: 0,
              }}
            >
              {r.displayName}
            </div>
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.ink2,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
            title={r.email}
          >
            {r.email}
          </div>
          <div>
            <RolePill role={r.role} />
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink2, fontWeight: 500 }}>
            {r.joinedLabel}
          </div>
          <div>
            <ShiftsTodayPill count={r.shiftsToday} />
          </div>
        </Link>
      ))}
    </Card>
  );
}

function tableHeader(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: TABLE_COLS,
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    background: AC.bg,
    borderBottom: `1px solid ${AC.line}`,
    fontFamily: AC.font,
    fontSize: 11,
    fontWeight: 600,
    color: AC.mute,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
}
