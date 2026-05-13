/**
 * shift-order-store — per-rep "I've planned my day" preference.
 *
 * When the rep flips Optimize on /route and the resulting visit order
 * is meaningfully different from chronological, they can tap "Save
 * this order". That stores the ordered list of shift IDs here so
 * /shifts + the home Up Next card pick the same order without
 * touching `shifts.start_time` in the database (the customer's
 * scheduled time stays sacred — see Option A vs Option B in the
 * chat history).
 *
 * Storage:
 *   - localStorage, keyed by today's date so yesterday's order
 *     doesn't carry forward.
 *   - Per-device — no sync across devices. Acceptable because
 *     "today's plan" is short-lived and a rep on a second device
 *     can re-save. Could be promoted to a `rep_shift_order` table
 *     later if cross-device sync becomes important.
 *
 * Cross-platform: pure localStorage + custom-event bus. Identical
 * on iOS Safari, iOS PWA, Android Chrome, Android PWA.
 */

import { todayLocalISO } from "./format";

// v2 (current): single key holding `{order, savedAt}`. One setItem
// writes both fields together so a crash between writes can't leave
// an order without meta (or vice versa).
const LS_V2_PREFIX = "morpheus.shift_order.v2.";
// v1 (legacy): two separate keys. Reads fall back to v1 for one
// release so reps mid-day on the day of the rollout keep their
// saved order. v1 keys are removed on the next save/clear so they
// don't linger.
const LS_V1_ORDER_PREFIX = "morpheus.shift_order.";
const LS_V1_META_PREFIX = "morpheus.shift_order.meta.";
const CHANGE_EVENT = "morpheus.shift_order.changed";

function todayV2Key(): string {
  return LS_V2_PREFIX + todayLocalISO();
}
function todayV1OrderKey(): string {
  return LS_V1_ORDER_PREFIX + todayLocalISO();
}
function todayV1MetaKey(): string {
  return LS_V1_META_PREFIX + todayLocalISO();
}

interface OrderMeta {
  /** ms-epoch when the rep saved this order. Drives the "Last
   *  optimized X min ago" line on /route. */
  savedAt: number;
}

interface OrderPayload {
  order: string[];
  savedAt: number;
}

/** Read + validate the v2 payload, or null if absent / malformed. */
function readV2Payload(): OrderPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(todayV2Key());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.order) &&
      parsed.order.every((x: unknown) => typeof x === "string") &&
      typeof parsed.savedAt === "number"
    ) {
      return { order: parsed.order as string[], savedAt: parsed.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the visit order. One setItem call so order + savedAt are
 *  atomic — a crash between writes can no longer leave the rep with
 *  a "Last optimized at" line that doesn't match the order on
 *  screen. Fires a window event so other parts of the app (Up Next
 *  card, /shifts list) refresh immediately without waiting for a
 *  remount. */
export function saveShiftOrder(shiftRealIds: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: OrderPayload = {
      order: shiftRealIds,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(todayV2Key(), JSON.stringify(payload));
    // Sweep v1 leftovers so they don't shadow the v2 payload on
    // reads from a different (older) build mid-session.
    window.localStorage.removeItem(todayV1OrderKey());
    window.localStorage.removeItem(todayV1MetaKey());
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* quota / disabled — fail silently. Loss of preference is
     * benign; the rep just goes back to chronological order. */
  }
}

/** Read the saved visit order for today, or null if none saved.
 *  Falls back to the v1 key shape for one release. */
export function readShiftOrder(): string[] | null {
  if (typeof window === "undefined") return null;
  const v2 = readV2Payload();
  if (v2) return v2.order;
  // v1 fallback — read-only; not migrated until the next save.
  try {
    const raw = window.localStorage.getItem(todayV1OrderKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string")
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

/** Read the metadata (savedAt) for today's order, or null if none
 *  saved. Used by /route to show "Last optimized X min ago". Falls
 *  back to the v1 key shape for one release. */
export function readShiftOrderMeta(): OrderMeta | null {
  if (typeof window === "undefined") return null;
  const v2 = readV2Payload();
  if (v2) return { savedAt: v2.savedAt };
  // v1 fallback.
  try {
    const raw = window.localStorage.getItem(todayV1MetaKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.savedAt === "number"
    ) {
      return { savedAt: parsed.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

/** Clear the saved order — fires the same change event so consumers
 *  flip back to chronological in real time. */
export function clearShiftOrder(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(todayV2Key());
    window.localStorage.removeItem(todayV1OrderKey());
    window.localStorage.removeItem(todayV1MetaKey());
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

/** Subscribe to saved-order changes. Returns an unsubscribe function.
 *  Used by /shifts + the home Up Next card so a Save click on
 *  /route propagates instantly without waiting for a route change
 *  or component remount. */
export function subscribeShiftOrder(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/**
 * Apply a saved order to an array of shifts.
 *
 * Shifts that ARE in the saved list sort by their saved-position.
 * Shifts that are NOT (added after the rep saved — e.g. a new
 * claimable shift, or a manager just scheduled one) keep their
 * original relative order and append after the saved ones.
 *
 * Stable: deterministic output for any input.
 */
export function applySavedOrder<T extends { realId: string }>(
  shifts: T[],
  savedOrder: string[] | null | undefined
): T[] {
  if (!savedOrder || savedOrder.length === 0) return shifts;
  const positionById = new Map<string, number>();
  savedOrder.forEach((id, i) => positionById.set(id, i));
  // Pair each shift with a position number to keep the sort stable
  // for non-saved shifts (they share Infinity and preserve their
  // original relative order via the index tiebreaker below).
  return [...shifts]
    .map((s, originalIdx) => ({
      s,
      pos: positionById.has(s.realId)
        ? positionById.get(s.realId)!
        : Number.POSITIVE_INFINITY,
      originalIdx,
    }))
    .sort((a, b) => {
      if (a.pos !== b.pos) return a.pos - b.pos;
      return a.originalIdx - b.originalIdx;
    })
    .map((x) => x.s);
}
