/**
 * Messaging store (admin) — Feature E, May 13.
 *
 * Composes + sends messages to reps and other managers, with optional
 * scheduling and per-channel (push / in-app) delivery. See the
 * 2026_05_13_messages migration for the schema.
 *
 * Lifecycle:
 *   compose → INSERT into messages (status='pending') + materialise
 *             recipients into message_recipients
 *   send-now → POST /api/messages/send which:
 *              1. UPDATE messages SET status='sending' WHERE status='pending'
 *                 (advisory lock — prevents double-send if user double-taps)
 *              2. Fans out push to recipients where deliver_push=true
 *                 + push subscription exists
 *              3. UPDATE messages SET status='sent', sent_at=now()
 *   scheduled → /api/cron/messages sweeps pending+due rows on each tick
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type AudienceKind = "all" | "all_reps" | "all_managers" | "specific";
export type MessageStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface MessageRow {
  id: string;
  subject: string;
  body: string;
  created_by: string | null;
  audience_kind: AudienceKind;
  audience_user_ids: string[] | null;
  deliver_push: boolean;
  deliver_in_app: boolean;
  scheduled_at: string | null;
  status: MessageStatus;
  sent_at: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ComposeMessageInput {
  subject: string;
  body: string;
  audienceKind: AudienceKind;
  /** Required when audienceKind='specific'. Ignored otherwise. */
  audienceUserIds?: string[];
  deliverPush: boolean;
  deliverInApp: boolean;
  /** ISO timestamp or null. null = send now. */
  scheduledAtIso?: string | null;
}

export interface ComposeResult {
  ok: true;
  id: string;
  recipientCount: number;
  /** Whether the API send-now fan-out fired (true when scheduledAtIso
   *  is null and the inline send succeeded). False for scheduled
   *  messages (cron handles those). */
  sentNow: boolean;
}
export interface ComposeError {
  ok: false;
  error: string;
}

/**
 * Resolve an audience descriptor into a list of recipient user ids
 * by reading the profiles table. The result is what gets materialised
 * into message_recipients at compose time.
 *
 * Includes the composer when they belong in the audience — e.g. a
 * manager who composes "All managers" or "Everyone" gets their own
 * copy. This matches Slack / Teams behaviour AND makes testing sane
 * (you can compose from admin and watch the message arrive on your
 * own device without juggling two accounts).
 *
 * The previous version auto-excluded the composer "to avoid the
 * awkward I-sent-this-and-got-my-own-copy experience". Gary hit
 * that exact gotcha during testing — composed from admin, watched
 * his own inbox, saw nothing because the exclusion silently
 * filtered him out. If a manager truly doesn't want their own copy
 * for a specific message, "Pick specific…" gives them precise
 * control over the list.
 */
async function resolveRecipients(
  audienceKind: AudienceKind,
  audienceUserIds: string[] | undefined
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Database not configured" };
  if (audienceKind === "specific") {
    const ids = (audienceUserIds || []).filter(Boolean);
    if (ids.length === 0) {
      return {
        ok: false,
        error: "Pick at least one recipient (or change to All).",
      };
    }
    return { ok: true, ids: Array.from(new Set(ids)) };
  }

  let q = supabase.from("profiles").select("id");
  if (audienceKind === "all_reps") q = q.eq("role", "rep");
  else if (audienceKind === "all_managers") q = q.eq("role", "manager");
  // 'all' → no filter
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const ids = ((data as { id: string }[]) || []).map((p) => p.id);
  return { ok: true, ids };
}

/**
 * Compose + persist a message. Materialises message_recipients but
 * does NOT trigger send. For send-now flows the caller (the composer
 * UI) should call sendMessageNow(id) immediately after a successful
 * compose. For scheduled flows the cron picks up status='pending'
 * rows where scheduled_at <= now().
 */
export async function composeMessage(
  input: ComposeMessageInput
): Promise<ComposeResult | ComposeError> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { ok: false, error: "Give the message a subject." };
  if (!body) return { ok: false, error: "Add a body." };
  if (!input.deliverPush && !input.deliverInApp) {
    return {
      ok: false,
      error: "Pick at least one channel (push or in-app).",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const composerId = userData.user?.id ?? null;

  // Resolve recipients first so we can fail fast if there's nobody
  // to send to (avoids creating an orphan zero-recipient row).
  // Composer is now INCLUDED in the audience when they belong (e.g.
  // a manager composing "All managers" gets their own copy). See
  // resolveRecipients() doc comment for rationale.
  const r = await resolveRecipients(
    input.audienceKind,
    input.audienceUserIds
  );
  if (!r.ok) return r;
  if (r.ids.length === 0) {
    return {
      ok: false,
      error: "No matching recipients found. Check your audience pick.",
    };
  }

  // 1. Insert the message row.
  const { data: inserted, error: insErr } = await supabase
    .from("messages")
    .insert({
      subject,
      body,
      created_by: composerId,
      audience_kind: input.audienceKind,
      audience_user_ids:
        input.audienceKind === "specific" ? input.audienceUserIds : null,
      deliver_push: input.deliverPush,
      deliver_in_app: input.deliverInApp,
      scheduled_at: input.scheduledAtIso || null,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message || "Couldn't save message." };
  }
  const messageId = (inserted as { id: string }).id;

  // 2. Materialise recipients. One row per resolved user id. ignoreDuplicates
  //    in case a future audience type creates overlap.
  const recipientRows = r.ids.map((rid) => ({
    message_id: messageId,
    recipient_id: rid,
  }));
  const { error: recErr } = await supabase
    .from("message_recipients")
    .insert(recipientRows);
  if (recErr) {
    // Roll back the message so we don't have a zero-recipients orphan.
    await supabase.from("messages").delete().eq("id", messageId);
    return { ok: false, error: recErr.message };
  }

  // 3. If send-now, hit the API to fan out push immediately. Cron
  //    picks up scheduled rows separately.
  const sendNow = !input.scheduledAtIso;
  if (sendNow) {
    const sendResult = await sendMessageNow(messageId);
    if (!sendResult.ok) {
      // The message + recipients are saved; only the send failed.
      // Mark failed in meta so the UI can surface this without losing
      // the audit trail.
      await supabase
        .from("messages")
        .update({
          status: "failed",
          meta: { send_error: sendResult.error },
        })
        .eq("id", messageId);
      return { ok: false, error: sendResult.error };
    }
  }

  return {
    ok: true,
    id: messageId,
    recipientCount: r.ids.length,
    sentNow: sendNow,
  };
}

/**
 * Tell the API to send a previously-composed message now. Used both
 * by composeMessage's send-now path and by the cron sweep for
 * scheduled messages whose scheduled_at has arrived.
 *
 * Posts to a same-origin admin API route which does the actual
 * fan-out with a service-role client (so we can read every rep's
 * push_subscriptions row without bumping into RLS).
 */
export async function sendMessageNow(
  messageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Send failed (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** List recent messages composed by anyone in this org. */
export async function listMessages(opts?: {
  limit?: number;
  status?: MessageStatus;
}): Promise<MessageRow[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let q = supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[messages] list:", error.message);
    return [];
  }
  return (data as MessageRow[]) || [];
}

/** Cancel a still-pending message (e.g. scheduled one before it
 *  fires). No-op if status isn't 'pending'. */
export async function cancelMessage(
  messageId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("messages")
    .update({ status: "cancelled" })
    .eq("id", messageId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Realtime subscription for the admin /notify list (any change). */
export function subscribeMessages(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  const channel = supabase
    .channel(`messages_${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
