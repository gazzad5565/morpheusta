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

/**
 * Default column widths for /past-shifts Table view.
 *
 * Customer | Rep | Date | Time | Tasks done | State
 *
 * Resizable via useColumnWidths (localStorage key
 * `morpheus.cols.past-shifts.v1`). Was originally fr-based but every
 * other Table-view page in the admin uses pixel-based resizable cols
 * (May 27 sweep); /past-shifts was missed and is now caught up.
 */
export const PAST_SHIFTS_COLUMNS: (string | number)[] = [
  280, // Customer (swatch + name + code)
  220, // Rep (avatar + name)
  130, // Date
  130, // Time range
  110, // Tasks done pill
  140, // State pill (+ photo count)
];
