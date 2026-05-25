/**
 * Reads + writes for import_runs (Phase A migration). Phase C uses
 * this for the "Recent imports" panel on the hub; Phase D's wizard
 * onCommit creates a row at start (status=running) and updates it
 * at end (status=complete + counts + errors_json).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import type { EntityType } from "./import-types";

export interface ImportRunFailure {
  row_index: number;
  original_row: Record<string, string>;
  error_code: string;
  error_message: string;
}

/** Insert a new pending import_runs row. Returns its id. Manager-only
 *  RLS — caller's session must be a manager. */
export async function createImportRun(args: {
  entity: EntityType;
  totalRows: number;
  sourceFilename: string | null;
  settings: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const startedBy = userData.user?.id;
  if (!startedBy) {
    return { ok: false, error: "Not signed in" };
  }
  const { data, error } = await supabase
    .from("import_runs")
    .insert({
      started_by: startedBy,
      entity_type: args.entity,
      status: "running",
      total_rows: args.totalRows,
      created_count: 0,
      updated_count: 0,
      failed_count: 0,
      settings_json: args.settings,
      errors_json: [],
      source_filename: args.sourceFilename,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message || "insert failed" };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/** Finalise an import_runs row with counts + errors + complete status. */
export async function finishImportRun(
  id: string,
  args: {
    created: number;
    updated: number;
    failed: number;
    failures: ImportRunFailure[];
    finalStatus: "complete" | "failed";
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("import_runs")
    .update({
      status: args.finalStatus,
      finished_at: new Date().toISOString(),
      created_count: args.created,
      updated_count: args.updated,
      failed_count: args.failed,
      errors_json: args.failures,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface ImportRunRow {
  id: string;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  entity_type: EntityType;
  status: "pending" | "running" | "complete" | "failed";
  total_rows: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  source_filename: string | null;
  // settings_json + errors_json intentionally not returned by the list
  // call — too verbose for the panel. Detail view fetches the full row.
}

export async function listRecentImports(
  limit = 20
): Promise<ImportRunRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("import_runs")
    .select(
      "id, started_by, started_at, finished_at, entity_type, status, total_rows, created_count, updated_count, failed_count, source_filename"
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[import_runs] list:", error.message);
    return [];
  }
  return (data || []) as ImportRunRow[];
}

/** Subscribe to import_runs changes — used so the hub's Recent
 *  Imports panel updates live as Phase D adapters commit rows. */
let _channelCounter = 0;
export function subscribeImportRuns(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  _channelCounter += 1;
  const channelName = `import_runs_live_${Date.now()}_${_channelCounter}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "import_runs" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
