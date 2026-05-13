"use client";

/**
 * MessageBanner — in-app banner that pops when a new manager message
 * lands (Feature E, May 13).
 *
 * Lives at layout level so it survives navigation. Realtime sub on
 * the rep's message_recipients rows fires onInsert → we fetch the
 * message, render a brand-toned banner top-of-screen for ~6s with
 * Open / Dismiss buttons.
 *
 * Notes:
 *   - Auto-dismisses after the timer unless the rep hovers / focuses
 *     (the visual would otherwise feel pushy).
 *   - Doesn't render if the rep is already on /messages — that page
 *     is the destination anyway, and a banner there would be noise.
 *   - Banner is per-arrival (not a persistent stack) — if several
 *     messages arrive in close succession the latest wins. The
 *     inbox + side-menu badge are the source of truth for "what's
 *     unread"; the banner is just a heads-up.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";
import {
  subscribeMyInbox,
  getInboxMessageById,
  type InboxMessage,
} from "@/lib/messaging-store";

const AUTO_DISMISS_MS = 6500;

export function MessageBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<InboxMessage | null>(null);
  const [mounted, setMounted] = useState(false);
  const dismissTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsub = subscribeMyInbox({
      onInsert: async (_recipientRowId, messageId) => {
        // Don't pop on the inbox page itself.
        if (pathname?.startsWith("/messages")) return;
        const msg = await getInboxMessageById(messageId);
        if (!msg) return;
        // Only banner in-app deliveries — push notifications are
        // the OS-level surface, no in-app duplicate needed unless
        // the manager explicitly opted in to in-app too.
        if (!msg.deliver_in_app) return;
        setPending(msg);
      },
    });
    return unsub;
  }, [pathname]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!pending) return;
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => {
      setPending(null);
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimer.current) {
        window.clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [pending]);

  if (!mounted || !pending) return null;

  const onOpen = () => {
    router.push(`/messages?id=${pending.message_id}`);
    setPending(null);
  };
  const onDismiss = () => setPending(null);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        // Sit just below the safe-area top so it doesn't bump into
        // the notch or the dynamic island on iPhones.
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        left: 14,
        right: 14,
        zIndex: 60,
        background: "#fff",
        border: `1px solid ${MC.brand}55`,
        borderLeft: `3px solid ${MC.brand}`,
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "0 18px 40px rgba(10,15,30,.25)",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        fontFamily: MC.font,
        animation: "mb-slide-in .3s cubic-bezier(.22, 1, .36, 1) both",
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: MC.brandTint,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name="send" size={14} color={MC.brandDeep} strokeWidth={2.4} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: MC.brandDeep,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          New message
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: MC.ink,
            marginTop: 2,
            letterSpacing: -0.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={pending.subject}
        >
          {pending.subject}
        </div>
        <div
          style={{
            fontSize: 12,
            color: MC.ink2,
            marginTop: 4,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {pending.body}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              background: MC.brandDeep,
              color: "#fff",
              border: "none",
              padding: "6px 12px",
              borderRadius: 8,
              fontFamily: MC.font,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: "transparent",
              color: MC.mute,
              border: "none",
              padding: "6px 8px",
              fontFamily: MC.font,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
      <style>{`
        @keyframes mb-slide-in {
          from { transform: translateY(-10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
