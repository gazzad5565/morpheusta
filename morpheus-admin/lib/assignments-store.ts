/**
 * Assignments store (admin) — rep ↔ customer many-to-many.
 *
 * Backed by `rep_customer_assignments`. Both /reps/[id] and
 * /customers/[id] read + write through here.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

interface RcaRow {
  rep_id: string;
  customer_id: string;
}

/** Customer ids assigned to a single rep. */
export async function listCustomersForRep(repId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("rep_customer_assignments")
    .select("customer_id")
    .eq("rep_id", repId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[assignments] customers for rep:", error.message);
    return [];
  }
  return ((data as { customer_id: string }[]) || []).map((r) => r.customer_id);
}

/** Rep ids assigned to a single customer. */
export async function listRepsForCustomer(customerId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("rep_customer_assignments")
    .select("rep_id")
    .eq("customer_id", customerId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[assignments] reps for customer:", error.message);
    return [];
  }
  return ((data as { rep_id: string }[]) || []).map((r) => r.rep_id);
}

/**
 * Replace the rep's full set of customer assignments with the given list.
 * Idempotent: existing rows for this rep are diffed against `customerIds`
 * — only the delta is touched, so assigned_at timestamps on already-set
 * pairs are preserved.
 */
export async function setCustomersForRep(
  repId: string,
  customerIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const desired = new Set(customerIds);
  const current = new Set(await listCustomersForRep(repId));
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("rep_customer_assignments")
      .insert(toAdd.map((customer_id) => ({ rep_id: repId, customer_id })));
    if (error) return { ok: false, error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("rep_customer_assignments")
      .delete()
      .eq("rep_id", repId)
      .in("customer_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Replace the customer's full set of rep assignments with the given list. */
export async function setRepsForCustomer(
  customerId: string,
  repIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const desired = new Set(repIds);
  const current = new Set(await listRepsForCustomer(customerId));
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("rep_customer_assignments")
      .insert(toAdd.map((rep_id) => ({ rep_id, customer_id: customerId })));
    if (error) return { ok: false, error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("rep_customer_assignments")
      .delete()
      .eq("customer_id", customerId)
      .in("rep_id", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Bulk-load assignments and group by rep id (for the /reps list page so
 * we can show "X customers assigned" without N+1 queries).
 */
export async function listAllAssignments(): Promise<RcaRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("rep_customer_assignments")
    .select("rep_id, customer_id");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[assignments] listAll:", error.message);
    return [];
  }
  return (data as RcaRow[]) || [];
}
