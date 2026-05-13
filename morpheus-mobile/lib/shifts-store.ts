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
import { notifyManagersOfAttention } from "./push-notify-managers";
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
  /** When the rep checked out (or the auto-checkout sweep ran).
   *  Set alongside `state='complete'`. Used by /day for hours-worked
   *  aggregation. */
  check_out_at: string | null;
  tasks_done: number;
  tasks_total: number;
  /** Freeform rep-supplied note for this shift. See the 2026-05-11
   *  shifts_notes migration. Edited from /active; shown read-only
   *  on the admin shift detail page. */
  rep_notes: string | null;
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
  /** Claim-radius geofence in metres. Only meaningful when rep_id IS
   *  NULL (the shift is claimable). NULL = no restriction. Set by
   *  the admin /schedule/new form; filtered client-side in
   *  listUnassignedShiftsToday so reps outside the radius don't see
   *  shifts they can't realistically attend. See
   *  2026_05_12_shifts_claim_radius.sql. */
  claim_radius_m: number | null;
  /** Flexible-time flag — when true the shift has no specific start /
   *  end, just a workday window. UI displays "Anytime today" instead
   *  of the time range and late / early exceptions are skipped.
   *  See 2026_05_12_shifts_flexible_time.sql. */
  is_flexible_time?: boolean;
  customers: {
    id: string;
    name: string;
    initials: string;
    color: string;
    code: number;
    /** Base64 data URL of the customer logo, set from admin. The
     *  rep-side avatar tile shows this in place of the coloured
     *  initials when populated. Added by 2026_05_11_customers_logo. */
    logo_url?: string | null;
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
    /** Wall-clock ISO at which the shift entered terminal state
     *  (`complete`). Populated alongside state by checkOutOfShift +
     *  the auto-checkout sweep. /day uses this to compute hours-
     *  worked aggregates. Null for any state other than complete. */
    checkOutAt: string | null;
    state: string;
    /** Raw HH:MM[:SS] from the DB so the rep app can compute relative
     *  countdowns ("in 50 min" / "10 min late") without re-parsing
     *  the human-formatted display strings. */
    rawStartTime: string;
    rawEndTime: string;
    shiftDate: string;
    /** Freeform rep-supplied note tied to this shift. */
    repNotes: string | null;
    /** Flexible-time flag — true when the manager picked "Anytime
     *  today" instead of a specific start/end. UI displays
     *  "Anytime today" in place of the time range and countdown /
     *  late-by logic skips the comparison entirely. */
    isFlexibleTime: boolean;
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
    logoUrl: c?.logo_url ?? null,
    start: formatTimeLabel(row.start_time),
    end: formatTimeLabel(row.end_time),
    distance: row.distance_label || "",
    // Internal — for claim/check-in/timer + state badge
    realId: row.id,
    repId: row.rep_id,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    state: row.state,
    rawStartTime: row.start_time || "",
    rawEndTime: row.end_time || "",
    shiftDate: row.shift_date || "",
    isFlexibleTime: row.is_flexible_time === true,
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
    repNotes: row.rep_notes ?? null,
  };
}

/**
 * Save a rep-supplied note onto a shift. The rep can edit notes
 * during a shift (and after, until the shift is locked by a
 * manager-side state machine) — admin sees them read-only on
 * /shifts/[id]. Empty/whitespace-only strings clear the note.
 */
