/**
 * Library store (mobile) — read-only, multi-customer aware.
 *
 * Reps see files where customer_ids is null/empty (universal) OR where
 * one of the customers they're assigned to appears in the array. (For
 * Phase 3 we just show every file the rep is allowed to read; mobile
 * doesn't yet filter by their assigned customers — admin RLS doesn't
 * enforce that yet either.)
 */

import { supabase, isSupabaseConfigured } from "./supabase";

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
export const DEFAULT_CATEGORY = "Documents";

export interface LibraryFileCustomer {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface LibraryFile {
  id: string;
  name: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  category: string | null;
  /** null = "shared with all"; otherwise the specific customer ids. */
  customerIds: string[] | null;
  /** Joined customer info for the ids above (when those customers exist). */
  customers: LibraryFileCustomer[];
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
  uploaded_at: string;
}

const SELECT_COLS =
  "id, name, storage_path, size_bytes, mime_type, category, customer_ids, uploaded_at";

async function fetchCustomerLookup(
  rows: FileRow[]
): Promise<Map<string, LibraryFileCustomer>> {
  const map = new Map<string, LibraryFileCustomer>();
  if (!isSupabaseConfigured() || !supabase) return map;
  const ids = new Set<string>();
  for (const r of rows) for (const id of r.customer_ids || []) ids.add(id);
  if (ids.size === 0) return map;
  const { data } = await supabase
    .from("customers")
    .select("id,name,initials,color")
    .in("id", Array.from(ids));
  for (const c of (data as LibraryFileCustomer[]) || []) {
    map.set(c.id, c);
  }
  return map;
}

function rowToFile(
  r: FileRow,
  lookup: Map<string, LibraryFileCustomer>
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
      .map((id) => lookup.get(id))
      .filter((c): c is LibraryFileCustomer => !!c),
    uploadedAt: r.uploaded_at,
  };
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
