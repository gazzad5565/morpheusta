/**
 * Library store (admin) — upload + list + edit + delete shared files.
 *
 * Multi-customer model: each file row carries a `customer_ids text[]`.
 *   - NULL or empty array → "shared with all" (universal).
 *   - Populated array → applies only to those customers.
 *
 * Customer info isn't FK-joined (PostgREST can't do array-element FKs
 * cleanly); we fetch matching customers in a second query and merge in
 * JS, mirroring the rep-locations / requests-store pattern.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import type { Customer } from "./types";

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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

/**
 * Distinct, non-null category strings currently set on at least one
 * library file in this tenant. Cheap single-column query — used to
 * build the category dropdown's option list as a union of:
 *   - the manager-managed list from `app_settings.library_categories`
 *   - whatever categories already exist on files (which may include
 *     custom values typed at upload time before the manager added
 *     them to the canonical list).
 *
 * Mariska's B6: before this, the edit page bound to LIBRARY_CATEGORIES
 * only, so a file uploaded under "Brand Guidelines" couldn't be
 * re-saved with the same category from the edit page — the dropdown
 * didn't list it.
 */
export async function listLibraryCategoriesInUse(): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("library_files")
    .select("category")
    .not("category", "is", null);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[library] in-use categories:", error.message);
    return [];
  }
  const seen = new Set<string>();
  for (const r of (data as { category: string | null }[]) || []) {
    const c = (r.category || "").trim();
    if (c) seen.add(c);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export interface LibraryFile {
  id: string;
  name: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  category: string | null;
  /** null/empty = "shared with all"; otherwise the specific customers the file targets. */
  customerIds: string[] | null;
  /** Joined customer summary array, populated when those customers exist. */
  customers: Pick<Customer, "id" | "name" | "initials" | "color">[];
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
  customer_ids: string[] | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const SELECT_COLS =
  "id, name, storage_path, size_bytes, mime_type, category, customer_ids, uploaded_by, uploaded_at";

function rowToFile(
  r: FileRow,
  customerLookup: Map<string, Pick<Customer, "id" | "name" | "initials" | "color">>
): LibraryFile {
  const ids = r.customer_ids || [];
  return {
    id: r.id,
    name: r.name,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes,
    mimeType: r.mime_type,
    category: r.category,
    customerIds: r.customer_ids && r.customer_ids.length > 0 ? r.customer_ids : null,
    customers: ids
      .map((id) => customerLookup.get(id))
      .filter((c): c is Pick<Customer, "id" | "name" | "initials" | "color"> => !!c),
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  };
}

async function fetchCustomerLookup(
  rows: FileRow[]
): Promise<Map<string, Pick<Customer, "id" | "name" | "initials" | "color">>> {
  const map = new Map<string, Pick<Customer, "id" | "name" | "initials" | "color">>();
  if (!isSupabaseConfigured() || !supabase) return map;
  const ids = new Set<string>();
  for (const r of rows) for (const id of r.customer_ids || []) ids.add(id);
  if (ids.size === 0) return map;
  const { data } = await supabase
    .from("customers")
    .select("id,name,initials,color")
    .in("id", Array.from(ids));
  for (const c of (data as Pick<Customer, "id" | "name" | "initials" | "color">[]) || []) {
    map.set(c.id, c);
  }
  return map;
}

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
  const rows = (data as FileRow[]) || [];
  const lookup = await fetchCustomerLookup(rows);
  return rows.map((r) => rowToFile(r, lookup));
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
  const lookup = await fetchCustomerLookup([data as FileRow]);
  return rowToFile(data as FileRow, lookup);
}

/** Files visible to a specific customer = either universal OR including this customer. */
export async function listLibraryFilesForCustomer(
  customerId: string
): Promise<LibraryFile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  // PostgREST: customer_ids @> ARRAY[id]  OR  customer_ids IS NULL OR length 0
  const { data, error } = await supabase
    .from("library_files")
    .select(SELECT_COLS)
    .or(`customer_ids.cs.{${customerId}},customer_ids.is.null`)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.warn("[library] list for customer:", error.message);
    return [];
  }
  const rows = (data as FileRow[]) || [];
  const lookup = await fetchCustomerLookup(rows);
  return rows.map((r) => rowToFile(r, lookup));
}

export async function uploadLibraryFile(
  file: File,
  opts?: { customerIds?: string[] | null; category?: string | null }
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
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

  // Normalise: null OR empty array → null (universal).
  const ids = opts?.customerIds && opts.customerIds.length > 0 ? opts.customerIds : null;

  const { data, error: insErr } = await supabase
    .from("library_files")
    .insert({
      name: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: file.type || null,
      category: opts?.category || DEFAULT_CATEGORY,
      customer_ids: ids,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: insErr.message };
  }
  await logEvent({
    event_type: "library.uploaded",
    message: `Uploaded ${file.name}`,
    meta: { size_bytes: file.size, customer_ids: ids },
  });
  return { ok: true, id: data?.id };
}

export interface LibraryFileUpdate {
  name?: string;
  category?: string | null;
  /** undefined = leave unchanged. null = universal. [] also treated as universal. */
  customerIds?: string[] | null;
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
  if (patch.customerIds !== undefined) {
    dbPatch.customer_ids =
      patch.customerIds && patch.customerIds.length > 0 ? patch.customerIds : null;
  }
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
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .remove([f.storagePath]);
  if (storageErr) {
    // eslint-disable-next-line no-console
    console.warn("[library] storage delete:", storageErr.message);
  }
  const { error: dbErr } = await supabase.from("library_files").delete().eq("id", f.id);
  if (dbErr) return { ok: false, error: dbErr.message };
  await logEvent({
    event_type: "library.deleted",
    message: `Deleted ${f.name}`,
  });
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
