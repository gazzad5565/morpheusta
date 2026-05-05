/**
 * Library store (mobile) — read-only.
 *
 * Reps fetch the file list and tap to open. Downloads use short-lived
 * signed URLs from Supabase Storage so the bucket can stay private.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface LibraryFile {
  id: string;
  name: string;
  storagePath: string;
  sizeBytes: number | null;
  mimeType: string | null;
  customerId: string | null;
  customerName: string | null;
  customerInitials: string | null;
  customerColor: string | null;
  uploadedAt: string;
}

interface FileRow {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  customer_id: string | null;
  uploaded_at: string;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
  } | null;
}

export async function listLibraryFiles(): Promise<LibraryFile[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("library_files")
    .select(
      "id, name, storage_path, size_bytes, mime_type, customer_id, uploaded_at, customers(id,name,initials,color)"
    )
    .order("uploaded_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[library] list:", error.message);
    return [];
  }
  return ((data as unknown as FileRow[]) || []).map((r) => ({
    id: r.id,
    name: r.name,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes,
    mimeType: r.mime_type,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? null,
    customerInitials: r.customers?.initials ?? null,
    customerColor: r.customers?.color ?? null,
    uploadedAt: r.uploaded_at,
  }));
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
