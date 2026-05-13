/**
 * Events store (admin) — read + write the shift_events activity log.
 *
 * Every meaningful action across the app writes one row here so the
 * Live Feed "All activity" tab + future audit views have a single
 * source of truth.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type EventType =
  // Shifts
  | "shift.scheduled"
  | "shift.claimed"
  | "shift.checked_in"
  | "shift.checked_in_offsite"
  | "shift.checked_in_late"
  | "shift.checked_in_early"
  | "shift.checked_out"
  | "shift.checked_out_offsite"
  | "shift.checked_out_early"
  | "shift.auto_checked_out"
  // Rep paused this shift to check into another one (May 13). Pairs
  // with shift.resumed when they come back.
  | "shift.paused_for_other_shift"
  | "shift.resumed"
  | "shift.deleted"
  // In-shift activity (everything that happens between check-in / check-out)
  | "shift.task_started"
  | "shift.task_completed"
  | "shift.break_started"
  | "shift.break_ended"
  | "shift.travel_started"
  | "shift.travel_ended"
  // Attention overlay — rep raises "can't make it", manager resolves
  | "shift.rep_unable_to_attend"
  | "shift.rep_unable_withdrawn"
  | "shift.reassigned"
  | "shift.released"
  | "shift.acknowledged"
  | "shift.cancelled"
  // Requests
  | "request.submitted"
  | "request.scheduled"
  | "request.declined"
  // Customers
  | "customer.created"
  | "customer.updated"
  | "customer.deactivated"
  | "customer.reactivated"
  | "customer.deleted"
  | "customer.site_added"
  | "customer.site_updated"
  | "customer.site_deactivated"
  | "customer.site_reactivated"
  | "customer.site_deleted"
  // Library
  | "library.uploaded"
  | "library.deleted"
  // Tasks (admin-defined templates, not per-shift completions)
  | "task.created"
  | "task.deleted";

export interface ShiftEvent {
  id: string;
  event_type: EventType;
  actor_id: string | null;
  actor_label: string | null;
  shift_id: string | null;
  customer_id: string | null;
  message: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface NewEvent {
  event_type: EventType;
  shift_id?: string | null;
  customer_id?: string | null;
  message?: string;
  meta?: Record<string, unknown>;
}

/** Insert a row. Auto-fills actor from the current Supabase session. */
export async function logEvent(e: NewEvent): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actorId = userData.user?.id ?? null;
    // Best-effort actor label from the profile's name; falls back to email.
    let actorLabel: string | null = null;
    if (actorId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", actorId)
        .maybeSingle();
      const p = profile as { name?: string | null; email?: string } | null;
      actorLabel =
        p?.name?.trim() || p?.email?.split("@")[0] || null;
    }
    await supabase.from("shift_events").insert({
      event_type: e.event_type,
      actor_id: actorId,
      actor_label: actorLabel,
      shift_id: e.shift_id ?? null,
      customer_id: e.customer_id ?? null,
      message: e.message ?? null,
      meta: e.meta ?? null,
    });
  } catch (err) {
    // Logging failures should never break the user's action.
    // eslint-disable-next-line no-console
    console.warn("[events] logEvent failed:", err);
  }
}

/** Read recent events, newest first. */
export async function listRecentEvents(limit = 50): Promise<ShiftEvent[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shift_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[events] list:", error.message);
    return [];
  }
  return (data as ShiftEvent[]) || [];
}

/**
 * Just the total count of events — used by the Live Feed pill so
 * "All activity" shows the true number (e.g. 312) rather than the
 * display cap (50) on busy days. Cheap query: PostgREST head=true
 * sends a HEAD request that returns just the row count.
 */
