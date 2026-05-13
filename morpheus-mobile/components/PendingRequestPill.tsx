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

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";
import {
  listRequestedShifts,
  subscribeRequestedShifts,
  type RequestedShift,
} from "@/lib/shift-store";
import { listMyShiftsToday, subscribeShifts } from "@/lib/shifts-store";

export function PendingRequestPill() {
  const router = useRouter();
  const [pendingRows, setPendingRows] = useState<RequestedShift[]>([]);
  const [mounted, setMounted] = useState(false);
  // Tap-to-expand: collapsed pill grows into a small info card that
  // shows the actual pending customers + an unambiguous CTA. Reps
  // reported tapping the collapsed pill expecting "tell me more"; the
  // existing behaviour (silently navigate to /shifts) felt unreactive
  // because the tap target is small and the destination page is busy.
  // The expanded variant gives them context AND a clear next step.
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Derive the count from the rows so the pill, the popover, and any
  // future surfaces share one source of truth.
  const count = pendingRows.length;

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    // Compute the EFFECTIVE pending list. Two queries in parallel:
    //   1. Pending requests (the source of truth from requested_shifts)
    //   2. My shifts today (so we can mask requests whose approved
    //      shift has already landed for me — a Supabase realtime
    //      DELETE on requested_shifts can lag behind the shifts
    //      INSERT by tens of seconds, so without this cross-check
    //      the pill stayed visible for ~60s after approval until the
    //      polling fallback caught up).
    const refresh = async () => {
      const [pending, myShifts] = await Promise.all([
        listRequestedShifts(),
        listMyShiftsToday(),
      ]);
      if (cancelled) return;
      const myCustomerIds = new Set(myShifts.map((s) => s.id));
      const stillPending = pending.filter((p) => !myCustomerIds.has(p.id));
      setPendingRows(stillPending);
    };
    void refresh();

    // Realtime + visibility refetch + custom-event bus + poll. The
    // realtime + poll pair was the original story but managers
    // reported lag in BOTH directions — pill appearing late after
    // submit, lingering after the manager approved. Two fixes:
    //
    //   1. Local custom-event bus ("morpheus.requests.changed").
    //      addRequestedShift / removeRequestedShift dispatch it
    //      synchronously on success, and RequestResolutionWatcher
    //      dispatches it the moment a resolution banner fires.
    //      The pill picks the event up in the same tick — no
    //      waiting for the realtime round-trip.
    //   2. Poll tightened from 60 s → 15 s as a defence-in-depth
    //      fallback. Cheap query (one rep's own rows), so the
    //      extra frequency is negligible.
    const unsubRequests = subscribeRequestedShifts(refresh);
    const unsubShifts = subscribeShifts(refresh);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const onLocalChange = () => void refresh();
    window.addEventListener("morpheus.requests.changed", onLocalChange);
    const poll = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      unsubRequests();
      unsubShifts();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("morpheus.requests.changed", onLocalChange);
      window.clearInterval(poll);
    };
  }, []);

  // Outside-tap collapses the expanded popover. Mirrors mousedown +
  // touchstart so iOS Safari dismisses cleanly on tap without
  // waiting for the click event.
  useEffect(() => {
    if (!expanded) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [expanded]);

  // Auto-collapse if the queue drains while expanded — saves the rep
  // tapping ×  on an empty popover after their last request was
  // approved/declined.
  useEffect(() => {
    if (count === 0 && expanded) setExpanded(false);
  }, [count, expanded]);

  if (!mounted || count === 0) return null;

  const wentToShifts = () => {
    setExpanded(false);
    router.push("/shifts");
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        right: 14,
        // Sit above the static AppFooter (~46px tall) plus the safe-area
        // inset on notched devices.
        bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        zIndex: 40,
        // Allow the popover above to overflow the pill width without
        // pushing the pill itself off-screen.
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: MC.font,
      }}
    >
      {/* Expanded info card — appears above the pill on tap. Gives the
          rep context (which customers, when requested) and a clear
          "View shifts" CTA. Tapping outside or × collapses back to
          the pill. */}
      {expanded && (
        <div
          role="dialog"
          aria-label="Pending shift requests"
          style={{
            width: "min(78vw, 280px)",
            background: "#fff",
            border: `1px solid ${MC.line}`,
            borderRadius: 14,
            boxShadow: "0 16px 40px rgba(10,15,30,.18)",
            padding: "12px 12px 10px",
            animation: "prp-pop-in .22s cubic-bezier(.22, 1, .36, 1) both",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
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
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.1,
                }}
              >
                Awaiting approval
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: MC.mute,
                  marginTop: 1,
                  lineHeight: 1.35,
                }}
              >
                Your manager hasn&apos;t decided yet — you&apos;ll get a
                notification when they do.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                padding: 4,
                cursor: "pointer",
                color: MC.hint,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Glyph name="close" size={14} color={MC.hint} strokeWidth={2.4} />
            </button>
          </div>

          {/* Pending customers — capped at first 3 so the popover
              stays compact on small screens; +N more affordance
              when the queue is deeper. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 10,
              maxHeight: 132,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {pendingRows.slice(0, 4).map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  background: MC.bg,
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: p.color || MC.brand,
                    color: "#fff",
                    fontSize: 9.5,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    letterSpacing: 0.3,
                  }}
                >
                  {p.initials || p.name.slice(0, 2).toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: MC.ink,
                    fontWeight: 600,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    flex: 1,
                  }}
                  title={p.name}
                >
                  {p.name}
                </span>
              </div>
            ))}
            {pendingRows.length > 4 && (
              <div
                style={{
                  fontSize: 11,
                  color: MC.mute,
                  textAlign: "center",
                  paddingTop: 2,
                }}
              >
                +{pendingRows.length - 4} more
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={wentToShifts}
            style={{
              width: "100%",
              minHeight: 38,
              padding: "0 12px",
              borderRadius: 10,
              background: MC.brandDeep,
              color: "#fff",
              border: "none",
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            View your shifts
            <Glyph name="chev-r" size={13} color="#fff" strokeWidth={2.4} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={`${count} request${count === 1 ? "" : "s"} pending — ${expanded ? "hide details" : "show details"}`}
        aria-expanded={expanded}
        style={{
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
          animation: expanded
            ? undefined
            : "prp-slide-in .28s cubic-bezier(.22, 1, .36, 1) both",
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
        {/* Chevron rotates 90° when expanded so the affordance reads
            as a disclosure indicator rather than a "go forward" arrow.
            That was the source of the rep confusion — chev-r looked
            like "tap to navigate" but the tap silently navigated to
            a busy page, and reps reported feeling like nothing
            happened. The rotation makes the expansion the obvious
            outcome of the tap. */}
        <span
          style={{
            display: "inline-flex",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform .18s ease",
          }}
        >
          <Glyph name="chev-r" size={14} color={MC.hint} />
        </span>
      </button>
      <style>{`
        @keyframes prp-slide-in {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        @keyframes prp-pop-in {
          from { transform: translateY(6px) scale(.96); opacity: 0; }
          to   { transform: translateY(0)   scale(1);   opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-prp] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
