/**
 * Shifts store (admin) — list + create.
 *
 * Admins see ALL shifts (not just their own) since the SELECT policy is
 * `TO authenticated USING (true)`. Phase 4 will scope this to manager role.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import { getAutoCheckoutTime } from "./settings-store";
import { todayLocalISO } from "./format";
import { notifySaved, notifySaveError } from "./save-status";

export interface ShiftRow {
  id: string;
  customer_id: string;
  rep_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  distance_label: string | null;
  state: string;
  check_in_at: string | null;
  /** ISO timestamp of when the rep checked out. Set by checkOutOfShift
   *  (mobile) and by sweepStaleShifts (admin). NULL while the shift is
   *  still in flight. Backfilled from shift_events for historical rows. */
  check_out_at: string | null;
  tasks_done: number;
  tasks_total: number;
  /** Set by /schedule/new when one submission produces multiple shifts.
   *  Null on one-off shifts. Used by /schedule/manage to group shifts
   *  back into the series they were created from. */
  series_id: string | null;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
  } | null;
}

export async function listShifts(opts?: {
  date?: string; // YYYY-MM-DD; default today (local tz)
  limit?: number;
}): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const date = opts?.date || todayLocalISO();
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("shift_date", date)
    .order("start_time", { ascending: true })
    .limit(opts?.limit ?? 100);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] list:", error.message);
    return [];
  }
  return data as ShiftRow[];
}

/**
 * Shifts whose `shift_date` falls in [startISO, endISO] (inclusive).
 * Used by the /schedule week-planner.
 */
export async function listShiftsInRange(
  startISO: string,
  endISO: string
): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .gte("shift_date", startISO)
    .lte("shift_date", endISO)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listInRange:", error.message);
    return [];
  }
  return data as ShiftRow[];
}

export interface NewShift {
  customer_id: string;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  distance_label?: string;
  tasks_total?: number;
  /** Optional. If null/undefined, the shift is claimable by any rep. */
  rep_id?: string | null;
  /**
   * Optional series id. When the schedule form generates N shifts in
   * one submission (e.g. recurring weekly across multiple customers)
   * every row gets the same series_id so we can later offer
   * "edit / cancel this and future" actions across the group. Single
   * one-off shifts leave this null.
   */
  series_id?: string | null;
}

/**
 * Right click-target for a shift card / row. Scheduled shifts are
 * editable, so we route to the edit form; everything else (in-progress,
 * late, complete) is locked, so we route to the read-only detail page.
 *
 * Centralised here so every list site (week planner, today's shifts,
 * rep detail, etc) routes consistently — no risk of one place going to
 * /shifts/[id]/edit while another goes to /shifts/[id] for the same row.
 */
export function shiftHref(shift: { id: string; state: string }): string {
  return shift.state === "scheduled"
    ? `/shifts/${shift.id}/edit`
    : `/shifts/${shift.id}`;
}

/** True when the shift is in a state the admin is allowed to edit. */
export function isShiftEditable(state: string): boolean {
  return state === "scheduled";
}

/** One shift by id, with the joined customer block. Used by the shift
 *  detail page. */
export async function getShiftById(id: string): Promise<ShiftRow | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getById:", error.message);
    return null;
  }
  return (data as ShiftRow | null) ?? null;
}

export async function createShift(
  s: NewShift
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase
    .from("shifts")
    .insert({
      customer_id: s.customer_id,
      shift_date: s.shift_date,
      start_time: s.start_time,
      end_time: s.end_time,
      distance_label: s.distance_label || "",
      tasks_total: s.tasks_total ?? 4,
      rep_id: s.rep_id || null,
      series_id: s.series_id ?? null,
    })
    .select("id, customers(name)")
    .single();
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  const customerName =
    (data as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.scheduled",
    shift_id: data?.id,
    customer_id: s.customer_id,
    message: `Scheduled ${customerName} on ${s.shift_date} ${s.start_time}–${s.end_time}`,
    meta: { rep_assigned: s.rep_id ? true : false },
  });
  notifySaved("shift");
  return { ok: true, id: data?.id };
}

