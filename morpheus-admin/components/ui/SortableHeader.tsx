"use client";

/**
 * Sortable column header for grid-row tables.
 *
 * Renders a clickable column label with an up/down indicator showing the
 * current sort direction. Pure presentational — sorting state lives in
 * the parent page; the parent passes the current key + direction in and
 * gets a callback when the header is clicked.
 *
 * Usage:
 *   const [sort, setSort] = useState<SortState<MyKey>>({ key: "name", dir: "asc" });
 *   <SortableHeader sort={sort} onChange={setSort} k="name">Name</SortableHeader>
 *
 * Click semantics: if the header is for the active key, flip direction.
 * If it's for a different key, switch to it (asc by default).
 */

import { AC } from "@/lib/tokens";
import { AGlyph } from "@/components/ui/AGlyph";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function nextSortState<K extends string>(
  current: SortState<K>,
  k: K
): SortState<K> {
  if (current.key === k) {
    return { key: k, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: k, dir: "asc" };
}

export function SortableHeader<K extends string>({
  k,
  sort,
  onChange,
  children,
  align = "left",
}: {
  k: K;
  sort: SortState<K>;
  onChange: (next: SortState<K>) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onChange(nextSortState(sort, k))}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "inherit",
        fontSize: "inherit",
        color: active ? AC.ink : AC.mute,
        fontWeight: active ? 700 : 600,
        letterSpacing: "inherit",
        textTransform: "inherit",
        textAlign: align,
        width: "100%",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {children}
      <AGlyph
        name={active ? (sort.dir === "asc" ? "arrow-u" : "arrow-d") : "sort"}
        size={11}
        color={active ? AC.brandDeep : AC.faint}
      />
    </button>
  );
}

/**
 * Generic comparator. Pulls a string/number/null value via `pick` and
 * compares respecting direction. Nulls always sort last.
 */
export function compareBy<T, K extends string>(
  a: T,
  b: T,
  pick: (row: T) => string | number | null | undefined,
  dir: SortDir
): number {
  const av = pick(a);
  const bv = pick(b);
  const an = av === null || av === undefined || av === "";
  const bn = bv === null || bv === undefined || bv === "";
  if (an && bn) return 0;
  if (an) return 1; // nulls last regardless of direction
  if (bn) return -1;
  let c = 0;
  if (typeof av === "number" && typeof bv === "number") c = av - bv;
  else c = String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
  return dir === "asc" ? c : -c;
}
