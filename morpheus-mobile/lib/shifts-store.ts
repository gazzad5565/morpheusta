/**
 * Shifts store (mobile) — reads + claims shifts from Supabase.
 *
 * Two views the mobile app cares about:
 *   - "My shifts today" → rep_id = me, shift_date = today
 *   - "Unscheduled today" → rep_id IS NULL, shift_date = today (claimable)
 *
 * Each row joins with the customers table so we get the display info
 * (name, initials, color, code) in one query.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import type { Shift } from "./mock-data";

interface ShiftRow {
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

/** Convert "08:00:00" → "08:00 AM" */
function formatTimeLabel(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

function rowToShift(
  row: ShiftRow
): Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string } {
  const c = row.customers;
  return {
    // The "id" used by mobile UI for matching is customer id
    id: c?.id || row.customer_id,
    name: c?.name || "Unknown customer",
    initials: c?.initials || "??",
    color: c?.color || "#888",
    code: c?.code || 0,
    start: formatTimeLabel(row.start_time),
    end: formatTimeLabel(row.end_time),
    distance: row.distance_label || "",
    // Internal — for claim/check-in/timer + state badge
    realId: row.id,
    repId: row.rep_id,
    checkInAt: row.check_in_at,
    state: row.state,
  };
}

// "Today" in local tz — see lib/format.ts for the why.
import { todayLocalISO as todayISO } from "./format";

/** Shifts assigned to the current user, today. */
export async function listMyShiftsToday(): Promise<
  Array<Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string }>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const today = todayISO();
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("rep_id", userId)
    .eq("shift_date", today)
    .order("start_time", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listMyShiftsToday:", error.message);
    return [];
  }

  // If we got nothing back, log a one-line diagnostic so the rep
  // (and us, when they screenshot the console) can see WHY their
  // dashboard is empty — without the diagnostic the most common
  // misdiagnosis is "the app is broken" when actually the shifts
  // were assigned to a different rep or dated something else.
  if (!data || data.length === 0) {
    const { count } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("rep_id", userId);
    // eslint-disable-next-line no-console
    console.info(
      `[shifts] listMyShiftsToday: 0 today (${today}). Total shifts assigned to me (any date): ${
        count ?? "unknown"
      }. user_id=${userId}`
    );
  }

  return (data as ShiftRow[]).map(rowToShift);
}

/**
 * The rep's currently active (in-progress) shift, if any.
 *
 * Used by the active-shift screen and the check-out screen so they can
 * read/update the right row without threading a shift id through the URL.
 * If there's more than one in-progress shift (shouldn't happen normally),
 * returns the most recently checked-in one.
 */
export async function getMyActiveShift(): Promise<
  (Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string }) | null
> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("rep_id", userId)
    .eq("state", "in-progress")
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getMyActiveShift:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToShift(data as ShiftRow);
}

/** Unassigned shifts today — anyone authenticated can see + claim. */
export async function listUnassignedShiftsToday(): Promise<
  Array<Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string }>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .is("rep_id", null)
    .eq("shift_date", todayISO())
    .order("start_time", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listUnassignedShiftsToday:", error.message);
    return [];
  }
  return (data as ShiftRow[]).map(rowToShift);
}

/** Claim an unassigned shift — sets rep_id to the current user. */
export async function claimShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  // Look up the shift first so we can include the customer in the event log.
  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();

  const { error } = await supabase
    .from("shifts")
    .update({ rep_id: userId })
    .eq("id", shiftId)
    .is("rep_id", null); // Only succeeds if it's still unassigned (race-safe)

  if (error) return { ok: false, error: error.message };
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.claimed",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Claimed shift at ${customerName}`,
  });
  return { ok: true };
}

/** Fetch a single shift by id, joined with its customer. */
export async function getShiftById(
  shiftId: string
): Promise<(Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string }) | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("id", shiftId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[shifts] getById:", error.message);
    return null;
  }
  return rowToShift(data as ShiftRow);
}

