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
  | "shift.checked_out"
  | "shift.deleted"
  // Requests
  | "request.submitted"
  | "request.scheduled"
  | "request.declined"
  // Customers
  | "customer.created"
  | "customer.deactivated"
  | "customer.reactivated"
  | "customer.deleted"
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
  "shift.checked_out": "checked out",
  "shift.deleted": "removed a shift",
  "request.submitted": "requested a customer",
  "request.scheduled": "approved a request",
  "request.declined": "declined a request",
  "customer.created": "added a customer",
  "customer.deactivated": "deactivated a customer",
  "customer.reactivated": "reactivated a customer",
  "customer.deleted": "deleted a customer",
  "library.uploaded": "uploaded a file",
  "library.deleted": "deleted a file",
  "task.created": "added a task",
  "task.deleted": "removed a task",
};

/** Tone hint for the feed UI — colours the left-edge accent. */
export function eventTone(type: EventType): "ok" | "warn" | "danger" | "info" {
  if (type === "shift.checked_in" || type === "shift.checked_out") return "ok";
  if (
    type === "shift.deleted" ||
    type === "customer.deleted" ||
    type === "library.deleted" ||
    type === "task.deleted"
  )
    return "danger";
  if (type === "request.submitted") return "info";
  return "ok";
}
