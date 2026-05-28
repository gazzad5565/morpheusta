/**
 * Requests store (admin) — list pending rep-requested shifts so an admin
 * can approve (schedule) or decline them.
 *
 * Implementation note: same FK gotcha as rep_locations. requested_shifts.rep_id
 * → auth.users(id), and profiles.id → auth.users(id), but PostgREST can't
 * resolve a multi-hop join through auth.users. So we do two queries here too
 * (requested_shifts + profiles) and merge in JS.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent, type EventType } from "./events-store";
import { createShift } from "./shifts-store";
import { todayLocalISO } from "./format";
import { notifySaved, notifySaveError } from "./save-status";

export interface PendingRequest {
  id: string; // composite "{userId}-{customerId}"
  customerId: string;
  customerName: string;
  customerInitials: string;
  customerColor: string;
  /** Opaque text — was `number` pre-May-28 (Mariska B5). */
  customerCode: string;
  repId: string;
  repName: string;
  repEmail: string;
  status: string;
  requestedAt: string; // ISO
}

interface RequestRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_initials: string;
  customer_color: string;
  /** Text column since 2026_05_28_customer_code_text.sql. */
  customer_code: string;
  rep_id: string | null;
  status: string;
  requested_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string;
}

/** Fetch all rep-requested shifts where status = 'pending'. */
export async function listPendingRequests(): Promise<PendingRequest[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data: rows, error: rowsErr } = await supabase
    .from("requested_shifts")
    .select(
      "id, customer_id, customer_name, customer_initials, customer_color, customer_code, rep_id, status, requested_at"
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  if (rowsErr) {
    // eslint-disable-next-line no-console
    console.warn("[requests] list:", rowsErr.message);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const repIds = (rows as RequestRow[])
    .map((r) => r.rep_id)
    .filter((id): id is string => id !== null);
  let profileMap = new Map<string, { name: string | null; email: string }>();
  if (repIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", repIds);
    if (profErr) {
      // eslint-disable-next-line no-console
      console.warn("[requests] profiles:", profErr.message);
    } else {
      profileMap = new Map(
        ((profiles as ProfileRow[]) || []).map((p) => [
          p.id,
          { name: p.name, email: p.email },
        ])
      );
    }
  }

  return (rows as RequestRow[]).map((r) => {
    const profile = (r.rep_id && profileMap.get(r.rep_id)) || {
      name: null,
      email: "",
    };
    const repName =
      profile.name?.trim() || profile.email.split("@")[0] || "Unknown rep";
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerInitials: r.customer_initials,
      customerColor: r.customer_color,
      customerCode: r.customer_code,
      repId: r.rep_id || "",
      repName,
      repEmail: profile.email,
      status: r.status,
      requestedAt: r.requested_at,
    };
  });
}

/**
 * Subscribe to realtime changes on the requested_shifts table. Caller's
 * onChange runs on every insert/update/delete. Returns an unsubscribe
 * function. Requires the table to be in the supabase_realtime
 * publication (see db/migrations/2026_05_05_requested_shifts_realtime.sql).
 *
 * Each call gets a unique channel name to avoid the supabase-js
 * collision when two components subscribe at the same time.
 */
let _requestsChannelCounter = 0;

export function subscribeRequests(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _requestsChannelCounter += 1;
    const channelName = `requested_shifts_live_${Date.now()}_${_requestsChannelCounter}`;
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
        console.warn("[requests] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[requests] subscribe failed:", err);
    return () => {};
  }
}

/**
 * One-tap approval. Creates a shift assigned to the requester with
 * sensible defaults, then deletes the pending request. Use this when
 * the manager doesn't need to override the rep / time / tasks — the
 * form-based flow (router.push to /schedule/new?…) is still there for
 * when they do.
 *
 * Defaults:
 *   - shift_date  = today (local tz)
 *   - start_time  = 08:00
 *   - end_time    = 17:00
 *   - tasks_total = 4
 * Override any of these by passing `opts`.
 */
