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
  customer_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  compulsory: boolean;
  sort_order: number;
  created_at?: string;
  /** Joined customer summary, when present. */
  customers?: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
  } | null;
}

export interface NewTask {
  customer_id: string;
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
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase
    .from("customer_tasks")
    .insert({
      customer_id: t.customer_id,
      name: t.name.trim(),
      description: t.description?.trim() || null,
      duration_min: t.duration_min ?? 10,
      compulsory: t.compulsory ?? false,
      sort_order: t.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function deleteTask(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Database not configured" };
  const { error } = await supabase.from("customer_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
