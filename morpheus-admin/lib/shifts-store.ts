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
  /** Which site of the customer this shift is at. Nullable for legacy
   *  rows pre-2026-05-08; new shifts always set it. */
  site_id: string | null;
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
  /** Attention overlay — when not null + not resolved, the shift
   *  surfaces in Live Ops "Needs action". See the 2026-05-11
   *  migration for the full lifecycle. */
  attention: string | null;
  attention_reason: string | null;
  attention_note: string | null;
  attention_raised_at: string | null;
  attention_resolved_at: string | null;
  attention_resolved_by: string | null;
  /** Which manager-side action resolved the flag — see the
   *  2026-05-11 attention_resolution migration. NULL until a manager
   *  (or the rep, via withdraw) acts. */
  attention_resolution: string | null;
  /** Rep-supplied freeform note on this shift. Edited on the mobile
   *  /active page, read-only on the admin detail. See the
   *  2026-05-11 shifts_notes migration. */
  rep_notes: string | null;
  /** Joined site row when the shift has a site_id. The customer's
   *  legacy address fields are still populated for back-compat but
   *  every read path should prefer the site coords / address. */
  site: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    geofence_radius_m: number | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    notes: string | null;
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
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
  /**
   * Specific site of the customer for this shift. Required when the
   * customer has >1 active site; auto-resolved to the customer's only
   * active site otherwise (the form / cartesian builder fills it in).
   * Pre-2026-05-08 customers may have no site at all — those shifts
   * still insert with site_id=null (the FK is nullable) until the
   * one-time backfill catches up.
   */
  site_id?: string | null;
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
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
      site_id: s.site_id ?? null,
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
  site_id?: string | null;
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

// ─── One-off shifts management ─────────────────────────────────────────

export interface OneOffShiftRow {
  id: string;
  customer_id: string;
  rep_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  state: string;
  customer: { name: string; initials: string; color: string } | null;
}

/**
 * List shifts NOT part of a series (series_id IS NULL). These are
 * either one-off shifts created via /schedule/new with no recurrence,
 * OR legacy shifts created before the series_id column existed —
 * either way they're invisible on /schedule/manage's series list and
 * can pile up if the manager doesn't clean them up. By default we
 * only return upcoming + scheduled rows so the cleanup affordance
 * doesn't try to delete shifts already in flight.
 */
export async function listStandaloneShifts(opts?: {
  /** When true, restrict to shift_date >= today AND state='scheduled'. Default true. */
  upcomingOnly?: boolean;
}): Promise<OneOffShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const upcomingOnly = opts?.upcomingOnly ?? true;
  let q = supabase
    .from("shifts")
    .select(
      "id, customer_id, rep_id, shift_date, start_time, end_time, state, customers(name,initials,color)"
    )
    .is("series_id", null)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (upcomingOnly) {
    q = q.gte("shift_date", todayLocalISO()).eq("state", "scheduled");
  }
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listStandaloneShifts:", error.message);
    return [];
  }
  type Row = {
    id: string;
    customer_id: string;
    rep_id: string | null;
    shift_date: string;
    start_time: string;
    end_time: string;
    state: string;
    // PostgREST returns array shape for embedded resources; we know
    // the FK is to-one so it's always 0 or 1 entries.
    customers:
      | { name: string; initials: string; color: string }
      | { name: string; initials: string; color: string }[]
      | null;
  };
  return ((data as unknown as Row[]) || []).map((r) => {
    const customer = Array.isArray(r.customers)
      ? r.customers[0] ?? null
      : r.customers;
    return {
      id: r.id,
      customer_id: r.customer_id,
      rep_id: r.rep_id,
      shift_date: r.shift_date,
      start_time: (r.start_time || "").slice(0, 5),
      end_time: (r.end_time || "").slice(0, 5),
      state: r.state,
      customer,
    };
  });
}

