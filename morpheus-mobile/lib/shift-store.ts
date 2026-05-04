/**
 * Shift store — Phase 2: backed by Supabase Postgres.
 *
 * Falls back to localStorage if Supabase isn't configured (e.g. local dev
 * without env vars). That keeps the app usable in offline or unconfigured
 * states.
 *
 * Phase 1 used localStorage exclusively. We've migrated to Supabase so:
 *  - Requested shifts persist across devices and browsers
 *  - Admins can (eventually) see them in the admin app
 *  - The Add-shift Allow toggle in admin Settings can actually gate behavior
 *
 * Auth is not yet wired (Phase 2 next session). For now `rep_id` is null,
 * meaning ALL requests are visible to every user of the mobile app. RLS
 * policies will be tightened once auth lands.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import type { Shift } from "./mock-data";

const KEY = "morpheus.requested-shifts.v1";

export interface RequestedShift extends Shift {
  requestedAt: number;
}

// ─── localStorage fallback (used only when Supabase isn't configured) ─────

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function lsRead(): RequestedShift[] {
  if (typeof window === "undefined") return [];
  return safe(() => {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [] as RequestedShift[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RequestedShift[]) : [];
  }, [] as RequestedShift[]);
}

function lsWrite(items: RequestedShift[]): void {
  if (typeof window === "undefined") return;
  safe(() => window.localStorage.setItem(KEY, JSON.stringify(items)), undefined);
}

// ─── Supabase row mapping ─────────────────────────────────────────────────

interface DbRow {
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

function rowToShift(row: DbRow): RequestedShift {
  // Use customer_id as the externally-visible id so callers compare with
  // ALL_CUSTOMERS[i].id (which is also the customer code). The DB row's id
  // is a composite "{userId}-{customerId}" — internal only.
  return {
    id: row.customer_id,
    name: row.customer_name,
    initials: row.customer_initials,
    color: row.customer_color,
    code: row.customer_code,
    start: "",
    end: "",
    distance: "",
    requestedAt: new Date(row.requested_at).getTime(),
  };
}

// ─── Public API (async; callers await) ────────────────────────────────────

export async function listRequestedShifts(): Promise<RequestedShift[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return lsRead();
  }
  const { data, error } = await supabase
    .from("requested_shifts")
    .select("*")
    .order("requested_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] list error, falling back to local:", error.message);
    return lsRead();
  }
  return (data as DbRow[]).map(rowToShift);
}

export async function addRequestedShift(
  shift: Omit<Shift, "start" | "end" | "distance">
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    const existing = lsRead();
    if (existing.some((s) => s.id === shift.id)) return;
    lsWrite([
      ...existing,
      {
        ...shift,
        start: "",
        end: "",
        distance: "",
        requestedAt: Date.now(),
      },
    ]);
    return;
  }
  // Composite row id keeps the (rep_id, customer_id) pair unique per user.
  // RLS already restricts visibility, but we need a globally-unique PK to
  // let two different users both request the same customer.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] add: no authenticated user; skipping insert.");
    return;
  }
  const rowId = `${userId}-${shift.id}`;

  const { error } = await supabase.from("requested_shifts").upsert(
    {
      id: rowId,
      customer_id: shift.id,
      customer_name: shift.name,
      customer_initials: shift.initials,
      customer_color: shift.color,
      customer_code: shift.code,
      status: "pending",
      // rep_id auto-fills via DEFAULT auth.uid() on the server side
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] add error:", error.message);
  }
}

export async function removeRequestedShift(id: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    lsWrite(lsRead().filter((s) => s.id !== id));
    return;
  }
  // RLS restricts the delete to the current user's row only — even though
  // multiple users might have rows with the same customer_id, only mine
  // is visible (and therefore deletable) to me.
  const { error } = await supabase
    .from("requested_shifts")
    .delete()
    .eq("customer_id", id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shift-store] remove error:", error.message);
  }
}
