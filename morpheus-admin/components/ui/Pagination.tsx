"use client";

/**
 * Pagination — shared component for the admin's list pages.
 *
 * Renders: [<< First] [< Prev] 1 ... 4 [5] 6 ... 12 [Next >] [Last >>]
 *          Showing 201-250 of 587
 *
 * Client-side pagination only — the caller already has the full
 * filtered array and slices it locally. This component just owns the
 * navigation UI + emits page-change events. Server-side pagination
 * would be a bigger refactor of every store; deferred until row
 * counts actually warrant it (current admin scale is dozens-to-low-
 * hundreds per entity).
 *
 * Page numbers are 0-indexed internally (matches array.slice math)
 * but displayed 1-indexed (matches user mental model).
 *
 * Behaviour:
 *   - Hidden entirely when totalItems <= pageSize (one page total).
 *   - First / Prev disabled on page 0.
 *   - Next / Last disabled on the last page.
 *   - Page-number ellipsis when there are >7 pages — always shows
 *     first, last, current, current±1, with "..." filling the gaps.
 *   - "Showing X-Y of Z" indicator stays accurate even when the last
 *     page is partial.
 */

import { AC } from "@/lib/tokens";

export const DEFAULT_PAGE_SIZE = 50;

export interface PaginationProps {
  /** Total number of items in the FILTERED set (post-search/filter,
   *  pre-pagination). The component does its own math from this +
   *  pageSize to compute totalPages and the current window. */
  totalItems: number;
  /** 0-indexed current page. */
  currentPage: number;
  /** Number of items per page. Defaults to DEFAULT_PAGE_SIZE (50). */
  pageSize?: number;
  /** Fired when the user picks a different page. The caller updates
   *  its own currentPage state. */
  onPageChange: (nextPage: number) => void;
}

export function Pagination({
  totalItems,
  currentPage,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Hide the whole thing when everything fits on one page — no point
  // showing "Page 1 of 1" + a row of disabled buttons.
  if (totalPages <= 1) return null;

  // Clamp currentPage defensively in case the parent passes a stale
  // page after a filter change (we also expect parents to reset to 0
  // when filters change, but belt-and-braces).
  const safePage = Math.min(Math.max(0, currentPage), totalPages - 1);
  const from = safePage * pageSize + 1;
  const to = Math.min(totalItems, (safePage + 1) * pageSize);

  const pageNumbers = buildPageList(safePage, totalPages);

  const atFirst = safePage === 0;
  const atLast = safePage === totalPages - 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "10px 4px",
        marginTop: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <NavButton
          label="First page"
          glyph="«"
          disabled={atFirst}
          onClick={() => onPageChange(0)}
        />
        <NavButton
          label="Previous page"
          glyph="‹"
          disabled={atFirst}
          onClick={() => onPageChange(safePage - 1)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "0 4px" }}>
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                  padding: "0 4px",
                }}
              >
                …
              </span>
            ) : (
              <PageNumber
                key={p}
                page={p}
                active={p === safePage}
                onClick={() => onPageChange(p)}
              />
            )
          )}
        </div>
        <NavButton
          label="Next page"
          glyph="›"
          disabled={atLast}
          onClick={() => onPageChange(safePage + 1)}
        />
        <NavButton
          label="Last page"
          glyph="»"
          disabled={atLast}
          onClick={() => onPageChange(totalPages - 1)}
        />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          fontWeight: 500,
        }}
      >
        Showing {from.toLocaleString()}–{to.toLocaleString()} of{" "}
        {totalItems.toLocaleString()}
      </div>
    </div>
  );
}

/**
 * Build the page-number display list with ellipses.
 *
 *   totalPages = 5,  current = 2  → [0, 1, 2, 3, 4]
 *   totalPages = 12, current = 0  → [0, 1, 2, '...', 11]
 *   totalPages = 12, current = 5  → [0, '...', 4, 5, 6, '...', 11]
 *   totalPages = 12, current = 11 → [0, '...', 9, 10, 11]
 *
 * Always shows first + last + current ± 1. Fills the rest with "...".
 */
function buildPageList(current: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const out: (number | "...")[] = [];
  const last = totalPages - 1;
  // Always first.
  out.push(0);
  // Gap or 1, 2 depending on current.
  if (current > 2) out.push("...");
  // Window around current.
  for (let p = Math.max(1, current - 1); p <= Math.min(last - 1, current + 1); p++) {
    out.push(p);
  }
  if (current < last - 2) out.push("...");
  // Always last.
  out.push(last);
  return out;
}

function NavButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: 32,
        height: 32,
        padding: "0 8px",
        borderRadius: 7,
        border: `1px solid ${disabled ? AC.lineDim : AC.line}`,
        background: disabled ? AC.bg : "#fff",
        color: disabled ? AC.faint : AC.ink2,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: AC.font,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {glyph}
    </button>
  );
}

function PageNumber({
  page,
  active,
  onClick,
}: {
  page: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      aria-current={active ? "page" : undefined}
      style={{
        minWidth: 32,
        height: 32,
        padding: "0 10px",
        borderRadius: 7,
        border: `1px solid ${active ? AC.brand : AC.line}`,
        background: active ? AC.brand : "#fff",
        color: active ? "#fff" : AC.ink2,
        cursor: active ? "default" : "pointer",
        fontFamily: AC.font,
        fontSize: 12.5,
        fontWeight: active ? 700 : 600,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {page + 1}
    </button>
  );
}
