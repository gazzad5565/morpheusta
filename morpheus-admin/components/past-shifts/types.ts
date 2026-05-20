import type { ShiftRow } from "@/lib/shifts-store";
import type { Profile } from "@/lib/profiles-store";
import { AC } from "@/lib/tokens";

/** Sort keys exposed by the table view's column headers. */
export type SortKey = "date" | "customer" | "rep" | "tasksDone" | "state";

/** Enriched row shape consumed by both TableView and GridView. The
 *  page does the join (shift × rep × derived names) once so the views
 *  stay pure renderers. */
export interface PastShiftRow {
  shift: ShiftRow;
  customerName: string;
  customerCode: string;
  rep: Profile | null;
  repName: string;
  tasksDoneRatio: number;
}

export const STATE_LABEL: Record<string, string> = {
  complete: "Complete",
  cancelled: "Cancelled",
};

export const STATE_TONE: Record<string, { bg: string; fg: string }> = {
  complete: { bg: "#dcf6e3", fg: "#1f7a3f" },
  cancelled: { bg: AC.bg, fg: AC.mute },
};

/** Grid template shared by the table header + every row. */
export const TABLE_COLS = "1.6fr 1.4fr 130px 130px 110px 110px";
