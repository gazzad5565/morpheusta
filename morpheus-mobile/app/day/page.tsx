"use client";

/**
 * /day — End-of-day summary.
 *
 * Reached from the home dashboard's "All shifts done — nice work"
 * card once every shift today is in a terminal state (complete +
 * cancelled). Replaces the per-shift /summary page we deleted on
 * May 12 — that one fired after EVERY check-out which was too much.
 * This one fires at most once per day, when the work's actually
 * done, and gives the rep a payoff: a cinematic celebration plus a
 * clean recap of everything they did.
 *
 * Reuses the same animation grammar as the late-version /summary
 * (rings + bouncy stage + drawn check + 36-particle confetti, fade-
 * up cascade for the tiles + timeline). The CountUp + Confetti
 * helpers are inlined here rather than imported — they're cheap,
 * lifetime-bound to this page, and keeping them local means /day
 * has no cross-page coupling.
 *
 * Data sources (all client-side queries against existing schema —
 * no new tables):
 *   - shifts (complete state, today, current rep)            → shifts done + hours worked
 *   - shift_task_completions (joined by shift_id)            → tasks completed
 *   - shift_events (travel_started / travel_ended pairs)     → travel time
 *
 * Cross-platform: pure React + Supabase + CSS — same on iOS Safari /
 * PWA, Android Chrome / PWA, desktop.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter, CustomerTile } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { listMyShiftsToday, type ShiftWithMeta } from "@/lib/shifts-store";

// ---------------------------------------------------------------------------
// Helpers — kept inline to keep the page self-contained.
// ---------------------------------------------------------------------------

/** Count-up number animation. easeOutCubic; skips entirely when
 *  prefers-reduced-motion is on. */
function CountUp({
  to,
  duration = 900,
  delay = 0,
  format = (n: number) => String(n),
}: {
  to: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setN(to);
      return;
    }
    let raf = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, delay]);
  return <>{format(n)}</>;
}