export async function saveShiftNotes(
  shiftId: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const trimmed = notes.trim();
  // Read-back via .select().single() rather than fire-and-forget.
  // Two failure modes this catches:
  //   1. The `rep_notes` column doesn't exist yet — Supabase returns
  //      a "column does not exist" error that we can show the rep
  //      instead of a silent OK. Migration `2026_05_11_shifts_notes.sql`
  //      adds the column.
  //   2. RLS / .eq("rep_id", userId) matched zero rows — UPDATE
  //      succeeds with rowsAffected=0 (no error). Without the
  //      .select().single() we'd report "Saved ✓" even though
  //      nothing landed. .single() turns the empty result into a
  //      hard error so we surface it.
  const { data, error } = await supabase
    .from("shifts")
    .update({ rep_notes: trimmed || null })
    .eq("id", shiftId)
    .eq("rep_id", userId)
    .select("id, rep_notes")
    .single();
  if (error) {
    // Friendlier message when the underlying issue is a missing
    // column — managers without admin SQL access were getting raw
    // PostgREST strings and not knowing what to do with them.
    const m = error.message || "";
    if (/column .*rep_notes.* does not exist/i.test(m)) {
      return {
        ok: false,
        error:
          "Notes column not set up yet — ask your admin to run the latest DB migration (shifts.rep_notes).",
      };
    }
    return { ok: false, error: m };
  }
  if (!data) {
    return {
      ok: false,
      error: "Couldn't save — this shift may have been reassigned.",
    };
  }
  return { ok: true };
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
    .select("*, customers(id,name,initials,color,code,logo_url), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
    .select("*, customers(id,name,initials,color,code,logo_url), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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

/** Unassigned shifts today — anyone authenticated can see + claim.
 *
 * Claim-radius filter: when a shift has `claim_radius_m` set, the
 * admin wanted to scope the claim list to reps physically near the
 * site. We honour that by computing the haversine distance between
 * the rep's GPS (if available) and the site's coords, dropping
 * shifts where the rep is further away than the radius.
 *
 * Lenient mode: if we don't HAVE a GPS fix for the rep (denied,
 * unavailable, browser doesn't support, timed out) we keep the
 * shift visible. The reasoning: a rep with denied location is
 * already at a disadvantage; further hiding shifts from them would
 * compound the problem. Managers who really want strict gating can
 * set a smaller radius — but they should expect denied-GPS reps to
 * still see those shifts.
 */
export async function listUnassignedShiftsToday(): Promise<
  Array<ShiftWithMeta>
> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("shifts")
    // claim_radius_m comes back as part of "*", no schema change to
    // the .select() string required.
    .select("*, customers(id,name,initials,color,code,logo_url), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
  const rows = (data as ShiftRow[]) || [];

  // Fast path: no row has a claim radius set → skip the GPS call
  // entirely (avoids triggering the permission prompt for nothing).
  const anyRadiusSet = rows.some(
    (r) => typeof r.claim_radius_m === "number" && r.claim_radius_m > 0
  );
  if (!anyRadiusSet) {
    return rows.map(rowToShift);
  }

  // Get the rep's GPS once. Uses the shared permission-aware helper
  // so this call is silent when permission is granted, returns null
  // when denied (no prompt loop).
  const { requestGeolocationOnce } = await import("./route-planner");
  const repPos = await requestGeolocationOnce();

  if (!repPos) {
    // Lenient: no GPS → show all claimable shifts. See doc above.
    return rows.map(rowToShift);
  }

  // Haversine distance in metres.
  const haversineM = (
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ): number => {
    const R = 6_371_000;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  const filtered = rows.filter((r) => {
    const radius = r.claim_radius_m ?? 0;
    if (!radius || radius <= 0) return true; // no restriction
    const lat = r.site?.latitude ?? null;
    const lng = r.site?.longitude ?? null;
    if (typeof lat !== "number" || typeof lng !== "number") {
      // Radius set but site has no coords on file. Show the shift —
      // failing closed would silently hide it forever and there's
      // no way for the rep to know why.
      return true;
    }
    const distance = haversineM(repPos, { lat, lng });
    return distance <= radius;
  });

  return filtered.map(rowToShift);
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
    .select("*, customers(id,name,initials,color,code,logo_url), site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)")
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
  /** Feature C — photos on tasks. */
  photo_count?: number;
  photos_compulsory?: boolean;
}

export async function getTasksForCustomer(customerId: string): Promise<TaskRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  // Match this customer's specific tasks AND any universal (NULL) tasks
  // that apply to all customers.
  const { data, error } = await supabase
    .from("customer_tasks")
    .select(
      "id, name, description, duration_min, compulsory, sort_order, photo_count, photos_compulsory"
    )
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
//   - State must be one of `scheduled` / `travelling` / `late` —
//     all pre-check-in states. Once a rep checks in (in-progress,
//     on-break) the right path is the existing check-out-early flow.
//     Travelling and Late are allowed because a rep can decide
//     mid-route they can't make it.
//   - Only the assigned rep can raise on their own shift. The DB
//     write is permissive for any authenticated user (Phase-pre-4
//     RLS) so we enforce ownership in the SQL filter itself, which
//     is enough: a rep can only mutate a row where rep_id = their id.
//   - Idempotent: raising twice in a row is a no-op; the second call
//     is filtered out by the `attention IS NULL` guard.
//   - Read-back verification: the UPDATE returns the row via .select()
//     so we can confirm the change actually persisted. Silent no-ops
//     (filter mismatch, RLS rejection, etc) get surfaced as errors
//     instead of looking like success.

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
  // eslint-disable-next-line no-console
  console.warn("[unable] raise: start", { shiftId, reason });
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  // Read the row once so the audit event carries customer_id and the
  // mobile UI can verify the shift was actually flipped (count check).
  const { data: before, error: beforeErr } = await supabase
    .from("shifts")
    .select("customer_id, state, attention, rep_id")
    .eq("id", shiftId)
    .maybeSingle();
  if (beforeErr) {
    // eslint-disable-next-line no-console
    console.warn("[unable] raise: pre-read failed", beforeErr);
    return { ok: false, error: `Couldn't load shift: ${beforeErr.message}` };
  }
  const beforeRow =
    (before as { customer_id?: string; state?: string; attention?: string | null; rep_id?: string | null } | null) ?? null;
  // eslint-disable-next-line no-console
  console.warn("[unable] raise: pre-read", beforeRow);

  if (!beforeRow) return { ok: false, error: "Shift not found" };
  if (beforeRow.rep_id !== userId) {
    // eslint-disable-next-line no-console
    console.warn("[unable] raise: rep_id mismatch", {
      shiftRepId: beforeRow.rep_id,
      myUserId: userId,
    });
    return { ok: false, error: "Not your shift" };
  }
  // Pre-check-in states: scheduled, travelling, late. Anything after
  // check-in (in-progress, on-break) means the rep is already on the
  // job — the right path there is check-out-early, not unable-to-attend.
  // complete / cancelled are terminal so they're excluded too.
  const ALLOWED_STATES = new Set(["scheduled", "travelling", "late"]);
  if (!ALLOWED_STATES.has(beforeRow.state || "")) {
    // eslint-disable-next-line no-console
    console.warn("[unable] raise: state not allowed", beforeRow.state);
    return {
      ok: false,
      error: `Can't flag a shift in state "${beforeRow.state || "unknown"}". This action only works before you check in.`,
    };
  }
  if (beforeRow.attention) {
    // Already flagged — idempotent no-op, the UI shouldn't normally
    // get here (the "Can't make it" affordance is hidden once raised).
    // eslint-disable-next-line no-console
    console.warn("[unable] raise: already flagged, no-op", beforeRow.attention);
    return { ok: true };
  }

  // Critical: also clear attention_resolved_at / _by / _resolution.
  // If a previous round on this same shift was actioned by a manager
  // (acknowledge, etc), those columns are still populated from that
  // resolution. Without clearing them on re-raise the row ends up in
  // a half-resolved state — attention='unable_to_attend' AND
  // attention_resolved_at=<old timestamp> — which the Live Ops queue
  // (`attention_resolved_at IS NULL`) and the rep's Awaiting banner
  // both filter out. Result: nothing visibly happens on either side
  // even though the DB write succeeded.
  const { data: updated, error } = await supabase
    .from("shifts")
    .update({
      attention: "unable_to_attend",
      attention_reason: reason,
      attention_note: note?.trim() || null,
      attention_raised_at: new Date().toISOString(),
      attention_resolved_at: null,
      attention_resolved_by: null,
      attention_resolution: null,
    })
    .eq("id", shiftId)
    .eq("rep_id", userId)
    .in("state", ["scheduled", "travelling", "late"])
    .is("attention", null)
    .select("id, attention");
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[unable] raise: UPDATE failed", error);
    return { ok: false, error: error.message };
  }
  // eslint-disable-next-line no-console
  console.warn("[unable] raise: UPDATE returned", updated);
  // Read-back: if 0 rows came back, the filter matched nothing — most
  // commonly a race with another writer (state flipped, attention
  // already set). Surface it instead of returning silent success.
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't save — the shift may have changed since this screen loaded. Pull to refresh and try again.",
    };
  }

  await logEvent({
    event_type: "shift.rep_unable_to_attend",
    shift_id: shiftId,
    ...(beforeRow.customer_id ? { customer_id: beforeRow.customer_id } : {}),
    message: `Rep flagged unable to attend (${reason})`,
    meta: { reason, hasNote: !!note?.trim() },
  });

  // Fire-and-forget push to every manager in the org. The admin's
  // /api/push/notify endpoint validates the rep's JWT, confirms
  // they own the shift, and only sends if the shift actually has
  // the attention flag set (just persisted above). Push is
  // best-effort — never await, never let it surface failures here
  // (the DB write has already succeeded, which is what the rep
  // cares about).
  notifyManagersOfAttention("attention-raised", shiftId);

  // eslint-disable-next-line no-console
  console.warn("[unable] raise: success");
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
  const { data: updated, error } = await supabase
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
    .is("attention_resolved_at", null)
    .select("id, attention");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "Couldn't withdraw — your manager may already have actioned it. Pull to refresh.",
    };
  }

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
