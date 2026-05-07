"use client";

/**
 * PendingRequestPill — small floating reminder that shows on every page
 * while the rep has at least one unresolved shift request.
 *
 * Why this exists: a rep submits a request from /add-shift, then
 * navigates back to / (dashboard) or anywhere else. Without this pill
 * they'd have no live indicator that something's still in flight, and
 * (in their words) "I still need something to show me that I'm waiting
 * to be notified the shift is approved."
 *
 * Sits alongside <RequestResolutionWatcher /> at the layout level so
 * it survives navigation. Auto-counts via the same realtime sub used
 * by /shifts; tapping the pill takes the rep to /shifts where they
 * can see the actual cards. Hides itself when the count hits zero.
 *
 * Positioning: bottom-right above the static AppFooter so it never
 * collides with the resolution banners that the watcher renders
 * top-of-screen. Lower z-index than those banners so a fresh
 * approval message stacks visually over the still-pending pill if
 * both happen to be on-screen at the same instant.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";
import {
  listRequestedShifts,
  subscribeRequestedShifts,
} from "@/lib/shift-store";

export function PendingRequestPill() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    const refresh = async () => {
      const rows = await listRequestedShifts();
      if (!cancelled) setCount(rows.length);
    };
    void refresh();

    // Realtime + visibility refetch + 60s poll. Mirrors the defence-in-
    // depth pattern on the admin Sidebar's pending-request badge so
    // the count can't silently drift if the WebSocket drops.
    const unsub = subscribeRequestedShifts(refresh);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, []);

  if (!mounted || count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/shifts")}
      aria-label={`${count} request${count === 1 ? "" : "s"} pending — view`}
      style={{
        position: "fixed",
        right: 14,
        // Sit above the static AppFooter (~46px tall) plus the safe-area
        // inset on notched devices.
        bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        zIndex: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 13px 9px 11px",
        background: "#fff",
        border: `1px solid ${MC.warn}55`,
        borderLeft: `3px solid ${MC.warn}`,
        borderRadius: 999,
        cursor: "pointer",
        fontFamily: MC.font,
        boxShadow: "0 10px 22px rgba(10,15,30,.14)",
        animation: "prp-slide-in .28s cubic-bezier(.22, 1, .36, 1) both",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: MC.warnTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name="clock" size={13} color={MC.warn} strokeWidth={2.4} />
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#7A560A",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {count} pending
      </span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: MC.ink,
          letterSpacing: -0.1,
        }}
      >
        Awaiting approval
      </span>
      <Glyph name="chev-r" size={14} color={MC.hint} />
      <style>{`
        @keyframes prp-slide-in {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-prp] { animation: none !important; }
        }
      `}</style>
    </button>
  );
}