export async function countRecentEvents(opts?: {
  /** ISO date string — only count events at or after this timestamp. */
  since?: string;
}): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  let q = supabase
    .from("shift_events")
    .select("id", { count: "exact", head: true });
  if (opts?.since) q = q.gte("created_at", opts.since);
  const { count, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[events] count:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Subscribe to inserts on shift_events. Each call gets a unique
 * channel name to avoid the supabase-js collision with concurrent
 * subscribers.
 */
let _eventsChannelCounter = 0;

export function subscribeEvents(onInsert: (e: ShiftEvent) => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _eventsChannelCounter += 1;
    const channelName = `shift_events_live_${Date.now()}_${_eventsChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shift_events" },
        (payload) => {
          onInsert(payload.new as ShiftEvent);
        }
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[events] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[events] subscribe failed:", err);
    return () => {};
  }
}

/** Pretty label for each event type — used in the activity feed. */
export const EVENT_LABEL: Record<EventType, string> = {
  "shift.scheduled": "scheduled a shift",
  "shift.claimed": "claimed a shift",
  "shift.checked_in": "checked in",
  "shift.checked_in_offsite": "checked in OFF-SITE",
  "shift.checked_in_late": "checked in LATE",
  "shift.checked_in_early": "checked in EARLY",
  "shift.checked_out": "checked out",
  "shift.checked_out_offsite": "checked out OFF-SITE",
  "shift.checked_out_early": "checked out EARLY",
  "shift.auto_checked_out": "was auto-checked out",
  "shift.paused_for_other_shift": "paused this shift to check into another",
  "shift.resumed": "resumed this shift",
  "shift.deleted": "removed a shift",
  "shift.task_started": "started a task",
  "shift.task_completed": "completed a task",
  "shift.break_started": "started a break",
  "shift.break_ended": "ended a break",
  "shift.travel_started": "started travelling",
  "shift.travel_ended": "arrived",
  "shift.rep_unable_to_attend": "flagged a shift they can't make",
  "shift.rep_unable_withdrawn": "withdrew their unable-to-attend flag",
  "shift.reassigned": "reassigned a shift",
  "shift.released": "released a shift to the claimable pool",
  "shift.acknowledged": "acknowledged a shift change",
  "shift.cancelled": "cancelled a shift",
  "request.submitted": "requested a customer",
  "request.scheduled": "approved a request",
  "request.declined": "declined a request",
  "customer.created": "added a customer",
  "customer.updated": "updated a customer",
  "customer.deactivated": "deactivated a customer",
  "customer.reactivated": "reactivated a customer",
  "customer.deleted": "deleted a customer",
  "customer.site_added": "added a site",
  "customer.site_updated": "updated a site",
  "customer.site_deactivated": "deactivated a site",
  "customer.site_reactivated": "reactivated a site",
  "customer.site_deleted": "deleted a site",
  "library.uploaded": "uploaded a file",
  "library.deleted": "deleted a file",
  "task.created": "added a task",
  "task.deleted": "removed a task",
};

/** Tone hint for the feed UI — colours the left-edge accent. */
export function eventTone(type: EventType): "ok" | "warn" | "danger" | "info" {
  if (type === "shift.checked_in" || type === "shift.checked_out") return "ok";
  if (
    type === "shift.checked_in_offsite" ||
    type === "shift.checked_out_offsite" ||
    type === "shift.deleted" ||
    type === "shift.cancelled" ||
    type === "customer.deleted" ||
    type === "customer.site_deleted" ||
    type === "library.deleted" ||
    type === "task.deleted"
  )
    return "danger";
  if (
    type === "shift.checked_in_late" ||
    type === "shift.checked_in_early" ||
    type === "shift.checked_out_early" ||
    type === "shift.auto_checked_out" ||
    type === "shift.rep_unable_to_attend" ||
    type === "shift.released" ||
    type === "customer.site_deactivated" ||
    type === "customer.site_reactivated"
  )
    return "warn";
  if (
    type === "request.submitted" ||
    type === "shift.rep_unable_withdrawn" ||
    type === "shift.reassigned" ||
    type === "shift.acknowledged"
  )
    return "info";
  return "ok";
}

/**
 * Map shift_id → ISO timestamp of the latest check-out event for that
 * shift. Covers every variant we log: shift.checked_out (clean exit),
 * shift.checked_out_offsite, shift.checked_out_early, and
 * shift.auto_checked_out (sweep at 23:59).
 *
 * Used by the /reports/timesheet page — shifts table doesn't have a
 * check_out_at column, so the events log is authoritative for "when
 * the rep actually clocked out".
 *
 * Pass at most ~1k shift ids per call. Larger batches should chunk.
 */
const CHECKOUT_EVENT_TYPES = [
  "shift.checked_out",
  "shift.checked_out_offsite",
  "shift.checked_out_early",
  "shift.auto_checked_out",
] as const;

export async function getCheckoutTimesForShifts(
  shiftIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isSupabaseConfigured() || !supabase) return out;
  if (shiftIds.length === 0) return out;
  // Defensive cap: a manager opening Live Ops on a busy day might
  // ask for checkout times across hundreds of shifts. The old query
  // had no `.limit()` and PostgREST defaults to 1000 rows; if any
  // shift accumulated many checkout events (bulk re-checkouts during
  // a bug, debug runs, etc) those would crowd out other shifts'
  // latest events. Asking for `shiftIds.length * 4` gives plenty of
  // headroom (each shift typically has at most 1-2 checkout events)
  // while keeping the response bounded.
  const cap = Math.max(50, shiftIds.length * 4);
  const { data, error } = await supabase
    .from("shift_events")
    .select("shift_id, created_at, event_type")
    .in("shift_id", shiftIds)
    .in("event_type", CHECKOUT_EVENT_TYPES as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[events] checkout times:", error.message);
    return out;
  }
  // Rows are sorted newest-first; first row per shift_id wins.
  for (const r of (data as { shift_id: string | null; created_at: string }[]) || []) {
    if (r.shift_id && !out.has(r.shift_id)) out.set(r.shift_id, r.created_at);
  }
  return out;
}