/** 36-particle CSS confetti burst — gravity arc, 1.7s lifespan. */
function Confetti({ count = 36 }: { count?: number }) {
  const particles = useMemo(() => {
    const palette = [
      MC.brand,
      MC.brandDeep,
      "#5b3da5",
      "#2E4FB8",
      MC.ok,
      "#E5A017",
    ];
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.random() * 140 - 110) * (Math.PI / 180);
      const speed = 80 + Math.random() * 140;
      const tx = Math.cos(angle) * speed;
      const ty = Math.sin(angle) * speed;
      const tyFinal = ty + 60 + Math.random() * 40;
      const rot = (Math.random() - 0.5) * 720;
      const color = palette[i % palette.length];
      const isCircle = Math.random() > 0.55;
      const w = isCircle ? 6 + Math.random() * 4 : 4 + Math.random() * 4;
      const h = isCircle ? w : 8 + Math.random() * 6;
      const delay = Math.random() * 80;
      return { tx, tyFinal, rot, color, w, h, isCircle, delay, key: i };
    });
  }, [count]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: 56,
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 5,
      }}
      className="dm-confetti-host"
    >
      {particles.map((p) => (
        <span
          key={p.key}
          className="dm-confetti-piece"
          style={
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: p.w,
              height: p.h,
              borderRadius: p.isCircle ? "50%" : 2,
              background: p.color,
              opacity: 0,
              ["--tx" as never]: `${p.tx}px`,
              ["--ty" as never]: `${p.tyFinal}px`,
              ["--rot" as never]: `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** "7h 24m" / "45m" — friendly duration formatter. Floors seconds. */
function formatHHMM(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Pair up travel_started / travel_ended events (sorted by created_at)
 *  and sum their durations. Unpaired starts are clamped to "now" so a
 *  rep who forgot to end-travel still shows something sensible. */
function sumTravelSeconds(
  events: { event_type: string; created_at: string }[]
): number {
  const sorted = [...events]
    .filter(
      (e) =>
        e.event_type === "shift.travel_started" ||
        e.event_type === "shift.travel_ended"
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  let total = 0;
  let openStart: number | null = null;
  for (const e of sorted) {
    const t = new Date(e.created_at).getTime();
    if (e.event_type === "shift.travel_started") {
      openStart = t;
    } else if (e.event_type === "shift.travel_ended" && openStart != null) {
      total += (t - openStart) / 1000;
      openStart = null;
    }
  }
  // Unclosed leg — count up to now so the rep sees their effort, but
  // capped to 8 hours to avoid an obviously-broken huge number when an
  // event log is malformed.
  if (openStart != null) {
    const tail = Math.min((Date.now() - openStart) / 1000, 8 * 3600);
    total += Math.max(0, tail);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface DayStats {
  shiftsDone: number;
  hoursSeconds: number;
  tasksCompleted: number;
  travelSeconds: number;
  exceptions: number;
  shifts: ShiftWithMeta[];
}

export default function DayPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Today's shifts for the current rep.
      const all = await listMyShiftsToday();
      const complete = all.filter((s) => s.state === "complete");
      const shiftIds = complete.map((s) => s.realId);

      // No work today → render a calm empty state. (Reached only if
      // someone navigates to /day directly with no completed work,
      // since the home tap target is gated on allDone.)
      if (shiftIds.length === 0) {
        if (!cancelled) {
          setStats({
            shiftsDone: 0,
            hoursSeconds: 0,
            tasksCompleted: 0,
            travelSeconds: 0,
            exceptions: 0,
            shifts: [],
          });
          setLoaded(true);
        }
        return;
      }

      // 2. Hours worked — sum check_in_at → check_out_at for every
      //    complete shift. Rows missing either timestamp contribute 0.
      let hoursSeconds = 0;
      for (const s of complete) {
        if (!s.checkInAt) continue;
        const inMs = new Date(s.checkInAt).getTime();
        // ShiftWithMeta exposes checkOutAt on some flows; falls back
        // to fetching from the row directly for safety.
        const outIso =
          (s as ShiftWithMeta & { checkOutAt?: string | null }).checkOutAt ?? null;
        const outMs = outIso ? new Date(outIso).getTime() : NaN;
        if (Number.isFinite(inMs) && Number.isFinite(outMs) && outMs > inMs) {
          hoursSeconds += (outMs - inMs) / 1000;
        }
      }

      // 3. Tasks completed + 4. travel time + 5. exceptions — all from
      //    one supabase round-trip each, batched across shift IDs.
      let tasksCompleted = 0;
      let travelSeconds = 0;
      let exceptions = 0;
      if (isSupabaseConfigured() && supabase) {
        const [taskRes, eventRes] = await Promise.all([
          supabase
            .from("shift_task_completions")
            .select("shift_id, task_id")
            .in("shift_id", shiftIds),
          supabase
            .from("shift_events")
            .select("event_type, created_at, shift_id")
            .in("shift_id", shiftIds),
        ]);
        if (!taskRes.error && taskRes.data) {
          tasksCompleted = taskRes.data.length;
        }
        if (!eventRes.error && eventRes.data) {
          travelSeconds = sumTravelSeconds(
            eventRes.data as { event_type: string; created_at: string }[]
          );
          exceptions = eventRes.data.filter((e) =>
            [
              "shift.checked_in_offsite",
              "shift.checked_in_late",
              "shift.checked_in_early",
              "shift.checked_out_offsite",
              "shift.checked_out_early",
              "shift.rep_unable_to_attend",
            ].includes(e.event_type as string)
          ).length;
        }
      }

      if (!cancelled) {
        setStats({
          shiftsDone: complete.length,
          hoursSeconds,
          tasksCompleted,
          travelSeconds,
          exceptions,
          shifts: complete,
        });
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: MC.bg, minHeight: "100%", overflow: "hidden" }}>
      <style>{`
        /* Cinematic entry — same grammar as the deleted /summary so
           the visual language is consistent if reps see the old
           wrap-up overlay then land here. */
        @keyframes dm-pop {
          0%   { transform: scale(0);   opacity: 0; }
          60%  { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes dm-ring {
          0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0.65; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        @keyframes dm-draw { to { stroke-dashoffset: 0; } }
        @keyframes dm-fade-up {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes dm-tile {
          0%   { opacity: 0; transform: translateY(14px) scale(.96); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes dm-confetti {
          0%   { opacity: 0; transform: translate(0,0) rotate(0); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); }
        }
        @keyframes dm-shimmer {
          0%   { transform: translateX(-120%); opacity: 0; }
          25%  { opacity: .4; }
          100% { transform: translateX(220%); opacity: 0; }
        }
        .dm-stage   { animation: dm-pop .5s cubic-bezier(.34, 1.6, .64, 1) both; }
        .dm-ring    { animation: dm-ring 1.6s cubic-bezier(.16, 1, .3, 1) .15s both; }
        .dm-ring-2  { animation-delay: .4s; }
        .dm-ring-3  { animation-delay: .65s; }
        .dm-check-path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: dm-draw .42s cubic-bezier(.65, 0, .35, 1) .35s both;
        }
        .dm-confetti-piece { animation: dm-confetti 1.7s cubic-bezier(.22, .61, .36, 1) both; }
        .dm-fade-up { animation: dm-fade-up .5s cubic-bezier(.22, 1, .36, 1) both; }
        .dm-tile    { animation: dm-tile .55s cubic-bezier(.22, 1, .36, 1) both; }
        .dm-shimmer {
          position: absolute; inset: 0;
          background: linear-gradient(
            105deg,
            transparent 35%,
            rgba(255,255,255,.55) 50%,
            transparent 65%
          );
          mix-blend-mode: overlay;
          pointer-events: none;
          animation: dm-shimmer 1.4s ease-out 1.1s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .dm-stage, .dm-ring, .dm-check-path, .dm-confetti-piece,
          .dm-fade-up, .dm-tile, .dm-shimmer {
            animation: none !important;
          }
          .dm-check-path { stroke-dashoffset: 0; }
          .dm-confetti-host { display: none; }
        }
      `}</style>

      <AppHeader title="Today's recap" onBack={() => router.push("/")} withMenu />

      {/* Hero stage — rings, bouncy disc, drawn check, confetti, headline */}
      <div
        style={{
          padding: "28px 20px 20px",
          background: `linear-gradient(180deg, ${MC.bg} 0%, ${MC.brandTint}55 100%)`,
          textAlign: "center",
          position: "relative",
        }}
      >
        <Confetti />
        <div
          style={{
            position: "relative",
            width: 120,
            height: 120,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`dm-ring dm-ring-${i}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `2px solid ${MC.brand}`,
                pointerEvents: "none",
              }}
              aria-hidden
            />
          ))}
          <div
            className="dm-stage"
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              background: MC.card,
              border: `1px solid ${MC.brandTint}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 10px 30px ${MC.brand}33`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <svg
              width={42}
              height={42}
              viewBox="0 0 24 24"
              fill="none"
              stroke={MC.brand}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx={12} cy={12} r={10} opacity={0.18} />
              <path className="dm-check-path" d="M5 12 L10 17 L19 8" />
            </svg>
            <span className="dm-shimmer" aria-hidden />
          </div>
        </div>

        <div
          className="dm-fade-up"
          style={{
            animationDelay: ".5s",
            fontFamily: MC.fontDisplay,
            fontSize: 26,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.6,
            marginTop: 14,
          }}
        >
          Day done
        </div>
        <div
          className="dm-fade-up"
          style={{
            animationDelay: ".62s",
            fontFamily: MC.font,
            fontSize: 14,
            color: MC.mute,
            marginTop: 4,
          }}
        >
          {loaded && stats
            ? stats.shiftsDone === 0
              ? "No completed shifts today."
              : `${stats.shiftsDone} ${stats.shiftsDone === 1 ? "stop" : "stops"} visited · ${formatHHMM(stats.hoursSeconds)} on the clock`
            : "Tallying your day…"}
        </div>
      </div>

      {/* Four stat tiles in a 2×2 grid. Each animates in with a small
          stagger + a count-up inside so the numbers feel earned. */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DayStat
            label="Shifts done"
            tone="brand"
            icon="check-circle"
            countTo={stats?.shiftsDone ?? 0}
            format={(n) => String(n)}
            delay={780}
          />
          <DayStat
            label="Hours worked"
            tone="ok"
            icon="clock"
            countTo={stats?.hoursSeconds ?? 0}
            format={(s) => formatHHMM(s)}
            delay={860}
          />
          <DayStat
            label="Tasks completed"
            tone="neutral"
            icon="check"
            countTo={stats?.tasksCompleted ?? 0}
            format={(n) => String(n)}
            delay={940}
          />
          <DayStat
            label="Travel time"
            tone="travel"
            icon="pin"
            countTo={stats?.travelSeconds ?? 0}
            format={(s) => formatHHMM(s)}
            delay={1020}
          />
        </div>
      </div>

      {/* Per-stop timeline — gives the day texture. Each row is a
          completed shift with the customer logo, the check-in /
          check-out window, and an exception flag if relevant. */}
      {loaded && stats && stats.shifts.length > 0 && (
        <>
          <div
            className="dm-fade-up"
            style={{
              animationDelay: "1.3s",
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: MC.hint,
              padding: "18px 16px 8px",
            }}
          >
            Your day
          </div>
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.shifts.map((s, i) => (
              <DayShiftRow key={s.realId} shift={s} delay={1350 + i * 60} />
            ))}
          </div>
        </>
      )}

      {/* Exception count — only when there were any. */}
      {loaded && stats && stats.exceptions > 0 && (
        <div
          className="dm-fade-up"
          style={{
            animationDelay: "1.7s",
            margin: "18px 16px 0",
            padding: "10px 12px",
            borderRadius: 12,
            background: MC.warnTint,
            border: `1px solid ${MC.warn}33`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: MC.font,
            fontSize: 13,
            color: "#7A560A",
          }}
        >
          <Glyph name="warn" size={16} color={MC.warn} strokeWidth={2.2} />
          <span>
            <b>{stats.exceptions}</b> exception
            {stats.exceptions === 1 ? "" : "s"} logged today — your manager
            will see them in the Live feed.
          </span>
        </div>
      )}

      {/* Footer CTA — single low-friction return. The rep got their
          payoff; don't litter the page with secondary actions. */}
      <div
        className="dm-fade-up"
        style={{
          animationDelay: "1.9s",
          padding: "20px 16px 28px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 22px",
            borderRadius: 999,
            background: MC.ink,
            color: "#fff",
            textDecoration: "none",
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: -0.1,
            boxShadow: `0 10px 24px ${MC.ink}33`,
          }}
        >
          <Glyph name="arrow-r" size={15} color="#fff" strokeWidth={2.4} />
          Back to dashboard
        </Link>
      </div>

      <AppFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DayStat({
  label,
  tone,
  icon,
  countTo,
  format,
  delay,
}: {
  label: string;
  tone: "brand" | "ok" | "neutral" | "travel";
  icon: GlyphName;
  countTo: number;
  format: (n: number) => string;
  delay: number;
}) {
  const palette = {
    brand: { bg: MC.brandTint, border: `${MC.brand}33`, fg: MC.brandDeep, iconBg: MC.brand },
    ok: { bg: MC.okTint, border: `${MC.ok}33`, fg: "#0d6a45", iconBg: MC.ok },
    neutral: { bg: "#F4F6F9", border: MC.line, fg: MC.ink, iconBg: MC.ink2 },
    travel: { bg: "#EAEFFA", border: "#2E4FB833", fg: "#1f3a8a", iconBg: "#2E4FB8" },
  }[tone];
  return (
    <div
      className="dm-tile"
      style={{
        animationDelay: `${delay}ms`,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: palette.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Glyph name={icon} size={16} color="#fff" strokeWidth={2.4} />
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: palette.fg,
          opacity: 0.7,
          marginTop: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.4,
          color: palette.fg,
        }}
      >
        <CountUp to={countTo} delay={delay + 50} format={format} />
      </div>
    </div>
  );
}

function DayShiftRow({ shift, delay }: { shift: ShiftWithMeta; delay: number }) {
  const checkIn = shift.checkInAt ? new Date(shift.checkInAt) : null;
  const checkOut =
    (shift as ShiftWithMeta & { checkOutAt?: string | null }).checkOutAt;
  const checkOutDate = checkOut ? new Date(checkOut) : null;
  const formatClock = (d: Date) =>
    d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  return (
    <div
      className="dm-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 14,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <CustomerTile
        initials={shift.initials}
        color={shift.color}
        size={42}
        logoUrl={shift.logoUrl}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shift.name}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12,
            color: MC.mute,
            marginTop: 2,
          }}
        >
          {checkIn && checkOutDate
            ? `${formatClock(checkIn)} → ${formatClock(checkOutDate)}`
            : checkIn
            ? `Checked in ${formatClock(checkIn)}`
            : "—"}
        </div>
      </div>
      <Glyph name="check-circle" size={20} color={MC.ok} strokeWidth={2.2} />
    </div>
  );
}
