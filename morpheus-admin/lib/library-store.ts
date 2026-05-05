/**
 * Library store (admin) — upload + list + delete shared files.
 *
 * Files live in Supabase Storage bucket "library" (private). Friendly
 * metadata (name, size, customer association, uploader) lives in
 * public.library_files.
 *
 * Downloads use short-lived signed URLs so we don't have to make the
 * bucket public.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Predefined categories. Free-form is allowed at the DB level, but the
 * UI sticks to this list for consistency. */
export const LIBRARY_CATEGORIES = [
  "Documents",
  "Photos",
  "Training",
  "Forms",
  "Reference",
  "Other",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];
export const DEFAULT_CATEGORY: LibraryCategory = "Documents";

export interface LibraryFile {
  id: string;
  name: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  category: string | null;
  customerId: string | null;
  customerName: string | null;
  customerInitials: string | null;
  customerColor: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

interface FileRow {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  category: string | null;
  customer_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
  } | null;
}

function rowToFile(r: FileRow): LibraryFile {
  return {
    id: r.id,
    name: r.name,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes,
    mimeType: r.mime_type,
    category: r.category,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? null,
    customerInitials: r.customers?.initials ?? null,
    customerColor: r.customers?.color ?? null,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  };
}

const SELECT_COLS =
  "id, name, storage_path, size_bytes, mime_type, category, customer_id, uploaded_by, uploaded_at, customers(id,name,initials,color)";

export async function listLibraryFiles(): Promise<LibraryFile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("library_files")
    .select(SELECT_COLS)
    .order("uploaded_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[library] list:", error.message);
    return [];
  }
  return ((data as unknown as FileRow[]) || []).map(rowToFile);
}

export async function getLibraryFile(id: string): Promise<LibraryFile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("library_files")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[library] get:", error.message);
    return null;
  }
  return rowToFile(data as unknown as FileRow);
}

export async function uploadLibraryFile(
  file: File,
  opts?: { customerId?: string | null; category?: string | null }
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Build a unique storage path so two files with the same display name
  // don't clobber each other in storage.
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const { data, error: insErr } = await supabase
    .from("library_files")
    .insert({
      name: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: file.type || null,
      category: opts?.category || DEFAULT_CATEGORY,
      customer_id: opts?.customerId || null,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (insErr) {
    // Storage row landed but metadata insert failed — try to roll back the
    // upload so we don't leak orphan files.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: insErr.message };
  }
  return { ok: true, id: data?.id };
}

export interface LibraryFileUpdate {
  name?: string;
  category?: string | null;
  customerId?: string | null;
}

export async function updateLibraryFile(
  id: string,
  patch: LibraryFileUpdate
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.category !== undefined) dbPatch.category = patch.category;
  if (patch.customerId !== undefined) dbPatch.customer_id = patch.customerId;
  // Note: we deliberately leave the metadata UPDATE policy off (per the
  // README RLS table). If you re-enable it in Phase 4, remember to widen
  // it for managers only.
  const { error } = await supabase
    .from("library_files")
    .update(dbPatch)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteLibraryFile(
  f: LibraryFile
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Storage first; if it fails, the metadata row stays so we can retry.
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([f.storagePath]);
  if (storageErr) {
    // eslint-disable-next-line no-console
    console.warn("[library] storage delete:", storageErr.message);
    // Don't bail — try the metadata delete anyway, in case the storage
    // object was already missing.
  }
  const { error: dbErr } = await supabase.from("library_files").delete().eq("id", f.id);
  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

export async function getLibraryDownloadUrl(
  storagePath: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return { ok: false, error: error?.message || "no url" };
  }
  return { ok: true, url: data.signedUrl };
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
