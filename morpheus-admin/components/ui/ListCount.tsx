"use client";

/**
 * ListCount — small subtitle line shown between the filter row and the
 * body on every list page (/customers, /reps, /tasks, /library,
 * /past-shifts, /settings/managers, …).
 *
 * Why a dedicated component:
 *   - Codifies the "count at the top of every list" rule in DESIGN.md
 *     section 8 (gold-standard list page) so every page formats the
 *     same.
 *   - Pagination already shows "Showing 201–250 of 587" at the BOTTOM,
 *     but Gary wants the total reachable instantly — without scrolling
 *     past a long table — so the same answer also appears near the top.
 *
 * Format:
 *   - When all rows are visible (visible === total):  "247 customers"
 *   - When a filter / search is active:               "Showing 32 of 247 customers"
 *   - When total === 0:                               renders nothing
 *     (the empty-state Card below already explains "No customers yet").
 *
 * Pass the post-filter length as `visible` and the pre-filter length
 * as `total`. Both should be the FULL filtered count, not the
 * paginated slice.
 */

import { AC } from "@/lib/tokens";

export interface ListCountProps {
  /** Length of the filtered array (what the user actually sees across all pages). */
  visible: number;
  /** Length of the full unfiltered array. */
  total: number;
  /** Singular noun (e.g. "customer"). The "s" plural is appended automatically. */
  noun: string;
  /** Optional plural override for nouns that don't just take "s" (e.g. "categories"). */
  pluralNoun?: string;
}

export function ListCount({ visible, total, noun, pluralNoun }: ListCountProps) {
  if (total === 0) return null;
  const plural = pluralNoun ?? `${noun}s`;
  const word = total === 1 ? noun : plural;
  const text =
    visible === total
      ? `${total.toLocaleString()} ${word}`
      : `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} ${word}`;
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 12,
        color: AC.mute,
        fontWeight: 500,
        padding: "0 2px",
        marginTop: -4,
      }}
    >
      {text}
    </div>
  );
}