/**
 * Update a scheduled shift. Only allowed while state='scheduled' — once
 * a rep checks in (state='in-progress' / 'late' / 'complete') the row
 * is read-only from the admin's perspective. The shift detail page
 * enforces the same rule on the UI side.
 */
export interface ShiftPatch {
  customer_id?: string;
  rep_id?: string | null;
  shift_date?: string;
  start_time?: string;
  end_time?: string;
  distance_label?: string;
  tasks_total?: number;
}

export async function updateShift(
  id: string,
  patch: ShiftPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Refuse to update once the shift has progressed past 'scheduled'.
  // Belt-and-braces — the UI shouldn't expose the form, but a deep
  // link to /shifts/[id]/edit would otherwise let a manager mutate
  // an in-progress row.
  const { data: cur } = await supabase
    .from("shifts")
    .select("state, customer_id, customers(name)")
    .eq("id", id)
    .maybeSingle();
  const currentState = (cur as { state?: string } | null)?.state ?? "scheduled";
  if (currentState !== "scheduled") {
    return {
      ok: false,
      error: `Can't edit a ${currentState} shift. Only scheduled shifts are editable.`,
    };
  }

  // Strip undefined keys so we only send the fields the caller actually
  // wants to change.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return { ok: true };

  const { error } = await supabase.from("shifts").update(cleaned).eq("id", id);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }

  const customerName =
    (cur as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.scheduled",
    shift_id: id,
    customer_id:
      (patch.customer_id as string | undefined) ??
      ((cur as { customer_id?: string } | null)?.customer_id || null),
    message: `Updated shift at ${customerName}`,
    meta: { fields: Object.keys(cleaned) },
  });
  notifySaved("shift");
  return { ok: true };
}

export async function deleteShift(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, error: "Database not configured" };
  const { data: row } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  const customerName =
    (row as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.deleted",
    customer_id: (row as { customer_id?: string } | null)?.customer_id || null,
    message: `Removed shift at ${customerName}`,
  });
  notifySaved("shift removed");
  return { ok: true };
}

// ─── Shift series (recurring / bulk-created) ──────────────────────────

/** A summary row for the /schedule/manage list — one per series. */
export interface ShiftSeriesSummary {
  series_id: string;
  shiftCount: number;
  /** Earliest shift_date in the series. */
  firstDate: string;
  /** Latest shift_date in the series. */
  lastDate: string;
  /** First-rendered start_time (HH:MM) — series typically share one. */
  startTime: string;
  endTime: string;
  /** Distinct customer_id list — ordered, deduped. */
  customerIds: string[];
  /** Distinct rep_id list (or null entries for unassigned). */
  repIds: (string | null)[];
  /** Set of yyyy-mm-dd → count, used to render the recurrence pattern. */
  upcomingCount: number;
  pastCount: number;
}

/**
 * Group every shift that has a series_id into one summary row each.
 * One-off shifts (no series_id) are omitted because the manage page
 * only cares about recurring/bulk patterns. The Live Ops page +
 * calendar already cover one-offs.
 */
export async function listShiftSeries(): Promise<ShiftSeriesSummary[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select(
      "id, series_id, customer_id, rep_id, shift_date, start_time, end_time, state"
    )
    .not("series_id", "is", null)
    .order("shift_date", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listShiftSeries:", error.message);
    return [];
  }
  type Row = {
    id: string;
    series_id: string;
    customer_id: string;
    rep_id: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    state: string;
  };
  const today = todayLocalISO();
  const groups = new Map<string, Row[]>();
  for (const r of (data as Row[]) || []) {
    const list = groups.get(r.series_id) || [];
    list.push(r);
    groups.set(r.series_id, list);
  }
  const out: ShiftSeriesSummary[] = [];
  for (const [series_id, rows] of groups.entries()) {
    rows.sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    const customerIds = Array.from(new Set(rows.map((r) => r.customer_id)));
    const repIds = Array.from(new Set(rows.map((r) => r.rep_id)));
    const upcomingCount = rows.filter((r) => r.shift_date >= today).length;
    const pastCount = rows.length - upcomingCount;
    out.push({
      series_id,
      shiftCount: rows.length,
      firstDate: rows[0].shift_date,
      lastDate: rows[rows.length - 1].shift_date,
      startTime: (rows[0].start_time || "").slice(0, 5),
      endTime: (rows[0].end_time || "").slice(0, 5),
      customerIds,
      repIds,
      upcomingCount,
      pastCount,
    });
  }
  // Newest series first (by lastDate desc).
  out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  return out;
}

