/**
 * Tiny global event bus for "Saved" feedback in the admin top bar.
 *
 * Why a module-scope emitter and not React Context? Mutation calls happen
 * deep inside store helpers (createShift, updateCustomer, etc) that have
 * no React tree access. A plain pub/sub lets any store call
 * `notifySaved()` from anywhere — server, client, useEffect, doesn't
 * matter — and the single <SaveIndicator /> in the top bar reflects it.
 *
 * The indicator displays four states:
 *   idle   — nothing happening; component renders the gentle reassurance
 *            "Auto-saves on every change" once the page has been open for
 *            a moment.
 *   saving — a mutation is in flight (optional — most stores just call
 *            notifySaved() after the await resolves)
 *   saved  — fades a green "Saved" pill in for ~3.5s, then back to idle
 *   error  — red "Couldn't save" with the message; sticks until the next
 *            successful save replaces it
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveSnapshot {
  status: SaveStatus;
  /** ms timestamp when this snapshot was emitted. */
  at: number;
  /** Optional context label, e.g. "Saved customer". */
  label?: string;
  /** Populated when status === "error". */
  error?: string;
}

let current: SaveSnapshot = { status: "idle", at: 0 };
const listeners = new Set<(s: SaveSnapshot) => void>();

function emit(next: SaveSnapshot) {
  current = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* listener crashed — keep going so one bad subscriber doesn't
         poison the rest */
    }
  }
}

export function notifySaving(label?: string) {
  emit({ status: "saving", at: Date.now(), label });
}

export function notifySaved(label?: string) {
  emit({ status: "saved", at: Date.now(), label });
}

export function notifySaveError(error: string, label?: string) {
  emit({ status: "error", at: Date.now(), label, error });
}

export function getSaveStatus(): SaveSnapshot {
  return current;
}

export function subscribeSaveStatus(
  fn: (s: SaveSnapshot) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Sugar — wrap any "ok-or-error" mutation result so callers can drop in
 * one call per store function instead of branching on the return shape:
 *
 *   const r = await createShift(...);
 *   reportSave(r, "shift");
 *   return r;
 */
export function reportSave<T extends { ok: boolean; error?: string }>(
  result: T,
  label?: string
): T {
  if (result.ok) notifySaved(label);
  else notifySaveError(result.error || "Couldn't save", label);
  return result;
}
