/**
 * /api/push/notify — server endpoint for push delivery.
 *
 *   POST /api/push/notify { event, shiftId, ?previousRepId }
 *
 * Event types:
 *   Manager-initiated (auth: manager JWT, called from admin app):
 *     - "shift-assigned"   — new shift with a rep_id set
 *     - "shift-reassigned" — existing shift's rep_id changed
 *                            (push goes to the NEW rep)
 *     - "shift-cancelled"  — shift went to state='cancelled' (or
 *                            equivalent attention_resolution)
 *   Rep-initiated (auth: rep JWT, called cross-origin from mobile):
 *     - "attention-raised" — rep flagged an unable-to-attend. Push
 *                            broadcasts to every manager in the org.
 *
 * Why a single endpoint with an event discriminator: the wording,
 * the payload, and which-recipients-to-target are all server-
 * decided. The client only says "this happened to this shift" —
 * no risk of arbitrary push content being sent to anyone.
 *
 * CORS: mobile and admin live on separate Vercel projects (separate
 * origins), so this endpoint exposes CORS to allow the mobile app
 * to call it for rep-initiated events. The Access-Control-Allow-
 * Origin is restricted to the mobile origin (NEXT_PUBLIC_MOBILE_URL
 * or hardcoded fallback) so random sites can't trigger pushes.
 *
 * Service-role used internally to read shift + customer +
 * push_subscriptions rows. Callers never get to choose recipients.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAttentionRaisedPayload,
  buildShiftAssignedPayload,
  buildShiftCancelledPayload,
  buildShiftReassignedPayload,
  sendPushToManagers,
  sendPushToRep,
  type ShiftLike,
} from "@/lib/push-send";

// Fallback updated May 14 — the previous "https://morpheusta.vercel.app"
// fallback was both a non-existent deployment (taps to it 404'd
// with DEPLOYMENT_NOT_FOUND) AND meant CORS pre-flights from the
// real mobile origin would fail when the env var wasn't set. Real
// prod URL is `*-khaki-omega.vercel.app`. Keep in sync if host
// changes; better still, set NEXT_PUBLIC_MOBILE_URL on Vercel.
const MOBILE_ORIGIN =
  process.env.NEXT_PUBLIC_MOBILE_URL ||
  "https://morpheusta-khaki-omega.vercel.app";

function corsHeaders(origin: string | null): Record<string, string> {
  // Echo the mobile origin only — anything else gets no CORS
  // headers, which fails the browser's CORS check and stops the
  // request. Localhost dev origins are allowed via NEXT_PUBLIC_
  // MOBILE_URL when running locally.
  const allow =
    origin === MOBILE_ORIGIN ||
    (origin && origin.startsWith("http://localhost"))
      ? origin
      : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Authenticate the caller's bearer token and return their user_id
 *  + role. No role gate — the caller decides per-event whether to
 *  accept reps, managers, or both. */
async function authCaller(
  req: NextRequest
): Promise<
  | { ok: true; userId: string; role: string | null }
  | { ok: false; res: NextResponse }
> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500, headers: corsHeaders(req.headers.get("origin")) }
      ),
    };
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401, headers: corsHeaders(req.headers.get("origin")) }
      ),
    };
  }
  const callerSb = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await callerSb.auth.getUser(token);
  if (userErr || !userData.user) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401, headers: corsHeaders(req.headers.get("origin")) }
      ),
    };
  }
  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  return {
    ok: true,
    userId: userData.user.id,
    role: (profile as { role?: string } | null)?.role ?? null,
  };
}

type NotifyEvent =
  | "shift-assigned"
  | "shift-reassigned"
  | "shift-cancelled"
  | "attention-raised";

const MANAGER_EVENTS: NotifyEvent[] = [
  "shift-assigned",
  "shift-reassigned",
  "shift-cancelled",
];
const REP_EVENTS: NotifyEvent[] = ["attention-raised"];

interface NotifyBody {
  event: NotifyEvent;
  shiftId: string;
  /** For "shift-reassigned": optional. If present, no notification is
   *  sent to the previous rep (we don't currently tell them they
   *  lost the shift; that'd be follow-up scope). */
  previousRepId?: string | null;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  const gate = await authCaller(req);
  if (!gate.ok) return gate.res;

