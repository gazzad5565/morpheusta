/**
 * Shifts store (mobile) — reads + claims shifts from Supabase.
 *
 * Two views the mobile app cares about:
 *   - "My shifts today" → rep_id = me, shift_date = today
 *   - "Unscheduled today" → rep_id IS NULL, shift_date = today (claimable)
 *
 * Each row joins with the customers table so we get the display info
 * (name, initials, color, code) in one query.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import type { Shift } from "./mock-data";

interface ShiftRow {
  id: string;
  customer_id: string;
  /** Specific site for this shift. Nullable for legacy rows. */
  site_id: string | null;
  rep_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  distance_label: string | null;
  state: string;
  check_in_at: string | null;
  tasks_done: number;
  tasks_total: number;
  /** Attention overlay — null when nothing needs a manager to look
   *  at it, otherwise one of 'unable_to_attend' | 'no_show' | …
   *  Resolved when attention_resolved_at is set. See the 2026-05-11
   *  migration for the full lifecycle. */
  attention: string | null;
  attention_reason: string | null;
  attention_note: string | null;
  attention_raised_at: string | null;
  attention_resolved_at: string | null;
  attention_resolution: string | null;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
  } | null;
  /** Joined site row when site_id is set. The mobile rep app prefers
   *  these coords/address/geofence over the customer's legacy fields
   *  for the geofence + map dot + directions deep link. */
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

/** Convert "08:00:00" → "08:00 AM" */
function formatTimeLabel(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

/**
 * Site fields exposed to the rep app — flattened so screens don't
 * have to dig through `shift.site?.lat`. Nullable on every field
 * because pre-2026-05-08 rows might not have a site joined.
 */
export interface ShiftSiteFields {
  siteId: string | null;
  siteName: string | null;
  siteAddress: string | null;
  siteLat: number | null;
  siteLng: number | null;
  /** Site-level geofence override; falls back to customer/org default
   *  when null (handled at the consumer). */
  siteGeofenceM: number | null;
  /** Per-site contact details. Reps tap-to-call / tap-to-mail when
   *  travelling or having trouble finding the site; access notes are
   *  the freeform "use back entrance, buzz #1234, park lot B" string
   *  shown on the active shift screen. */
  siteContactName: string | null;
  siteContactPhone: string | null;
  siteContactEmail: string | null;
  siteNotes: string | null;
}

/**
 * Attention overlay surfaced to mobile screens. Mirrors the DB columns
 * added by the 2026-05-11 migration so the row UI can branch on
 * "awaiting manager" without joining or re-querying.
 *
 * Open = `attention != null && attentionResolvedAt == null`.
 * Resolved = `attentionResolvedAt != null` (the manager acted).
 * The rep app generally treats *resolved* attention as ancient
 * history and doesn't display it.
 */
export interface ShiftAttentionFields {
  attention: string | null;
  attentionReason: string | null;
  attentionNote: string | null;
  attentionRaisedAt: string | null;
  attentionResolvedAt: string | null;
  /** What the manager (or rep, via withdraw) did to resolve the
   *  flag. One of 'reassigned' | 'released' | 'acknowledged' |
   *  'cancelled' | 'withdrawn'. Drives the brief feedback pill that
   *  shows on the rep's row for a few hours after resolution. */
  attentionResolution: string | null;
}

export type ShiftWithMeta = Shift &
  ShiftSiteFields &
  ShiftAttentionFields & {
    realId: string;
    repId: string | null;
    checkInAt: string | null;
    state: string;
    /** Raw HH:MM[:SS] from the DB so the rep app can compute relative
     *  countdowns ("in 50 min" / "10 min late") without re-parsing
     *  the human-formatted display strings. */
    rawStartTime: string;
    rawEndTime: string;
    shiftDate: string;
  };

function rowToShift(row: ShiftRow): ShiftWithMeta {
  const c = row.customers;
  const s = row.site;
  return {
    // The "id" used by mobile UI for matching is customer id
    id: c?.id || row.customer_id,
    name: c?.name || "Unknown customer",
    initials: c?.initials || "??",
    color: c?.color || "#888",
    code: c?.code || 0,
    start: formatTimeLabel(row.start_time),
    end: formatTimeLabel(row.end_time),
    distance: row.distance_label || "",
    // Internal — for claim/check-in/timer + state badge
    realId: row.id,
    repId: row.rep_id,
    checkInAt: row.check_in_at,
    state: row.state,
    rawStartTime: row.start_time || "",
    rawEndTime: row.end_time || "",
    shiftDate: row.shift_date || "",
    siteId: s?.id ?? row.site_id ?? null,
    siteName: s?.name ?? null,
    siteAddress: s?.address ?? null,
    siteLat: s?.latitude ?? null,
    siteLng: s?.longitude ?? null,
    siteGeofenceM: s?.geofence_radius_m ?? null,
    siteContactName: s?.contact_name ?? null,
    siteContactPhone: s?.contact_phone ?? null,
    siteContactEmail: s?.contact_email ?? null,
    siteNotes: s?.notes ?? null,
    attention: row.attention ?? null,
    attentionReason: row.attention_reason ?? null,
    attentionNote: row.attention_note ?? null,
    attentionRaisedAt: row.attention_raised_at ?? null,
    attentionResolvedAt: row.attention_resolved_at ?? null,
    attentionResolution: row.attention_resolution ?? null,
  };
}

// "Today" in local tz — see lib/format.ts for the why.
import { todayLocalISO as todayISO } from "./format";

/** Shifts assigned to the current user, today. */
export async function listMyShiftsToday(): Promise<
  Array<ShiftWithMeta>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const today = todayISO();
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
    .eq("rep_id", userId)
    .eq("shift_date", today)
    // Cancelled shifts (manager resolved an attention flag with Cancel,
    // or cancelled outright) shouldn't appear in the rep's today list —
    // they're done from the rep's perspective. The audit row in
    // shift_events preserves the trail.
    .neq("state", "cancelled")
    .order("start_time", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listMyShiftsToday:", error.message);
    return [];
  }

  // If we got nothing back, log a one-line diagnostic so the rep
  // (and us, when they screenshot the console) can see WHY their
  // dashboard is empty — without the diagnostic the most common
  // misdiagnosis is "the app is broken" when actually the shifts
  // were assigned to a different rep or dated something else.
  if (!data || data.length === 0) {
    const { count } = await supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("rep_id", userId);
    // eslint-disable-next-line no-console
    console.info(
      `[shifts] listMyShiftsToday: 0 today (${today}). Total shifts assigned to me (any date): ${
        count ?? "unknown"
      }. user_id=${userId}`
    );
  }

  return (data as ShiftRow[]).map(rowToShift);
}

