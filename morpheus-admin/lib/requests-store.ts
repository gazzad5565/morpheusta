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

export interface PendingRequest {
  id: string; // composite "{userId}-{customerId}"
  customerId: string;
  customerName: string;
  customerInitials: string;
  customerColor: string;
  customerCode: number;
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
  customer_code: number;
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

/** Delete a single request by composite id (used after approving + scheduling, or on decline). */
export async function deleteRequest(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase.from("requested_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
