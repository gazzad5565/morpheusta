/**
 * Shifts store (admin) — list + create.
 *
 * Admins see ALL shifts (not just their own) since the SELECT policy is
 * `TO authenticated USING (true)`. Phase 4 will scope this to manager role.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import { getAutoCheckoutTime } from "./settings-store";

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

/**
 * "Today" in the user's local timezone, formatted YYYY-MM-DD.
 * Note: we deliberately don't use toISOString() here — that returns UTC,
 * which means at e.g. 1 AM local in UTC+2 you'd get yesterday's date and
 * the dashboard would show yesterday's shifts as "today's".
 */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function listShifts(opts?: {
  date?: string; // YYYY-MM-DD; default today (local tz)
  limit?: number;
}): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const date = opts?.date || todayLocalISO();
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

/** One shift by id, with the joined customer block. Used by the shift
 *  detail page. */
export async function getShiftById(id: string): Promise<ShiftRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getById:", error.message);
    return null;
  }
  return (data as ShiftRow | null) ?? null;
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

/**
 * Sweep stale "active" shifts past the auto-checkout cutoff and force
 * them to "complete", and clear any orphaned rep_locations rows that
 * are leaving phantom dots on the admin map.
 *
 * Without this, reps who forget to tap Check out keep showing as "in
 * shift" on the dashboard map forever and their green dot stays alive.
 *
 * Two passes:
 *
 * 1. Active-state shifts past cutoff → state="complete".
 *    Active = state in ('in-progress','travelling','on-break','late').
 *    Cutoff:
 *      - shift_date < today                                  → always stale
 *      - shift_date == today AND now >= auto_checkout_time    → stale
 *
 * 2. Orphan rep_locations cleanup. Any rep_locations row whose rep_id
 *    has NO currently-active shift gets deleted. Catches the case
 *    where a shift was already marked complete (manual check-out, an
 *    earlier sweep run, or a previous bug) but the location-tracker's
 *    final clearRepLocation() never fired so the dot stuck.
 *
 * Returns the number of shifts auto-completed (orphan rep_locations
 * cleanup runs silently). Safe to call on every admin home mount.
 */
const ACTIVE_SHIFT_STATES = ["in-progress", "travelling", "on-break", "late"];

export async function sweepStaleShifts(): Promise<{ swept: number }> {
  if (!isSupabaseConfigured() || !supabase) return { swept: 0 };

  const cutoff = await getAutoCheckoutTime(); // "HH:MM"
  const today = todayLocalISO();
  const now = new Date();
  const [ch, cm] = cutoff.split(":").map((n) => parseInt(n, 10));
  const cutoffTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    ch,
    cm,
    0,
    0
  ).getTime();
  const todayPastCutoff = now.getTime() >= cutoffTodayMs;

  // ─── Pass 1: stale active shifts ─────────────────────────────────────
  const { data, error } = await supabase
    .from("shifts")
    .select("id, rep_id, shift_date, customer_id, customers(name)")
    .in("state", ACTIVE_SHIFT_STATES);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] sweep select:", error.message);
  }
  type Row = {
    id: string;
    rep_id: string | null;
    shift_date: string;
    customer_id: string;
    customers: { name?: string } | null;
  };
  const rows = (data as Row[]) || [];
  const stale = rows.filter((r) => {
    if (r.shift_date < today) return true;
    if (r.shift_date === today && todayPastCutoff) return true;
    return false;
  });

  if (stale.length > 0) {
    const ids = stale.map((s) => s.id);
    const { error: updErr } = await supabase
      .from("shifts")
      .update({ state: "complete" })
      .in("id", ids);
    if (updErr) {
      // eslint-disable-next-line no-console
      console.warn("[shifts] sweep update:", updErr.message);
    }

    // Audit trail per shift.
    for (const s of stale) {
      const customerName = s.customers?.name || "a customer";
      await logEvent({
        event_type: "shift.auto_checked_out",
        shift_id: s.id,
        customer_id: s.customer_id,
        message: `Auto checked-out of ${customerName} (past ${cutoff})`,
        meta: { cutoff, shift_date: s.shift_date },
      });
    }
  }

  // ─── Pass 2: orphan rep_locations cleanup ────────────────────────────
  // Re-fetch the still-active shift list AFTER pass 1 so the active-rep
  // set reflects any auto-completes we just did.
  const { data: stillActive } = await supabase
    .from("shifts")
    .select("rep_id")
    .in("state", ACTIVE_SHIFT_STATES);
  const activeRepIds = new Set(
    ((stillActive as { rep_id: string | null }[]) || [])
      .map((r) => r.rep_id)
      .filter((id): id is string => !!id)
  );

  const { data: locRows } = await supabase
    .from("rep_locations")
    .select("rep_id");
  const orphanRepIds = ((locRows as { rep_id: string }[]) || [])
    .map((r) => r.rep_id)
    .filter((id) => !activeRepIds.has(id));

  if (orphanRepIds.length > 0) {
    // .select() after .delete() returns the deleted rows so we can
    // detect silent RLS blocks (Postgres returns 0 rows + no error
    // when a policy refuses the delete). The manager-delete policy
    // in db/migrations/2026_05_06_rep_locations_manager_delete.sql
    // is required for the admin app to actually wipe these rows.
    const { data: deleted, error: delErr } = await supabase
      .from("rep_locations")
      .delete()
      .in("rep_id", orphanRepIds)
      .select("rep_id");
    if (delErr) {
      // eslint-disable-next-line no-console
      console.warn("[sweep] clear orphan locations:", delErr.message);
    } else if (!deleted || deleted.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sweep] tried to clear ${orphanRepIds.length} orphan rep_locations row(s) but Postgres affected 0 — likely missing the rep_locations_manager_delete RLS policy. Apply db/migrations/2026_05_06_rep_locations_manager_delete.sql in Supabase.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.info(
        `[sweep] cleared ${deleted.length} orphan rep_locations row(s)`
      );
    }
  }

  return { swept: stale.length };
}
