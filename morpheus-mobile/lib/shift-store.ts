/**
 * Shift store — Phase 2: backed by Supabase Postgres.
 *
 * Falls back to localStorage if Supabase isn't configured (e.g. local dev
 * without env vars). That keeps the app usable in offline or unconfigured
 * states.
 *
 * Phase 1 used localStorage exclusively. We've migrated to Supabase so:
 *  - Requested shifts persist across devices and browsers
 *  - Admins can (eventually) see them in the admin app
 *  - The Add-shift Allow toggle in admin Settings can actually gate behavior
 *
 * Auth is not yet wired (Phase 2 next session). For now `rep_id` is null,
 * meaning ALL requests are visible to every user of the mobile app. RLS
 * policies will be tightened once auth lands.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import type { Shift } from "./mock-data";

const KEY = "morpheus.requested-shifts.v1";

/**
 * Track every customer the rep has requested in the last 14 days,
 * persisted to localStorage. Used by RequestResolutionWatcher to
 * cold-start: when the rep opens the app after being offline, we
 * query shift_events for resolution events on these customer_ids
 * and banner any the rep hasn't seen yet (request.scheduled /
 * request.declined). Without this set, resolution events have no
 * way to filter "is this for me" because the event row only carries
 * customer_id, not rep_id.
 */
const RECENT_REQ_LS_KEY = "morpheus.recent_requested_customers.v1";
const RECENT_REQ_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14d

interface RecentRequestEntry {
  customerId: string;
  customerName: string;
  requestedAt: number;
}

function readRecentRequests(): RecentRequestEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_REQ_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentRequestEntry[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - RECENT_REQ_TTL_MS;
    return parsed.filter((e) => e && e.requestedAt > cutoff);
  } catch {
    return [];
  }
}

function writeRecentRequest(entry: RecentRequestEntry): void {
  if (typeof window === "undefined") return;
  try {
    const cur = readRecentRequests();
    // Dedup by customerId — re-requesting the same customer bumps
    // the timestamp rather than adding a duplicate row.
    const filtered = cur.filter((e) => e.customerId !== entry.customerId);
    filtered.push(entry);
    window.localStorage.setItem(
      RECENT_REQ_LS_KEY,
      JSON.stringify(filtered)
    );
  } catch {
    /* quota / disabled */
  }
}

/** Public read for the watcher. */
export function listRecentRequestedCustomerIds(): {
  customerId: string;
  customerName: string;
  requestedAt: number;
}[] {
  return readRecentRequests();
}

export interface RequestedShift extends Shift {
  requestedAt: number;
}

// ─── localStorage fallback (used only when Supabase isn't configured) ─────

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function lsRead(): RequestedShift[] {
  if (typeof window === "undefined") return [];
  return safe(() => {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [] as RequestedShift[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RequestedShift[]) : [];
  }, [] as RequestedShift[]);
}

function lsWrite(items: RequestedShift[]): void {
  if (typeof window === "undefined") return;
  safe(() => window.localStorage.setItem(KEY, JSON.stringify(items)), undefined);
}

// ─── Supabase row mapping ─────────────────────────────────────────────────

interface DbRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_initials: string;
  customer_color: string;
  /** Text since admin migration 2026_05_28_customer_code_text.sql (B5). */
  customer_code: string;
  rep_id: string | null;
  status: string;
  requested_at: string;
}

function rowToShift(row: DbRow): RequestedShift {
  // Use customer_id as the externally-visible id so it matches the
  // customer id used elsewhere in the app. The DB row's id is a
  // composite "{userId}-{customerId}" — internal only.
  return {
    id: row.customer_id,
    name: row.customer_name,
    initials: row.customer_initials,
    color: row.customer_color,
    code: row.customer_code,
    start: "",
    end: "",
    distance: "",
    requestedAt: new Date(row.requested_at).getTime(),
  };
}

// ─── Public API (async; callers await) ────────────────────────────────────

export async function listRequestedShifts(): Promise<RequestedShift[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return lsRead();
  }
  const { data, error } = await supabase
    .from("requested_shifts")
    .select("*")
    .order("requested_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] list error, falling back to local:", error.message);
    return lsRead();
  }
  return (data as DbRow[]).map(rowToShift);
}

