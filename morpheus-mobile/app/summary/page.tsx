"use client";

import { Suspense } from "react";
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
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Shift Complete" />

      <div
        style={{
          padding: "28px 20px 24px",
          background: `linear-gradient(180deg, ${MC.bg} 0%, ${MC.brandTint}55 100%)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            margin: "0 auto",
            background: MC.card,
            border: `1px solid ${MC.brandTint}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 10px 30px ${MC.brand}33`,
          }}
        >
          <Glyph name="check-circle" size={42} color={MC.brand} strokeWidth={1.8} />
        </div>
        <div
          style={{
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
        <div style={{ fontFamily: MC.font, fontSize: 14, color: MC.mute, marginTop: 4 }}>
          {customerName} · {hh > 0 ? `${hh}h ` : ""}
          {mm}m on shift
        </div>
      </div>

      <div style={{ padding: "8px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <SummaryStat
            label="Tasks complete"
            value={`${tasksDone}/${totalTasks}`}
            tone="brand"
            icon="check-circle"
          />
          <SummaryStat label="Breaks taken" value="1" tone="neutral" icon="clock" />
          <SummaryStat label="Travel time" value="—" tone="neutral" icon="pin" />
          <SummaryStat
            label="Exceptions"
            value={`${exceptionCount}`}
            tone={exceptionCount > 0 ? "warn" : "ok"}
            icon="warn"
          />
        </div>
      </div>

      <SectionLabel>Activity timeline</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <div
          style={{
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
          <SectionLabel>Recorded exceptions</SectionLabel>
          <div
            style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}
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
      <div style={{ padding: "8px 16px 0" }}>
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

      <div style={{ padding: "20px 16px 22px" }}>
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
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "brand" | "warn" | "ok" | "neutral";
  icon: GlyphName;
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
      style={{
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
        }}
      >
        {value}
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

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
      {events.map((e, i) => {
        const c = tones[e.tone];
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              position: "relative",
              paddingBottom: i === events.length - 1 ? 0 : 14,
            }}
          >
            <div style={{ width: 18, position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: c,
                  position: "relative",
                  zIndex: 1,
                  margin: "4px auto 0",
                  boxShadow: `0 0 0 3px ${c}22`,
                }}
              />
              {i < events.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    top: 14,
                    bottom: -2,
                    width: 2,
                    background: MC.line,
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
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
