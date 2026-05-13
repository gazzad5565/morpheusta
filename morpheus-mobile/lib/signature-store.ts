/**
 * Signature store (mobile) — Feature D, May 13.
 *
 * Per-(shift, task) signature captured on the SignaturePad component.
 * One row per (shift, task) via the UNIQUE constraint in the
 * 2026_05_13_task_signatures migration. Re-signs replace via a
 * delete-then-insert pair (mirrors how photo slots handle re-shoots).
 *
 * Storage: base64 PNG data URL in the signature_data_url text column.
 * Typical size: 5–20 KB for a normal handwritten signature on a
 * ~600x180 device-pixel canvas. Small enough that putting it in a
 * regular column beats a separate storage bucket — no extra RLS
 * dance, no signed-URL TTL, no getPublicUrl roundtrip on read.
 *
 * Used by:
 *   - /active when the rep taps a task with requiresSignature=true
 *     (opens the SignaturePad → save → autocomplete the task).
 *   - Eventually the admin's customer-facing report generator,
 *     embedding the data URL as an <img src>.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface ShiftTaskSignature {
  id: string;
  shift_id: string;
  task_id: string;
  rep_id: string | null;
  signature_data_url: string;
  signer_name: string | null;
  signed_at: string;
}

/** One signature per (shift, task) — or null if none captured yet. */
export async function getShiftTaskSignature(
  shiftId: string,
  taskId: string
): Promise<ShiftTaskSignature | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("shift_task_signatures")
    .select("*")
    .eq("shift_id", shiftId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[signatures] get:", error.message);
    return null;
  }
  return (data as ShiftTaskSignature | null) ?? null;
}

/**
 * Save a signature for a (shift, task). Replaces any existing
 * signature for that pair via DELETE-then-INSERT (mirrors the
 * photo-slot re-shoot pattern; cleaner than an UPSERT given the
 * trigger-less schema).
 */
export async function saveShiftTaskSignature(args: {
  shiftId: string;
  taskId: string;
  signatureDataUrl: string;
  signerName?: string | null;
}): Promise<{ ok: true; row: ShiftTaskSignature } | { ok: false; error: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { shiftId, taskId, signatureDataUrl, signerName } = args;

  // Identify the rep so the audit / report can show "signed under
  // the supervision of <rep>" later.
  const { data: userData } = await supabase.auth.getUser();
  const repId = userData.user?.id ?? null;
  if (!repId) {
    return { ok: false, error: "Sign in again to save the signature." };
  }

  // Sanity-check the data URL — should be a base64 PNG. Drop the
  // attempt early if someone passed in something that isn't.
  if (!signatureDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "Couldn't read the signature image — try again." };
  }

  // Wipe any existing row for this (shift, task) so the unique
  // constraint doesn't reject the insert. Cheap query — one row at
  // most thanks to the UNIQUE constraint.
  await supabase
    .from("shift_task_signatures")
    .delete()
    .eq("shift_id", shiftId)
    .eq("task_id", taskId);

  const { data, error } = await supabase
    .from("shift_task_signatures")
    .insert({
      shift_id: shiftId,
      task_id: taskId,
      rep_id: repId,
      signature_data_url: signatureDataUrl,
      signer_name: signerName?.trim() || null,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as ShiftTaskSignature };
}

/** Remove a captured signature (e.g. rep wants to redo it). */
export async function deleteShiftTaskSignature(args: {
  shiftId: string;
  taskId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("shift_task_signatures")
    .delete()
    .eq("shift_id", args.shiftId)
    .eq("task_id", args.taskId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Subscribe to (shift, task) signature inserts/deletes so the
 *  signed pill updates in real time across devices. Returns the
 *  unsubscribe handle. */
export function subscribeShiftTaskSignatures(
  shiftId: string,
  taskId: string,
  onChange: () => void
): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  const channelName = `signatures_${shiftId}_${taskId}_${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shift_task_signatures",
        filter: `shift_id=eq.${shiftId}`,
      },
      (payload) => {
        // Filter to this task client-side — postgres_changes only
        // supports one filter expression at a time.
        const row =
          (payload.new as { task_id?: string } | null) ||
          (payload.old as { task_id?: string } | null);
        if (row?.task_id === taskId) onChange();
      }
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