/**
 * The rep's currently active (in-progress) shift, if any.
 *
 * Used by the active-shift screen and the check-out screen so they can
 * read/update the right row without threading a shift id through the URL.
 * If there's more than one in-progress shift (shouldn't happen normally),
 * returns the most recently checked-in one.
 */
export async function getMyActiveShift(): Promise<
  (ShiftWithMeta) | null
> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
    .eq("rep_id", userId)
    .eq("state", "in-progress")
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getMyActiveShift:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToShift(data as ShiftRow);
}

/** Unassigned shifts today — anyone authenticated can see + claim. */
export async function listUnassignedShiftsToday(): Promise<
  Array<ShiftWithMeta>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
    .is("rep_id", null)
    .eq("shift_date", todayISO())
    // Cancelled shifts aren't claimable.
    .neq("state", "cancelled")
    .order("start_time", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] listUnassignedShiftsToday:", error.message);
    return [];
  }
  return (data as ShiftRow[]).map(rowToShift);
}

/** Claim an unassigned shift — sets rep_id to the current user. */
export async function claimShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  // Look up the shift first so we can include the customer in the event log.
  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();

  const { error } = await supabase
    .from("shifts")
    .update({ rep_id: userId })
    .eq("id", shiftId)
    .is("rep_id", null); // Only succeeds if it's still unassigned (race-safe)

  if (error) return { ok: false, error: error.message };
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "a customer";
  await logEvent({
    event_type: "shift.claimed",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Claimed shift at ${customerName}`,
  });
  return { ok: true };
}

/**
 * Self-create an immediate-shift for the current rep at a customer.
 * Used by /add-shift when the org has the "approval not needed"
 * setting on — bypasses the requested_shifts queue and writes a
 * scheduled shift directly so the rep can check in straight away.
 *
 * Defaults: today's date, 08:00–17:00, tasks_total derived later
 * by listShifts joins / countTasksForCustomers (we just write a
 * sensible 0 here; the admin's edit page surfaces the live count).
 *
 * Caller is responsible for not invoking this when auto-approve is
 * off — we don't recheck the setting here to avoid an extra round-
 * trip per submission.
 */
export async function selfCreateImmediateShift(
  customerId: string,
  opts?: { startTime?: string; endTime?: string; shiftDate?: string }
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const today = todayISO();
  const { data: customerRow } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("shifts")
    .insert({
      customer_id: customerId,
      shift_date: opts?.shiftDate || today,
      start_time: opts?.startTime || "08:00",
      end_time: opts?.endTime || "17:00",
      rep_id: userId,
      distance_label: "",
      tasks_total: 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const customerName =
    (customerRow as { name?: string } | null)?.name || "a customer";
  await logEvent({
    event_type: "shift.scheduled",
    shift_id: data?.id,
    customer_id: customerId,
    message: `Self-scheduled at ${customerName} (auto-approved)`,
    meta: { auto_approved: true },
  });
  return { ok: true, id: data?.id };
}

/** Fetch a single shift by id, joined with its customer. */
export async function getShiftById(
  shiftId: string
): Promise<(ShiftWithMeta) | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("shifts")
    .select("*, customers(id,name,initials,color,code), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
    .eq("id", shiftId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[shifts] getById:", error.message);
    return null;
  }
  return rowToShift(data as ShiftRow);
}

/**
 * Check in to a shift — sets state='in-progress', stamps check_in_at,
 * AND claims the shift (sets rep_id = current user) if it was unassigned.
 *
 * Bug previously: this function only flipped state. If a rep tapped
 * Check in on an unassigned shift via a deep link or similar, rep_id
 * stayed null, so:
 *   - getMyActiveShift() (filters by rep_id = me) returned null →
 *     /active redirected back to "Today's shifts"
 *   - The location-tracker, which only mounts on /active, never started
 *     → no rep_locations row → admin map didn't show the rep
 *   - The admin shifts list rendered the row as "Unassigned" because
 *     there was no rep_id to resolve against profiles
 *
 * Fix: include rep_id in the update so a check-in always claims the
 * shift to the user. Refuses if the shift is already assigned to a
 * different rep (the .or filter limits it to "unassigned or already
 * mine").
 */
export async function checkInToShift(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("shifts")
    .update({
      state: "in-progress",
      check_in_at: new Date().toISOString(),
      rep_id: userId,
    })
    .eq("id", shiftId)
    // Only succeed when the shift is unassigned or already mine.
    // Postgrest .or() syntax: comma-separated filters in one OR group.
    .or(`rep_id.is.null,rep_id.eq.${userId}`)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "That shift is assigned to another rep — can't check in.",
    };
  }
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "customer";

  // Auto-end any in-flight travel — if the rep tapped Start travelling
  // before checking in, this is implicitly their "Arrived" moment.
  // Saves them a tap + makes sure shift.travel_started has a paired
  // shift.travel_ended event in the audit trail.
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("morpheus.travelling_since");
      if (raw) {
        const ts = parseInt(raw, 10);
        if (Number.isFinite(ts) && ts > 0) {
          const elapsed = Math.floor((Date.now() - ts) / 1000);
          await logEvent({
            event_type: "shift.travel_ended",
            shift_id: shiftId,
            customer_id:
              (shiftRow as { customer_id?: string } | null)?.customer_id ||
              null,
            message: `Arrived at ${customerName}`,
            meta: { elapsed_sec: elapsed, auto_ended_by: "check_in" },
          });
        }
        window.localStorage.removeItem("morpheus.travelling_since");
      }
    }
  } catch {
    /* localStorage / SSR — ignore */
  }

  await logEvent({
    event_type: "shift.checked_in",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Checked into ${customerName}`,
  });
  return { ok: true };
}

