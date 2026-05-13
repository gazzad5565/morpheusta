/**
 * Messaging store (mobile) — Feature E, May 13.
 *
 * The rep-side counterpart to the admin /notify composer. Reads
 * messages addressed to the current user (joined via
 * message_recipients), marks them read, subscribes to inserts so
 * the in-app banner can pop the moment a manager fires one off.
 *
 * Schema: see db/migrations/2026_05_13_messages.sql.
 *
 * Two key behaviours:
 *   1. listMyInbox(): joins messages × message_recipients so each
 *      row carries the message body + read state in one shot. We
 *      filter to status='sent' so scheduled-future and cancelled
 *      rows don't surface in the inbox.
 *   2. subscribeMyInbox(): realtime sub on message_recipients
 *      filtered to recipient_id = current user. Fires on every
 *      INSERT (new message) AND every UPDATE (read state changed
 *      on another device).
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export interface InboxMessage {
  /** message_recipients.id — the per-recipient row */
  recipient_row_id: string;
  /** messages.id — the message itself (use this for navigation /
   *  deep-linking from a push tap). */
  message_id: string;
  subject: string;
  body: string;
  /** True when push delivery is enabled — drives the small "push"
   *  pill on the inbox row so the rep knows whether they would
   *  have gotten an OS notification. */
  deliver_push: boolean;
  deliver_in_app: boolean;
  sent_at: string | null;
  read_at: string | null;
}

interface JoinedRow {
  id: string;
  message_id: string;
  read_at: string | null;
  messages: {
    id: string;
    subject: string;
    body: string;
    deliver_push: boolean;
    deliver_in_app: boolean;
    status: string;
    sent_at: string | null;
  } | null;
}

/** All messages addressed to me, newest first. Filtered to
 *  successfully-sent messages — pending / scheduled / cancelled
 *  shouldn't show up in the inbox yet. */
export async function listMyInbox(): Promise<InboxMessage[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("message_recipients")
    .select(
      "id, message_id, read_at, messages(id, subject, body, deliver_push, deliver_in_app, status, sent_at)"
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[messaging] inbox:", error.message);
    return [];
  }
  const rows = (data as unknown as JoinedRow[]) || [];
  return rows
    .filter((r) => r.messages && r.messages.status === "sent")
    .map((r) => ({
      recipient_row_id: r.id,
      message_id: r.message_id,
      subject: r.messages!.subject,
      body: r.messages!.body,
      deliver_push: r.messages!.deliver_push,
      deliver_in_app: r.messages!.deliver_in_app,
      sent_at: r.messages!.sent_at,
      read_at: r.read_at,
    }));
}

/** Count of unread messages for the current user — drives the
 *  side-menu badge. */
export async function countMyUnread(): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return 0;

  // We can't combine messages.status filter with a count() over
  // message_recipients in a single Supabase query without a view,
  // so we approximate by counting unread recipient rows — close
  // enough since the lifecycle window between 'pending' and 'sent'
  // is brief (seconds for send-now, picked up by cron for
  // scheduled).
  const { count, error } = await supabase
    .from("message_recipients")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[messaging] unread count:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Mark a specific inbox row as read. Idempotent — repeat calls
 *  are no-ops because of the read_at IS NULL filter. */
export async function markMessageRead(
  recipientRowId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("message_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("id", recipientRowId)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Mark every unread row as read in one shot ("Mark all read"
 *  affordance in the inbox). */
export async function markAllRead(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };
  const { error } = await supabase
    .from("message_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Subscribe to inbox changes for the current user. Fires on:
 *   - INSERT (new message landed in my inbox) — drives the in-app
 *     banner pop.
 *   - UPDATE (read state changed on another device) — keeps the
 *     unread badge in sync across phones / tablets.
 *
 * The `onInsert` callback is fired SPECIFICALLY for new messages so
 * the watcher can fetch + show the banner without an extra round-
 * trip to figure out which row was added.
 */
export function subscribeMyInbox(args: {
  onChange?: () => void;
  onInsert?: (recipientRowId: string, messageId: string) => void;
}): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  let cancelled = false;
  // Declared before the async IIFE so the closure that assigns it
  // doesn't run into the TS "used before declaration" rule. The
  // outer unsubscribe handler reads it; by the time the consumer
  // calls back, the async block has either set the real cleanup OR
  // cancelled before subscribe ran (in which case the no-op stands).
  let cleanup: () => void = () => {};

  void (async () => {
    if (!supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId || cancelled) return;

    const channel = supabase
      .channel(`inbox_${userId}_${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_recipients",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === "INSERT" && args.onInsert) {
            const row = payload.new as {
              id: string;
              message_id: string;
            } | null;
            if (row) args.onInsert(row.id, row.message_id);
          }
          args.onChange?.();
        }
      )
      .subscribe();

    cleanup = () => {
      supabase!.removeChannel(channel);
    };
  })();

  return () => {
    cancelled = true;
    cleanup();
  };
}

/** Fetch a single message by id — used by deep-link from a push
 *  notification (?id=<message_id> on /messages). Returns null if
 *  the user isn't a recipient of that message. */
export async function getInboxMessageById(
  messageId: string
): Promise<InboxMessage | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("message_recipients")
    .select(
      "id, message_id, read_at, messages(id, subject, body, deliver_push, deliver_in_app, status, sent_at)"
    )
    .eq("recipient_id", userId)
    .eq("message_id", messageId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as JoinedRow;
  if (!row.messages) return null;
  return {
    recipient_row_id: row.id,
    message_id: row.message_id,
    subject: row.messages.subject,
    body: row.messages.body,
    deliver_push: row.messages.deliver_push,
    deliver_in_app: row.messages.deliver_in_app,
    sent_at: row.messages.sent_at,
    read_at: row.read_at,
  };
}
