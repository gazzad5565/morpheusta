/**
 * /api/cron/shift-reminders — Vercel Cron-driven push reminder
 * sweep.
 *
 * Runs every 5 minutes (see vercel.json). On each tick:
 *
 *   1. "Running late" sweep
 *      Find shifts where:
 *        - shift_date = today (local-ish, see below)
 *        - state = 'scheduled' (not yet checked in)
 *        - rep_id IS NOT NULL
 *        - is_flexible_time = false
 *        - start_time has passed by ≥ late_grace_minutes
 *        - No `shift.reminder_late_sent` event exists for the shift
 *      Action: send "Running late?" push to rep, log
 *      `shift.reminder_late_sent` event (idempotency marker).
 *
 *   2. "EOD checkout reminder" sweep
 *      Find shifts where:
 *        - state IN ('in-progress', 'on-break')
 *        - end_time has passed by ≥ EOD_BUFFER_MINUTES
 *        - is_flexible_time = false (flex shifts have no real end)
 *        - No `shift.reminder_eod_sent` event exists for the shift
 *      Action: send "Don't forget to check out" push to rep, log
 *      `shift.reminder_eod_sent` event.
 *
 * Idempotency comes from the shift_events markers — if the cron
 * runs twice in the same window we won't double-send because the
 * second sweep filters out shifts that already have the reminder
 * event.
 *
 * Auth: Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>`
 * header. We reject anything else with 401 so this endpoint can't
 * be hit publicly.
 *
 * Best-effort: any failure is logged and the next push is still
 * attempted. The endpoint returns a summary so the Vercel Cron
 * dashboard surfaces the volume per tick.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildEODCheckoutPayload,
  buildRunningLatePayload,
  sendPushToRep,
  type ShiftLike,
} from "@/lib/push-send";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

/** How many minutes past `end_time` we wait before nudging the rep
 *  to check out. 30 is the sweet spot: long enough that "rep is
 *  finishing up" doesn't generate a false positive, short enough
 *  that the reminder lands while it's still actionable. */
const EOD_BUFFER_MINUTES = 30;

/** Fallback when the `late_grace_minutes` app-setting hasn't been
 *  configured yet. Mirrors the constant on /lib/settings-store. */
const DEFAULT_LATE_GRACE_MINUTES = 10;

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function todayISO(): string {
  // We use UTC date because the DB stores shift_date as a plain
  // date string and the rep's clock is what the cron should match.
  // The +/- 1 day fringe (when running across midnight in a
  // different TZ) is covered by the "yesterday or today" filter
  // below — we look at both dates to absorb that ambiguity.
  return new Date().toISOString().slice(0, 10);
}
function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Build a millisecond timestamp from `shift_date` + `HH:MM:SS`
 *  treating both as local-equivalents (no TZ shift). This is the
 *  same approach used elsewhere in the app for "did this start time
 *  pass?" comparisons. */
function shiftTimestampMs(shiftDate: string, hhmmss: string): number {
  // shift_date is "YYYY-MM-DD", hhmmss is "HH:MM:SS"
  const iso = `${shiftDate}T${hhmmss}`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

interface ReminderShiftRow {
  id: string;
  rep_id: string | null;
  customer_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  is_flexible_time: boolean | null;
  state: string;
}

interface SweepResult {
  type: "running-late" | "eod-checkout";
  shiftsConsidered: number;
  pushesAttempted: number;
  pushesDelivered: number;
  pushesPruned: number;
  pushesErrors: number;
}

async function runningLateSweep(): Promise<SweepResult> {
  const result: SweepResult = {
    type: "running-late",
    shiftsConsidered: 0,
    pushesAttempted: 0,
    pushesDelivered: 0,
    pushesPruned: 0,
    pushesErrors: 0,
  };
  const sb = adminClient();

  // Read the org's grace period.
  const { data: gracePref } = await sb
    .from("app_settings")
    .select("value")
    .eq("key", "late_grace_minutes")
    .maybeSingle();
  const graceMinutes =
    typeof (gracePref as { value?: number } | null)?.value === "number"
      ? (gracePref as { value: number }).value
      : DEFAULT_LATE_GRACE_MINUTES;

  // Pull scheduled shifts from today + yesterday (TZ fringe safety).
  // Filter to ones with a rep + a concrete start time.
  const { data: shifts, error } = await sb
    .from("shifts")
    .select("id, rep_id, customer_id, shift_date, start_time, end_time, is_flexible_time, state")
    .in("shift_date", [todayISO(), yesterdayISO()])
    .eq("state", "scheduled")
    .not("rep_id", "is", null)
    .neq("is_flexible_time", true);
  if (error) {
    console.warn("[cron/reminders] running-late: shifts query failed", error);
    return result;
  }
  if (!shifts || shifts.length === 0) return result;

  const now = Date.now();
  const due = (shifts as ReminderShiftRow[]).filter((s) => {
    if (!s.start_time) return false;
    const startMs = shiftTimestampMs(s.shift_date, s.start_time);
    if (!Number.isFinite(startMs)) return false;
    return startMs + graceMinutes * 60_000 < now;
  });
  result.shiftsConsidered = due.length;
  if (due.length === 0) return result;

  // De-dupe: anything that already has a `shift.reminder_late_sent`
  // event on file gets filtered out. One round-trip for all candidate IDs.
  const dueIds = due.map((s) => s.id);
  const { data: priorEvents } = await sb
    .from("shift_events")
    .select("shift_id")
    .eq("event_type", "shift.reminder_late_sent")
    .in("shift_id", dueIds);
  const alreadySent = new Set(
    ((priorEvents as { shift_id: string }[]) || []).map((e) => e.shift_id)
  );
  const toFire = due.filter((s) => !alreadySent.has(s.id));
  if (toFire.length === 0) return result;

  // Hydrate customer names in one batch.
  const customerIds = Array.from(
    new Set(toFire.map((s) => s.customer_id).filter((c): c is string => !!c))
  );
  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await sb
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    for (const c of (customers as { id: string; name: string }[]) || []) {
      customerNameById.set(c.id, c.name);
    }
  }

  // Fire pushes + log idempotency events in parallel.
  await Promise.all(
    toFire.map(async (s) => {
      if (!s.rep_id) return;
      const shiftForPayload: ShiftLike = {
        id: s.id,
        customer_name: s.customer_id ? customerNameById.get(s.customer_id) ?? null : null,
        shift_date: s.shift_date,
        start_time: s.start_time,
        end_time: s.end_time,
        is_flexible_time: s.is_flexible_time,
      };
      const payload = buildRunningLatePayload(shiftForPayload);
      const send = await sendPushToRep(s.rep_id, payload);
      result.pushesAttempted += send.attempted;
      result.pushesDelivered += send.delivered;
      result.pushesPruned += send.pruned;
      result.pushesErrors += send.errors;
      // Log the marker AFTER the send so a network blip during the
      // push doesn't lock the shift out of a retry. If the marker
      // insert fails the next cron tick will re-send — annoying but
      // not destructive.
      await sb.from("shift_events").insert({
        event_type: "shift.reminder_late_sent",
        shift_id: s.id,
        customer_id: s.customer_id,
        rep_id: s.rep_id,
        message: `Auto-reminder sent (rep was ${Math.round((now - shiftTimestampMs(s.shift_date, s.start_time)) / 60_000)} min late)`,
        meta: { delivered: send.delivered, attempted: send.attempted },
      });
    })
  );
  return result;
}