/**
 * Check in to a shift — sets state='in-progress', stamps check_in_at,
 * AND claims the shift (sets rep_id = current user) if it was unassigned.
 *
 * Bug previously: this function only flipped state. If a rep tapped
 * Check in on an unassigned shift via a deep link or similar, rep_id
 * stayed null, so:
 *   - getMyActiveShift() (filters by rep_id = me) returned null →
 *     /active redirected back to "Today's shifts"
 *   - The location-tracker, which only mounts on /active, never started
 *     → no rep_locations row → admin map didn't show the rep
 *   - The admin shifts list rendered the row as "Unassigned" because
 *     there was no rep_id to resolve against profiles
 *
 * Fix: include rep_id in the update so a check-in always claims the
 * shift to the user. Refuses if the shift is already assigned to a
 * different rep (the .or filter limits it to "unassigned or already
 * mine").
 */
export async function checkInToShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("shifts")
    .update({
      state: "in-progress",
      check_in_at: new Date().toISOString(),
      rep_id: userId,
    })
    .eq("id", shiftId)
    // Only succeed when the shift is unassigned or already mine.
    // Postgrest .or() syntax: comma-separated filters in one OR group.
    .or(`rep_id.is.null,rep_id.eq.${userId}`)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "That shift is assigned to another rep — can't check in.",
    };
  }
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "customer";
  await logEvent({
    event_type: "shift.checked_in",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Checked into ${customerName}`,
  });
  return { ok: true };
}

/**
 * Tasks defined for a customer (admin-managed via /tasks).
 * Used on the active-shift screen so the rep sees what to do at this site.
 */
export interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  compulsory: boolean;
  sort_order: number;
}

export async function getTasksForCustomer(customerId: string): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  // Match this customer's specific tasks AND any universal (NULL) tasks
  // that apply to all customers.
  const { data, error } = await supabase
    .from("customer_tasks")
    .select("id, name, description, duration_min, compulsory, sort_order")
    .or(`customer_id.eq.${customerId},customer_id.is.null`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getTasksForCustomer:", error.message);
    return [];
  }
  return (data as TaskRow[]) || [];
}

/**
 * Check out of a shift — sets state='complete'. Also accepts a tasksDone
 * value so the admin can see how many tasks the rep finished.
 */
export async function checkOutOfShift(
  shiftId: string,
  tasksDone?: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();
  const update: Record<string, unknown> = {
    state: "complete",
    // First-class column so the timesheet can compute hours without
    // joining shift_events. The events log still gets a row below for
    // the audit trail / Live Feed.
    check_out_at: new Date().toISOString(),
  };
  if (typeof tasksDone === "number") update.tasks_done = tasksDone;
  const { error } = await supabase.from("shifts").update(update).eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "customer";
  await logEvent({
    event_type: "shift.checked_out",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Checked out of ${customerName}`,
    meta: typeof tasksDone === "number" ? { tasks_done: tasksDone } : undefined,
  });
  return { ok: true };
}

/**
 * Subscribe to realtime changes on the shifts table. The callback fires
 * on any insert/update/delete; the caller is expected to refetch its
 * own shape (listMyShiftsToday, etc).
 *
 * Mirror of the admin-side subscribeShifts. Without this, a rep who's
 * looking at the dashboard right now wouldn't see a freshly-assigned
 * shift until they switched tabs and came back.
 *
 * Each call gets a unique channel name to avoid the supabase-js
 * collision when two screens subscribe at the same time.
 *
 * Wrapped in try/catch so a misbehaving realtime client (publication
 * not configured, websocket can't open) can never crash the page.
 */
let _shiftsChannelCounter = 0;

export function subscribeShifts(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _shiftsChannelCounter += 1;
    const channelName = `mobile_shifts_live_${Date.now()}_${_shiftsChannelCounter}`;
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
