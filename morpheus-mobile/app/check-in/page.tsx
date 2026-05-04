"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, CustomerTile, ReasonChip, PrimaryButton } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { getShiftById, checkInToShift } from "@/lib/shifts-store";
import type { Shift } from "@/lib/mock-data";

const LOCATION_REASONS = [
  "Customer site closed",
  "Parking/access issue",
  "Wrong GPS fix",
  "Visiting nearby store",
  "Manager approved",
  "Other",
];
const LATE_REASONS = [
  "Traffic",
  "Previous shift overrun",
  "Vehicle breakdown",
  "Stock delivery delay",
  "Personal emergency",
  "Other",
];

export default function CheckInPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CheckInPage />
    </Suspense>
  );
}

function CheckInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const shiftId = params.get("shift");

  const [shift, setShift] = useState<(Shift & { realId: string }) | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Load the shift on mount so we display the real customer and have the
  // right ID to update on proceed.
  useEffect(() => {
    if (!shiftId) {
      setShiftError("No shift specified.");
      return;
    }
    let cancelled = false;
    getShiftById(shiftId).then((s) => {
      if (cancelled) return;
      if (!s) setShiftError("Shift not found.");
      else setShift(s);
    });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const [openException, setOpenException] = useState<"location" | "late" | null>("location");
  const [locationReason, setLocationReasonRaw] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [lateReason, setLateReasonRaw] = useState<string | null>(null);
  const [lateNote, setLateNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const locResolved = !!locationReason;
  const lateResolved = !!lateReason;
  const canProceed = locResolved && lateResolved && !!shift && !submitting;

  // When a reason is newly selected, auto-collapse this accordion and open
  // the next still-pending one. When deselected, re-open the current one so
  // the user can pick again. Mirror behavior for late.
  const handleSetLocationReason = (newValue: string | null) => {
    setLocationReasonRaw(newValue);
    if (newValue !== null) {
      setOpenException(lateReason ? null : "late");
    } else {
      setOpenException("location");
    }
  };
  const handleSetLateReason = (newValue: string | null) => {
    setLateReasonRaw(newValue);
    if (newValue !== null) {
      setOpenException(locationReason ? null : "location");
    } else {
      setOpenException("late");
    }
  };

  const onProceed = async () => {
    if (!canProceed || !shift) return;
    setSubmitting(true);
    // Write to DB: mark shift in-progress with check_in_at = now.
    const result = await checkInToShift(shift.realId);
    if (!result.ok) {
      setSubmitting(false);
      alert(`Couldn't check in: ${result.error}`);
      return;
    }
    const sp = new URLSearchParams({
      locationReason: locationReason!,
      locationNote,
      lateReason: lateReason!,
      lateNote,
    });
    router.push(`/check-in/success?${sp.toString()}`);
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%", position: "relative" }}>
      <AppHeader title="Check in" onBack={() => router.back()} />

      <div style={{ padding: "14px 16px 8px" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 14,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <CustomerTile
            initials={shift?.initials || "GW"}
            color={shift?.color || MC.swatch.GW}
            size={46}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: MC.fontDisplay,
                fontSize: 16,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.2,
              }}
            >
              {shift?.name || "Loading…"}
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 12.5, color: MC.mute, marginTop: 2 }}>
              {shift
                ? `Scheduled ${shift.start} – ${shift.end} · Code #${shift.code}`
                : "Loading shift…"}
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: MC.brandTint,
              color: MC.brandDeep,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="target" size={18} color={MC.brandDeep} />
          </div>
        </div>
      </div>

      <div style={{ padding: "6px 20px 10px" }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: MC.hint,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Review before check-in</span>
          <span style={{ color: canProceed ? MC.ok : MC.hint }}>
            {(locResolved ? 1 : 0) + (lateResolved ? 1 : 0)} / 2 resolved
          </span>
        </div>
      </div>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <ExceptionCard
          tone="danger"
          iconName="pin"
          title="Not at customer location"
          subtitle={
            locResolved
              ? `Reason · ${locationReason}`
              : `You are 3 km from GreenWave Innovations.`
          }
          open={openException === "location"}
          onToggle={() =>
            setOpenException(openException === "location" ? null : "location")
          }
          resolved={locResolved}
        >
          <div style={{ paddingTop: 10 }}>
            <MapPlaceholder />
          </div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
              marginTop: 10,
            }}
          >
            Checking in to GreenWave Innovations <b style={{ color: MC.ink }}>3 km</b> away from
            site.
          </div>
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
                color: MC.ink2,
                marginBottom: 8,
              }}
            >
              Why are you off-site?
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {LOCATION_REASONS.map((r) => (
                <ReasonChip
                  key={r}
                  label={r}
                  selected={locationReason === r}
                  onClick={() =>
                    handleSetLocationReason(locationReason === r ? null : r)
                  }
                />
              ))}
            </div>
          </div>
          {locationReason && (
            <div style={{ marginTop: 14 }}>
              <NoteField
                label="Add a note (optional)"
                value={locationNote}
                onChange={setLocationNote}
                placeholder="Add any context for your manager…"
              />
            </div>
          )}
        </ExceptionCard>

        <ExceptionCard
          tone="warn"
          iconName="clock"
          title="Late check-in"
          subtitle={
            lateResolved ? `Reason · ${lateReason}` : `373 min after 8:00 AM start.`
          }
          open={openException === "late"}
          onToggle={() => setOpenException(openException === "late" ? null : "late")}
          resolved={lateResolved}
        >
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            <Stat label="Expected" value="8:00 AM" />
            <Stat label="Now" value="2:13 PM" />
            <Stat label="Late by" value="6h 13m" tone="warn" />
          </div>
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
                color: MC.ink2,
                marginBottom: 8,
              }}
            >
              Why are you late?
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {LATE_REASONS.map((r) => (
                <ReasonChip
                  key={r}
                  label={r}
                  selected={lateReason === r}
                  onClick={() => handleSetLateReason(lateReason === r ? null : r)}
                />
              ))}
            </div>
          </div>
          {lateReason && (
            <div style={{ marginTop: 14 }}>
              <NoteField
                label="Add a note (optional)"
                value={lateNote}
                onChange={setLateNote}
                placeholder="Traffic on M3, expected arrival earlier…"
              />
            </div>
          )}
        </ExceptionCard>
      </div>

      <div style={{ padding: "20px 16px 16px" }}>
        <PrimaryButton onClick={onProceed} disabled={!canProceed} icon="check">
          {canProceed
            ? "Proceed to check in"
            : `Resolve ${2 - (locResolved ? 1 : 0) - (lateResolved ? 1 : 0)} to continue`}
        </PrimaryButton>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.hint,
            textAlign: "center",
            marginTop: 10,
          }}
        >
          Reasons are logged and sent to your manager for review.
        </div>
      </div>
    </div>
  );
}

