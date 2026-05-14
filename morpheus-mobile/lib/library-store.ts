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
  /** Pre-generated signed download URL (1-hour TTL). Populated by
   *  listLibraryFiles in the same pass that loads the rows — lets
   *  the rep tile render as a native `<a href>` anchor so the tap
   *  is treated as a user-initiated navigation. (Lazy on-demand
   *  fetch broke on iOS standalone PWA: awaiting the signed-URL
   *  promise between the tap and window.open() lost the user-
   *  gesture chain → iOS silently blocked the popup → the link
   *  looked like a dead button.) Null = still loading or RLS error. */
  downloadUrl: string | null;
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
  lookup: Map<string, LibraryFileCustomer>,
  downloadUrl: string | null
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
    downloadUrl,
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
  // Generate signed URLs for every row in one batched call instead
  // of N sequential roundtrips. Supabase supports this since v2 —
  // single network request, returns one URL per path.
  const paths = rows.map((r) => r.storage_path);
  let urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      // eslint-disable-next-line no-console
      console.warn("[library] batch signed URLs failed:", signErr.message);
    } else {
      urlByPath = new Map(
        ((signed as { path: string | null; signedUrl: string }[]) || [])
          .filter((s) => s.path && s.signedUrl)
          .map((s) => [s.path as string, s.signedUrl])
      );
    }
  }
  const lookup = await fetchCustomerLookup(rows);
  return rows.map((r) =>
    rowToFile(r, lookup, urlByPath.get(r.storage_path) ?? null)
  );
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

/**
 * Subscribe to realtime changes on the library_files table. Used by the
 * mobile /library page so new uploads / deletes show up live without
 * the rep needing to refresh.
 *
 * Same defensive try/catch + unique channel pattern as subscribeShifts.
 */
let _libraryChannelCounter = 0;

export function subscribeLibrary(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _libraryChannelCounter += 1;
    const channelName = `mobile_library_live_${Date.now()}_${_libraryChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "library_files" },
        () => onChange()
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[library] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[library] subscribe failed:", err);
    return () => {};
  }
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