/**
 * Bulk-delete shifts by ids. Refuses to touch anything that isn't
 * still 'scheduled' so an admin can't accidentally nuke a row mid-
 * shift or rewrite history. Returns the count actually deleted.
 */
export async function bulkDeleteShifts(
  ids: string[]
): Promise<{ ok: boolean; error?: string; deleted?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  if (ids.length === 0) return { ok: true, deleted: 0 };
  const { error, count } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .in("id", ids)
    .eq("state", "scheduled");
  if (error) {
    notifySaveError(error.message, "shifts");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.deleted",
    message: `Bulk-deleted ${count ?? 0} shifts`,
    meta: { count: count ?? 0 },
  });
  notifySaved("shifts removed");
  return { ok: true, deleted: count ?? 0 };
}

/**
 * Nuke every shift dated today or later — regardless of state.
 * Used by the typed-RESET confirm on /schedule/manage. Past
 * shifts (history) are preserved; everything from today forward
 * goes, including stranded in_progress / complete / late /
 * cancelled rows that previous "scheduled-only" filters left
 * behind. The typed-RESET prompt is the safety net.
 */
export async function deleteAllUpcomingShifts(): Promise<{
  ok: boolean;
  error?: string;
  deleted?: number;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error, count } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .gte("shift_date", todayLocalISO());
  if (error) {
    notifySaveError(error.message, "schedule");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.deleted",
    message: `Reset schedule — deleted ${count ?? 0} upcoming shifts`,
    meta: { count: count ?? 0, source: "deleteAllUpcomingShifts" },
  });
  notifySaved("schedule reset");
  return { ok: true, deleted: count ?? 0 };
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
  /** Distinct weekday indices used by this series (0=Sun, 6=Sat),
   *  derived from the actual shift_date list. Drives the cadence
   *  pill on /schedule/manage so the manager can tell at a glance
   *  which series is "Mon, Wed, Fri" vs "Daily" vs a one-off. */
  weekdays: number[];
  /** Human-readable label for the cadence column. "One-off",
   *  "Daily", "Mon · Wed · Fri", etc. Computed in the store so
   *  every render site uses the same vocabulary. */
  cadenceLabel: string;
}

/**
 * Translate a set of weekday indices + total shift count into the
 * cadence label rendered on /schedule/manage.
 *
 *   - 1 shift total          → "One-off"
 *   - all 7 weekdays         → "Daily"
 *   - Mon–Fri only           → "Weekdays"
 *   - Sat+Sun only           → "Weekends"
 *   - 1 weekday              → "Weekly · {Mondays}"
 *   - 2–4 weekdays           → "Mon · Wed · Fri" (short labels joined)
 *   - otherwise (5/6 mix)    → full short list
 */
function describeCadence(weekdays: number[], totalCount: number): string {
  if (totalCount <= 1) return "One-off";
  const set = new Set(weekdays);
  const all7 = set.size === 7;
  if (all7) return "Daily";
  const onlyMonFri =
    set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d));
  if (onlyMonFri) return "Weekdays";
  const onlyWeekend =
    set.size === 2 && set.has(0) && set.has(6);
  if (onlyWeekend) return "Weekends";
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const LONG = [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
  ];
  if (weekdays.length === 1) {
    return `Weekly · ${LONG[weekdays[0]]}`;
  }
  return weekdays.map((d) => SHORT[d]).join(" · ");
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
    // Derive cadence from the actual shift_date set. We use noon
    // local time when constructing the Date so a date string like
    // "2026-05-12" never lands in yesterday in UTC-aware browsers.
    const weekdaySet = new Set<number>();
    for (const r of rows) {
      const d = new Date(`${r.shift_date}T12:00:00`);
      weekdaySet.add(d.getDay());
    }
    const weekdays = Array.from(weekdaySet).sort();
    const cadenceLabel = describeCadence(weekdays, rows.length);
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
      weekdays,
      cadenceLabel,
    });
  }
  // Newest series first (by lastDate desc).
  out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  return out;
}