export async function approveRequest(
  id: string,
  opts?: {
    shift_date?: string;
    start_time?: string;
    end_time?: string;
    tasks_total?: number;
    distance_label?: string;
  }
): Promise<{ ok: boolean; error?: string; shiftId?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }

  // Atomic claim. Flips the row from status='pending' → 'approving'
  // AND reads the rep/customer fields in one round-trip. If the
  // filter clause misses (the row isn't pending anymore — another
  // concurrent approve already grabbed it, the manager declined it,
  // etc.) the UPDATE affects 0 rows and we bail. Without this,
  // double-tapping Approve fast (or two managers tapping at the
  // same moment) raced two parallel createShift calls and produced
  // duplicate shifts — Mariska's "one request → two shifts" bug.
  // (May 14, Gary.)
  const { data: claimed, error: claimErr } = await supabase
    .from("requested_shifts")
    .update({ status: "approving" })
    .eq("id", id)
    .eq("status", "pending")
    .select("rep_id, customer_id, customer_name")
    .maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) {
    return {
      ok: false,
      error: "Already being processed (or no longer pending).",
    };
  }

  const r = claimed as {
    rep_id: string | null;
    customer_id: string;
    customer_name: string;
  };
  if (!r.rep_id) {
    // Revert the claim so the manager can fix the request manually.
    await supabase
      .from("requested_shifts")
      .update({ status: "pending" })
      .eq("id", id);
    return {
      ok: false,
      error: "This request has no rep attached — open Schedule to assign one manually.",
    };
  }

  // Create the shift with defaults.
  const created = await createShift({
    customer_id: r.customer_id,
    rep_id: r.rep_id,
    shift_date: opts?.shift_date || todayLocalISO(),
    start_time: opts?.start_time || "08:00",
    end_time: opts?.end_time || "17:00",
    tasks_total: opts?.tasks_total ?? 4,
    distance_label: opts?.distance_label || "",
  });
  if (!created.ok) {
    // createShift failed AFTER we claimed the request. Release the
    // claim so the row is re-approvable on retry.
    await supabase
      .from("requested_shifts")
      .update({ status: "pending" })
      .eq("id", id);
    return { ok: false, error: created.error };
  }

  // Delete the request now that the shift exists. logEvent inside
  // deleteRequest will emit a request.scheduled event.
  const del = await deleteRequest(id, "scheduled");
  if (!del.ok) {
    // Shift was created but request wasn't cleared — surface the error
    // so the manager knows to delete it manually. Don't try to roll
    // back the shift; the rep would rather have a duplicate to clean
    // up than a missing approved shift.
    return { ok: false, error: `Shift created, but couldn't clear the request: ${del.error}` };
  }

  return { ok: true, shiftId: created.id };
}

/**
 * Delete a single request by composite id. Pass `outcome` so the event
 * log knows whether this was a "scheduled" approval (the schedule form
 * deletes after creating the shift) or a manual "declined" action.
 */
export async function deleteRequest(
  id: string,
  outcome: "scheduled" | "declined" | "handled" = "handled"
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: row } = await supabase
    .from("requested_shifts")
    .select("customer_id, customer_name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("requested_shifts").delete().eq("id", id);
  if (error) {
    notifySaveError(error.message, "request");
    return { ok: false, error: error.message };
  }
  const customerName =
    (row as { customer_name?: string } | null)?.customer_name || "a customer";
  const eventType: EventType =
    outcome === "scheduled"
      ? "request.scheduled"
      : outcome === "declined"
      ? "request.declined"
      : "request.declined";
  await logEvent({
    event_type: eventType,
    customer_id: (row as { customer_id?: string } | null)?.customer_id || null,
    message:
      outcome === "scheduled"
        ? `Approved request for ${customerName}`
        : `Declined request for ${customerName}`,
  });
  notifySaved(outcome === "scheduled" ? "request approved" : "request declined");
  return { ok: true };
}
