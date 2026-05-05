/**
 * Shifts store (admin) — list + create.
 *
 * Admins see ALL shifts (not just their own) since the SELECT policy is
 * `TO authenticated USING (true)`. Phase 4 will scope this to manager role.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";

export interface ShiftRow {
  id: string;
  customer_id: string;
  rep_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  distance_label: string | null;
  state: string;
  check_in_at: string | null;
  tasks_done: number;
  tasks_total: number;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
  } | null;
}

export async function listShifts(opts?: {
  date?: string; // YYYY-MM-DD; default today
  limit?: number;
}): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const date = opts?.date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("shift_date", date)
    .order("start_time", { ascending: true })
    .limit(opts?.limit ?? 100);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] list:", error.message);
    return [];
  }
  return data as ShiftRow[];
}

/**
 * Shifts whose `shift_date` falls in [startISO, endISO] (inclusive).
 * Used by the /schedule week-planner.
 */
export async function listShiftsInRange(
  startISO: string,
  endISO: string
): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .gte("shift_date", startISO)
    .lte("shift_date", endISO)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listInRange:", error.message);
    return [];
  }
  return data as ShiftRow[];
}

export interface NewShift {
  customer_id: string;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  distance_label?: string;
  tasks_total?: number;
  /** Optional. If null/undefined, the shift is claimable by any rep. */
  rep_id?: string | null;
}

export async function createShift(
  s: NewShift
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase
    .from("shifts")
    .insert({
      customer_id: s.customer_id,
      shift_date: s.shift_date,
      start_time: s.start_time,
      end_time: s.end_time,
      distance_label: s.distance_label || "",
      tasks_total: s.tasks_total ?? 4,
      rep_id: s.rep_id || null,
    })
    .select("id, customers(name)")
    .single();
  if (error) return { ok: false, error: error.message };
  const customerName =
    (data as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.scheduled",
    shift_id: data?.id,
    customer_id: s.customer_id,
    message: `Scheduled ${customerName} on ${s.shift_date} ${s.start_time}–${s.end_time}`,
    meta: { rep_assigned: s.rep_id ? true : false },
  });
  return { ok: true, id: data?.id };
}

export async function deleteShift(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Database not configured" };
  const { data: row } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  const customerName =
    (row as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.deleted",
    customer_id: (row as { customer_id?: string } | null)?.customer_id || null,
    message: `Removed shift at ${customerName}`,
  });
  return { ok: true };
}

/**
 * Subscribe to realtime changes on the shifts table. The callback is
 * called on any insert/update/delete. Caller decides what to do — most
 * consumers just refetch their list.
 *
 * Returns an unsubscribe function. Requires the shifts table to be in
 * the supabase_realtime publication
 * (see db/migrations/2026_05_05_shifts_realtime.sql).
 *
 * Each call gets a unique channel name. supabase-js stores channels by
 * name on the client; if two subscribers used the same name the second
 * call collided with the first — which crashed the whole dashboard
 * because both KpiStrip and ShiftsList subscribe at the same time.
 *
 * Wrapped in a try/catch so a misbehaving realtime client (publication
 * not configured, websocket can't open, etc) can never bring down the
 * page that called us. Worst case: no live updates, manual refresh
 * still works.
 */
let _shiftsChannelCounter = 0;

export function subscribeShifts(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _shiftsChannelCounter += 1;
    const channelName = `shifts_live_${Date.now()}_${_shiftsChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        () => onChange()
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[shifts] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] subscribe failed:", err);
    return () => {};
  }
}
