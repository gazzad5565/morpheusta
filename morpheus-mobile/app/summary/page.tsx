"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import {
  AppHeader,
  AppFooter,
  PrimaryButton,
  SectionLabel,
} from "@/components/Chrome";
import { Glyph, formatTime, type GlyphName } from "@/components/Glyph";
import { logEvent } from "@/lib/events-store";

const TRAVEL_LS_KEY = "morpheus.travelling_since";
const BREAK_LS_KEY = "morpheus.break_since";

/**
 * Animated number that ticks up from 0 to `to` over `duration` ms,
 * starting after `delay` ms. easeOutCubic for that satisfying tick.
 * Renders a static value (no animation) when prefers-reduced-motion
 * is on. Used by the stat tiles.
 */
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
      // easeOutCubic — fast start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, delay]);
  return <>{format(n)}</>;
}

/**
 * One-shot confetti burst. Particles are pure CSS — each gets its own
 * randomized translation (tx, ty), rotation, colour, and shape via
 * inline style + CSS variables. The keyframes drive everything.
 *
 * Tuned for a B2B work app: 36 particles, brand-aligned palette, ~1.8s
 * lifespan, gentle gravity arc. Not a kids-party explosion.
 *
 * Skipped entirely when prefers-reduced-motion is on.
 */
