"use client";

/**
 * RouteOptimizedSheet
 *
 * Tap-feedback for the "calm" state of the Route pill on the home
 * page and /shifts. Instead of routing to /route (which has nothing
 * actionable to show when the day's already optimised), the calm
 * pill opens this small, celebratory sheet.
 *
 * Design choices:
 *   • Centred modal, not a bottom sheet — feels more rewarding,
 *     less utilitarian. The day is good; the moment should pop.
 *   • Animated content: stroke-drawn check inside two pulsing
 *     concentric rings, then a soft scale-up + fade-up for the
 *     headline + subline. Identical animation grammar to
 *     /check-in/success so reps recognise the "well done" tone.
 *   • Backdrop tap dismisses. Explicit "Got it" button too — gives
 *     a thumb-friendly close on phones where backdrop taps land
 *     on something else by accident.
 *   • Secondary "Open route anyway" link tucked at the bottom so
 *     reps who want to actually look at the route still can.
 *     Subordinate styling so it doesn't fight the celebration.
 *   • Respects prefers-reduced-motion: skips the animations,
 *     renders in final state.
 *
 * Mount near the top of the consumer page (home, /shifts) and
 * control visibility via the `open` prop. Renders a non-portal
 * full-viewport overlay — fine for a mobile PWA where there's
 * never more than one page at a time on screen.
 */

import { useEffect } from "react";
import Link from "next/link";
import { MC } from "@/lib/tokens";
import { Glyph } from "./Glyph";

export function RouteOptimizedSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Esc key dismiss — covers desktop / iPad with a keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes mc-rop-backdrop-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes mc-rop-card-rise {
          from { opacity: 0; transform: translateY(14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mc-rop-ring-pulse {
          0%   { transform: scale(0.6); opacity: 0.65; }
          70%  { transform: scale(1.3); opacity: 0;    }
          100% { transform: scale(1.3); opacity: 0;    }
        }
        @keyframes mc-rop-check-draw {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0;  }
        }
        @keyframes mc-rop-text-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,15,30,0.55)",
          zIndex: 50,
          animation: "mc-rop-backdrop-fade 160ms ease-out both",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      {/* Centred card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Route optimized"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 51,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          // Stop propagation so a tap on the card doesn't close it
          // via the backdrop click handler above.
          onClick={(e) => e.stopPropagation()}
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 340,
            background: "#fff",
            borderRadius: 18,
            padding: "26px 22px 22px",
            boxShadow: "0 24px 60px rgba(10,15,30,0.35)",
            textAlign: "center",
            animation: "mc-rop-card-rise 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
            overflow: "hidden",
          }}
        >
          {/* Hero — concentric pulsing rings + stroke-drawn check */}
          <div
            style={{
              position: "relative",
              width: 84,
              height: 84,
              margin: "4px auto 14px",
            }}
          >
            {/* Two staggered rings, ok-tone */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 999,
                background: `${MC.ok}33`,
                animation: "mc-rop-ring-pulse 1.6s ease-out infinite",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 999,
                background: `${MC.ok}22`,
                animation:
                  "mc-rop-ring-pulse 1.6s ease-out 350ms infinite",
              }}
            />
            {/* Solid disc */}
            <div
              style={{
                position: "absolute",
                inset: 8,
                borderRadius: 999,
                background: MC.ok,
                boxShadow: `0 10px 24px ${MC.ok}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Stroke-drawn check inside the disc */}
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M4 12l5 5 11-12"
                  style={{
                    strokeDasharray: 30,
                    animation:
                      "mc-rop-check-draw 380ms cubic-bezier(0.6, 0.2, 0.3, 1) 120ms both",
                  }}
                />
              </svg>
            </div>
          </div>

          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 20,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.3,
              animation:
                "mc-rop-text-rise 300ms ease-out 200ms both",
            }}
          >
            Route optimized
          </div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 13.5,
              color: MC.mute,
              marginTop: 6,
              lineHeight: 1.45,
              animation:
                "mc-rop-text-rise 300ms ease-out 280ms both",
            }}
          >
            You&apos;re already on the best path. Nothing to do.
          </div>
          {/* Reassurance line so the rep knows the calm state is
              not "the app stopped checking" — it's "the watcher
              checked and found nothing to act on". Tied to the
              hourly route-improvement-watcher tick. */}
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.hint,
              marginTop: 8,
              lineHeight: 1.45,
              animation:
                "mc-rop-text-rise 300ms ease-out 320ms both",
            }}
          >
            Auto-checked every hour. If a better route opens up,
            we&apos;ll let you know right here.
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: 18,
              padding: "11px 22px",
              background: MC.ok,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontFamily: MC.font,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: -0.05,
              boxShadow: `0 6px 18px ${MC.ok}55`,
              animation:
                "mc-rop-text-rise 300ms ease-out 360ms both",
            }}
          >
            Got it
          </button>

          {/* Subordinate escape hatch — for reps who want to see
              the route map / re-optimise manually despite the
              calm state. */}
          <div
            style={{
              marginTop: 12,
              animation:
                "mc-rop-text-rise 300ms ease-out 440ms both",
            }}
          >
            <Link
              href="/route"
              onClick={onClose}
              style={{
                fontFamily: MC.font,
                fontSize: 12.5,
                color: MC.mute,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Open route anyway
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