function ExceptionCard({
  tone,
  iconName,
  title,
  subtitle,
  open,
  onToggle,
  resolved,
  children,
}: {
  tone: "danger" | "warn";
  iconName: GlyphName;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  resolved?: boolean;
  children: React.ReactNode;
}) {
  const toneMap = {
    danger: { tint: MC.dangerTint, deep: "#9c1a3c", icon: MC.danger },
    warn: { tint: MC.warnTint, deep: "#8a5d06", icon: "#b27606" },
  };
  const t = toneMap[tone];
  return (
    <div
      style={{
        background: MC.card,
        border: `1px solid ${open ? t.icon + "55" : MC.line}`,
        borderRadius: MC.radiusCard,
        overflow: "hidden",
        boxShadow: open ? `0 10px 28px ${t.icon}18` : "0 1px 2px rgba(10,15,30,.03)",
        transition: "all .15s ease",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: t.tint,
            color: t.icon,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Glyph name={iconName} size={20} color={t.icon} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 15.5,
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
              fontSize: 12.5,
              color: MC.mute,
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        </div>
        {resolved ? (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: MC.okTint,
              color: MC.ok,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="check" size={16} color="#0d6a45" strokeWidth={2.4} />
          </div>
        ) : (
          <Glyph name={open ? "chev-u" : "chev-d"} size={18} color={MC.mute} />
        )}
      </button>

      {open && (
        <div style={{ padding: "4px 16px 16px", borderTop: `1px solid ${MC.line}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 150,
        borderRadius: 12,
        overflow: "hidden",
        background: "linear-gradient(135deg, #E6F1F6 0%, #DCEBF2 60%, #E2EDD8 100%)",
        border: `1px solid ${MC.line}`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "55%",
          height: "50%",
          background: "linear-gradient(180deg, #B6D9E7 0%, #9BC6D7 100%)",
          clipPath:
            "polygon(20% 0, 100% 0, 100% 100%, 60% 95%, 40% 70%, 25% 50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: "5%",
          width: "60%",
          height: "55%",
          background: "linear-gradient(180deg, #C8DBB7 0%, #A8C48E 100%)",
          borderRadius: "40% 30% 20% 50% / 50% 40% 30% 20%",
          opacity: 0.85,
        }}
      />
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <path
          d="M5,40 Q30,30 45,45 T95,20"
          stroke="#fff"
          strokeWidth="1.2"
          fill="none"
          opacity=".9"
        />
        <path d="M10,15 Q40,25 70,15" stroke="#fff" strokeWidth="1" fill="none" opacity=".7" />
      </svg>
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "22%",
          transform: "translate(-50%,-100%)",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50% 50% 50% 0",
            background: MC.brandDeep,
            transform: "rotate(-45deg)",
            boxShadow: "0 4px 10px rgba(0,0,0,.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#fff",
              transform: "rotate(45deg)",
            }}
          />
        </div>
      </div>
      <div style={{ position: "absolute", top: "55%", left: "60%" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: `${MC.brand}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${MC.brand}`,
              animation: "mc-map-pulse 1.6s ease-out infinite",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: MC.brand,
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,.15)",
            }}
          />
        </div>
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <line
          x1="22%"
          y1="35%"
          x2="62%"
          y2="60%"
          stroke={MC.brandDeep}
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity=".7"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          background: "rgba(23,26,31,.92)",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: 999,
          fontFamily: MC.font,
          fontSize: 11.5,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          backdropFilter: "blur(8px)",
        }}
      >
        <Glyph name="pin" size={12} color="#fff" strokeWidth={2.2} />
        3 km away
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  const c = tone === "warn" ? "#8a5d06" : MC.ink;
  const bg = tone === "warn" ? MC.warnTint : MC.bg;
  return (
    <div style={{ background: bg, borderRadius: 10, padding: "8px 10px" }}>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: MC.hint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 14,
          fontWeight: 700,
          color: c,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function NoteField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 12,
          fontWeight: 600,
          color: MC.mute,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: 64,
          resize: "none",
          border: `1px solid ${MC.line}`,
          borderRadius: 12,
          padding: "10px 12px",
          boxSizing: "border-box",
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.ink,
          outline: "none",
          background: "#FBFBFC",
        }}
      />
    </div>
  );
}
