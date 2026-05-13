/**
 * Photo store (mobile) — Feature C, May 13.
 *
 * Compresses a captured image client-side then uploads it to the
 * Supabase Storage `shift_photos` bucket and records the metadata
 * row in `shift_task_photos`.
 *
 * Compression: canvas-based downscale + JPEG quality, tuned by the
 * org's `app_settings.photo_quality_tier` setting (standard / high
 * / maximum). The mirror of those tiers in this file is hardcoded
 * — admin manages the choice; the rep app just consumes it. The
 * setting is read on first call + cached for the session so the
 * 10th photo upload doesn't pay the DB round-trip.
 *
 * Hard cap of 2 MB per photo regardless of tier — if a single
 * image somehow blows the cap (unusual; would need a 12 MP HDR
 * shot at "Maximum" tier), we retry at lower quality until it
 * fits, or bail at quality < 0.5.
 *
 * Storage path: shift_photos/{shift_id}/{task_id}/{photo-uuid}.jpg
 * Public bucket so the admin's eventual report generator can
 * embed by URL without a signed-URL roundtrip. URLs include a
 * uuid in the path so they're unguessable.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

interface QualityTier {
  maxDimension: number;
  jpegQuality: number;
}
const TIERS: Record<"standard" | "high" | "maximum", QualityTier> = {
  standard: { maxDimension: 1600, jpegQuality: 0.8 },
  high:     { maxDimension: 1920, jpegQuality: 0.88 },
  maximum:  { maxDimension: 2400, jpegQuality: 0.92 },
};
const DEFAULT_TIER: keyof typeof TIERS = "standard";
const HARD_CAP_BYTES = 2 * 1024 * 1024; // 2 MB

let _cachedTier: keyof typeof TIERS | null = null;
async function readPhotoQualityTier(): Promise<keyof typeof TIERS> {
  if (_cachedTier) return _cachedTier;
  if (!isSupabaseConfigured() || !supabase) return DEFAULT_TIER;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "photo_quality_tier")
      .maybeSingle();
    const v = (data as { value?: string } | null)?.value;
    if (v === "high" || v === "maximum" || v === "standard") {
      _cachedTier = v;
      return v;
    }
  } catch {
    /* swallow */
  }
  _cachedTier = DEFAULT_TIER;
  return DEFAULT_TIER;
}

/** Force a re-read of the photo-quality setting next time it's
 *  needed. Called by the admin if it ever exposes a manual
 *  refresh; otherwise the cache lives for the session. */
export function clearPhotoQualityCache(): void {
  _cachedTier = null;
}

// ─── Client-side compression ──────────────────────────────────────

interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  qualityUsed: number;
}

/**
 * Downscale + recompress an image File/Blob to fit the active
 * quality tier. Returns the resulting Blob + actual dimensions
 * after scaling + the JPEG quality that ended up being used (may
 * have been reduced if the first pass blew the hard cap).
 */
async function compressImage(
  file: Blob,
  tier: QualityTier
): Promise<CompressResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Couldn't decode image"));
    im.src = dataUrl;
  });

  // Calculate target dimensions preserving aspect ratio so the
  // LONGER edge equals tier.maxDimension (or less if the source
  // is already smaller — never upscale).
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longEdge > tier.maxDimension ? tier.maxDimension / longEdge : 1;
  const targetW = Math.round(img.naturalWidth * scale);
  const targetH = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Try the tier's nominal quality first; retry stepping down by
  // 0.1 if it blows the hard cap. Stops at 0.5 to avoid shipping
  // a totally mangled image.
  let q = tier.jpegQuality;
  let blob: Blob | null = null;
  while (q >= 0.5) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", q)
    );
    if (!blob) throw new Error("Compression failed");
    if (blob.size <= HARD_CAP_BYTES) break;
    q = Math.round((q - 0.1) * 100) / 100;
  }
  if (!blob) throw new Error("Compression failed");

  return { blob, width: targetW, height: targetH, qualityUsed: q };
}

// ─── Upload + DB write ────────────────────────────────────────────

export interface UploadedPhoto {
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
  created_at: string;
}