  let body: NotifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: cors }
    );
  }
  const { event, shiftId } = body;
  if (!event || !shiftId) {
    return NextResponse.json(
      { ok: false, error: "event and shiftId are required" },
      { status: 400, headers: cors }
    );
  }

  // Per-event role gate. Manager events require role=manager; rep
  // events require role=rep AND ownership of the shift (checked
  // below after we load the row).
  if (MANAGER_EVENTS.includes(event) && gate.role !== "manager") {
    return NextResponse.json(
      { ok: false, error: "Manager role required for this event" },
      { status: 403, headers: cors }
    );
  }
  if (REP_EVENTS.includes(event) && gate.role !== "rep" && gate.role !== "manager") {
    return NextResponse.json(
      { ok: false, error: "Rep role required for this event" },
      { status: 403, headers: cors }
    );
  }

  const sb = adminClient();

  // Pull the shift + a few customer fields needed for the payload
  // copy. We avoid joining the customer table directly because the
  // shift row already carries enough denormalized info in most
  // cases — but customer_name lives on customers, so we join.
  type ShiftRow = ShiftLike & {
    rep_id: string | null;
    customer_id: string;
    attention?: string | null;
    attention_reason?: string | null;
  };

  const { data: shiftRow, error: shiftErr } = await sb
    .from("shifts")
    .select(
      "id, rep_id, customer_id, shift_date, start_time, end_time, is_flexible_time, attention, attention_reason"
    )
    .eq("id", shiftId)
    .maybeSingle();

  if (shiftErr || !shiftRow) {
    return NextResponse.json(
      { ok: false, error: shiftErr?.message || "Shift not found" },
      { status: 404, headers: cors }
    );
  }
  const shift = shiftRow as ShiftRow;

  let customerName: string | null = null;
  if (shift.customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("name")
      .eq("id", shift.customer_id)
      .maybeSingle();
    customerName = (cust as { name?: string } | null)?.name ?? null;
  }

  const shiftForPayload: ShiftLike = {
    id: shift.id,
    customer_name: customerName,
    shift_date: shift.shift_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    is_flexible_time: shift.is_flexible_time,
  };

  // ── Manager-targeted events ─────────────────────────────────────
  if (event === "attention-raised") {
    // Rep-initiated: caller must be the rep assigned to this shift.
    if (shift.rep_id && shift.rep_id !== gate.userId && gate.role !== "manager") {
      return NextResponse.json(
        { ok: false, error: "You can only raise attention on your own shifts" },
        { status: 403, headers: cors }
      );
    }
    // Sanity: only fire if the shift actually has an unable_to_attend
    // flag set — prevents a malicious rep from spamming managers with
    // arbitrary "attention raised" pushes for shifts that aren't
    // actually flagged.
    if (shift.attention !== "unable_to_attend") {
      return NextResponse.json(
        { ok: true, skipped: "Shift not in attention state" },
        { headers: cors }
      );
    }
    // Look up the rep's display name for nicer copy.
    let repName: string | null = null;
    if (shift.rep_id) {
      const { data: prof } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", shift.rep_id)
        .maybeSingle();
      repName = (prof as { full_name?: string | null } | null)?.full_name ?? null;
    }
    const payload = buildAttentionRaisedPayload(
      shiftForPayload,
      repName,
      shift.attention_reason ?? null
    );
    const result = await sendPushToManagers(payload);
    return NextResponse.json({ ok: true, result }, { headers: cors });
  }

  // ── Rep-targeted events ─────────────────────────────────────────
  let recipientRepId: string | null = null;
  let payload;
  if (event === "shift-assigned") {
    recipientRepId = shift.rep_id;
    payload = buildShiftAssignedPayload(shiftForPayload);
  } else if (event === "shift-reassigned") {
    recipientRepId = shift.rep_id;
    payload = buildShiftReassignedPayload(shiftForPayload);
  } else if (event === "shift-cancelled") {
    recipientRepId = shift.rep_id || body.previousRepId || null;
    payload = buildShiftCancelledPayload(shiftForPayload);
  } else {
    return NextResponse.json(
      { ok: false, error: "Unknown event" },
      { status: 400, headers: cors }
    );
  }

  if (!recipientRepId) {
    return NextResponse.json({ ok: true, skipped: "No rep to notify" }, { headers: cors });
  }

  const result = await sendPushToRep(recipientRepId, payload);
  return NextResponse.json({ ok: true, result }, { headers: cors });
}
