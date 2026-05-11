/**
 * Task completions store (admin) — read-side counterpart to the mobile
 * write store. Used by the shift detail page to show "which tasks did
 * this rep tick off, and when?".
 *
 * Same FK gotcha as everywhere else: completion.rep_id → auth.users(id),
 * profiles.id → auth.users(id), but PostgREST can't resolve a hop
 * through auth.users. Two queries + JS merge.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface ShiftTaskCompletion {
  id: string;
  shiftId: string;
  taskId: string;
  repId: string | null;
  repName: string | null;
  completedAt: string;
}

interface CompletionRow {
  id: string;
  shift_id: string;
  task_id: string;
  rep_id: string | null;
  completed_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string;
}

export async function listCompletionsForShift(
  shiftId: string
): Promise<ShiftTaskCompletion[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data: rows, error } = await supabase
    .from("shift_task_completions")
    .select("id, shift_id, task_id, rep_id, completed_at")
    .eq("shift_id", shiftId)
    .order("completed_at", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[task-completions] list:", error.message);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const repIds = (rows as CompletionRow[])
    .map((r) => r.rep_id)
    .filter((id): id is string => id !== null);
  let profileMap = new Map<string, { name: string | null; email: string }>();
  if (repIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", Array.from(new Set(repIds)));
    profileMap = new Map(
      ((profiles as ProfileRow[]) || []).map((p) => [
        p.id,
        { name: p.name, email: p.email },
      ])
    );
  }

  return (rows as CompletionRow[]).map((r) => {
    const profile = (r.rep_id && profileMap.get(r.rep_id)) || null;
    const repName =
      profile?.name?.trim() || profile?.email?.split("@")[0] || null;
    return {
      id: r.id,
      shiftId: r.shift_id,
      taskId: r.task_id,
      repId: r.rep_id,
      repName,
      completedAt: r.completed_at,
    };
  });
}

/**
 * Look up the task the rep currently has in progress on a given
 * shift, if any. Computed from the audit log: take the most recent
 * `shift.task_started` event whose task hasn't yet been completed.
 * Returns null when no task is active (rep hasn't started anything,
 * or finished what they started).
 *
 * Used by the admin shift detail page for in-progress shifts to
 * show "Currently working on: Task X · started 12 min ago" alongside
 * the live timer.
 */
export interface ActiveTask {
  taskId: string;
  taskName: string | null;
  startedAt: string;
}

export async function getActiveTaskForShift(
  shiftId: string
): Promise<ActiveTask | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const [{ data: starts }, { data: completions }] = await Promise.all([
    supabase
      .from("shift_events")
      .select("created_at, meta")
      .eq("shift_id", shiftId)
      .eq("event_type", "shift.task_started")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("shift_task_completions")
      .select("task_id, completed_at")
      .eq("shift_id", shiftId),
  ]);
  const startedRows = (starts ?? []) as Array<{
    created_at: string;
    meta: { task_id?: string; task_name?: string } | null;
  }>;
  const completedSet = new Set<string>(
    ((completions ?? []) as Array<{ task_id: string }>).map((c) => c.task_id)
  );
  for (const ev of startedRows) {
    const taskId = ev.meta?.task_id;
    if (!taskId) continue;
    if (completedSet.has(taskId)) continue;
    return {
      taskId,
      taskName: ev.meta?.task_name ?? null,
      startedAt: ev.created_at,
    };
  }
  return null;
}

