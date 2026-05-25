/**
 * Reads from import_runs (Phase A migration). Phase C uses this for
 * the "Recent imports" panel on the /import hub. Phase D will also
 * write to it from each adapter's commit path.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import type { EntityType } from "./import-types";

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