/**
 * Cancel every shift in a series. By default we only delete shifts
 * still in the 'scheduled' state — running / complete shifts are
 * untouched (deleting them would corrupt audit history). Pass
 * `fromDate` to limit deletion to shifts on or after that date
 * ("cancel from today forward" semantics).
 */
export async function cancelShiftSeries(
  series_id: string,
  opts?: { fromDate?: string }
): Promise<{ ok: boolean; error?: string; deleted?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  let q = supabase
    .from("shifts")
    .delete({ count: "exact" })
    .eq("series_id", series_id)
    .eq("state", "scheduled");
  if (opts?.fromDate) q = q.gte("shift_date", opts.fromDate);
  const { error, count } = await q;
  if (error) {
    notifySaveError(error.message, "shift series");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.deleted",
    message: `Cancelled ${count ?? 0} shifts in a series${
      opts?.fromDate ? ` from ${opts.fromDate} forward` : ""
    }`,
    meta: { series_id, from_date: opts?.fromDate },
  });
  notifySaved("series cancelled");
  return { ok: true, deleted: count ?? 0 };
}

/**
 * Subscribe to realtime changes on the shifts table. The callback is
 * called on any insert/update/delete. Caller decides what to do — most
 * consumers just refetch their list.
 *
 * Returns an unsubscribe function. Requires the shifts table to be in
 * the supabase_realtime publication
 * (see db/migrations/2026_05_05_shifts_realtime.sql).
 *
 * Each call gets a unique channel name. supabase-js stores channels by
 * name on the client; if two subscribers used the same name the second
 * call collided with the first — which crashed the whole dashboard
 * because both KpiStrip and ShiftsList subscribe at the same time.
 *
 * Wrapped in a try/catch so a misbehaving realtime client (publication
 * not configured, websocket can't open, etc) can never bring down the
 * page that called us. Worst case: no live updates, manual refresh
 * still works.
 */
let _shiftsChannelCounter = 0;