/**
 * Edit every still-scheduled shift in a series. Mirrors
 * cancelShiftSeries — we only touch state='scheduled' rows so a
 * running or complete shift can't be retroactively rewritten.
 *
 * Pass `fromDate` to limit the update to shifts on or after that
 * date ("apply to today and future" semantics). Pass it the same
 * keys updateShift accepts; we also accept rep_id explicitly here
 * (null = make claimable).
 *
 * Customer changes propagate to tasks_total too — the new customer's
 * task count is fetched once and applied to every updated row, so
 * the live tasks bar stays honest after a series-wide customer flip.
 */
export interface SeriesPatch {
  customer_id?: string;
  rep_id?: string | null;
  start_time?: string;
  end_time?: string;
}

export async function updateShiftSeries(
  series_id: string,
  patch: SeriesPatch,
  opts?: { fromDate?: string }
): Promise<{ ok: boolean; error?: string; updated?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }

  // Strip undefined keys so we only push what the caller wants
  // changed.
  const cleaned: Record<string, unknown> = {};
  if (patch.customer_id !== undefined) cleaned.customer_id = patch.customer_id;
  if (patch.rep_id !== undefined) cleaned.rep_id = patch.rep_id;
  if (patch.start_time !== undefined) cleaned.start_time = patch.start_time;
  if (patch.end_time !== undefined) cleaned.end_time = patch.end_time;
  if (Object.keys(cleaned).length === 0) {
    return { ok: true, updated: 0 };
  }

  let q = supabase
    .from("shifts")
    .update(cleaned, { count: "exact" })
    .eq("series_id", series_id)
    .eq("state", "scheduled");
  if (opts?.fromDate) q = q.gte("shift_date", opts.fromDate);
  const { error, count } = await q;
  if (error) {
    notifySaveError(error.message, "shift series");
    return { ok: false, error: error.message };
  }
  // Catch silent zero-row updates — most often "every shift in this
  // series is already past or in a state other than 'scheduled'",
  // sometimes an RLS block. The old behaviour was to swallow this
  // as success, which made Edit-future feel broken when nothing
  // changed under the hood. Surfacing the count = 0 case gives the
  // manager a clear "nothing was updated, here's why" message.
  if ((count ?? 0) === 0) {
    return {
      ok: false,
      error:
        "Nothing was updated — every shift in this series is past, running, or complete. Edit-future only changes shifts still in 'scheduled' state.",
    };
  }

  await logEvent({
    event_type: "shift.scheduled",
    message: `Edited ${count ?? 0} shifts in a series${
      opts?.fromDate ? ` from ${opts.fromDate} forward` : ""
    }`,
    meta: { series_id, from_date: opts?.fromDate, fields: Object.keys(cleaned) },
  });
  notifySaved("series updated");
  return { ok: true, updated: count ?? 0 };
}

/**
 * Regenerate the future portion of a series with a new pattern.
 *
 * Conceptually: "edit future" is too narrow when the manager wants
 * to change the ACTUAL DAYS the shifts run on (e.g. flip from
 * Mon-Fri to Mon-Wed-Fri). Doing that in-place per row is fragile —
 * fewer days means orphaned shifts, more days means new rows that
 * have to attach to the same series. So we instead:
 *
 *   1. Delete every still-scheduled shift in the series whose
 *      shift_date ≥ fromDate.
 *   2. Walk the new (weekdays × dateRange) pattern and create one
 *      shift per (customer × rep × generated date), all sharing
 *      the original series_id.
 *
 * Running + complete + past shifts in the series are never
 * touched. Returns the count deleted + count inserted so the UI
 * can report "Replaced 32 shifts → 18 shifts".
 *
 * If the new pattern produces zero dates (e.g. weekdays array is
 * empty or fromDate > untilDate) the function refuses rather than
 * silently turning the regen into a pure delete.
 */
