"use client";

/**
 * /messages — rep inbox (Feature E, May 13).
 *
 * Lists messages sent by managers via the admin /notify composer.
 * Realtime sub keeps the list live; the side-menu badge over in
 * the layout is fed by the same data via countMyUnread.
 *
 * Deep-link: /messages?id=<message_id> jumps straight to that
 * message expanded (used by push-notification taps).
 */

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import {
  listMyInbox,
  markMessageRead,
  markAllRead,
  subscribeMyInbox,
  type InboxMessage,
} from "@/lib/messaging-store";

export default function MessagesPage() {
  return (
    <Suspense fallback={<div />}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = params.get("id");

  const [items, setItems] = useState<InboxMessage[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listMyInbox();
    setItems(rows);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeMyInbox({ onChange: refresh });
    return unsub;
  }, [refresh]);

  // Deep-link → expand the matching message + mark it read. Runs
  // every time items refresh in case the deep-linked message
  // hadn't arrived yet at first mount (race with realtime delivery).
  useEffect(() => {
    if (!focusId || !items) return;
    const hit = items.find((m) => m.message_id === focusId);
    if (hit) {
      setExpanded(hit.recipient_row_id);
      if (!hit.read_at) {
        void markMessageRead(hit.recipient_row_id).then(refresh);
      }
    }
  }, [focusId, items, refresh]);

  const onExpand = async (m: InboxMessage) => {
    const willExpand = expanded !== m.recipient_row_id;
    setExpanded(willExpand ? m.recipient_row_id : null);
    if (willExpand && !m.read_at) {
      const r = await markMessageRead(m.recipient_row_id);
      if (r.ok) void refresh();
    }
  };

  const onMarkAll = async () => {
    const r = await markAllRead();
    if (r.ok) void refresh();
  };

  const unreadCount = items?.filter((m) => !m.read_at).length ?? 0;

  return (
    <div
      style={{
        background: MC.bg,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppHeader title="Messages" onBack={() => router.push("/")} withMenu />

      <div
        style={{
          padding: "20px 16px 100px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Header strip — unread count + mark-all-read */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: MC.brandTint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph name="send" size={14} color={MC.brandDeep} strokeWidth={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13.5,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.1,
              }}
            >
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.mute,
                marginTop: 2,
              }}
            >
              From your managers. New messages land in real time.
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              style={{
                background: "transparent",
                color: MC.brandDeep,
                border: `1px solid ${MC.brand}55`,
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                padding: "6px 10px",
                borderRadius: 999,
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        {items === null ? (
          <div
            style={{
              padding: 20,
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
              textAlign: "center",
            }}
          >
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              padding: 28,
              fontFamily: MC.font,
              fontSize: 13,
              color: MC.mute,
              textAlign: "center",
              background: MC.card,
              border: `1px dashed ${MC.line}`,
              borderRadius: 14,
              lineHeight: 1.5,
            }}
          >
            No messages yet. When your manager sends one, it&apos;ll show up
            here.
          </div>
        ) : (
          items.map((m) => (
            <MessageItem
              key={m.recipient_row_id}
              msg={m}
              expanded={expanded === m.recipient_row_id}
              onTap={() => onExpand(m)}
            />
          ))
        )}
      </div>

      <AppFooter />
    </div>
  );
}

function MessageItem({
  msg,
  expanded,
  onTap,
}: {
  msg: InboxMessage;
  expanded: boolean;
  onTap: () => void;
}) {
  const unread = !msg.read_at;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        width: "100%",
        textAlign: "left",
        padding: 14,
        background: MC.card,
        border: `1px solid ${unread ? `${MC.brand}55` : MC.line}`,
        borderLeft: `3px solid ${unread ? MC.brand : MC.line}`,
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: MC.font,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: unread ? 700 : 600,
              color: MC.ink,
              letterSpacing: -0.1,
              overflow: expanded ? undefined : "hidden",
              textOverflow: expanded ? undefined : "ellipsis",
              whiteSpace: expanded ? "normal" : "nowrap",
            }}
          >
            {msg.subject}
          </div>
          <div
            style={{
              fontSize: 11,
              color: MC.mute,
              marginTop: 2,
            }}
          >
            {msg.sent_at
              ? new Date(msg.sent_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : ""}
          </div>
        </div>
        {unread && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: MC.brand,
              flexShrink: 0,
              marginTop: 6,
            }}
            aria-label="Unread"
          />
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          color: MC.ink2,
          marginTop: 8,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          display: expanded ? "block" : "-webkit-box",
          WebkitLineClamp: expanded ? undefined : 2,
          WebkitBoxOrient: expanded ? undefined : "vertical",
          overflow: expanded ? "visible" : "hidden",
        }}
      >
        {msg.body}
      </div>
    </button>
  );
}
