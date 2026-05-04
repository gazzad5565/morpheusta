"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { SAMPLE } from "@/lib/mock-data";
import {
  AppHeader,
  AppFooter,
  PrimaryButton,
  SectionLabel,
} from "@/components/Chrome";
import { Glyph, formatTime, type GlyphName } from "@/components/Glyph";

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

  const shift = SAMPLE.shifts[0];
  const tasksDone = 3;
  const totalTasks = 4;
  const totalElapsed = 60 * 47;
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
          {shift.name} · {hh > 0 ? `${hh}h ` : ""}
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

      <div style={{ padding: "20px 16px 22px" }}>
        <PrimaryButton onClick={() => router.push("/")} icon="arrow-r">
          Back to dashboard
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