export interface SeriesRegenerateInput {
  customerIds: string[];
  /** rep_ids, or [null] for "unassigned/claimable". */
  repIds: (string | null)[];
  /** 0..6, Mon=0..Sun=6 — matches the schedule/new form. */
  weekdays: number[];
  /** YYYY-MM-DD, inclusive. Earliest date a new shift can land on. */
  fromDate: string;
  /** YYYY-MM-DD, inclusive. Latest date a new shift can land on. */
  untilDate: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export async function regenerateShiftSeries(
  series_id: string,
  input: SeriesRegenerateInput
): Promise<{
  ok: boolean;
  error?: string;
  deleted?: number;
  created?: number;
}> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  if (input.weekdays.length === 0) {
    return { ok: false, error: "Pick at least one weekday." };
  }
  if (input.untilDate < input.fromDate) {
    return { ok: false, error: "'Until' date must be on or after the start." };
  }
  if (input.startTime >= input.endTime) {
    return { ok: false, error: "End time must be after start time." };
  }
  if (input.customerIds.length === 0) {
    return { ok: false, error: "Pick at least one customer." };
  }
  if (input.repIds.length === 0) {
    return { ok: false, error: "Pick at least one rep (or 'Unassigned')." };
  }

  // Walk the new date pattern. Same anchor-at-noon trick used in
  // /schedule/new to dodge DST flips at midnight.
  const dates: string[] = [];
  const start = new Date(input.fromDate + "T12:00:00");
  const end = new Date(input.untilDate + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay();
    const idx = (jsDay + 6) % 7; // Mon=0..Sun=6
    if (input.weekdays.includes(idx)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${day}`);
    }
  }
  if (dates.length === 0) {
    return {
      ok: false,
      error: "No dates fall in that range with those weekdays selected.",
    };
  }

  // Delete the existing future shifts in the series.
  const { error: delErr, count: deletedCount } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .eq("series_id", series_id)
    .eq("state", "scheduled")
    .gte("shift_date", input.fromDate);
  if (delErr) {
    notifySaveError(delErr.message, "shift series");
    return { ok: false, error: delErr.message };
  }

  // Build the insert payload. tasks_total stays 0 here — admin's
  // /shifts/[id]/edit + Live Ops both auto-derive it from
  // customer_tasks via countTasksForCustomers, so the column is
  // just a denormalised cache.
  const rows: Array<Record<string, unknown>> = [];
  for (const date of dates) {
    for (const cid of input.customerIds) {
      for (const rid of input.repIds) {
        rows.push({
          customer_id: cid,
          shift_date: date,
          start_time: input.startTime,
          end_time: input.endTime,
          rep_id: rid || null,
          distance_label: "",
          tasks_total: 0,
          series_id,
        });
      }
    }
  }

  // Bulk insert. Supabase chunks at ~1000 rows by default; we
  // rarely cross that for a 4-week regen, but split just in case.
  let createdCount = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insErr } = await supabase.from("shifts").insert(chunk);
    if (insErr) {
      notifySaveError(insErr.message, "shift series");
      return { ok: false, error: insErr.message, deleted: deletedCount ?? 0, created: createdCount };
    }
    createdCount += chunk.length;
  }

  await logEvent({
    event_type: "shift.scheduled",
    message: `Regenerated series — replaced ${deletedCount ?? 0} shifts with ${createdCount}`,
    meta: {
      series_id,
      from_date: input.fromDate,
      until_date: input.untilDate,
      weekdays: input.weekdays,
      deleted: deletedCount ?? 0,
      created: createdCount,
    },
  });
  notifySaved("series regenerated");
  return { ok: true, deleted: deletedCount ?? 0, created: createdCount };
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
// ─── Attention: manager-side "Needs action" queue ─────────────────────
//
// The rep flags a shift they can't attend (mobile /shifts or home
// up-next card → UnableToAttendSheet) which sets `attention` and
// `attention_reason` on the shift. Manager resolves via Live Ops
// "Needs action" — four affordances, each clears the overlay by
// stamping attention_resolved_at + attention_resolved_by:
//
//   reassignShift(id, newRepId)
//     → rep_id := newRepId; overlay cleared; event shift.reassigned
//
//   releaseShift(id)
//     → rep_id := null (claimable); overlay cleared; event shift.released
//
//   acknowledgeAttention(id)
//     → overlay cleared, rep_id/state untouched; event shift.acknowledged
//       (used when the manager just wants to mark it resolved — eg
//       they spoke to the rep and worked something out off-app.)
//
//   cancelShiftFromAttention(id)
//     → state := 'cancelled'; overlay cleared; event shift.cancelled

/**
 * Find rep_ids that already have a shift overlapping a given window
 * on the given date. Used by the Reassign picker to warn (or block)
 * the manager from double-booking a rep when they're reassigning a
 * flagged shift away from its original rep.
 *
 * Excludes:
 *   - The shift being reassigned itself (excludeShiftId)
 *   - State='cancelled' rows (they're not really occupying the slot)
 *
 * Returns a Set of rep_ids for cheap O(1) membership tests in the UI.
 */
export async function listRepConflictsForSlot(opts: {
  shiftDate: string;
  startTime: string;
  endTime: string;
  excludeShiftId?: string;
}): Promise<Set<string>> {
  if (!isSupabaseConfigured() || !supabase) return new Set();
  let q = supabase
    .from("shifts")
    .select("rep_id, start_time, end_time, id")
    .eq("shift_date", opts.shiftDate)
    .not("rep_id", "is", null)
    .neq("state", "cancelled")
    // Half-open overlap: rows where existing.start < ours.end AND
    // ours.start < existing.end. Filtered server-side to keep the
    // payload small even on busy days.
    .lt("start_time", opts.endTime)
    .gt("end_time", opts.startTime);
  if (opts.excludeShiftId) q = q.neq("id", opts.excludeShiftId);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listRepConflictsForSlot:", error.message);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ rep_id: string | null }>) {
    if (row.rep_id) out.add(row.rep_id);
  }
  return out;
}

/**
 * Every shift with an open attention overlay. The Live Ops "Needs
 * action" tab drives off this. Ordered by raised_at desc so the
 * freshest issues bubble to the top — matches the partial index
 * the schema migration creates for this exact query.
 */
export async function listOpenAttentionShifts(): Promise<ShiftRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select(
      "*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)"
    )
    .not("attention", "is", null)
    .is("attention_resolved_at", null)
    .order("attention_raised_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[unable] admin listOpenAttention: query failed", error);
    return [];
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[unable] admin listOpenAttention: ${(data ?? []).length} open row(s)`,
    (data ?? []).map((r) => ({
      id: (r as { id?: string }).id,
      attention: (r as { attention?: string }).attention,
      rep_id: (r as { rep_id?: string }).rep_id,
    }))
  );
  return (data as ShiftRow[]) ?? [];
}

async function getResolverId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Read the shift's name + reason once before mutating so the audit
 * event and the toast message both carry useful context. Returns
 * null when the row is gone (race with delete).
 */
async function readAttentionContext(shiftId: string): Promise<
  | {
      customer_id: string;
      customer_name: string;
      attention_reason: string | null;
      original_rep_id: string | null;
    }
  | null
> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("shifts")
    .select("customer_id, rep_id, attention_reason, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    customer_id: string;
    rep_id: string | null;
    attention_reason: string | null;
    customers: { name?: string } | { name?: string }[] | null;
  };
  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    customer_id: row.customer_id,
    customer_name: cust?.name || "a shift",
    attention_reason: row.attention_reason,
    original_rep_id: row.rep_id,
  };
}

