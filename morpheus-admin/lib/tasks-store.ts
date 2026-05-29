/**
 * Tasks store (admin) — CRUD for customer_tasks.
 *
 * Each customer has its own list of tasks the rep should perform on a
 * shift at that customer. The mobile app reads these on /active and
 * renders them under the timer.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import { notifySaved, notifySaveError } from "./save-status";
import { TASK_SELECT } from "./db/selects";

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
  /** Feature C (May 13): photos on tasks. */
  photo_count?: number;
  photos_compulsory?: boolean;
  /** Feature D (May 13): customer signature on the task. When true,
   *  the rep must capture a signature in the rep app before they
   *  can mark the task complete. Combines with photo gates. */
  requires_signature?: boolean;
  /** Joined customer summary, when present (null for universal tasks). */
  customers?: {
    id: string;
    name: string;
    initials: string;
    color: string;
    /** Opaque text — see 2026_05_28_customer_code_text.sql (B5). */
    code: string;
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
  /** Feature C: number of photos the rep must capture during this
   *  task. 0 = no photos. Default 0. */
  photo_count?: number;
  /** Feature C: whether photos are required to mark complete when
   *  photo_count > 0. Ignored at photo_count = 0. Default true. */
  photos_compulsory?: boolean;
  /** Feature D: rep must capture a customer signature to complete. */
  requires_signature?: boolean;
}

/** All tasks across all customers (admin /tasks page). */
export async function listAllTasks(): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      TASK_SELECT
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

/**
 * Count of tasks that apply to each customer in `customerIds`. Used by
 * the schedule form to derive `tasks_total` per shift without making
 * the manager type a number — the count auto-tracks edits to
 * customer_tasks. Universal tasks (customer_id IS NULL) are added to
 * every customer's tally because the rep's /active page surfaces them
 * for any customer.
 *
 * Returns a Map keyed by customer_id. Missing customers default to 0.
 */
export async function countTasksForCustomers(
  customerIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const id of customerIds) result.set(id, 0);
  if (!isSupabaseConfigured() || !supabase) return result;
  if (customerIds.length === 0) return result;

  // Universal-task count — added to every customer's tally below.
  const { count: universalCount, error: uErr } = await supabase
    .from("customer_tasks")
    .select("id", { count: "exact", head: true })
    .is("customer_id", null);
  if (uErr) {
    // eslint-disable-next-line no-console
    console.warn("[tasks] count universals:", uErr.message);
  }

  // Customer-specific task rows for the requested ids. We only need
  // customer_id columns to tally, hence the narrow projection.
  const { data, error } = await supabase
    .from("customer_tasks")
    .select("customer_id")
    .in("customer_id", customerIds);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[tasks] count specific:", error.message);
    return result;
  }

  const universal = universalCount ?? 0;
  for (const id of customerIds) result.set(id, universal);
  for (const row of (data as { customer_id: string }[]) || []) {
    result.set(row.customer_id, (result.get(row.customer_id) ?? 0) + 1);
  }
  return result;
}

/** Tasks for a single customer (used on the customer detail page). */
export async function listTasksForCustomer(customerId: string): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      "id, customer_id, name, description, duration_min, compulsory, sort_order, created_at, photo_count, photos_compulsory, requires_signature"
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
    photo_count: Math.max(0, Math.round(t.photo_count ?? 0)),
    photos_compulsory: t.photos_compulsory ?? true,
    requires_signature: t.requires_signature ?? false,
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
  if (error) {
    notifySaveError(error.message, "task");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "task.created",
    message:
      t.customerIds === null
        ? `Added universal task "${t.name}"`
        : `Added task "${t.name}" to ${rows.length} customer${rows.length === 1 ? "" : "s"}`,
    meta: { customer_count: rows.length },
  });
  notifySaved("task");
  return { ok: true, count: rows.length };
}

export async function deleteTask(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Database not configured" };
  const { data: row } = await supabase
    .from("customer_tasks")
    .select("name, customer_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("customer_tasks").delete().eq("id", id);
  if (error) {
    notifySaveError(error.message, "task");
    return { ok: false, error: error.message };
  }
  const taskName = (row as { name?: string } | null)?.name || "task";
  await logEvent({
    event_type: "task.deleted",
    customer_id: (row as { customer_id?: string | null } | null)?.customer_id || null,
    message: `Removed task "${taskName}"`,
  });
  notifySaved("task removed");
  return { ok: true };
}

/** Fetch a single task by id (admin edit page). */
export async function getTask(id: string): Promise<TaskRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      TASK_SELECT
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[tasks] get:", error.message);
    return null;
  }
  return data as unknown as TaskRow;
}

export interface TaskUpdate {
  /** undefined = leave unchanged. null = make universal (applies to all). */
  customer_id?: string | null;
  name?: string;
  description?: string | null;
  duration_min?: number;
  compulsory?: boolean;
  sort_order?: number;
  /** Feature C — photos on tasks. */
  photo_count?: number;
  photos_compulsory?: boolean;
  /** Feature D — signature on tasks. */
  requires_signature?: boolean;
}

export async function updateTask(
  id: string,
  patch: TaskUpdate
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Strip undefined fields so we don't accidentally null them.
  const dbPatch: Record<string, unknown> = {};
  if (patch.customer_id !== undefined) dbPatch.customer_id = patch.customer_id;
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.description !== undefined) {
    dbPatch.description = patch.description?.trim() || null;
  }
  if (patch.duration_min !== undefined) dbPatch.duration_min = patch.duration_min;
  if (patch.compulsory !== undefined) dbPatch.compulsory = patch.compulsory;
  if (patch.sort_order !== undefined) dbPatch.sort_order = patch.sort_order;
  if (patch.photo_count !== undefined) {
    dbPatch.photo_count = Math.max(0, Math.round(patch.photo_count));
  }
  if (patch.photos_compulsory !== undefined) {
    dbPatch.photos_compulsory = patch.photos_compulsory;
  }
  if (patch.requires_signature !== undefined) {
    dbPatch.requires_signature = patch.requires_signature;
  }

  const { error } = await supabase
    .from("customer_tasks")
    .update(dbPatch)
    .eq("id", id);
  if (error) {
    notifySaveError(error.message, "task");
    return { ok: false, error: error.message };
  }
  notifySaved("task");
  return { ok: true };
}
