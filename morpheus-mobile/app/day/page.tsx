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

/** 80-particle CSS confetti volley — wide spread, gravity arc,
 *  2.2s lifespan. Brand-aligned palette plus white speckles for
 *  the dark hero backdrop. */
function Confetti({ count = 80 }: { count?: number }) {
  const particles = useMemo(() => {
    const palette = [
      MC.brand,
      MC.brandDeep,
      "#5b3da5",
      "#2E4FB8",
      MC.ok,
      "#E5A017",
      "#ffffff",
      "#ffe7a0",
      MC.brand,
      MC.ok,
    ];
    return Array.from({ length: count }, (_, i) => {
      // Wider angular spread — basically a half-disc upward.
      const angle = (Math.random() * 180 - 165) * (Math.PI / 180);
      const speed = 110 + Math.random() * 220;
      const tx = Math.cos(angle) * speed;
      const ty = Math.sin(angle) * speed;
      const tyFinal = ty + 120 + Math.random() * 90;
      const rot = (Math.random() - 0.5) * 1080;
      const color = palette[i % palette.length];
      const isCircle = Math.random() > 0.5;
      const w = isCircle ? 7 + Math.random() * 5 : 5 + Math.random() * 4;
      const h = isCircle ? w : 10 + Math.random() * 8;
      const delay = Math.random() * 200;
      return { tx, tyFinal, rot, color, w, h, isCircle, delay, key: i };
    });
  }, [count]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: 100,
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
              boxShadow: `0 0 6px ${p.color}99`,
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

        // Haptic pop on data-ready — Android Chrome supports
        // navigator.vibrate, iOS Safari ignores cleanly. The
        // pattern is a quick double-tap + a longer pulse to mirror
        // the hero number landing + the confetti finale. Pure
        // visual additions need a physical kick to feel real on
        // mobile; this is the cheapest way to land that punch.
        try {
          if (
            typeof navigator !== "undefined" &&
            typeof navigator.vibrate === "function" &&
            complete.length > 0
          ) {
            navigator.vibrate([35, 60, 35, 90, 120]);
          }
        } catch {
          /* unsupported */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: MC.bg, minHeight: "100%", overflow: "hidden" }}>
      <style>{`
        /* Cinematic entry — designed to feel like a moment, not a
           transition. Spotify-Wrapped / Apple-Activity energy:
           dark cinematic backdrop, oversized headline number that
           explodes onto screen, animated gradient on the title,
           multiple confetti waves, starburst flare behind the
           number. ~3 second arc end-to-end. */

        /* Number explosion — comes from huge scale, overshoots,
           settles. The bezier here is the secret: high overshoot
           + slight bounce so it lands with WEIGHT. */
        @keyframes dm-hero-num {
          0%   { transform: scale(0.2) rotate(-6deg); opacity: 0; filter: blur(20px); }
          40%  { opacity: 1; filter: blur(0); }
          60%  { transform: scale(1.18) rotate(2deg); }
          80%  { transform: scale(0.96) rotate(-1deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; filter: blur(0); }
        }
        /* Starburst flare — radial gradient that explodes outward
           behind the hero number. Pure CSS, no images. */
        @keyframes dm-starburst {
          0%   { transform: scale(0.3); opacity: 0; }
          30%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        /* Ring shockwave — like Activity ring closing.
           Faster + crisper than the old leisurely pulse. */
        @keyframes dm-shockwave {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(4.2); opacity: 0; }
        }
        /* Animated gradient text — moves a colour wash across
           the headline so it feels alive, not painted on. */
        @keyframes dm-gradient-sweep {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Subtitle drop — comes from below with a slight
           overshoot. */
        @keyframes dm-rise-bouncy {
          0%   { opacity: 0; transform: translateY(28px) scale(.94); }
          70%  { opacity: 1; transform: translateY(-3px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Tile reveals — each tile has a 3D-feel drop with depth
           shadow appearing on land. */
        @keyframes dm-tile-drop {
          0%   { opacity: 0; transform: translateY(40px) rotateX(-12deg); }
          70%  { opacity: 1; transform: translateY(-4px) rotateX(2deg); }
          100% { opacity: 1; transform: translateY(0) rotateX(0); }
        }
        /* Confetti — same physics as before but with a delayed
           second wave that fires from the tile area. */
        @keyframes dm-confetti {
          0%   { opacity: 0; transform: translate(0,0) rotate(0); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); }
        }
        /* Generic fade-up with longer travel for downstream
           content (timeline rows etc.). */
        @keyframes dm-fade-up {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        /* Sub-label characters typing in — adds drama to the
           "DAY COMPLETE" label below the hero number. */
        @keyframes dm-letter-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        .dm-hero-num {
          animation: dm-hero-num .9s cubic-bezier(.18, 1.6, .35, 1) both;
        }
        .dm-starburst {
          animation: dm-starburst 1.1s cubic-bezier(.16, 1, .3, 1) .05s both;
        }
        .dm-shock {
          animation: dm-shockwave 1.4s cubic-bezier(.16, 1, .3, 1) both;
        }
        .dm-shock-2 { animation-delay: .25s; }
        .dm-shock-3 { animation-delay: .5s; }
        .dm-gradient {
          background: linear-gradient(
            90deg,
            #fff 0%,
            ${MC.brand} 25%,
            #fff 50%,
            ${MC.brand} 75%,
            #fff 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: dm-gradient-sweep 3.5s linear infinite;
        }
        .dm-rise { animation: dm-rise-bouncy .7s cubic-bezier(.18, 1.4, .35, 1) both; }
        .dm-tile { animation: dm-tile-drop .65s cubic-bezier(.18, 1.3, .35, 1) both; }
        .dm-confetti-piece { animation: dm-confetti 2.2s cubic-bezier(.22, .61, .36, 1) both; }
        .dm-fade-up { animation: dm-fade-up .5s cubic-bezier(.22, 1, .36, 1) both; }
        .dm-letter {
          display: inline-block;
          animation: dm-letter-in .35s cubic-bezier(.18, 1.4, .35, 1) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .dm-hero-num, .dm-starburst, .dm-shock, .dm-rise,
          .dm-tile, .dm-confetti-piece, .dm-fade-up, .dm-letter,
          .dm-gradient {
            animation: none !important;
            -webkit-text-fill-color: #fff !important;
            background: none !important;
          }
          .dm-confetti-host { display: none; }
        }
      `}</style>

      <AppHeader title="Today's recap" onBack={() => router.push("/")} withMenu />

      {/* Hero stage — dark cinematic backdrop, hero number explodes
          in from huge scale, three shockwave rings expand outward,
          starburst flare blooms behind, 80 confetti particles spray
          on land, animated-gradient "DAY DONE" label below. */}
      <div
        style={{
          padding: "44px 20px 38px",
          background: `radial-gradient(ellipse at 50% 0%, ${MC.brandDeep} 0%, ${MC.ink} 55%, #050912 100%)`,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          minHeight: 320,
        }}
      >
        {/* Big confetti volley — 80 particles, wider spread. */}
        <Confetti count={80} />

        {/* Starburst flare — radial gradient that explodes outward
            behind the hero number. Pure CSS, no images. */}
        <div
          aria-hidden
          className="dm-starburst"
          style={{
            position: "absolute",
            left: "50%",
            top: 90,
            width: 320,
            height: 320,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${MC.brand}cc 0%, ${MC.brand}55 30%, transparent 65%)`,
            pointerEvents: "none",
            filter: "blur(10px)",
          }}
        />

        {/* Three shockwave rings — staggered outward expansion. */}
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`dm-shock dm-shock-${i}`}
            style={{
              position: "absolute",
              left: "50%",
              top: 100,
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: `2px solid ${MC.brand}`,
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          />
        ))}

        {/* HERO NUMBER — the lead stat at obscene size. Drops in
            from blurry scale 0.2, overshoots, settles. */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 200,
          }}
        >
          <div
            className="dm-hero-num"
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 160,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -6,
              color: "#fff",
              textShadow: `0 0 60px ${MC.brand}cc, 0 0 20px ${MC.brand}aa`,
            }}
          >
            {loaded && stats ? stats.shiftsDone : 0}
          </div>
          {/* Letter-typed "SHIFTS COMPLETE" sub-label.
              Each char animates in with a small stagger so it
              reads like it's being printed. */}
          <div
            style={{
              marginTop: 6,
              fontFamily: MC.font,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 6,
              color: `${MC.brand}`,
              textTransform: "uppercase",
              textShadow: `0 0 12px ${MC.brand}88`,
            }}
            aria-label={`${stats?.shiftsDone ?? 0} shifts complete`}
          >
            {"SHIFTS COMPLETE".split("").map((ch, i) => (
              <span
                key={i}
                className="dm-letter"
                style={{ animationDelay: `${0.85 + i * 0.04}s` }}
              >
                {ch === " " ? " " : ch}
              </span>
            ))}
          </div>
        </div>

        {/* Animated-gradient headline. */}
        <div
          className="dm-rise"
          style={{
            animationDelay: "1.3s",
            marginTop: 26,
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            className="dm-gradient"
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: -1.2,
              lineHeight: 1.05,
            }}
          >
            Day done.
          </div>
        </div>
        <div
          className="dm-rise"
          style={{
            animationDelay: "1.5s",
            fontFamily: MC.font,
            fontSize: 15,
            color: "rgba(255,255,255,.75)",
            marginTop: 8,
            position: "relative",
            zIndex: 2,
            fontWeight: 500,
          }}
        >
          {loaded && stats
            ? stats.shiftsDone === 0
              ? "No completed shifts today."
              : `${formatHHMM(stats.hoursSeconds)} on the clock`
            : "Tallying your day…"}
        </div>
      </div>

      {/* Four stat tiles in a 2×2 grid. Each animates in with a
          staggered 3D-feel drop + a count-up inside so the numbers
          feel earned. Delays start at 1.7s so the hero number has
          had its full moment first. */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DayStat
            label="Shifts done"
            tone="brand"
            icon="check-circle"
            countTo={stats?.shiftsDone ?? 0}
            format={(n) => String(n)}
            delay={1700}
          />
          <DayStat
            label="Hours worked"
            tone="ok"
            icon="clock"
            countTo={stats?.hoursSeconds ?? 0}
            format={(s) => formatHHMM(s)}
            delay={1820}
          />
          <DayStat
            label="Tasks completed"
            tone="neutral"
            icon="check"
            countTo={stats?.tasksCompleted ?? 0}
            format={(n) => String(n)}
            delay={1940}
          />
          <DayStat
            label="Travel time"
            tone="travel"
            icon="pin"
            countTo={stats?.travelSeconds ?? 0}
            format={(s) => formatHHMM(s)}
            delay={2060}
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
              animationDelay: "2.3s",
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: MC.hint,
              padding: "22px 16px 8px",
            }}
          >
            Your day
          </div>
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.shifts.map((s, i) => (
              <DayShiftRow key={s.realId} shift={s} delay={2400 + i * 80} />
            ))}
          </div>
        </>
      )}

      {/* Exception count — only when there were any. */}
      {loaded && stats && stats.exceptions > 0 && (
        <div
          className="dm-fade-up"
          style={{
            animationDelay: "2.7s",
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
          animationDelay: "2.9s",
          padding: "24px 16px 32px",
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
    brand: {
      bg: `linear-gradient(135deg, ${MC.brandTint} 0%, #fff 100%)`,
      border: `${MC.brand}55`,
      fg: MC.brandDeep,
      iconBg: MC.brand,
      glow: `${MC.brand}33`,
    },
    ok: {
      bg: `linear-gradient(135deg, ${MC.okTint} 0%, #fff 100%)`,
      border: `${MC.ok}55`,
      fg: "#0d6a45",
      iconBg: MC.ok,
      glow: `${MC.ok}33`,
    },
    neutral: {
      bg: "linear-gradient(135deg, #F4F6F9 0%, #fff 100%)",
      border: MC.line,
      fg: MC.ink,
      iconBg: MC.ink2,
      glow: "rgba(40, 50, 70, .14)",
    },
    travel: {
      bg: "linear-gradient(135deg, #EAEFFA 0%, #fff 100%)",
      border: "#2E4FB855",
      fg: "#1f3a8a",
      iconBg: "#2E4FB8",
      glow: "rgba(46, 79, 184, .26)",
    },
  }[tone];
  return (
    <div
      className="dm-tile"
      style={{
        animationDelay: `${delay}ms`,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 16,
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: `0 10px 28px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,.6)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: palette.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 12px ${palette.glow}`,
        }}
      >
        <Glyph name={icon} size={18} color="#fff" strokeWidth={2.4} />
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.8,
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
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: -0.8,
          color: palette.fg,
          lineHeight: 1,
        }}
      >
        <CountUp to={countTo} delay={delay + 100} duration={1100} format={format} />
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
