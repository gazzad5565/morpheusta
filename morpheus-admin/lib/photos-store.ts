/**
 * Photos store (admin) — read-side counterpart to the mobile photo
 * uploader (see morpheus-mobile/lib/photo-store.ts). Feature C, May 13.
 *
 * The admin never uploads — reps own that flow. This store only reads
 * `shift_task_photos` rows so the admin shift detail page can render
 * per-task thumbnails + a full-shift lightbox gallery, and the various
 * shift-list views can show a per-row camera-count badge.
 *
 * Storage path lives on the row (`storage_path`) but we always render
 * from `public_url`, which the mobile uploader caches at insert time —
 * saves a getPublicUrl() roundtrip on every render. Bucket is
 * public-read so embedding by URL Just Works for the admin pages.
 *
 * Same convention as the rest of the admin stores: swallow-warn on
 * error, return [] / empty Map, isSupabaseConfigured guard up front.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface ShiftTaskPhoto {
  id: string;
  shift_id: string;
  task_id: string;
  rep_id: string | null;
  slot_index: number;
  storage_path: string;
  public_url: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  quality_tier: string | null;
  created_at: string;
}

/**
 * All photos uploaded for a single shift, ordered by task_id then
 * slot_index ascending. The shift detail page groups these by
 * task_id client-side to render per-task thumbnail strips, then
 * uses the flat ordered list as the lightbox carousel order.
 */
export async function listPhotosForShift(
  shiftId: string
): Promise<ShiftTaskPhoto[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shift_task_photos")
    .select(
      "id, shift_id, task_id, rep_id, slot_index, storage_path, public_url, width, height, file_size_bytes, quality_tier, created_at"
    )
    .eq("shift_id", shiftId)
    .order("task_id", { ascending: true })
    .order("slot_index", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[photos] listForShift:", error.message);
    return [];
  }
  return (data as ShiftTaskPhoto[]) || [];
}

/**
 * Photo counts keyed by shift_id, for the shift list pages' camera
 * badges. One round-trip — pull every photo row for the requested
 * shift ids (just shift_id; that's all we need to tally) and group
 * client-side. Cheaper than N count() queries, and shift archives
 * never run away because a single shift's photo count tops out
 * around ~20 in practice.
 *
 * Returns an empty Map when given no ids — list pages call this
 * unconditionally after their fetch, so saving the round-trip on the
 * "no shifts to count" case is worth the four lines.
 */
export async function listPhotoCountsForShifts(
  shiftIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (shiftIds.length === 0) return result;
  if (!isSupabaseConfigured() || !supabase) return result;
  const { data, error } = await supabase
    .from("shift_task_photos")
    .select("shift_id")
    .in("shift_id", shiftIds);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[photos] countsForShifts:", error.message);
    return result;
  }
  for (const row of (data as { shift_id: string }[]) || []) {
    result.set(row.shift_id, (result.get(row.shift_id) ?? 0) + 1);
  }
  return result;
}
