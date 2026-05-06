/**
 * Events store (mobile) — write-only mirror of the admin events log.
 * Used to record shift-lifecycle actions the rep takes (claim, check-in,
 * check-out, request submission) so the admin Live Feed sees them in
 * real time.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type EventType =
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
  | "shift.deleted"
  | "request.submitted"
  | "request.scheduled"
  | "request.declined"
  | "customer.created"
  | "customer.deactivated"
  | "customer.reactivated"
  | "customer.deleted"
  | "library.uploaded"
  | "library.deleted"
  | "task.created"
  | "task.deleted";

export interface NewEvent {
  event_type: EventType;
  shift_id?: string | null;
  customer_id?: string | null;
  message?: string;
  meta?: Record<string, unknown>;
}

/** Insert a row. Best-effort — failures are silent so they never block UX. */
export async function logEvent(e: NewEvent): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actorId = userData.user?.id ?? null;
    let actorLabel: string | null = null;
    if (actorId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", actorId)
        .maybeSingle();
      const p = profile as { name?: string | null; email?: string } | null;
      actorLabel = p?.name?.trim() || p?.email?.split("@")[0] || null;
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
    // eslint-disable-next-line no-console
    console.warn("[events] logEvent failed:", err);
  }
}