export async function addRequestedShift(
  shift: Omit<Shift, "start" | "end" | "distance">
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    const existing = lsRead();
    if (existing.some((s) => s.id === shift.id)) return;
    lsWrite([
      ...existing,
      {
        ...shift,
        start: "",
        end: "",
        distance: "",
        requestedAt: Date.now(),
      },
    ]);
    return;
  }
  // Composite row id keeps the (rep_id, customer_id) pair unique per user.
  // RLS already restricts visibility, but we need a globally-unique PK to
  // let two different users both request the same customer.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] add: no authenticated user; skipping insert.");
    return;
  }
  const rowId = `${userId}-${shift.id}`;

  // ignoreDuplicates was true previously, which translates to
  // `ON CONFLICT DO NOTHING`. If a stale row existed (status='scheduled'
  // / 'declined' / anything that wasn't cleaned up) the new insert
  // silently no-op'd while `logEvent` below still fired — the manager
  // saw the request in the activity feed but no row in Needs action.
  //
  // Now: ON CONFLICT DO UPDATE — re-requesting the same customer
  // resets the row back to a fresh pending state, bumps requested_at
  // so it sorts to the top of the inbox, and refreshes the customer
  // metadata in case anything changed (rename, recoloured, etc).
  // .select() lets us catch the silent-success case where Postgres
  // returned 0 rows (RLS block, mostly) and warn the caller instead
  // of pretending the request landed.
  const { data, error } = await supabase
    .from("requested_shifts")
    .upsert(
      {
        id: rowId,
        customer_id: shift.id,
        customer_name: shift.name,
        customer_initials: shift.initials,
        customer_color: shift.color,
        customer_code: shift.code,
        status: "pending",
        requested_at: new Date().toISOString(),
        // rep_id auto-fills via DEFAULT auth.uid() on the server side
      },
      { onConflict: "id" }
    )
    .select("id");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] add error:", error.message);
    return;
  }
  if (!data || data.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[shift-store] add: insert affected 0 rows — likely an RLS block on requested_shifts. Check the requested_shifts INSERT policy in Supabase."
    );
    return;
  }
  await logEvent({
    event_type: "request.submitted",
    customer_id: shift.id,
    message: `Requested ${shift.name}`,
  });
  // Persist locally so the resolution watcher can match this on
  // a future cold start — see comment near RECENT_REQ_LS_KEY above.
  writeRecentRequest({
    customerId: shift.id,
    customerName: shift.name,
    requestedAt: Date.now(),
  });
  // Local event bus — tells PendingRequestPill (and any other
  // listener) to refresh immediately without waiting for the
  // Supabase realtime INSERT to round-trip. Previously the pill
  // arrived 1-3 s late on every submit because it only learned
  // about the new row via realtime / poll.
  notifyRequestsChanged();
}

export async function removeRequestedShift(id: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    lsWrite(lsRead().filter((s) => s.id !== id));
    notifyRequestsChanged();
    return;
  }
  // RLS restricts the delete to the current user's row only — even though
  // multiple users might have rows with the same customer_id, only mine
  // is visible (and therefore deletable) to me.
  const { error } = await supabase
    .from("requested_shifts")
    .delete()
    .eq("customer_id", id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] remove error:", error.message);
  }
  notifyRequestsChanged();
}

/**
 * Public helper so the resolution watcher (and anything else that
 * KNOWS a request just changed state from outside this module —
 * e.g. an admin approval / decline that fired a banner) can poke
 * subscribers like PendingRequestPill to refresh immediately
 * rather than wait for realtime + poll fallbacks.
 */
export function notifyRequestsChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("morpheus.requests.changed"));
  } catch {
    /* fallback: nothing — pill still has realtime + 15s poll */
  }
}

/**
 * Subscribe to realtime changes on requested_shifts. Used by mobile
 * /shifts so when an admin approves the rep's request (which inserts
 * a row into shifts AND deletes the row in requested_shifts), the
 * "Unscheduled" section drops the request immediately instead of
 * waiting for the rep to navigate away and back.
 *
 * Same defensive try/catch + unique channel pattern as subscribeShifts.
 */
let _requestedShiftsChannelCounter = 0;

export function subscribeRequestedShifts(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _requestedShiftsChannelCounter += 1;
    const channelName = `mobile_requested_shifts_live_${Date.now()}_${_requestedShiftsChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requested_shifts" },
        () => onChange()
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[shift-store] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] subscribe failed:", err);
    return () => {};
  }
}