/**
 * Tasks defined for a customer (admin-managed via /tasks).
 * Used on the active-shift screen so the rep sees what to do at this site.
 */
export interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  compulsory: boolean;
  sort_order: number;
}

export async function getTasksForCustomer(customerId: string): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  // Match this customer's specific tasks AND any universal (NULL) tasks
  // that apply to all customers.
  const { data, error } = await supabase
    .from("customer_tasks")
    .select("id, name, description, duration_min, compulsory, sort_order")
    .or(`customer_id.eq.${customerId},customer_id.is.null`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[shifts] getTasksForCustomer:", error.message);
    return [];
  }
  return (data as TaskRow[]) || [];
}

/**
 * Check out of a shift — sets state='complete'. Also accepts a tasksDone
 * value so the admin can see how many tasks the rep finished.
 */
export async function checkOutOfShift(
  shiftId: string,
  tasksDone?: number
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: shiftRow } = await supabase
    .from("shifts")
    .select("customer_id, customers(name)")
    .eq("id", shiftId)
    .maybeSingle();
  const update: Record<string, unknown> = {
    state: "complete",
    // First-class column so the timesheet can compute hours without
    // joining shift_events. The events log still gets a row below for
    // the audit trail / Live Feed.
    check_out_at: new Date().toISOString(),
  };
  if (typeof tasksDone === "number") update.tasks_done = tasksDone;
  const { error } = await supabase.from("shifts").update(update).eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
  const customerName =
    (shiftRow as { customers?: { name?: string } } | null)?.customers?.name || "customer";
  await logEvent({
    event_type: "shift.checked_out",
    shift_id: shiftId,
    customer_id:
      (shiftRow as { customer_id?: string } | null)?.customer_id || null,
    message: `Checked out of ${customerName}`,
    meta: typeof tasksDone === "number" ? { tasks_done: tasksDone } : undefined,
  });
  return { ok: true };
}

