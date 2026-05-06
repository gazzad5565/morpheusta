/**
 * Events store (mobile) — write-only mirror of the admin events log.
 * Used to record shift-lifecycle actions the rep takes (claim, check-in,
 * check-out, request submission) so the admin Live Feed sees them in
 * real time.
 */

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
  | "shift.task_started"
  | "shift.task_completed"
  | "shift.break_started"
  | "shift.break_ended"
  | "shift.travel_started"
  | "shift.travel_ended"
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

/**
 * Insert a row. Best-effort but offline-resilient: if the write fails
 * (no network, screen sleeping, RLS hiccup) the payload is queued in
 * localStorage and retried on the next mount or focus. See
 * lib/event-queue.ts for the implementation.
 */
export { logEventReliably as logEvent } from "./event-queue";