/** Reassign a flagged shift to a different rep. Clears the overlay. */
export async function reassignShift(
  shiftId: string,
  newRepId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const resolverId = await getResolverId();
  const ctx = await readAttentionContext(shiftId);
  const { error } = await supabase
    .from("shifts")
    .update({
      rep_id: newRepId,
      attention: null,
      attention_reason: null,
      attention_note: null,
      attention_raised_at: null,
      attention_resolved_at: new Date().toISOString(),
      attention_resolved_by: resolverId,
      attention_resolution: "reassigned",
    })
    .eq("id", shiftId);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.reassigned",
    shift_id: shiftId,
    ...(ctx?.customer_id ? { customer_id: ctx.customer_id } : {}),
    message: `Reassigned ${ctx?.customer_name || "shift"}`,
    meta: {
      original_rep_id: ctx?.original_rep_id ?? null,
      new_rep_id: newRepId,
      reason: ctx?.attention_reason ?? null,
    },
  });
  notifySaved("shift");
  return { ok: true };
}

/** Release a flagged shift to the claimable pool (rep_id = null). */
export async function releaseShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const resolverId = await getResolverId();
  const ctx = await readAttentionContext(shiftId);
  const { error } = await supabase
    .from("shifts")
    .update({
      rep_id: null,
      attention: null,
      attention_reason: null,
      attention_note: null,
      attention_raised_at: null,
      attention_resolved_at: new Date().toISOString(),
      attention_resolved_by: resolverId,
      attention_resolution: "released",
    })
    .eq("id", shiftId);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.released",
    shift_id: shiftId,
    ...(ctx?.customer_id ? { customer_id: ctx.customer_id } : {}),
    message: `Released ${ctx?.customer_name || "shift"} to the claimable pool`,
    meta: {
      original_rep_id: ctx?.original_rep_id ?? null,
      reason: ctx?.attention_reason ?? null,
    },
  });
  notifySaved("shift");
  return { ok: true };
}