export function subscribeShifts(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _shiftsChannelCounter += 1;
    const channelName = `shifts_live_${Date.now()}_${_shiftsChannelCounter}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        () => onChange()
      )
      .subscribe();
    return () => {
      try {
        supabase!.removeChannel(channel);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[shifts] removeChannel failed:", err);
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] subscribe failed:", err);
    return () => {};
  }
}

/**
 * Sweep stale "active" shifts past the auto-checkout cutoff and force
 * them to "complete", and clear any orphaned rep_locations rows that
 * are leaving phantom dots on the admin map.
 *
 * Without this, reps who forget to tap Check out keep showing as "in
 * shift" on the dashboard map forever and their green dot stays alive.
 *
 * Two passes:
 *
 * 1. Active-state shifts past cutoff → state="complete".
 *    Active = state in ('in-progress','travelling','on-break','late').
 *    Cutoff:
 *      - shift_date < today                                  → always stale
 *      - shift_date == today AND now >= auto_checkout_time    → stale
 *
 * 2. Orphan rep_locations cleanup. Any rep_locations row whose rep_id
 *    has NO currently-active shift gets deleted. Catches the case
 *    where a shift was already marked complete (manual check-out, an
 *    earlier sweep run, or a previous bug) but the location-tracker's
 *    final clearRepLocation() never fired so the dot stuck.
 *
 * Returns the number of shifts auto-completed (orphan rep_locations
 * cleanup runs silently). Safe to call on every admin home mount.
 */
const ACTIVE_SHIFT_STATES = ["in-progress", "travelling", "on-break", "late"];

export async function sweepStaleShifts(): Promise<{ swept: number }> {
  if (!isSupabaseConfigured() || !supabase) return { swept: 0 };

  const cutoff = await getAutoCheckoutTime(); // "HH:MM"
  const today = todayLocalISO();
  const now = new Date();
  const [ch, cm] = cutoff.split(":").map((n) => parseInt(n, 10));
  const cutoffTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    ch,
    cm,
    0,
    0
  ).getTime();
  const todayPastCutoff = now.getTime() >= cutoffTodayMs;

  // ─── Pass 1: stale active shifts ─────────────────────────────────────
  const { data, error } = await supabase
    .from("shifts")
    .select("id, rep_id, shift_date, customer_id, customers(name)")
    .in("state", ACTIVE_SHIFT_STATES);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] sweep select:", error.message);
  }
  type Row = {
    id: string;
    rep_id: string | null;
    shift_date: string;
    customer_id: string;
    customers: { name?: string } | null;
  };
  const rows = (data as Row[]) || [];
  const stale = rows.filter((r) => {
    if (r.shift_date < today) return true;
    if (r.shift_date === today && todayPastCutoff) return true;
    return false;
  });

  if (stale.length > 0) {
    const ids = stale.map((s) => s.id);
    const { error: updErr } = await supabase
      .from("shifts")
      .update({
        state: "complete",
        // Stamp the column so the timesheet can read it directly.
        // For shifts that never checked in, this is when the sweep
        // ran rather than a "real" rep checkout — the
        // shift.auto_checked_out event in shift_events tells the
        // story if anyone needs to dig in.
        check_out_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (updErr) {
      // eslint-disable-next-line no-console
      console.warn("[shifts] sweep update:", updErr.message);
    }

    // Audit trail per shift.
    for (const s of stale) {
      const customerName = s.customers?.name || "a customer";
      await logEvent({
        event_type: "shift.auto_checked_out",
        shift_id: s.id,
        customer_id: s.customer_id,
        message: `Auto checked-out of ${customerName} (past ${cutoff})`,
        meta: { cutoff, shift_date: s.shift_date },
      });
    }
  }

  // ─── Pass 2: orphan rep_locations cleanup ────────────────────────────
  // Re-fetch the still-active shift list AFTER pass 1 so the active-rep
  // set reflects any auto-completes we just did.
  const { data: stillActive } = await supabase
    .from("shifts")
    .select("rep_id")
    .in("state", ACTIVE_SHIFT_STATES);
  const activeRepIds = new Set(
    ((stillActive as { rep_id: string | null }[]) || [])
      .map((r) => r.rep_id)
      .filter((id): id is string => !!id)
  );

  const { data: locRows } = await supabase
    .from("rep_locations")
    .select("rep_id");
  const orphanRepIds = ((locRows as { rep_id: string }[]) || [])
    .map((r) => r.rep_id)
    .filter((id) => !activeRepIds.has(id));

  if (orphanRepIds.length > 0) {
    // .select() after .delete() returns the deleted rows so we can
    // detect silent RLS blocks (Postgres returns 0 rows + no error
    // when a policy refuses the delete). The manager-delete policy
    // in db/migrations/2026_05_06_rep_locations_manager_delete.sql
    // is required for the admin app to actually wipe these rows.
    const { data: deleted, error: delErr } = await supabase
      .from("rep_locations")
      .delete()
      .in("rep_id", orphanRepIds)
      .select("rep_id");
    if (delErr) {
      // eslint-disable-next-line no-console
      console.warn("[sweep] clear orphan locations:", delErr.message);
    } else if (!deleted || deleted.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sweep] tried to clear ${orphanRepIds.length} orphan rep_locations row(s) but Postgres affected 0 — likely missing the rep_locations_manager_delete RLS policy. Apply db/migrations/2026_05_06_rep_locations_manager_delete.sql in Supabase.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.info(
        `[sweep] cleared ${deleted.length} orphan rep_locations row(s)`
      );
    }
  }

  return { swept: stale.length };
}
