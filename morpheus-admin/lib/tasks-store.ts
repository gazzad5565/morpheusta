/**
 * Tasks store (admin) — CRUD for customer_tasks.
 *
 * Each customer has its own list of tasks the rep should perform on a
 * shift at that customer. The mobile app reads these on /active and
 * renders them under the timer.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface TaskRow {
  id: string;
  /** NULL = universal (applies to ALL customers). */
  customer_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  compulsory: boolean;
  sort_order: number;
  created_at?: string;
  /** Joined customer summary, when present (null for universal tasks). */
  customers?: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
  } | null;
}

export interface NewTask {
  /**
   * Which customers this task applies to.
   *   null  → universal (single row inserted with customer_id=NULL)
   *   ['x'] → one specific customer
   *   ['x','y','z'] → spray N rows, one per customer
   */
  customerIds: string[] | null;
  name: string;
  description?: string;
  duration_min?: number;
  compulsory?: boolean;
  sort_order?: number;
}

/** All tasks across all customers (admin /tasks page). */
export async function listAllTasks(): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      "id, customer_id, name, description, duration_min, compulsory, sort_order, created_at, customers(id,name,initials,color,code)"
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[tasks] listAll:", error.message);
    return [];
  }
  return (data as unknown as TaskRow[]) || [];
}

/** Tasks for a single customer (used on the customer detail page). */
export async function listTasksForCustomer(customerId: string): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      "id, customer_id, name, description, duration_min, compulsory, sort_order, created_at"
    )
    .eq("customer_id", customerId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[tasks] listForCustomer:", error.message);
    return [];
  }
  return (data as TaskRow[]) || [];
}

export async function createTask(
  t: NewTask
): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }

  const base = {
    name: t.name.trim(),
    description: t.description?.trim() || null,
    duration_min: t.duration_min ?? 10,
    compulsory: t.compulsory ?? false,
    sort_order: t.sort_order ?? 0,
  };

  // Build the rows to insert. NULL customer_id = universal.
  // For multi-customer, spray one row per selected customer.
  const rows =
    t.customerIds === null
      ? [{ ...base, customer_id: null }]
      : t.customerIds.map((cid) => ({ ...base, customer_id: cid }));

  if (rows.length === 0) {
    return { ok: false, error: "Pick at least one customer (or 'All customers')." };
  }

  const { error } = await supabase.from("customer_tasks").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: rows.length };
}

export async function deleteTask(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Database not configured" };
  const { error } = await supabase.from("customer_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
