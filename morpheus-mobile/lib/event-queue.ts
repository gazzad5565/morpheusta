/**
 * Offline-resilient event queue.
 *
 * Reps put their phone in their pocket between actions. Sometimes the
 * tap hits before the cellular reconnects, sometimes the phone screen
 * sleeps mid-request, sometimes the user backgrounds the app. If a
 * `logEvent` call fails for any reason, we don't want the audit trail
 * to silently lose it.
 *
 * Strategy:
 *   1. Try to insert via Supabase as before.
 *   2. On failure, push the payload onto a localStorage-backed queue.
 *   3. On every app/page mount, drain the queue (oldest first) before
 *      anything else. Successfully posted entries get removed; ones
 *      that still fail stay queued for the next attempt.
 *   4. On `pagehide` / `visibilitychange hidden`, no flush is needed —
 *      already-queued items will outlive the page.
 *
 * Tradeoffs:
 *   - 100% client-side; no service worker required (yet). When we
 *     wrap the app in Capacitor for proper background, the queue
 *     migrates to whatever native storage we use, but the API stays.
 *   - Queue is per-device. A rep who switches phones loses any
 *     unsent events on the old one. Acceptable given the rarity.
 *   - actor_id / actor_label are captured at QUEUE time, not flush
 *     time, so a logged-out rep replaying a stale queue still gets
 *     attributed correctly.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import type { NewEvent } from "./events-store";

const QUEUE_KEY = "morpheus.event_queue.v1";
const MAX_QUEUE = 200;

interface QueuedEvent {
  /** Random id so retries are idempotent at the client side. */
  client_id: string;
  payload: {
    event_type: string;
    actor_id: string | null;
    actor_label: string | null;
    shift_id: string | null;
    customer_id: string | null;
    message: string | null;
    meta: Record<string, unknown> | null;
  };
  queued_at: number; // ms
}

function read(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    // Cap at MAX_QUEUE most-recent — don't let a stuck queue eat all
    // of localStorage. If we lose 200+ events the rep should reinstall.
    const trimmed = items.slice(-MAX_QUEUE);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — nothing we can do */
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolve the actor (id + label) for the current session. We do this
 * eagerly when the event is generated — not when we eventually flush —
 * so attribution survives a sign-out before the queue drains.
 */
async function captureActor(): Promise<{ id: string | null; label: string | null }> {
  if (!isSupabaseConfigured() || !supabase) return { id: null, label: null };
  try {
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id ?? null;
    if (!id) return { id: null, label: null };
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", id)
      .maybeSingle();
    const p = profile as { name?: string | null; email?: string } | null;
    const label = p?.name?.trim() || p?.email?.split("@")[0] || null;
    return { id, label };
  } catch {
    return { id: null, label: null };
  }
}

/**
 * Try to write an event row. Returns true on success, false on any
 * failure (network, RLS, transient). Caller decides whether to queue.
 */
async function tryInsert(payload: QueuedEvent["payload"]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  try {
    const { error } = await supabase.from("shift_events").insert(payload);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Public entry point — replaces the old logEvent.
 * Always non-blocking; never throws.
 */
export async function logEventReliably(e: NewEvent): Promise<void> {
  const actor = await captureActor();
  const payload: QueuedEvent["payload"] = {
    event_type: e.event_type,
    actor_id: actor.id,
    actor_label: actor.label,
    shift_id: e.shift_id ?? null,
    customer_id: e.customer_id ?? null,
    message: e.message ?? null,
    meta: e.meta ?? null,
  };
  const ok = await tryInsert(payload);
  if (ok) return;
  // Queue for later.
  const q = read();
  q.push({ client_id: newId(), payload, queued_at: Date.now() });
  write(q);
  // eslint-disable-next-line no-console
  console.info(
    `[event-queue] queued ${payload.event_type} (queue size ${q.length})`
  );
}

/**
 * Drain the queue, oldest-first. Called on app mount + page focus.
 * Safe to call concurrently — uses a guard so a second drain triggered
 * by a fast visibilitychange doesn't double-send.
 */
let _draining = false;
export async function drainEventQueue(): Promise<{ flushed: number; remaining: number }> {
  if (_draining) return { flushed: 0, remaining: read().length };
  _draining = true;
  try {
    let q = read();
    if (q.length === 0) return { flushed: 0, remaining: 0 };
    let flushed = 0;
    const remaining: QueuedEvent[] = [];
    for (const item of q) {
      const ok = await tryInsert(item.payload);
      if (ok) {
        flushed += 1;
      } else {
        remaining.push(item);
        // Stop on first failure — if the network is bad, no point
        // hammering. Next mount will retry.
        break;
      }
    }
    if (flushed > 0) {
      // Write back: drop the prefix we successfully flushed, keep the
      // tail (failed item + everything after it).
      const idx = q.findIndex((x) => x.client_id === remaining[0]?.client_id);
      const tail = idx >= 0 ? q.slice(idx) : remaining;
      write(tail);
      // eslint-disable-next-line no-console
      console.info(
        `[event-queue] drained ${flushed}; ${tail.length} still queued`
      );
    }
    q = read();
    return { flushed, remaining: q.length };
  } finally {
    _draining = false;
  }
}

/** Read-only — for the dashboard to surface "N pending sync" if we ever want. */
export function pendingEventQueueCount(): number {
  return read().length;
}
