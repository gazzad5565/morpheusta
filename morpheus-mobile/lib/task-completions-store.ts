/**
 * Task completions store (mobile) — record which customer_tasks the rep
 * ticked off during a given shift.
 *
 * Mirror of the local `completedTaskIds` array on /active, but persisted
 * so a manager can see exactly what was done on each shift, and so a rep
 * who closes / reopens the app mid-shift doesn't lose their ticks.
 *
 * Idempotent on insert: if the rep accidentally taps complete twice the
 * unique (shift_id, task_id) constraint absorbs it.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

/** Task ids the current rep has already completed on this shift. */
export async function listCompletedTaskIds(shiftId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shift_task_completions")
    .select("task_id")
    .eq("shift_id", shiftId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[task-completions] list:", error.message);
    return [];
  }
  return ((data as { task_id: string }[]) || []).map((r) => r.task_id);
}

/** Tick a task as done for this shift. Idempotent. */
export async function markTaskComplete(
  shiftId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const repId = userData.user?.id || null;

  // upsert via onConflict so a double-tap doesn't error.
  const { error } = await supabase
    .from("shift_task_completions")
    .upsert(
      {
        shift_id: shiftId,
        task_id: taskId,
        rep_id: repId,
      },
      { onConflict: "shift_id,task_id" }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Untick a task. Used if we ever expose an undo on /active. */
export async function unmarkTaskComplete(
  shiftId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("shift_task_completions")
    .delete()
    .eq("shift_id", shiftId)
    .eq("task_id", taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
