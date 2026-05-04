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

function rowToShift(row: ShiftRow): Shift & { realId: string; repId: string | null } {
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
    // Internal — for claim/check-in
    realId: row.id,
    repId: row.rep_id,
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Shifts assigned to the current user, today. */
export async function listMyShiftsToday(): Promise<
  Array<Shift & { realId: string; repId: string | null }>
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

/** Unassigned shifts today — anyone authenticated can see + claim. */
export async function listUnassignedShiftsToday(): Promise<
  Array<Shift & { realId: string; repId: string | null }>
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
