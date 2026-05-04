"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { SAMPLE, ACTIVE_SAMPLE_TASKS } from "@/lib/mock-data";
import {
  AppHeader,
  AppFooter,
  CustomerTile,
  PrimaryButton,
  ReasonChip,
  SectionLabel,
} from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";

const OFFSITE_REASONS = [
  "Wrong location pinned",
  "Customer's not on site",
  "Working remotely",
  "Other",
];
const EARLY_REASONS = [
  "All tasks complete",
  "Customer asked me to leave",
  "Emergency",
  "Sick / not feeling well",
  "Other",
];

export default function CheckOutPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CheckOutPage />
    </Suspense>
  );
}

function CheckOutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const shift = SAMPLE.shifts[0];

  // Read completed task IDs from URL (set by /active page on Check Out tap).
  const completedIds = (params.get("completed") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const compulsoryTasks = ACTIVE_SAMPLE_TASKS.filter((t) => t.compulsory);
  const compulsoryRemaining = compulsoryTasks.filter(
    (t) => !completedIds.includes(t.id)
  );
  const compulsoryDone = compulsoryRemaining.length === 0;

  const [offsiteReason, setOffsiteReason] = useState<string | null>(null);
  const [offsiteNote, setOffsiteNote] = useState("");
  const [earlyReason, setEarlyReason] = useState<string | null>(null);
  const [earlyNote, setEarlyNote] = useState("");
  const [offsiteOpen, setOffsiteOpen] = useState(true);
  const [earlyOpen, setEarlyOpen] = useState(true);

  const offsiteResolved = !!offsiteReason;
  const earlyResolved = !!earlyReason;
  const canProceed = compulsoryDone && offsiteResolved && earlyResolved;

  const onProceed = () => {
    const params = new URLSearchParams({
      offsiteReason: offsiteReason!,
      offsiteNote,
      earlyReason: earlyReason!,
      earlyNote,
    });
    router.push(`/summary?${params.toString()}`);
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Check Out" onBack={() => router.back()} />

      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <CustomerTile initials={shift.initials} color={shift.color} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: MC.hint,
              }}
            >
              Checking out of
            </div>
            <div
              style={{
                fontFamily: MC.fontDisplay,
                fontSize: 17,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.3,
              }}
            >
              {shift.name}
            </div>
          </div>
        </div>
      </div>

      {/* Compulsory blocker — prevents check-out until all required tasks are done */}
      {!compulsoryDone && (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              background: "#FFF6F2",
              border: "1px solid #FBD0BD",
              borderRadius: MC.radiusCard,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#FBD0BD",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Glyph name="warn" size={18} color="#9c3a17" strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#7a2d11",
                  letterSpacing: -0.1,
                }}
              >
                Compulsory tasks not complete
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 13,
                  color: "#9c4a2c",
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                Finish all required tasks before checking out.{" "}
                <b>{compulsoryRemaining.length} remaining:</b>{" "}
                {compulsoryRemaining.map((t) => t.name).join(", ")}.
              </div>
              <button
                type="button"
                onClick={() => router.push("/active")}
                style={{
                  marginTop: 10,
                  background: "#9c3a17",
                  color: "#fff",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: MC.font,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Glyph name="chev-l" size={14} color="#fff" strokeWidth={2.4} />
                Back to tasks
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "12px 16px 0" }}>
        <FauxMap pinColor={shift.color} />
        <div
          style={{
            marginTop: 8,
            fontFamily: MC.font,
            fontSize: 12.5,
            color: MC.mute,
            padding: "0 4px",
          }}
        >
          You&apos;re checking out <b style={{ color: MC.ink }}>3 km</b> away from {shift.name}&apos;s
          location.
        </div>
      </div>

      <SectionLabel>Exceptions to resolve</SectionLabel>

      <div style={{ padding: "0 16px" }}>
        <ExceptionBlock
          tone="danger"
          icon="pin"
          title="Not at customer location"
          subtitle="3 km away from check-out"
          resolved={offsiteResolved}
          resolvedSummary={offsiteResolved ? offsiteReason : null}
          open={offsiteOpen}
          onToggle={() => setOffsiteOpen((o) => !o)}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OFFSITE_REASONS.map((r) => (
              <ReasonChip
                key={r}
                label={r}
                selected={offsiteReason === r}
                onClick={() => setOffsiteReason(r)}
              />
            ))}
          </div>
          <NoteField
            value={offsiteNote}
            onChange={setOffsiteNote}
            placeholder="Add a note (optional)"
          />
        </ExceptionBlock>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <ExceptionBlock
          tone="warn"
          icon="clock"
          title="Early check-out"
          subtitle="5h 47m before your scheduled end (05:00 PM)"
          resolved={earlyResolved}
          resolvedSummary={earlyResolved ? earlyReason : null}
          open={earlyOpen}
          onToggle={() => setEarlyOpen((o) => !o)}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EARLY_REASONS.map((r) => (
              <ReasonChip
                key={r}
                label={r}
                selected={earlyReason === r}
                onClick={() => setEarlyReason(r)}
              />
            ))}
          </div>
          <NoteField
            value={earlyNote}
            onChange={setEarlyNote}
            placeholder="Add a note (optional)"
          />
        </ExceptionBlock>
      </div>

      <div style={{ padding: "18px 16px 22px" }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12,
            color: MC.hint,
            textAlign: "right",
            marginBottom: 8,
          }}
        >
          {[offsiteResolved, earlyResolved].filter(Boolean).length}/2 resolved
          {!compulsoryDone && ` · ${compulsoryRemaining.length} task${compulsoryRemaining.length === 1 ? "" : "s"} pending`}
        </div>
        <PrimaryButton
          disabled={!canProceed}
          onClick={canProceed ? onProceed : undefined}
          icon={canProceed ? "arrow-r" : null}
        >
          {canProceed
            ? "Confirm check-out"
            : !compulsoryDone
            ? "Complete tasks first"
            : "Resolve to continue"}
        </PrimaryButton>
      </div>

      <AppFooter />
    </div>
  );
}

