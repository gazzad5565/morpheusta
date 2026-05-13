/**
 * Server-side Web Push sender.
 *
 * Sits behind /api/push/notify (and any other route that needs to
 * deliver pushes). Three responsibilities:
 *
 *   1. Look up all push_subscriptions rows for a given rep_id.
 *   2. Send a push to each, signed with the VAPID private key.
 *   3. Prune dead subscriptions — endpoints that return 404 or 410
 *      are gone for good (rep uninstalled the PWA, cleared their
 *      browser data, etc).
 *
 * Failures are swallowed and logged. A push failing to deliver
 * should never break the surrounding admin operation (e.g. shift
 * creation succeeded — push delivery is best-effort).
 */

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let vapidConfigured = false;
function configureVapidOnce() {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path the SW will navigate to when the rep taps the notification.
   *  Defaults to "/" if omitted. */
  url?: string;
  /** Override the default app icon. Should be a path under /public. */
  icon?: string;
}

export interface SendResult {
  attempted: number;
  delivered: number;
  pruned: number;
  errors: number;
}

/**
 * Send `payload` to every active subscription for `repId`.
 * Returns a summary so callers can log / surface failures if useful.
 *
 * Never throws — failures are logged and counted. The push system
 * is non-critical infrastructure; one bad subscription shouldn't
 * stop the others from getting their notification.
 */
export async function sendPushToRep(
  repId: string,
  payload: PushPayload
): Promise<SendResult> {
  const result: SendResult = { attempted: 0, delivered: 0, pruned: 0, errors: 0 };

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn("[push] missing Supabase config — skipping send");
    return result;
  }
  configureVapidOnce();
  if (!vapidConfigured) {
    console.warn("[push] VAPID keys not configured — skipping send");
    return result;
  }

  const sb = serviceClient();
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("rep_id", repId);

  if (error) {
    console.warn("[push] subscription lookup failed", error);
    return result;
  }
  if (!subs || subs.length === 0) {
    return result;
  }

  result.attempted = subs.length;
  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
  });

  const toPrune: string[] = [];

  await Promise.all(
    subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadString
        );
        result.delivered++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone for good — prune the row.
          toPrune.push(sub.id);
        } else {
          result.errors++;
          console.warn("[push] send failed", { endpoint: sub.endpoint, err });
        }
      }
    })
  );

  if (toPrune.length > 0) {
    const { error: pruneErr } = await sb
      .from("push_subscriptions")
      .delete()
      .in("id", toPrune);
    if (pruneErr) {
      console.warn("[push] prune failed", pruneErr);
    } else {
      result.pruned = toPrune.length;
    }
  }

  return result;
}

// ─── Event-specific payload builders ───────────────────────────────
//
// Centralised so wording stays consistent. Adjust copy here, not at
// the call sites. Each builder is a pure function from shift data
// to a PushPayload.

export interface ShiftLike {
  id: string;
  customer_name?: string | null;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_flexible_time?: boolean | null;
}

function formatShiftWhen(shift: ShiftLike): string {
  const date = shift.shift_date ? new Date(shift.shift_date + "T00:00:00") : null;
  const today = new Date();
  const isToday =
    date &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const datePart = !date
    ? ""
    : isToday
    ? "today"
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (shift.is_flexible_time) {
    return datePart ? `${datePart} · anytime` : "anytime";
  }
  if (shift.start_time && shift.end_time) {
    const hhmm = (t: string) => t.slice(0, 5); // "08:30:00" → "08:30"
    return datePart ? `${datePart} · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : `${hhmm(shift.start_time)}–${hhmm(shift.end_time)}`;
  }
  return datePart;
}

export function buildShiftAssignedPayload(shift: ShiftLike): PushPayload {
  const when = formatShiftWhen(shift);
  const customer = shift.customer_name || "a customer";
  return {
    title: "New shift assigned",
    body: when ? `${customer} · ${when}` : customer,
    url: "/shifts",
  };
}

export function buildShiftReassignedPayload(shift: ShiftLike): PushPayload {
  const when = formatShiftWhen(shift);
  const customer = shift.customer_name || "a customer";
  return {
    title: "Shift reassigned to you",
    body: when ? `${customer} · ${when}` : customer,
    url: "/shifts",
  };
}

export function buildShiftCancelledPayload(shift: ShiftLike): PushPayload {
  const when = formatShiftWhen(shift);
  const customer = shift.customer_name || "a customer";
  return {
    title: "Shift cancelled",
    body: when ? `${customer} · ${when}` : customer,
    url: "/shifts",
  };
}