async function eodCheckoutSweep(): Promise<SweepResult> {
  const result: SweepResult = {
    type: "eod-checkout",
    shiftsConsidered: 0,
    pushesAttempted: 0,
    pushesDelivered: 0,
    pushesPruned: 0,
    pushesErrors: 0,
  };
  const sb = adminClient();

  // Pull live shifts (in-progress + on-break) from today/yesterday.
  // Flex-time shifts are skipped — they have no concrete end_time
  // to compare against.
  const { data: shifts, error } = await sb
    .from("shifts")
    .select("id, rep_id, customer_id, shift_date, start_time, end_time, is_flexible_time, state")
    .in("shift_date", [todayISO(), yesterdayISO()])
    .in("state", ["in-progress", "on-break"])
    .neq("is_flexible_time", true);
  if (error) {
    console.warn("[cron/reminders] eod-checkout: shifts query failed", error);
    return result;
  }
  if (!shifts || shifts.length === 0) return result;

  const now = Date.now();
  const due = (shifts as ReminderShiftRow[]).filter((s) => {
    if (!s.end_time) return false;
    const endMs = shiftTimestampMs(s.shift_date, s.end_time);
    if (!Number.isFinite(endMs)) return false;
    return endMs + EOD_BUFFER_MINUTES * 60_000 < now;
  });
  result.shiftsConsidered = due.length;
  if (due.length === 0) return result;

  const dueIds = due.map((s) => s.id);
  const { data: priorEvents } = await sb
    .from("shift_events")
    .select("shift_id")
    .eq("event_type", "shift.reminder_eod_sent")
    .in("shift_id", dueIds);
  const alreadySent = new Set(
    ((priorEvents as { shift_id: string }[]) || []).map((e) => e.shift_id)
  );
  const toFire = due.filter((s) => !alreadySent.has(s.id));
  if (toFire.length === 0) return result;

  const customerIds = Array.from(
    new Set(toFire.map((s) => s.customer_id).filter((c): c is string => !!c))
  );
  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await sb
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    for (const c of (customers as { id: string; name: string }[]) || []) {
      customerNameById.set(c.id, c.name);
    }
  }

  await Promise.all(
    toFire.map(async (s) => {
      if (!s.rep_id) return;
      const shiftForPayload: ShiftLike = {
        id: s.id,
        customer_name: s.customer_id ? customerNameById.get(s.customer_id) ?? null : null,
        shift_date: s.shift_date,
        start_time: s.start_time,
        end_time: s.end_time,
        is_flexible_time: s.is_flexible_time,
      };
      const payload = buildEODCheckoutPayload(shiftForPayload);
      const send = await sendPushToRep(s.rep_id, payload);
      result.pushesAttempted += send.attempted;
      result.pushesDelivered += send.delivered;
      result.pushesPruned += send.pruned;
      result.pushesErrors += send.errors;
      await sb.from("shift_events").insert({
        event_type: "shift.reminder_eod_sent",
        shift_id: s.id,
        customer_id: s.customer_id,
        rep_id: s.rep_id,
        message: `Check-out reminder sent (${Math.round((now - shiftTimestampMs(s.shift_date, s.end_time)) / 60_000)} min past end)`,
        meta: { delivered: send.delivered, attempted: send.attempted },
      });
    })
  );
  return result;
}

export async function GET(req: NextRequest) {
  // Vercel Cron sets the Authorization header with the CRON_SECRET
  // env var. Reject anything else so the endpoint can't be hit by
  // outsiders.
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Server is missing CRON_SECRET" },
      { status: 500 }
    );
  }
  if (token !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  const [late, eod] = await Promise.all([runningLateSweep(), eodCheckoutSweep()]);
  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: true,
    elapsedMs,
    sweeps: [late, eod],
  });
}