function ExceptionBlock({
  tone,
  icon,
  title,
  subtitle,
  children,
  resolved,
  resolvedSummary,
  open,
  onToggle,
}: {
  tone: "danger" | "warn";
  icon: GlyphName;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  resolved: boolean;
  resolvedSummary: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const tones = {
    danger: { bg: MC.dangerTint, fg: "#9c1a3c" },
    warn: { bg: MC.warnTint, fg: "#8a5d06" },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        background: MC.card,
        borderRadius: MC.radiusCard,
        border: `1px solid ${resolved ? MC.okTint : MC.line}`,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "14px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: resolved ? MC.okTint : t.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Glyph
            name={resolved ? "check" : icon}
            size={18}
            color={resolved ? "#0d6a45" : t.fg}
            strokeWidth={2.2}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 14.5,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.1,
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
            }}
          >
            {resolvedSummary || subtitle}
          </div>
        </div>
        <Glyph name={open ? "chev-u" : "chev-d"} size={18} color={MC.hint} />
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${MC.line}` }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        style={{
          width: "100%",
          resize: "none",
          border: `1px solid ${MC.line}`,
          borderRadius: 12,
          padding: "10px 12px",
          fontFamily: MC.font,
          fontSize: 13.5,
          color: MC.ink,
          background: MC.bg,
          outline: "none",
        }}
      />
    </div>
  );
}

function FauxMap({ pinColor = MC.brand }: { pinColor?: string }) {
  return (
    <div
      style={{
        height: 160,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${MC.line}`,
        background: "linear-gradient(180deg, #DCEBEE 0%, #E5EFE3 100%)",
        position: "relative",
      }}
    >
      <svg
        viewBox="0 0 400 160"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        preserveAspectRatio="none"
      >
        <path
          d="M0,90 C80,80 160,120 240,100 S380,70 400,90"
          stroke="#fff"
          strokeWidth="6"
          fill="none"
          opacity=".9"
        />
        <path d="M40,0 L80,160" stroke="#fff" strokeWidth="3" fill="none" opacity=".7" />
        <path d="M280,0 L320,160" stroke="#fff" strokeWidth="3" fill="none" opacity=".7" />
        <circle cx="180" cy="60" r="22" fill="#9DC59A" opacity=".5" />
        <circle cx="100" cy="120" r="14" fill="#9DC59A" opacity=".5" />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 36,
          left: "34%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "4px 8px",
            background: pinColor,
            color: "#fff",
            fontFamily: MC.font,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            borderRadius: 4,
            marginBottom: 4,
            boxShadow: "0 2px 6px rgba(0,0,0,.3)",
          }}
        >
          Customer
        </div>
        <Glyph name="pin" size={26} color={pinColor} strokeWidth={2.4} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 100,
          left: "60%",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: MC.brand,
          border: "3px solid #fff",
          boxShadow: `0 0 0 6px ${MC.brand}33`,
        }}
      />
    </div>
  );
}
