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

/** Fallback when `eod_reminder_buffer_minutes` hasn't been
 *  configured yet. Mirrors the constant on /lib/settings-store. The
 *  cron prefers the app_settings value (manager can tune from
 *  /settings/notifications); only falls back here if the row is
 *  missing or unparseable. 30 is the sweet spot: long enough that
 *  "rep is finishing up" doesn't generate a false positive, short
 *  enough that the reminder lands while it's still actionable. */
const DEFAULT_EOD_BUFFER_MINUTES = 30;

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

  // Write the idempotency marker FIRST, then push only if the marker
  // landed. Inverted from the original "push, then mark" order
  // (May 14, Gary's report): a rep was getting a "running late"
  // push every 5 minutes because the marker insert was failing
  // silently — the code awaited the insert but never checked the
  // returned error, so a transient DB error or any other glitch
  // left no marker and the next cron tick re-fired the push.
  //
  // Pushing AFTER a confirmed marker means:
  //  - If the marker insert fails we log loudly + skip the push,
  //    so the rep gets zero spam (we'll catch up on the next tick
  //    once the DB is happy).
  //  - If the push itself fails after the marker landed, we miss
  //    that one notification. Acceptable trade — the alternative
  //    is re-spamming the rep every 5 min until something works.
  await Promise.all(
    toFire.map(async (s) => {
      if (!s.rep_id) return;
      const lateMin = Math.round(
        (now - shiftTimestampMs(s.shift_date, s.start_time)) / 60_000
      );
      const { error: markerErr } = await sb.from("shift_events").insert({
        event_type: "shift.reminder_late_sent",
        shift_id: s.id,
        customer_id: s.customer_id,
        rep_id: s.rep_id,
        message: `Auto-reminder sent (rep was ${lateMin} min late)`,
        meta: { phase: "marker_only" },
      });
      if (markerErr) {
        // Don't push if we couldn't record the marker — better to
        // miss one notification than to keep re-firing on every
        // tick. Loud-log so the issue surfaces in Vercel logs.
        console.warn(
          "[cron/reminders] running-late: marker insert failed; skipping push",
          { shiftId: s.id, error: markerErr.message }
        );
        return;
      }
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

  // Read the org's EOD reminder buffer (configurable from
  // /settings/notifications). Same fallback pattern as the running-
  // late sweep above.
  const { data: bufferPref } = await sb
    .from("app_settings")
    .select("value")
    .eq("key", "eod_reminder_buffer_minutes")
    .maybeSingle();
  const bufferMinutes =
    typeof (bufferPref as { value?: number } | null)?.value === "number"
      ? (bufferPref as { value: number }).value
      : DEFAULT_EOD_BUFFER_MINUTES;

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
    return endMs + bufferMinutes * 60_000 < now;
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

  // Same marker-first pattern as the running-late sweep (May 14):
  // write the idempotency marker BEFORE the push so a marker-insert
  // failure can't leave us re-firing the push every 5 min.
  await Promise.all(
    toFire.map(async (s) => {
      if (!s.rep_id) return;
      const pastEndMin = Math.round(
        (now - shiftTimestampMs(s.shift_date, s.end_time)) / 60_000
      );
      const { error: markerErr } = await sb.from("shift_events").insert({
        event_type: "shift.reminder_eod_sent",
        shift_id: s.id,
        customer_id: s.customer_id,
        rep_id: s.rep_id,
        message: `Check-out reminder sent (${pastEndMin} min past end)`,
        meta: { phase: "marker_only" },
      });
      if (markerErr) {
        console.warn(
          "[cron/reminders] eod-checkout: marker insert failed; skipping push",
          { shiftId: s.id, error: markerErr.message }
        );
        return;
      }
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
