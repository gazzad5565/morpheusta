"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { type Shift, type Customer } from "@/lib/mock-data";
import {
  AppHeader,
  AppFooter,
  CustomerTile,
  PrimaryButton,
  ReasonChip,
  SectionLabel,
} from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { LoadingBar } from "@/components/Loading";
import { clearRepLocation } from "@/lib/location-tracker";
import {
  getMyActiveShift,
  checkOutOfShift,
  getTasksForCustomer,
} from "@/lib/shifts-store";
import { getCustomerById } from "@/lib/customers-store";
import { getEarlyGraceMinutes } from "@/lib/settings-store";
import { logEvent } from "@/lib/events-store";

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

// Distance in meters between two lat/lng pairs (Haversine).
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

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

  // Fetch the rep's currently in-progress shift so we know which row to
  // mark complete and which tasks were required at this customer.
  const [shift, setShift] = useState<
    (Shift & { realId: string; repId: string | null; checkInAt: string | null }) | null
  >(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [compulsoryTaskIds, setCompulsoryTaskIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [graceMinutes, setGraceMinutes] = useState<number>(15);

  // Geolocation
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [positionLoading, setPositionLoading] = useState<boolean>(true);
  const [positionError, setPositionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, grace] = await Promise.all([getMyActiveShift(), getEarlyGraceMinutes()]);
      if (cancelled) return;
      setShift(s);
      setShiftLoaded(true);
      setGraceMinutes(grace);
      if (s) {
        const [tasks, cust] = await Promise.all([
          getTasksForCustomer(s.id),
          getCustomerById(s.id),
        ]);
        if (cancelled) return;
        setCompulsoryTaskIds(tasks.filter((t) => t.compulsory).map((t) => t.id));
        setCustomer(cust);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Best-effort GPS read for the off-site check.
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPositionLoading(false);
      setPositionError("Geolocation not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setPositionLoading(false);
      },
      (err) => {
        setPositionLoading(false);
        setPositionError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't read your location."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 }
    );
  }, []);

  // Read completed task IDs from URL (set by /active page on Check Out tap).
  const completedIds = (params.get("completed") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const compulsoryRemaining = compulsoryTaskIds.filter(
    (id) => !completedIds.includes(id)
  );
  const compulsoryDone = compulsoryRemaining.length === 0;

  const [offsiteReason, setOffsiteReason] = useState<string | null>(null);
  const [offsiteNote, setOffsiteNote] = useState("");
  const [earlyReason, setEarlyReason] = useState<string | null>(null);
  const [earlyNote, setEarlyNote] = useState("");
  const [offsiteOpen, setOffsiteOpen] = useState(true);
  const [earlyOpen, setEarlyOpen] = useState(true);

  // ─── Exception detection ─────────────────────────────────────────────
  // Off-site: same Haversine logic as /check-in.
  const offsiteInfo = useMemo(() => {
    if (!shift) return null;
    const radius = customer?.geofence_radius_m ?? 100;
    if (!customer?.latitude || !customer?.longitude) {
      return { triggered: false as const, reason: "Customer has no address pinned." };
    }
    if (positionLoading) return null;
    if (!position) {
      return {
        triggered: true as const,
        distanceM: null,
        radiusM: radius,
        message: positionError || "Location unavailable.",
      };
    }
    const distanceM = haversineMeters(
      position.lat,
      position.lon,
      customer.latitude,
      customer.longitude
    );
    if (distanceM > radius) {
      return {
        triggered: true as const,
        distanceM,
        radiusM: radius,
        message: `${formatDistance(distanceM)} from site (geofence is ${radius} m).`,
      };
    }
    return {
      triggered: false as const,
      distanceM,
      radiusM: radius,
      reason: `Within geofence (${formatDistance(distanceM)} of site).`,
    };
  }, [shift, customer, position, positionLoading, positionError]);

  // Early: now is more than `graceMinutes` before the shift's end_time.
  const earlyInfo = useMemo(() => {
    if (!shift) return null;
    const endStr = shift.end;
    const m = endStr.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      mins,
      0,
      0
    );
    const minutesEarly = (end.getTime() - now.getTime()) / 60000;
    if (minutesEarly > graceMinutes) {
      return {
        triggered: true as const,
        minutesEarly,
        endLabel: endStr,
        graceMinutes,
      };
    }
    return {
      triggered: false as const,
      minutesEarly,
      endLabel: endStr,
      graceMinutes,
    };
  }, [shift, graceMinutes]);

  const offsiteTriggered = offsiteInfo?.triggered === true;
  const earlyTriggered = earlyInfo?.triggered === true;
  const triggeredCount = (offsiteTriggered ? 1 : 0) + (earlyTriggered ? 1 : 0);

  const offsiteResolved = !offsiteTriggered || !!offsiteReason;
  const earlyResolved = !earlyTriggered || !!earlyReason;
  const canProceed =
    compulsoryDone && offsiteResolved && earlyResolved && !positionLoading;

  const [submitting, setSubmitting] = useState(false);

  const onProceed = async () => {
    if (submitting) return;
    setSubmitting(true);
    // 1. Mark the shift complete in the DB.
    if (shift) {
      const result = await checkOutOfShift(shift.realId, completedIds.length);
      if (!result.ok) {
        setSubmitting(false);
        alert(`Couldn't check out: ${result.error}`);
        return;
      }
      // 2. Log dedicated exception events alongside the standard checkout.
      if (offsiteTriggered) {
        await logEvent({
          event_type: "shift.checked_out_offsite",
          shift_id: shift.realId,
          customer_id: shift.id,
          message: `Off-site check-out at ${shift.name}`,
          meta: {
            distance_m: offsiteInfo?.triggered ? offsiteInfo.distanceM : null,
            radius_m: offsiteInfo?.radiusM ?? null,
            reason: offsiteReason,
            note: offsiteNote || undefined,
          },
        });
      }
      if (earlyTriggered) {
        await logEvent({
          event_type: "shift.checked_out_early",
          shift_id: shift.realId,
          customer_id: shift.id,
          message: `Early check-out at ${shift.name} · ${formatMinutes(
            earlyInfo!.minutesEarly
          )} before scheduled end`,
          meta: {
            minutes_early: Math.round(earlyInfo!.minutesEarly),
            grace_minutes: graceMinutes,
            end_label: earlyInfo!.endLabel,
            reason: earlyReason,
            note: earlyNote || undefined,
          },
        });
      }
    }
    // 3. Drop our pin from the admin map. Awaited so the realtime
    //    broadcast fires before the user navigates away.
    await clearRepLocation();

    const params = new URLSearchParams({
      ...(offsiteReason ? { offsiteReason, offsiteNote } : {}),
      ...(earlyReason ? { earlyReason, earlyNote } : {}),
      ...(shift?.name ? { customer: shift.name } : {}),
    });
    router.push(`/summary?${params.toString()}`);
  };

  // No active shift to check out of — guide the rep back. Also covers the
  // brief "still loading" gap (shows "Loading…" until the fetch resolves).
  if (!shift) {
    return (
      <div style={{ background: MC.bg, minHeight: "100%" }}>
        <AppHeader title="Check Out" onBack={() => router.push("/")} />
        <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              background: MC.card,
              border: `1px dashed ${MC.line}`,
              borderRadius: MC.radiusCard,
              padding: 28,
              textAlign: "center",
              fontFamily: MC.font,
              fontSize: 14,
              color: MC.ink2,
            }}
          >
            {shiftLoaded ? "No active shift to check out of." : "Loading…"}
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Check Out" onBack={() => router.back()} />
      {(positionLoading || !shiftLoaded) && <LoadingBar />}

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
                <b>{compulsoryRemaining.length} remaining</b>. Head back to your active shift to
                finish them, then return here to check out.
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

      {/* Loading state — fetching customer / GPS */}
      {(positionLoading || !shiftLoaded) && (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              padding: 14,
              background: MC.card,
              border: `1px solid ${MC.line}`,
              borderRadius: MC.radiusCard,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: MC.font,
              fontSize: 13,
              color: MC.mute,
            }}
          >
            <Glyph name="target" size={14} color={MC.hint} />
            <span>
              {positionLoading ? "Checking your location…" : "Loading shift…"}
            </span>
          </div>
        </div>
      )}

      {/* No exceptions — clean confirmation */}
      {!positionLoading && shiftLoaded && triggeredCount === 0 && compulsoryDone && (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              padding: 14,
              background: MC.okTint,
              border: `1px solid ${MC.ok}55`,
              borderRadius: MC.radiusCard,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Glyph name="check-circle" size={20} color={MC.ok} strokeWidth={2.4} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0d6a45",
                  letterSpacing: -0.1,
                }}
              >
                Ready to check out
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: "#0d6a45",
                  opacity: 0.85,
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                {[
                  offsiteInfo && offsiteInfo.triggered === false
                    ? "distanceM" in offsiteInfo && offsiteInfo.distanceM != null
                      ? `Within geofence (${formatDistance(offsiteInfo.distanceM)} of site)`
                      : offsiteInfo.reason || "Within geofence"
                    : null,
                  earlyInfo && earlyInfo.triggered === false
                    ? earlyInfo.minutesEarly <= 0
                      ? `Past scheduled end (${earlyInfo.endLabel})`
                      : `Within ${graceMinutes}-min grace (${formatMinutes(
                          earlyInfo.minutesEarly
                        )} before end)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Off-site exception — only if triggered */}
      {offsiteTriggered && (
        <>
          <SectionLabel>Exceptions to resolve</SectionLabel>
          <div style={{ padding: "0 16px" }}>
            <ExceptionBlock
              tone="danger"
              icon="pin"
              title="Not at customer location"
              subtitle={
                offsiteResolved && offsiteReason
                  ? offsiteReason
                  : offsiteInfo!.message
              }
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
        </>
      )}

      {/* Early-out exception — only if triggered */}
      {earlyTriggered && (
        <>
          {!offsiteTriggered && <SectionLabel>Exceptions to resolve</SectionLabel>}
          <div style={{ padding: offsiteTriggered ? "12px 16px 0" : "0 16px" }}>
            <ExceptionBlock
              tone="warn"
              icon="clock"
              title="Early check-out"
              subtitle={`${formatMinutes(earlyInfo!.minutesEarly)} before scheduled end (${earlyInfo!.endLabel})`}
              resolved={earlyResolved}
              resolvedSummary={earlyResolved ? earlyReason : null}
              open={earlyOpen}
              onToggle={() => setEarlyOpen((o) => !o)}
            >
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 11.5,
                  color: MC.mute,
                  marginBottom: 8,
                }}
              >
                Grace period: {graceMinutes} min.
              </div>
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
        </>
      )}

      <div style={{ padding: "18px 16px 22px" }}>
        {triggeredCount > 0 && (
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.hint,
              textAlign: "right",
              marginBottom: 8,
            }}
          >
            {(offsiteTriggered && offsiteReason ? 1 : 0) +
              (earlyTriggered && earlyReason ? 1 : 0)}
            /{triggeredCount} resolved
            {!compulsoryDone &&
              ` · ${compulsoryRemaining.length} task${compulsoryRemaining.length === 1 ? "" : "s"} pending`}
          </div>
        )}
        {triggeredCount === 0 && !compulsoryDone && (
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.warn,
              textAlign: "right",
              marginBottom: 8,
            }}
          >
            {compulsoryRemaining.length} task{compulsoryRemaining.length === 1 ? "" : "s"} pending
          </div>
        )}
        <PrimaryButton
          disabled={!canProceed}
          onClick={canProceed ? onProceed : undefined}
          icon={canProceed ? "arrow-r" : null}
        >
          {canProceed
            ? triggeredCount === 0
              ? "Confirm check-out"
              : "Confirm check-out"
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
