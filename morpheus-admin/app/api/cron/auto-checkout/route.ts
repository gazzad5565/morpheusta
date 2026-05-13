/**
 * /api/cron/auto-checkout — Vercel Cron-driven safety-net sweep.
 *
 * Force-completes any active-state shift past the configured
 * cutoff time and cleans up orphan rep_locations rows. Runs every
 * 15 minutes from Vercel Cron (see vercel.json).
 *
 * Why this exists on top of the client-side sweepStaleShifts() in
 * lib/shifts-store.ts: the client version only fires when a
 * manager has the admin Live Ops page open. On weekends / public
 * holidays / overnight when nobody's logged in, stale shifts and
 * orphaned rep dots accumulate. This server-side cron closes the
 * gap — runs hands-off regardless of whether anyone's at a desk.
 *
 * Logic mirror of sweepStaleShifts() but using the service-role
 * Supabase client because there's no user session in the cron
 * context. Two passes:
 *
 *   1. Active-state shifts past cutoff → state='complete'.
 *      Active = state in ('in-progress','travelling','on-break','late').
 *      Cutoff:
 *        - shift_date < today                              → always stale
 *        - shift_date == today AND now >= auto_checkout    → stale
 *      Stamps check_out_at, logs shift.auto_checked_out per shift.
 *
 *   2. Orphan rep_locations cleanup. Any rep_locations row whose
 *      rep_id has NO currently-active shift gets deleted.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Same gate as /api/cron/shift-reminders so configuring once
 * covers all cron routes.
 *
 * Independent of push notifications. The `push_notifications_enabled`
 * org kill switch does NOT silence this — auto-checkout is the
 * safety net that closes a forgotten shift no matter what.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

/** Default auto-checkout cutoff when the `auto_checkout_time` row
 *  is missing or malformed. Mirrors DEFAULT_AUTO_CHECKOUT_TIME in
 *  lib/settings-store.ts. */
const DEFAULT_AUTO_CHECKOUT_TIME = "23:59";

const ACTIVE_SHIFT_STATES = ["in-progress", "travelling", "on-break", "late"];

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Local-date string "YYYY-MM-DD" matching the rep's clock. Cron
 *  runs in UTC; we don't try to TZ-shift here because the client-
 *  side sweep uses the browser's local date too and we want the
 *  two sweeps to agree on what "today" means. The default cutoff
 *  of 23:59 means the cron's UTC-rounded "today" effectively
 *  covers anything that's still active when this fires. */
function todayLocalISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

interface ShiftRow {
  id: string;
  rep_id: string | null;
  shift_date: string;
  customer_id: string;
  customers: { name?: string } | null;
}

interface SweepResult {
  cutoffTime: string;
  totalActiveShifts: number;
  staleShifts: number;
  shiftsCompleted: number;
  orphanLocationsDeleted: number;
  elapsedMs: number;
}

export async function GET(req: NextRequest) {
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
  const sb = adminClient();

  // ── Read the cutoff time setting ─────────────────────────────────
  const { data: cutoffPref } = await sb
    .from("app_settings")
    .select("value")
    .eq("key", "auto_checkout_time")
    .maybeSingle();
  const rawCutoff =
    typeof (cutoffPref as { value?: string } | null)?.value === "string"
      ? (cutoffPref as { value: string }).value
      : DEFAULT_AUTO_CHECKOUT_TIME;
  const cutoffTime = isValidHHMM(rawCutoff) ? rawCutoff : DEFAULT_AUTO_CHECKOUT_TIME;

  const today = todayLocalISO();
  const now = new Date();
  const [ch, cm] = cutoffTime.split(":").map((n) => parseInt(n, 10));
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

  // ── Pass 1: stale active shifts ──────────────────────────────────
  const { data, error } = await sb
    .from("shifts")
    .select("id, rep_id, shift_date, customer_id, customers(name)")
    .in("state", ACTIVE_SHIFT_STATES);
  if (error) {
    console.warn("[cron/auto-checkout] active shifts query failed", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  const rows = (data as unknown as ShiftRow[]) || [];
  const stale = rows.filter((r) => {
    if (r.shift_date < today) return true;
    if (r.shift_date === today && todayPastCutoff) return true;
    return false;
  });

  let shiftsCompleted = 0;
  if (stale.length > 0) {
    const ids = stale.map((s) => s.id);
    const { error: updErr } = await sb
      .from("shifts")
      .update({
        state: "complete",
        check_out_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (updErr) {
      console.warn("[cron/auto-checkout] sweep update failed", updErr);
      // Don't return here — we still want to log the audit events for
      // any rows that DID succeed, and try the orphan cleanup. The
      // partial-failure surface is exposed via the result counters.
    } else {
      shiftsCompleted = stale.length;
    }

    // Audit trail per shift — shift.auto_checked_out distinguishes
    // these from real rep check-outs. Per-row insert mirrors the
    // client-side sweep so the events table looks identical
    // regardless of which sweep ran.
    for (const s of stale) {
      const customerName = s.customers?.name || "a customer";
      await sb.from("shift_events").insert({
        event_type: "shift.auto_checked_out",
        shift_id: s.id,
        customer_id: s.customer_id,
        rep_id: s.rep_id,
        message: `Auto checked-out of ${customerName} (past ${cutoffTime})`,
        meta: { cutoff: cutoffTime, shift_date: s.shift_date, source: "cron" },
      });
    }
  }

  // ── Pass 2: orphan rep_locations cleanup ────────────────────────
  // Re-query after pass 1 so the active-rep set reflects any
  // auto-completes we just did.
  const { data: stillActive } = await sb
    .from("shifts")
    .select("rep_id")
    .in("state", ACTIVE_SHIFT_STATES);
  const activeRepIds = new Set(
    ((stillActive as { rep_id: string | null }[]) || [])
      .map((r) => r.rep_id)
      .filter((id): id is string => !!id)
  );

  const { data: locRows } = await sb.from("rep_locations").select("rep_id");
  const orphanRepIds = ((locRows as { rep_id: string }[]) || [])
    .map((r) => r.rep_id)
    .filter((id) => !activeRepIds.has(id));

  let orphanLocationsDeleted = 0;
  if (orphanRepIds.length > 0) {
    const { data: deleted, error: delErr } = await sb
      .from("rep_locations")
      .delete()
      .in("rep_id", orphanRepIds)
      .select("rep_id");
    if (delErr) {
      console.warn("[cron/auto-checkout] orphan delete failed", delErr);
    } else {
      orphanLocationsDeleted = deleted?.length ?? 0;
    }
  }

  const result: SweepResult = {
    cutoffTime,
    totalActiveShifts: rows.length,
    staleShifts: stale.length,
    shiftsCompleted,
    orphanLocationsDeleted,
    elapsedMs: Date.now() - startedAt,
  };
  return NextResponse.json({ ok: true, result });
}
