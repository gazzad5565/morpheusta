/**
 * /api/push/notify — server endpoint that admin store code calls
 * after a shift mutation to deliver a push to the affected rep.
 *
 *   POST /api/push/notify { event, shiftId, ?previousRepId }
 *
 * Event types:
 *   - "shift-assigned"   — new shift with a rep_id set
 *   - "shift-reassigned" — existing shift's rep_id changed
 *                          (push goes to the NEW rep)
 *   - "shift-cancelled"  — shift went to state='cancelled' (or
 *                          equivalent attention_resolution)
 *
 * Why a single endpoint with an event discriminator instead of
 * three: the wording, the payload, and which-rep-to-target are all
 * server-decided. The client only needs to say "this happened to
 * this shift" — no risk of an XSS or a misbehaving admin sending
 * arbitrary push content to reps.
 *
 * Auth: manager only. Service-role used internally to read the
 * shift + customer + push_subscriptions rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildShiftAssignedPayload,
  buildShiftCancelledPayload,
  buildShiftReassignedPayload,
  sendPushToRep,
  type ShiftLike,
} from "@/lib/push-send";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireManager(req: NextRequest): Promise<
  | { ok: true; userId: string }
  | { ok: false; res: NextResponse }
> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      ),
    };
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 }) };
  }
  const callerSb = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await callerSb.auth.getUser(token);
  if (userErr || !userData.user) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 }) };
  }
  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "manager") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Manager role required" }, { status: 403 }) };
  }
  return { ok: true, userId: userData.user.id };
}

type NotifyEvent = "shift-assigned" | "shift-reassigned" | "shift-cancelled";

interface NotifyBody {
  event: NotifyEvent;
  shiftId: string;
  /** For "shift-reassigned": optional. If present, no notification is
   *  sent to the previous rep (we don't currently tell them they
   *  lost the shift; that'd be follow-up scope). */
  previousRepId?: string | null;
}

export async function POST(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  let body: NotifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const { event, shiftId } = body;
  if (!event || !shiftId) {
    return NextResponse.json(
      { ok: false, error: "event and shiftId are required" },
      { status: 400 }
    );
  }

  const sb = adminClient();

  // Pull the shift + a few customer fields needed for the payload
  // copy. We avoid joining the customer table directly because the
  // shift row already carries enough denormalized info in most
  // cases — but customer_name lives on customers, so we join.
  type ShiftRow = ShiftLike & { rep_id: string | null; customer_id: string };

  const { data: shiftRow, error: shiftErr } = await sb
    .from("shifts")
    .select(
      "id, rep_id, customer_id, shift_date, start_time, end_time, is_flexible_time"
    )
    .eq("id", shiftId)
    .maybeSingle();

  if (shiftErr || !shiftRow) {
    return NextResponse.json(
      { ok: false, error: shiftErr?.message || "Shift not found" },
      { status: 404 }
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

  // Pick the recipient + payload based on the event.
  let recipientRepId: string | null = null;
  let payload;
  if (event === "shift-assigned") {
    recipientRepId = shift.rep_id;
    payload = buildShiftAssignedPayload(shiftForPayload);
  } else if (event === "shift-reassigned") {
    recipientRepId = shift.rep_id;
    payload = buildShiftReassignedPayload(shiftForPayload);
  } else if (event === "shift-cancelled") {
    // For cancellation we notify whoever the shift was assigned to
    // (rep_id on the cancelled row, or previousRepId if the row was
    // already nulled out before the call).
    recipientRepId = shift.rep_id || body.previousRepId || null;
    payload = buildShiftCancelledPayload(shiftForPayload);
  } else {
    return NextResponse.json({ ok: false, error: "Unknown event" }, { status: 400 });
  }

  if (!recipientRepId) {
    // No rep to notify — that's fine, just say so. Common for
    // unassigned shifts that get cancelled.
    return NextResponse.json({ ok: true, skipped: "No rep to notify" });
  }

  const result = await sendPushToRep(recipientRepId, payload);
  return NextResponse.json({ ok: true, result });
}
