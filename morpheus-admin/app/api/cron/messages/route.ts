/**
 * Cron sweep — dispatch scheduled messages whose scheduled_at has
 * arrived (Feature E, May 13).
 *
 * Picks up rows from `messages` where:
 *   - status = 'pending'
 *   - scheduled_at IS NOT NULL  AND  scheduled_at <= now()
 *
 * For each, hits the internal /api/messages/send route which handles
 * the advisory-lock + fan-out. Same path as the admin "Send now"
 * button, so the lifecycle bookkeeping (status, sent_at, meta) is
 * identical regardless of whether the message went immediately or
 * was scheduled.
 *
 * Cron cadence: should run minute-tick on Vercel Pro. Without Pro,
 * fall back to a manual /api/cron/messages?force=1 ping from the
 * admin (or wait for Pro to be active — see vercel.json).
 *
 * Auth: CRON_SECRET bearer-token. Same mechanism used by the
 * shift-reminders + auto-checkout crons.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Always re-evaluate cron requests at run time; never cache the
// result (Next.js would otherwise serve a stale 200 to repeat calls).
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
// Self-call URL — defaults to the host the request came in on, but
// allows an override in case Vercel cron pings from a different
// hostname than the public one.
const SELF_BASE_URL =
  process.env.ADMIN_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";

function unauthorised() {
  return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
}

function authedFromHeader(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    // Without a CRON_SECRET set, refuse — protects against
    // unauthenticated callers triggering paid push fan-out.
    return false;
  }
  const header = req.headers.get("authorization") || "";
  const expected = `Bearer ${CRON_SECRET}`;
  return header === expected;
}

export async function GET(req: NextRequest) {
  if (!authedFromHeader(req)) return unauthorised();

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find due messages. Cap at 50 per tick — a healthy install
  // should never have more pending than this in one minute, but
  // the cap prevents runaway loops on a backlog.
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("messages")
    .select("id, scheduled_at")
    .eq("status", "pending")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(50);
  if (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  const due = (data as { id: string }[]) || [];
  if (due.length === 0) {
    return Response.json({ ok: true, dispatched: 0 });
  }

  // Dispatch each by calling the internal send route. We pass the
  // CRON_SECRET on the way through so the send route can identify
  // this as an authenticated server-side call if we ever need to
  // distinguish (e.g. for metering, error attribution).
  const origin = SELF_BASE_URL || new URL(req.url).origin;
  let dispatched = 0;
  let errored = 0;
  await Promise.all(
    due.map(async (m) => {
      try {
        const res = await fetch(`${origin}/api/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // The send route doesn't currently require auth (it's
            // same-origin from the admin). For belt-and-braces we
            // pass the bearer along anyway — easy to gate later.
            Authorization: `Bearer ${CRON_SECRET}`,
          },
          body: JSON.stringify({ messageId: m.id }),
        });
        if (res.ok) dispatched++;
        else errored++;
      } catch {
        errored++;
      }
    })
  );

  return Response.json({
    ok: true,
    found: due.length,
    dispatched,
    errored,
  });
}
