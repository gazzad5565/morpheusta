"use client";

/**
 * CheckingInOverlay — full-screen "we're checking you in" moment.
 *
 * Sits on top of the check-in form when the rep taps Confirm /
 * Proceed. Replaces the previous behaviour where the button just
 * changed text to "Checking in…" and the page sat still for a few
 * seconds. Now the rep sees a clear, confident animation tied to
 * the brand: glowing pulse rings, the customer's name, and a small
 * step-tracker that animates forward as the events log.
 *
 * Three "phases" — driven by props from the parent so the parent
 * stays the source of truth on what actually happened:
 *
 *   "submitting"  → primary write (checkInToShift) is in flight
 *   "logging"     → exception events being written
 *   "done"        → all writes confirmed; about to route
 *
 * The parent navigates away once the success URL is built; this
 * component just shows the user that something good is happening
 * while it does. If the parent never reaches "done" (e.g. an alert
 * fires), it simply unmounts the overlay and the user falls back to
 * the form.
 */

import { useEffect, useState } from "react";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";

export type CheckInPhase = "submitting" | "logging" | "done";

export function CheckingInOverlay({
  customerName,
  phase,
}: {
  customerName: string;
  phase: CheckInPhase;
}) {
  // Map phase → step index so the stepper highlights deterministic
  // milestones. We also bump a low-frequency tick so the elapsed
  // time crawls visibly even when phases stall on slow networks.
  const stepIndex = phase === "submitting" ? 0 : phase === "logging" ? 1 : 2;
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setTickMs(Date.now() - start), 100);
    return () => window.clearInterval(t);
  }, []);

  const headline =
    phase === "done"
      ? "You're checked in!"
      : phase === "logging"
      ? "Logging the details…"
      : "Checking you in";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${headline} at ${customerName}`}
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(ellipse at center, rgba(255,255,255,.97) 0%, rgba(243,250,253,.97) 60%, rgba(227,246,251,.95) 100%)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 28px",
        animation: "mc-fadein .25s ease both",
      }}
    >
      {/* Brand circle with pulsing rings.
          Two rings, staggered by 750ms so they leapfrog outward and
          the visual never has a "rest" frame. */}
      <div
        style={{
          position: "relative",
          width: 120,
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `${MC.brand}33`,
            animation: "mc-ring-pulse 1.6s ease-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `${MC.brand}22`,
            animation: "mc-ring-pulse 1.6s ease-out infinite",
            animationDelay: ".75s",
          }}
        />
        <div
          style={{
            position: "relative",
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${MC.brand} 0%, ${MC.brandDeep} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 18px 40px ${MC.brand}55, inset 0 -8px 16px rgba(0,0,0,.08)`,
          }}
        >
          <Glyph
            name={phase === "done" ? "check" : "pin"}
            size={42}
            color="#fff"
            strokeWidth={2.6}
          />
        </div>
      </div>

      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 22,
          fontWeight: 700,
          color: MC.ink,
          letterSpacing: -0.4,
          marginBottom: 6,
          textAlign: "center",
          animation: "mc-rise .35s ease both",
        }}
        // re-trigger the rise animation each phase change for a
        // subtle handoff between headline copy.
        key={phase}
      >
        {headline}
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.mute,
          marginBottom: 24,
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 1.45,
        }}
      >
        {phase === "done" ? (
          <>You&apos;re on the clock at <b style={{ color: MC.ink }}>{customerName}</b>.</>
        ) : (
          <>
            Locking in your shift at{" "}
            <b style={{ color: MC.ink }}>{customerName}</b>…
          </>
        )}
      </div>

      {/* Progress bar — visual filler that maps roughly to phase.
          Width inferred from stepIndex so a slow logging phase still
          shows ~66% filled rather than "stuck". */}
      <div
        style={{
          width: "100%",
          maxWidth: 280,
          height: 6,
          borderRadius: 99,
          background: `${MC.brand}22`,
          overflow: "hidden",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${[40, 75, 100][stepIndex]}%`,
            background: `linear-gradient(90deg, ${MC.brand} 0%, ${MC.brandDeep} 100%)`,
            borderRadius: 99,
            transition: "width .5s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </div>

      {/* Stepper — 3 dots labelled "Saving", "Logging", "Done".
          The active dot pulses; completed dots tick. */}
      <div
        style={{
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
          justifyContent: "center",
          fontFamily: MC.font,
        }}
      >
        <Step label="Saving" active={stepIndex === 0} done={stepIndex > 0} />
        <Step label="Logging" active={stepIndex === 1} done={stepIndex > 1} />
        <Step label="Ready" active={stepIndex === 2} done={false} />
      </div>

      {/* Tiny elapsed counter so the rep sees forward motion even on
          a slow network where phases stall for a couple seconds. */}
      <div
        style={{
          marginTop: 22,
          fontFamily: MC.font,
          fontSize: 11.5,
          color: MC.hint,
          letterSpacing: 0.4,
        }}
      >
        {(tickMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}

function Step({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        minWidth: 64,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: done ? MC.brand : active ? "#fff" : MC.bg,
          border: `2px solid ${done || active ? MC.brand : MC.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transition: "all .25s ease",
        }}
      >
        {done && (
          <Glyph name="check" size={10} color="#fff" strokeWidth={3.2} />
        )}
        {active && (
          <span
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: "50%",
              border: `2px solid ${MC.brand}`,
              animation: "mc-pulse 1.4s ease-out infinite",
            }}
          />
        )}
      </div>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: done || active ? MC.brandInk : MC.hint,
          transition: "color .25s ease",
        }}
      >
        {label}
      </span>
    </div>
  );
}