/**
 * Acknowledge — clears the overlay without changing rep_id or state.
 * Used when the manager resolved the issue out-of-band (called the
 * rep, etc) and just wants the queue clean.
 */
export async function acknowledgeAttention(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const resolverId = await getResolverId();
  const ctx = await readAttentionContext(shiftId);
  const { error } = await supabase
    .from("shifts")
    .update({
      attention: null,
      attention_reason: null,
      attention_note: null,
      attention_raised_at: null,
      attention_resolved_at: new Date().toISOString(),
      attention_resolved_by: resolverId,
      attention_resolution: "acknowledged",
    })
    .eq("id", shiftId);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.acknowledged",
    shift_id: shiftId,
    ...(ctx?.customer_id ? { customer_id: ctx.customer_id } : {}),
    message: `Acknowledged unable-to-attend on ${ctx?.customer_name || "shift"}`,
    meta: { reason: ctx?.attention_reason ?? null },
  });
  notifySaved("shift");
  return { ok: true };
}

/** Cancel the shift outright. Sets state='cancelled', clears overlay. */
export async function cancelShiftFromAttention(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const resolverId = await getResolverId();
  const ctx = await readAttentionContext(shiftId);
  const { error } = await supabase
    .from("shifts")
    .update({
      state: "cancelled",
      attention: null,
      attention_reason: null,
      attention_note: null,
      attention_raised_at: null,
      attention_resolved_at: new Date().toISOString(),
      attention_resolved_by: resolverId,
      attention_resolution: "cancelled",
    })
    .eq("id", shiftId);
  if (error) {
    notifySaveError(error.message, "shift");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "shift.cancelled",
    shift_id: shiftId,
    ...(ctx?.customer_id ? { customer_id: ctx.customer_id } : {}),
    message: `Cancelled ${ctx?.customer_name || "shift"}`,
    meta: {
      original_rep_id: ctx?.original_rep_id ?? null,
      reason: ctx?.attention_reason ?? null,
    },
  });
  notifySaved("shift");
  return { ok: true };
}

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