/**
 * Compress + upload a captured image for a (shift, task) slot.
 *
 * The `slotIndex` lets the UI maintain N stable slots — the rep
 * can re-shoot slot 0 even after slots 1+2 are filled. We delete
 * any existing photo at that slot before inserting the new row
 * (one photo per slot, no orphans).
 */
export async function uploadShiftTaskPhoto(args: {
  shiftId: string;
  taskId: string;
  slotIndex: number;
  file: File | Blob;
}): Promise<{ ok: true; photo: UploadedPhoto } | { ok: false; error: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { shiftId, taskId, slotIndex, file } = args;

  // Identify uploader (rep_id) — used both for the DB row + storage
  // path security in the future RLS pass.
  const { data: userData } = await supabase.auth.getUser();
  const repId = userData.user?.id ?? null;
  if (!repId) {
    return { ok: false, error: "Sign in again to upload photos." };
  }

  const tierName = await readPhotoQualityTier();
  const tier = TIERS[tierName];

  let compressed: CompressResult;
  try {
    compressed = await compressImage(file, tier);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Couldn't process image";
    return { ok: false, error: msg };
  }

  // 1. Remove any existing photo at this slot — keeps the rep's
  //    re-shoots clean and avoids orphan storage objects. Both
  //    the storage object AND the metadata row are removed.
  const { data: existing } = await supabase
    .from("shift_task_photos")
    .select("id, storage_path")
    .eq("shift_id", shiftId)
    .eq("task_id", taskId)
    .eq("slot_index", slotIndex);
  if (existing && existing.length > 0) {
    const paths = (existing as { id: string; storage_path: string }[]).map(
      (r) => r.storage_path
    );
    await supabase.storage.from("shift_photos").remove(paths);
    await supabase
      .from("shift_task_photos")
      .delete()
      .in(
        "id",
        (existing as { id: string }[]).map((r) => r.id)
      );
  }

  // 2. Upload the compressed JPEG. Path includes a uuid so URLs
  //    are unguessable + replacing a slot doesn't collide with
  //    any cached browser image.
  const photoId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const storagePath = `${shiftId}/${taskId}/${photoId}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("shift_photos")
    .upload(storagePath, compressed.blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  // 3. Resolve the public URL once + cache on the row so reads
  //    don't need to re-derive it.
  const { data: pub } = supabase.storage
    .from("shift_photos")
    .getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  // 4. Insert the metadata row.
  const { data: inserted, error: insErr } = await supabase
    .from("shift_task_photos")
    .insert({
      shift_id: shiftId,
      task_id: taskId,
      rep_id: repId,
      slot_index: slotIndex,
      storage_path: storagePath,
      public_url: publicUrl,
      width: compressed.width,
      height: compressed.height,
      file_size_bytes: compressed.blob.size,
      quality_tier: tierName,
    })
    .select("*")
    .single();
  if (insErr) {
    // Roll back the storage upload if the row insert failed so
    // we don't leak orphan objects.
    await supabase.storage.from("shift_photos").remove([storagePath]);
    return { ok: false, error: insErr.message };
  }

  return { ok: true, photo: inserted as UploadedPhoto };
}

/** List photos already uploaded for this (shift, task), ordered by
 *  slot. Used to hydrate the slot thumbnails on /active mount. */
export async function listShiftTaskPhotos(
  shiftId: string,
  taskId: string
): Promise<UploadedPhoto[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shift_task_photos")
    .select("*")
    .eq("shift_id", shiftId)
    .eq("task_id", taskId)
    .order("slot_index", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[photos] list:", error.message);
    return [];
  }
  return (data as UploadedPhoto[]) || [];
}

/** Delete a single photo (storage object + metadata row). Lets the
 *  rep clear a slot before re-shooting. */
export async function deleteShiftTaskPhoto(
  photo: UploadedPhoto
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  await supabase.storage.from("shift_photos").remove([photo.storage_path]);
  const { error } = await supabase
    .from("shift_task_photos")
    .delete()
    .eq("id", photo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Subscribe to (shift, task) photo inserts/deletes so the slot
 *  grid updates in real time across devices. Returns the
 *  unsubscribe handle. */
export function subscribeShiftTaskPhotos(
  shiftId: string,
  taskId: string,
  onChange: () => void
): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  const channelName = `photos_${shiftId}_${taskId}_${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shift_task_photos",
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