/**
 * Flip a live shift between in-progress and on-break.
 *
 * The admin Live Ops tabs filter by shifts.state, so without an
 * actual state change the "On break" tab stayed empty even while a
 * rep was on break — the existing shift_events row carried the
 * audit but didn't surface in the live filter.
 *
 * We only allow the obvious transitions:
 *   onBreak=true   → state must currently be 'in-progress' to flip
 *                    to 'on-break'.
 *   onBreak=false  → state must currently be 'on-break' to flip
 *                    back to 'in-progress'.
 * Any other state (scheduled / complete / late) is left alone — a
 * stale break event after check-out shouldn't reanimate the shift.
 */
export async function setShiftBreakState(
  shiftId: string,
  onBreak: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: row } = await supabase
    .from("shifts")
    .select("state")
    .eq("id", shiftId)
    .maybeSingle();
  const currentState = (row as { state?: string } | null)?.state || "";
  const targetState = onBreak ? "on-break" : "in-progress";
  // Permissive transition rules:
  //   onBreak=true   → allowed from any "live" state
  //                    (in-progress / travelling / on-break-already)
  //   onBreak=false  → allowed only from on-break
  // We refuse from terminal states (complete / late) so a stale
  // event after check-out can't reanimate the shift. Earlier this
  // helper required `in-progress` strictly, which silently dropped
  // the flip when a rep started a break straight after travelling
  // (state still 'travelling', not 'in-progress') — admin's "On
  // break" tab stayed empty even though the rep was on break.
  const liveStates = new Set(["in-progress", "travelling", "on-break"]);
  const allowed = onBreak
    ? liveStates.has(currentState)
    : currentState === "on-break";
  if (!allowed) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shifts] setShiftBreakState skipped: shift ${shiftId} state="${currentState}" cannot flip to "${targetState}"`
    );
    return { ok: true };
  }
  if (currentState === targetState) return { ok: true }; // already there
  const { error } = await supabase
    .from("shifts")
    .update({ state: targetState })
    .eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Flip a scheduled shift's state to/from 'travelling'.
 *
 * Called from the homepage Travelling toggle so the admin's Live Ops
 * "Travelling" tab actually surfaces the rep's en-route status. We
 * gate the transition the same way setShiftBreakState does:
 *   travelling=true   → state must be 'scheduled' to flip to 'travelling'
 *   travelling=false  → state must be 'travelling' to flip back to 'scheduled'
 *
 * Any other state (in-progress, complete, late, on-break) is left
 * alone so a stale travel-ended event after check-in can't bump the
 * shift back to scheduled.
 */
export async function setShiftTravellingState(
  shiftId: string,
  travelling: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: row } = await supabase
    .from("shifts")
    .select("state")
    .eq("id", shiftId)
    .maybeSingle();
  const currentState = (row as { state?: string } | null)?.state || "";
  const targetState = travelling ? "travelling" : "scheduled";
  const requiredCurrent = travelling ? "scheduled" : "travelling";
  if (currentState !== requiredCurrent) {
    return { ok: true };
  }
  const { error } = await supabase
    .from("shifts")
    .update({ state: targetState })
    .eq("id", shiftId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Subscribe to realtime changes on the shifts table. The callback fires
 * on any insert/update/delete; the caller is expected to refetch its
 * own shape (listMyShiftsToday, etc).
 *
 * Mirror of the admin-side subscribeShifts. Without this, a rep who's
 * looking at the dashboard right now wouldn't see a freshly-assigned
 * shift until they switched tabs and came back.
 *
 * Each call gets a unique channel name to avoid the supabase-js
 * collision when two screens subscribe at the same time.
 *
 * Wrapped in try/catch so a misbehaving realtime client (publication
 * not configured, websocket can't open) can never crash the page.
 */
/**
 * Decide whether to surface a "your manager did X" pill on a row for
 * a recently-resolved attention flag. We only show this when the
 * outcome leaves the rep still seeing the shift in their list —
 * which is essentially the acknowledged case (rep still owns it) or
 * the withdrawn case (rep changed their own mind). Reassigned /
 * released / cancelled all remove the row from the rep's view
 * anyway, so they never reach this code path.
 *
 * The pill auto-expires four hours after resolution to keep the row
 * from looking weird the next day. After that the row is just a
 * normal scheduled shift.
 */
const RESOLVED_FEEDBACK_WINDOW_MS = 4 * 60 * 60 * 1000;

export type ResolvedFeedback = {
  tone: "ok" | "info";
  label: string;
  detail: string;
};

export function resolvedAttentionFeedback(shift: {
  attentionResolvedAt?: string | null;
  attentionResolution?: string | null;
  /** Mobile sometimes uses `attention_resolved_at` (db naming). Accept both. */
  attention_resolved_at?: string | null;
  attention_resolution?: string | null;
}): ResolvedFeedback | null {
  const resolvedAtIso =
    shift.attentionResolvedAt ?? shift.attention_resolved_at ?? null;
  const resolution = shift.attentionResolution ?? shift.attention_resolution ?? null;
  if (!resolvedAtIso || !resolution) return null;
  const age = Date.now() - new Date(resolvedAtIso).getTime();
  if (!Number.isFinite(age) || age < 0 || age > RESOLVED_FEEDBACK_WINDOW_MS) {
    return null;
  }
  switch (resolution) {
    case "acknowledged":
      return {
        tone: "ok",
        label: "Manager confirmed",
        detail: "You're still scheduled on this shift — check in as normal.",
      };
    case "withdrawn":
      return {
        tone: "info",
        label: "Flag withdrawn",
        detail: "You're back on the schedule.",
      };
    // 'reassigned' / 'released' / 'cancelled' shouldn't surface here
    // because the row leaves the rep's view in those cases. If for
    // some reason a stale row arrives, render nothing rather than a
    // confusing message.
    default:
      return null;
  }
}

// ─── Attention: "I can't make this shift" rep flow ─────────────────────
//
// The rep can flag a shift they can't attend BEFORE checking in. The
// flag is an overlay column on shifts (see the 2026-05-11 migration);
// the shift's `state` stays 'scheduled' so the calendar / list still
// shows it. Manager-side resolution (reassign / release / acknowledge
// / cancel) lives in admin-side code; here we own the rep half of
// the lifecycle: raise + withdraw.
//
// Guards:
//   - Only `state='scheduled'` shifts can have attention raised.
//     Once a rep checks in, the right path is the existing
//     check-out-early flow, not this one.
//   - Only the assigned rep can raise on their own shift. The DB
//     write is permissive for any authenticated user (Phase-pre-4
//     RLS) so we enforce ownership in the SQL filter itself, which
//     is enough: a rep can only mutate a row where rep_id = their id.
//   - Idempotent: raising twice in a row is a no-op; the second call
//     is filtered out by the `attention IS NULL` guard.

export type UnableReason =
  | "sick"
  | "family"
  | "double_booked"
  | "transport"
  | "other";

/**
 * Rep flags they can't attend a scheduled shift. Updates the attention
 * overlay and logs an audit event. Returns ok+true even if the row
 * couldn't be matched (filtered out by guards) — the UI treats it
 * as a successful no-op.
 */
export async function raiseUnableToAttend(
  shiftId: string,
  reason: UnableReason,
  note: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  // Read the row once so the audit event carries customer_id and the
  // mobile UI can verify the shift was actually flipped (count check).
  const { data: before } = await supabase
    .from("shifts")
    .select("customer_id, state, attention, rep_id")
    .eq("id", shiftId)
    .maybeSingle();
  const beforeRow =
    (before as { customer_id?: string; state?: string; attention?: string | null; rep_id?: string | null } | null) ?? null;

  if (!beforeRow) return { ok: false, error: "Shift not found" };
  if (beforeRow.rep_id !== userId) return { ok: false, error: "Not your shift" };
  if (beforeRow.state !== "scheduled") {
    return { ok: false, error: "Only scheduled shifts can be flagged" };
  }
  if (beforeRow.attention) {
    // Already flagged — idempotent no-op, the UI shouldn't normally
    // get here (the "Can't make it" affordance is hidden once raised).
    return { ok: true };
  }

  const { error } = await supabase
    .from("shifts")
    .update({
      attention: "unable_to_attend",
      attention_reason: reason,
      attention_note: note?.trim() || null,
      attention_raised_at: new Date().toISOString(),
    })
    .eq("id", shiftId)
    .eq("rep_id", userId)
    .eq("state", "scheduled")
    .is("attention", null);
  if (error) return { ok: false, error: error.message };

  await logEvent({
    event_type: "shift.rep_unable_to_attend",
    shift_id: shiftId,
    ...(beforeRow.customer_id ? { customer_id: beforeRow.customer_id } : {}),
    message: `Rep flagged unable to attend (${reason})`,
    meta: { reason, hasNote: !!note?.trim() },
  });
  return { ok: true };
}

/**
 * Rep changes their mind BEFORE the manager has acted. Clears the
 * attention overlay so the shift goes back to a clean "scheduled"
 * state with the rep assigned. Once the manager has resolved
 * (attention_resolved_at is set), this is a no-op — the rep no
 * longer "owns" the shift in that sense.
 */
export async function withdrawUnableToAttend(
  shiftId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const { data: before } = await supabase
    .from("shifts")
    .select("customer_id, attention, attention_resolved_at, rep_id")
    .eq("id", shiftId)
    .maybeSingle();
  const beforeRow =
    (before as {
      customer_id?: string;
      attention?: string | null;
      attention_resolved_at?: string | null;
      rep_id?: string | null;
    } | null) ?? null;

  if (!beforeRow) return { ok: false, error: "Shift not found" };
  if (beforeRow.rep_id !== userId) return { ok: false, error: "Not your shift" };
  if (!beforeRow.attention) return { ok: true }; // already clear
  if (beforeRow.attention_resolved_at) {
    return { ok: false, error: "Already actioned by your manager" };
  }

  // Withdraw clears the flag but doesn't stamp resolved_at — the
  // "open" state simply ends. The resolution column gets stamped
  // 'withdrawn' so any UI that wants to render a follow-up status
  // can do so; we don't set resolved_at because that's reserved for
  // manager-side actions in the audit trail.
  const { error } = await supabase
    .from("shifts")
    .update({
      attention: null,
      attention_reason: null,
      attention_note: null,
      attention_raised_at: null,
      attention_resolution: "withdrawn",
    })
    .eq("id", shiftId)
    .eq("rep_id", userId)
    .is("attention_resolved_at", null);
  if (error) return { ok: false, error: error.message };

  await logEvent({
    event_type: "shift.rep_unable_withdrawn",
    shift_id: shiftId,
    ...(beforeRow.customer_id ? { customer_id: beforeRow.customer_id } : {}),
    message: "Rep withdrew the unable-to-attend flag",
  });
  return { ok: true };
}

let _shiftsChannelCounter = 0;

export function subscribeShifts(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  try {
    _shiftsChannelCounter += 1;
    const channelName = `mobile_shifts_live_${Date.now()}_${_shiftsChannelCounter}`;
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
