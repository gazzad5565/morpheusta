/**
 * POST /api/messages/send — fan out a composed message (Feature E).
 *
 * Body: { messageId: string }
 *
 * Looks up the message + its recipients (already materialised by
 * composeMessage), then for each recipient:
 *   - If deliver_push: hit sendPushToRep with the message payload,
 *     stamp push_sent_at on message_recipients.
 *   - If deliver_in_app: nothing to do here — the message is already
 *     in message_recipients, mobile picks it up via realtime sub.
 *
 * Advisory-locks the messages row by flipping status='pending' →
 * 'sending' atomically. If another worker (e.g. a double-tap of
 * Send, or the cron firing at the same moment) tries to grab the
 * same row, the second update misses (filter clause on status) and
 * we bail. This is the no-races-against-cron pattern.
 *
 * Called by:
 *   - admin composeMessage's send-now path (same origin, browser fetch)
 *   - /api/cron/messages for scheduled-due rows (server-to-server)
 *
 * Both callers go through the same route so the lifecycle bookkeeping
 * stays in one place.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToRep } from "@/lib/push-send";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Fallback updated May 14 — the previous default
// "https://morpheusta.vercel.app" pointed to a Vercel hostname
// that has no deployment, so any environment missing the env var
// (incl. preview deploys) shipped push links that 404'd with
// DEPLOYMENT_NOT_FOUND when reps tapped them. Real prod URL is
// `*-khaki-omega.vercel.app`. Keep this in sync if the host
// changes. Better still: set NEXT_PUBLIC_MOBILE_URL on Vercel for
// prod + every preview so the fallback never fires.
const MOBILE_BASE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL ||
  "https://morpheusta-khaki-omega.vercel.app";

interface MessageRow {
  id: string;
  subject: string;
  body: string;
  deliver_push: boolean;
  deliver_in_app: boolean;
  status: string;
  meta: Record<string, unknown> | null;
}

interface RecipientRow {
  id: string;
  recipient_id: string;
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  let body: { messageId?: string } = {};
  try {
    body = (await req.json()) as { messageId?: string };
  } catch {
    return Response.json(
      { ok: false, error: "Body must be valid JSON." },
      { status: 400 }
    );
  }
  const messageId = body.messageId?.trim();
  if (!messageId) {
    return Response.json(
      { ok: false, error: "Missing messageId." },
      { status: 400 }
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Advisory-lock: pending → sending. If the row isn't currently
  //    pending (already sent / sending / cancelled) the filter clause
  //    misses and we bail. Prevents double-send under concurrent
  //    callers (cron + admin double-tap).
  const { data: locked, error: lockErr } = await sb
    .from("messages")
    .update({ status: "sending" })
    .eq("id", messageId)
    .eq("status", "pending")
    .select("id, subject, body, deliver_push, deliver_in_app, status, meta")
    .maybeSingle();
  if (lockErr) {
    return Response.json({ ok: false, error: lockErr.message }, { status: 500 });
  }
  if (!locked) {
    // Row exists but isn't pending — either already sent OR cancelled.
    // Return ok so cron / repeat-clicks don't churn on it.
    return Response.json({ ok: true, skipped: true });
  }
  const msg = locked as MessageRow;

  // 2. Pull recipient ids.
  const { data: recRows, error: recErr } = await sb
    .from("message_recipients")
    .select("id, recipient_id")
    .eq("message_id", messageId);
  if (recErr) {
    await sb
      .from("messages")
      .update({ status: "failed", meta: { send_error: recErr.message } })
      .eq("id", messageId);
    return Response.json({ ok: false, error: recErr.message }, { status: 500 });
  }
  const recipients = (recRows as RecipientRow[]) || [];

  // 3. Push fan-out. In-app delivery is implicit — message_recipients
  //    rows already exist, mobile picks them up via realtime sub. We
  //    only DO anything in this loop if deliver_push is on.
  let pushAttempted = 0;
  let pushDelivered = 0;
  let pushErrors = 0;
  if (msg.deliver_push) {
    // Push URL points at the mobile inbox so a tap lands on the
    // actual message rather than a generic /. The inbox screen
    // can deep-link to a specific message via ?id=...
    //
    // Relative URL (May 14) — was `${MOBILE_BASE_URL}/messages?...`
    // but that meant taps shipped to whichever host the env var
    // resolved to. If NEXT_PUBLIC_MOBILE_URL wasn't set (or was set
    // to the wrong host on a preview), reps tapped through to
    // Vercel's DEPLOYMENT_NOT_FOUND 404. The mobile service worker
    // resolves relative URLs against its registered origin via
    // clients.openWindow, so a relative path is both shorter and
    // can't ever ship to the wrong host. MOBILE_BASE_URL is kept
    // for paths that genuinely need an absolute URL (e.g., emails)
    // but those don't exist yet.
    const pushUrl = `/messages?id=${messageId}`;
    await Promise.all(
      recipients.map(async (r) => {
        pushAttempted++;
        try {
          const result = await sendPushToRep(r.recipient_id, {
            title: msg.subject,
            body: msg.body.slice(0, 240), // truncate for OS notif limits
            url: pushUrl,
          });
          if (result.delivered > 0) {
            pushDelivered += result.delivered;
            await sb
              .from("message_recipients")
              .update({ push_sent_at: new Date().toISOString() })
              .eq("id", r.id);
          } else if (result.errors > 0) {
            pushErrors += result.errors;
          }
        } catch (err) {
          pushErrors++;
          await sb
            .from("message_recipients")
            .update({
              push_error: err instanceof Error ? err.message : "Unknown",
            })
            .eq("id", r.id);
        }
      })
    );
  }

  // 4. Mark sent.
  await sb
    .from("messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      meta: {
        ...(msg.meta || {}),
        recipient_count: recipients.length,
        push_attempted: pushAttempted,
        push_delivered: pushDelivered,
        push_errors: pushErrors,
      },
    })
    .eq("id", messageId);

  return Response.json({
    ok: true,
    recipientCount: recipients.length,
    pushAttempted,
    pushDelivered,
    pushErrors,
  });
}