function Confetti({ count = 36 }: { count?: number }) {
  const particles = useMemo(() => {
    const palette = [
      MC.brand,
      MC.brandDeep,
      "#5b3da5", // purple from break tile
      "#2E4FB8", // blue from travel tile
      MC.ok,
      "#E5A017", // warn yellow
    ];
    return Array.from({ length: count }, (_, i) => {
      // Random angle in the upper hemisphere (-180° to 0° from down,
      // roughly -120° to -60° for an upward burst)
      const angle = (Math.random() * 140 - 110) * (Math.PI / 180);
      const speed = 80 + Math.random() * 140; // distance in px
      const tx = Math.cos(angle) * speed;
      const ty = Math.sin(angle) * speed; // negative = upward
      // Add gravity-ish fall (final ty drifts back down a bit)
      const tyFinal = ty + 60 + Math.random() * 40;
      const rot = (Math.random() - 0.5) * 720; // up to ±360°
      const color = palette[i % palette.length];
      const isCircle = Math.random() > 0.55;
      const w = isCircle ? 6 + Math.random() * 4 : 4 + Math.random() * 4;
      const h = isCircle ? w : 8 + Math.random() * 6;
      const delay = Math.random() * 80; // small jitter
      return { tx, tyFinal, rot, color, w, h, isCircle, delay, key: i };
    });
  }, [count]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: 56, // approx centre of the hero icon
        width: 0,
        height: 0,
        pointerEvents: "none",
        zIndex: 5,
      }}
      className="sm-confetti-host"
    >
      {particles.map((p) => (
        <span
          key={p.key}
          className="sm-confetti-piece"
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

export default function SummaryPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SummaryPage />
    </Suspense>
  );
}

function SummaryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const offsiteReason = params.get("offsiteReason");
  const offsiteNote = params.get("offsiteNote") || "";
  const earlyReason = params.get("earlyReason");
  const earlyNote = params.get("earlyNote") || "";
  // Customer name passed by /check-out so we don't need to refetch the
  // shift here. Falls back to a generic label if missing.
  const customerName = params.get("customer") || "your shift";

  // TODO: thread real per-shift task counts + elapsed through the URL
  // params too. Placeholder values for now (display-only on this
  // post-shift confirmation screen).
  const tasksDone = 0;
  const totalTasks = 0;
  const totalElapsed = 0;
  const hh = Math.floor(totalElapsed / 3600);
  const mm = Math.floor((totalElapsed % 3600) / 60);
  const exceptionCount = (offsiteReason ? 1 : 0) + (earlyReason ? 1 : 0);

  return (
    <div style={{ background: MC.bg, minHeight: "100%", overflow: "hidden" }}>
      {/*
        Cinematic celebration sequence on mount. Six layers, staggered
        into a ~3s arc that pays off the whole shift.

          1. Hero icon            →  bouncy scale-in with overshoot
          2. Three pulsing rings  →  expand outward, fade
          3. Stroke-drawn check   →  draws itself in 380ms
          4. Confetti burst       →  36 brand-coloured particles,
                                      gravity-ish arc, fade out
          5. Title + subtitle     →  fade-up stagger
          6. Stat tiles cascade   →  scale .96→1 + fade up, +
                                      number count-up inside each
          7. Activity timeline    →  vertical line draws downward,
                                      dots pop in as the line passes,
                                      labels fade alongside
          8. Tail content fades   →  exceptions, "What's next", CTA

        prefers-reduced-motion: every animation is disabled and the
        end-state renders instantly. Numbers also short-circuit.
      */}
      <style>{`
        @keyframes sm-pop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sm-ring {
          0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0.65; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        @keyframes sm-draw { to { stroke-dashoffset: 0; } }
        @keyframes sm-fade-up {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes sm-tile {
          0%   { opacity: 0; transform: translateY(14px) scale(.96); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes sm-confetti {
          0%   { opacity: 0; transform: translate(0,0) rotate(0); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); }
        }
        @keyframes sm-line-grow {
          0%   { transform: scaleY(0); transform-origin: top; }
          100% { transform: scaleY(1); transform-origin: top; }
        }
        @keyframes sm-dot-pop {
          0%   { opacity: 0; transform: scale(0); }
          70%  { opacity: 1; transform: scale(1.25); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sm-shimmer {
          0%   { transform: translateX(-120%); opacity: 0; }
          25%  { opacity: .4; }
          100% { transform: translateX(220%); opacity: 0; }
        }
        .sm-stage  { animation: sm-pop .5s cubic-bezier(.34, 1.6, .64, 1) both; }
        .sm-ring   { animation: sm-ring 1.6s cubic-bezier(.16, 1, .3, 1) .15s both; }
        .sm-ring-2 { animation-delay: .4s; }
        .sm-ring-3 { animation-delay: .65s; }
        .sm-check-path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: sm-draw .42s cubic-bezier(.65, 0, .35, 1) .35s both;
        }
        .sm-confetti-piece {
          animation: sm-confetti 1.7s cubic-bezier(.22, .61, .36, 1) both;
        }
        .sm-fade-up { animation: sm-fade-up .5s cubic-bezier(.22, 1, .36, 1) both; }
        .sm-tile    { animation: sm-tile .55s cubic-bezier(.22, 1, .36, 1) both; }
        .sm-shimmer-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(
            105deg,
            transparent 35%,
            rgba(255,255,255,.55) 50%,
            transparent 65%
          );
          mix-blend-mode: overlay;
          pointer-events: none;
          animation: sm-shimmer 1.4s ease-out 1.1s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .sm-stage, .sm-ring, .sm-check-path, .sm-confetti-piece,
          .sm-fade-up, .sm-tile, .sm-shimmer-overlay {
            animation: none !important;
          }
          .sm-check-path { stroke-dashoffset: 0; }
          .sm-confetti-host { display: none; }
        }
      `}</style>

      <AppHeader title="Shift Complete" />

      <div
        style={{
          padding: "28px 20px 24px",
          background: `linear-gradient(180deg, ${MC.bg} 0%, ${MC.brandTint}55 100%)`,
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Confetti — absolutely positioned, fires once on mount */}
        <Confetti />

        {/* Hero icon stage: pulsing rings + bouncy disc + drawn check + shimmer sweep */}
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
              className={`sm-ring sm-ring-${i}`}
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
            className="sm-stage"
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
              <path className="sm-check-path" d="M5 12 L10 17 L19 8" />
            </svg>
            <span className="sm-shimmer-overlay" aria-hidden />
          </div>
        </div>

        <div
          className="sm-fade-up"
          style={{
            animationDelay: ".5s",
            fontFamily: MC.fontDisplay,
            fontSize: 24,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.6,
            marginTop: 14,
          }}
        >
          Checked out
        </div>
        <div
          className="sm-fade-up"
          style={{
            animationDelay: ".62s",
            fontFamily: MC.font,
            fontSize: 14,
            color: MC.mute,
            marginTop: 4,
          }}
        >
          {customerName} · {hh > 0 ? `${hh}h ` : ""}
          {mm}m on shift
        </div>
      </div>

      <div style={{ padding: "8px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SummaryStat
            label="Tasks complete"
            value={`${tasksDone}/${totalTasks}`}
            countTo={tasksDone}
            countFormat={(n) => `${n}/${totalTasks}`}
            tone="brand"
            icon="check-circle"
            delay={780}
          />
          <SummaryStat
            label="Breaks taken"
            value="1"
            countTo={1}
            tone="neutral"
            icon="clock"
            delay={860}
          />
          <SummaryStat
            label="Travel time"
            value="—"
            tone="neutral"
            icon="pin"
            delay={940}
          />
          <SummaryStat
            label="Exceptions"
            value={`${exceptionCount}`}
            countTo={exceptionCount}
            tone={exceptionCount > 0 ? "warn" : "ok"}
            icon="warn"
            delay={1020}
          />
        </div>
      </div>

      <div className="sm-fade-up" style={{ animationDelay: "1.4s" }}>
        <SectionLabel>Activity timeline</SectionLabel>
      </div>
      <div style={{ padding: "0 16px" }}>
        <div
          className="sm-fade-up"
          style={{
            animationDelay: "1.45s",
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: "12px 14px",
          }}
        >
          <Timeline />
        </div>
      </div>

      {(offsiteReason || earlyReason) && (
        <>
          <div className="sm-fade-up" style={{ animationDelay: "2s" }}>
            <SectionLabel>Recorded exceptions</SectionLabel>
          </div>
          <div
            className="sm-fade-up"
            style={{
              animationDelay: "2.05s",
              padding: "0 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {offsiteReason && (
              <ExceptionRow
                title="Not at customer location"
                reason={offsiteReason}
                note={offsiteNote}
                tone="danger"
              />
            )}
            {earlyReason && (
              <ExceptionRow
                title="Early check-out"
                reason={earlyReason}
                note={earlyNote}
                tone="warn"
              />
            )}
          </div>
        </>
      )}

      {/* What's next? — three optional choices, none blocking. The rep
          can ignore them and just hit Back to dashboard. */}
      <div className="sm-fade-up" style={{ animationDelay: "2.25s", padding: "8px 16px 0" }}>
        <SectionLabel>What's next?</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NextActionTile
            icon="pin"
            color="#2E4FB8"
            title="Start travelling"
            sub="Log travel time to your next site. Auto-ends on next check-in."
            onClick={() => {
              const ts = Date.now();
              try {
                window.localStorage.setItem(TRAVEL_LS_KEY, String(ts));
              } catch {
                /* noop */
              }
              void logEvent({
                event_type: "shift.travel_started",
                message: "Started travelling (post-checkout)",
              });
              router.push("/");
            }}
          />
          <NextActionTile
            icon="clock"
            color="#5b3da5"
            title="Take a break"
            sub="Off-shift rest. Logged separately from paid time."
            onClick={() => {
              const ts = Date.now();
              try {
                window.localStorage.setItem(BREAK_LS_KEY, String(ts));
              } catch {
                /* noop */
              }
              void logEvent({
                event_type: "shift.break_started",
                message: "Started a rest break (post-checkout)",
                meta: { kind: "off_shift" },
              });
              router.push("/");
            }}
          />
        </div>
      </div>

      <div
        className="sm-fade-up"
        style={{ animationDelay: "2.5s", padding: "20px 16px 22px" }}
      >
        <PrimaryButton onClick={() => router.push("/")} icon="arrow-r">
          Done — back to dashboard
        </PrimaryButton>
        <div
          style={{
            textAlign: "center",
            marginTop: 12,
            fontFamily: MC.font,
            fontSize: 12,
            color: MC.hint,
          }}
        >
          Synced to server · {formatTime(Date.now())}
        </div>
      </div>

      <AppFooter />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  countTo,
  countFormat,
  tone = "neutral",
  icon,
  delay = 0,
}: {
  label: string;
  /** Static value shown when countTo is missing (e.g. "—" for travel time). */
  value: string;
  /** When supplied, the number ticks up from 0 to this value on mount. */
  countTo?: number;
  /** Formatter for the count-up output, e.g. "5/7". Defaults to plain number. */
  countFormat?: (n: number) => string;
  tone?: "brand" | "warn" | "ok" | "neutral";
  icon: GlyphName;
  /** ms — when this stat starts its tile-pop entrance animation. */
  delay?: number;
}) {
  const tones = {
    brand: { bg: MC.brandTint, fg: MC.brandDeep },
    warn: { bg: MC.warnTint, fg: "#8a5d06" },
    ok: { bg: MC.okTint, fg: "#0d6a45" },
    neutral: { bg: "#EEF0F3", fg: MC.ink2 },
  };
  const t = tones[tone];
  return (
    <div
      className="sm-tile"
      style={{
        animationDelay: `${delay}ms`,
        background: MC.card,
        borderRadius: 14,
        border: `1px solid ${MC.line}`,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: t.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph name={icon} size={14} color={t.fg} />
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11,
            fontWeight: 600,
            color: MC.hint,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 24,
          fontWeight: 700,
          color: MC.ink,
          letterSpacing: -0.6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {countTo !== undefined ? (
          <CountUp
            to={countTo}
            duration={900}
            delay={delay + 200}
            format={countFormat}
          />
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function Timeline() {
  const start = Date.now() - 60 * 60 * 1000;
  const events = [
    { ts: start, label: "Checked in", tone: "brand" as const },
    { ts: start + 60_000 * 5, label: "Started Compulsory Standard Task", tone: "neutral" as const },
    { ts: start + 60_000 * 12, label: "Completed Compulsory Standard Task", tone: "ok" as const },
    { ts: start + 60_000 * 26, label: "30 Minute Lunch", tone: "neutral" as const },
    { ts: start + 60_000 * 47, label: "Checked out · 3 km away", tone: "warn" as const },
  ];
  const tones = {
    brand: MC.brand,
    ok: MC.ok,
    warn: MC.warn,
    neutral: MC.hint,
  };

  // The connecting vertical line draws downward over a single duration;
  // each dot + label pops in as the line "reaches" it. The base delay
  // syncs with the parent fade-up at 1.45s so the line starts drawing
  // just after the timeline card has finished sliding in.
  const BASE_DELAY = 1500;
  const PER_ITEM = 220;
  const totalDuration = (events.length - 1) * PER_ITEM + 280;

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
      {events.map((e, i) => {
        const c = tones[e.tone];
        const dotDelay = BASE_DELAY + i * PER_ITEM;
        const isLast = i === events.length - 1;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              position: "relative",
              paddingBottom: isLast ? 0 : 14,
            }}
          >
            <div style={{ width: 18, position: "relative", flexShrink: 0 }}>
              {/* Dot pops in at the moment the line "arrives" */}
              <div
                className="sm-dot"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: c,
                  position: "relative",
                  zIndex: 1,
                  margin: "4px auto 0",
                  boxShadow: `0 0 0 3px ${c}22`,
                  animation: `sm-dot-pop .42s cubic-bezier(.34, 1.6, .64, 1) ${dotDelay}ms both`,
                }}
              />
              {/* Connecting line — grows from 0 to full height. The
                  duration scales by item index so each segment lasts
                  PER_ITEM ms and the dots keep pace. */}
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    top: 14,
                    bottom: -2,
                    width: 2,
                    background: MC.line,
                    transformOrigin: "top",
                    animation: `sm-line-grow ${PER_ITEM}ms cubic-bezier(.4, 0, .2, 1) ${
                      dotDelay + 120
                    }ms both`,
                  }}
                />
              )}
            </div>
            <div
              className="sm-fade-up"
              style={{
                animationDelay: `${dotDelay + 60}ms`,
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: MC.ink,
                  letterSpacing: -0.1,
                }}
              >
                {e.label}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 11.5,
                  color: MC.hint,
                  marginTop: 1,
                }}
              >
                {formatTime(e.ts)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExceptionRow({
  title,
  reason,
  note,
  tone,
}: {
  title: string;
  reason: string;
  note?: string;
  tone: "danger" | "warn";
}) {
  const tones = {
    danger: { bg: MC.dangerTint, fg: "#9c1a3c", icon: "pin" as GlyphName },
    warn: { bg: MC.warnTint, fg: "#8a5d06", icon: "clock" as GlyphName },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        background: MC.card,
        borderRadius: 14,
        border: `1px solid ${MC.line}`,
        padding: 12,
        display: "flex",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: t.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={t.icon} size={16} color={t.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11,
            fontWeight: 600,
            color: MC.hint,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: MC.ink,
            marginTop: 2,
          }}
        >
          {reason}
        </div>
        {note && (
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            &ldquo;{note}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact tile for the post-checkout "What's next?" choices. Drops a
 * coloured glyph + title + sublabel into a tappable row. Mirrors the
 * dashboard's BreakCard idle state visually so the rep recognises
 * the affordance.
 */
function NextActionTile({
  icon,
  color,
  title,
  sub,
  onClick,
}: {
  icon: GlyphName;
  color: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: MC.radiusCard,
        padding: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${color}1f`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={icon} size={20} color={color} strokeWidth={2.2} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14.5,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12,
            color: MC.mute,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      </div>
      <Glyph name="chev-r" size={16} color={MC.hint} />
    </button>
  );
}
