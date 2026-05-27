"use client";

/**
 * useColumnWidths — localStorage-backed column-width state for the
 * admin's resizable list tables.
 *
 * Usage:
 *   const cols = useColumnWidths("tasks", DEFAULT_TASKS_COLUMNS);
 *   <div style={{ gridTemplateColumns: cols.gridTemplateColumns }}>
 *     <HeaderCell><ColumnResizer index={0} cols={cols} /></HeaderCell>
 *     ...
 *
 * Defaults are an array of CSS values (e.g. "340px", "100px"). The
 * hook stores all widths as pixel numbers internally — once a user
 * starts resizing, "fr" / "auto" defaults get materialized into a
 * pixel width. This keeps the resize math trivial (delta-x → new px)
 * at the cost of losing fluid behaviour. Admin tables run on
 * desktop-only with predictable container widths so this is fine.
 *
 * Persistence: one localStorage key per page (e.g. `morpheus.cols.tasks.v1`).
 * Different browsers / machines reset to defaults — sync across devices
 * is deferred until Gary asks.
 *
 * Reset: setWidth(i, null) or resetColumn(i) clears a single column
 * back to its default; resetAll() clears everything (also removes the
 * localStorage row so a fresh page load picks up the defaults).
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "morpheus.cols.";
const STORAGE_VERSION = "v1";
const MIN_COLUMN_PX = 60;

/** Parse a CSS column value to a number of pixels. "240px" → 240,
 *  "2fr" → fallback (we can't compute fr without a container width).
 *  Used only to seed the very first resize: if the default was "2fr"
 *  we pick a sensible 240px starting point and let the user drag from
 *  there. Numbers passed through unchanged. */
function defaultToPx(value: string | number, fallback: number): number {
  if (typeof value === "number") return value;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (m) return Math.round(parseFloat(m[1]));
  return fallback;
}

export interface ColumnWidths {
  /** Current widths in px. */
  widths: number[];
  /** Computed CSS gridTemplateColumns string ("340px 240px 100px ..."). */
  gridTemplateColumns: string;
  /** Imperatively set one column's width (px). Clamped to MIN_COLUMN_PX. */
  setWidth: (index: number, px: number) => void;
  /** Reset one column to its default. */
  resetColumn: (index: number) => void;
  /** Reset all columns to their defaults + clear localStorage. */
  resetAll: () => void;
}

export function useColumnWidths(
  pageKey: string,
  /** Defaults as CSS values — strings ("340px") or numbers (340).
   *  Non-px CSS values get materialized to a sensible px fallback on
   *  first resize. */
  defaults: ReadonlyArray<string | number>,
  /** Fallback px width when a default isn't a literal px value (e.g.
   *  "2fr"). Sized so most default columns look ~right on a 1280px
   *  desktop. Override per-call if a column needs a different baseline. */
  frFallbackPx: number = 200
): ColumnWidths {
  const storageKey = `${STORAGE_PREFIX}${pageKey}.${STORAGE_VERSION}`;

  // Materialise defaults → px-or-fallback so we always have numbers.
  const defaultPx = defaults.map((d) => defaultToPx(d, frFallbackPx));

  // Hydrate from localStorage if present. We have to do this in a
  // useEffect (not useState init) because localStorage isn't available
  // during SSR / static-prerender of the admin pages — Next.js would
  // crash on the build pass.
  const [widths, setWidths] = useState<number[]>(defaultPx);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      // Map saved widths onto the current defaults length — if the
      // page added a column since last save, fall back to the default
      // for the new column rather than blowing up.
      const next = defaultPx.map((d, i) => {
        const saved = parsed[i];
        return typeof saved === "number" && saved >= MIN_COLUMN_PX ? saved : d;
      });
      setWidths(next);
    } catch {
      /* malformed storage row — fall through to defaults */
    }
    // We intentionally only hydrate ONCE per pageKey. Adding defaultPx
    // to deps would cause a re-hydrate every render since the array
    // ref changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback(
    (next: number[]) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* quota / disabled */
      }
    },
    [storageKey]
  );

  const setWidth = useCallback(
    (index: number, px: number) => {
      setWidths((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const clamped = Math.max(MIN_COLUMN_PX, Math.round(px));
        if (prev[index] === clamped) return prev;
        const next = prev.slice();
        next[index] = clamped;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const resetColumn = useCallback(
    (index: number) => {
      setWidths((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = prev.slice();
        next[index] = defaultPx[index];
        persist(next);
        return next;
      });
    },
    [defaultPx, persist]
  );

  const resetAll = useCallback(() => {
    setWidths(defaultPx);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  }, [defaultPx, storageKey]);

  const gridTemplateColumns = widths.map((w) => `${w}px`).join(" ");

  return { widths, gridTemplateColumns, setWidth, resetColumn, resetAll };
}

export { MIN_COLUMN_PX };
