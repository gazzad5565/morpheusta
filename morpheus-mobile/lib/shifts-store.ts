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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Shifts assigned to the current user, today. */
export async function listMyShiftsToday(): Promise<
  Array<Shift & { realId: string; repId: string | null; checkInAt: string | null; state: string }>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("rep_id", userId)
    .eq("shift_date", todayISO())
    .order("start_time", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listMyShiftsToday:", error.message);
    return [];
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

  const { error } = await supabase
    .from("shifts")
    .update({ rep_id: userId })
    .eq("id", shiftId)
    .is("rep_id", null); // Only succeeds if it's still unassigned (race-safe)

  if (error) return { ok: false, error: error.message };
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
 * Check in to a shift — sets state='in-progress' and stamps check_in_at.
 * RLS allows update where rep_id = auth.uid() (the rep's own shift).
 */
export async function checkInToShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("shifts")
    .update({
      state: "in-progress",
      check_in_at: new Date().toISOString(),
    })
    .eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
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
  const update: Record<string, unknown> = { state: "complete" };
  if (typeof tasksDone === "number") update.tasks_done = tasksDone;
  const { error } = await supabase.from("shifts").update(update).eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
