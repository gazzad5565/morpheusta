"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, CustomerTile, ReasonChip, PrimaryButton } from "@/components/Chrome";
import { LoadingBar } from "@/components/Loading";
import { CheckingInOverlay, type CheckInPhase } from "@/components/CheckingInOverlay";
import { Glyph, type GlyphName } from "@/components/Glyph";
import {
  getShiftById,
  checkInToShift,
  getMyActiveShift,
  pauseAndCheckIn,
  checkOutAndCheckIn,
  countMyPausedShifts,
  MAX_PAUSED_SHIFTS,
  type ShiftWithMeta,
} from "@/lib/shifts-store";
import { getCustomerById } from "@/lib/customers-store";
import {
  getLateGraceMinutes,
  getEarlyGraceMinutes,
  getLocationExceptionsEnabled,
  getTimingExceptionsEnabled,
} from "@/lib/settings-store";
import { logEvent } from "@/lib/events-store";
import { haversineMeters, formatDistanceMeters as formatDistance } from "@/lib/geo";
import { formatCustomerCode } from "@/lib/format";
import type { Customer } from "@/lib/mock-data";

function formatLateness(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function formatClockTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const LOCATION_REASONS = [
  "Customer site closed",
  "Parking/access issue",
  "Wrong GPS fix",
  "Visiting nearby store",
  "Manager approved",
  "Other",
];
const EARLY_REASONS = [
  "Traffic was light",
  "Customer asked me to come early",
  "Manager approved",
  "Mistake — wrong shift",
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

  const [shift, setShift] = useState<ShiftWithMeta | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  // The rep's currently in-progress shift, if any — detected on mount
  // alongside the target shift. Drives the "switch shifts" warning
  // banner: when this is non-null AND it's a DIFFERENT shift than
  // the one we're checking into, the rep needs to acknowledge that
  // proceeding will auto-close the existing one. When it's the
  // SAME shift, we just route them to /active (they're already in).
  const [activeShift, setActiveShift] = useState<ShiftWithMeta | null>(null);
  // Whether the rep has acknowledged the switch warning. Gates the
  // Proceed button so they can't accidentally tap through.
  // null = not yet acknowledged. "checkout" = close A. "pause" =
  // pause A. The chosen mode drives both the banner copy and which
  // helper runs at onProceed (checkOutAndCheckIn vs pauseAndCheckIn).
  // "checkout" is the default — most reps finish at A before moving
  // on; pause is the exception for the "swing by next door" case.
  const [switchMode, setSwitchMode] = useState<"checkout" | "pause" | null>(
    null
  );
  // Count of currently paused shifts — used to enforce the
  // MAX_PAUSED_SHIFTS cap. Loaded alongside the active shift on
  // mount. When the rep already has the max paused, we hide the
  // "Pause & switch" option so they can't tangle further.
  const [pausedCount, setPausedCount] = useState<number>(0);
  const [graceMinutes, setGraceMinutes] = useState<number>(10);
  // Early-check-in uses the same setting as early check-out — they're
  // symmetric concepts: don't clock in too soon, don't clock out too soon.
  // One setting drives both.
  const [earlyGraceMinutes, setEarlyGraceMinutes] = useState<number>(15);
  // Org-wide on/off for each exception type. Customer-level overrides
  // are applied separately (`effectiveLocationOn` / `effectiveTimingOn`
  // below) so a NULL customer override falls back to the org default.
  const [orgLocationOn, setOrgLocationOn] = useState<boolean>(true);
  const [orgTimingOn, setOrgTimingOn] = useState<boolean>(true);

  // Geolocation state
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [positionLoading, setPositionLoading] = useState<boolean>(true);

  // Initial loads: shift, grace minutes.
  useEffect(() => {
    if (!shiftId) {
      setShiftError("No shift specified.");
      return;
    }
    let cancelled = false;
    Promise.all([
      getShiftById(shiftId),
      getLateGraceMinutes(),
      getEarlyGraceMinutes(),
      getLocationExceptionsEnabled(),
      getTimingExceptionsEnabled(),
      // Active-shift detection — load in parallel so we don't add a
      // second round-trip. May 13: prevents the "rep checked into
      // two shifts at once" data-corruption path that the
      // auto-checkout cron previously only caught overnight.
      getMyActiveShift(),
      // Paused-shift count for the MAX_PAUSED_SHIFTS cap on the
      // pause-and-switch path. Tiny query (one COUNT), still loaded
      // here so the cap-check is ready by the time the banner needs it.
      countMyPausedShifts(),
    ]).then(async ([s, grace, earlyGrace, locOn, timeOn, active, paused]) => {
      if (cancelled) return;
      if (!s) {
        setShiftError("Shift not found.");
        return;
      }
      // Same shift the rep is already in? Just send them to /active —
      // no point making them re-fill the exception form for a shift
      // they already opened.
      if (active && active.realId === s.realId) {
        router.replace("/active");
        return;
      }
      setShift(s);
      // Different shift? Stash it so the warning banner renders.
      // Same-shift case was handled above and short-circuited.
      if (active) setActiveShift(active);
      setPausedCount(paused);
      setGraceMinutes(grace);
      setEarlyGraceMinutes(earlyGrace);
      setOrgLocationOn(locOn);
      setOrgTimingOn(timeOn);
      // Pull the customer to know its lat/lng + geofence radius +
      // any per-customer exception override.
      const c = await getCustomerById(s.id);
      if (cancelled) return;
      setCustomer(c);
    });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  // Get the rep's GPS once. Best-effort; if denied we treat as unknown
  // location → off-site exception with a "Location unavailable" reason.
  //
  // Cross-platform: same code path on iOS Safari, iOS PWA, and Android
  // Chrome. We pre-check navigator.permissions when available so a
  // denied state shorts out immediately (no pointless prompt) and a
  // granted state silently calls getCurrentPosition (no Safari re-
  // prompt on rep already-granted-once cases). When the Permissions
  // API isn't available we fall back to the previous direct call,
  // preserving the original behaviour on older browsers.
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setPositionLoading(false);
      setPositionError("Geolocation not available on this device.");
      return;
    }

    const fetchPosition = () => {
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
    };

    type PermsAPI = {
      query: (d: { name: PermissionName }) => Promise<{ state: PermissionState }>;
    };
    const perms = (
      navigator as Navigator & { permissions?: PermsAPI }
    ).permissions;
    if (perms && typeof perms.query === "function") {
      void perms
        .query({ name: "geolocation" as PermissionName })
        .then((res) => {
          if (res.state === "denied") {
            setPositionLoading(false);
            setPositionError("Location permission denied.");
            return;
          }
          // 'granted' → silent fetch. 'prompt' → user-initiated
          // prompt (rep just tapped Check in; iOS handles this well).
          fetchPosition();
        })
        .catch(() => {
          // Permissions API present but query failed — fall back.
          fetchPosition();
        });
    } else {
      // Old browser without Permissions API — preserve prior path.
      fetchPosition();
    }
  }, []);

  // ─── Effective exception toggles ─────────────────────────────────────
  // Customer-level override wins when set (true/false); NULL on the
  // customer falls back to the org-wide setting. The check-in page
  // uses these to decide whether the exception cards even render +
  // whether to log the dedicated event types.
  const locationExceptionsOn = useMemo(() => {
    const c = customer?.location_exceptions_enabled;
    if (c === true) return true;
    if (c === false) return false;
    return orgLocationOn;
  }, [customer, orgLocationOn]);
  const timingExceptionsOn = useMemo(() => {
    const c = customer?.timing_exceptions_enabled;
    if (c === true) return true;
    if (c === false) return false;
    return orgTimingOn;
  }, [customer, orgTimingOn]);

  // ─── Exception detection ─────────────────────────────────────────────
  // Off-site: rep's GPS distance to the customer > the customer's
  //   geofence radius (default 100m). If we can't read GPS or the
  //   customer lacks coords, we flag it as off-site with a more specific
  //   reason so the admin sees the gap.
  const offsiteInfo = useMemo(() => {
    if (!shift) return null;
    // Org / customer disabled this exception type → never trigger,
    // never even render the card. Returning null short-circuits the
    // downstream "triggered" boolean below.
    if (!locationExceptionsOn) return null;
    // Prefer the site's own coords + geofence; fall back to the legacy
    // customer-level fields for shifts that pre-date sites. Default
    // radius stays 100m if neither side carries one.
    const targetLat = shift.siteLat ?? customer?.latitude ?? null;
    const targetLng = shift.siteLng ?? customer?.longitude ?? null;
    const radius =
      shift.siteGeofenceM ?? customer?.geofence_radius_m ?? 100;
    if (targetLat == null || targetLng == null) {
      return {
        triggered: false as const,
        reason: "This site has no coordinates yet — geofence skipped.",
      };
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
      targetLat,
      targetLng
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
  }, [shift, customer, position, positionLoading, positionError, locationExceptionsOn]);

  const timingInfo = useMemo(() => {
    if (!shift) return null;
    // Org / customer disabled timing exceptions → never trigger.
    if (!timingExceptionsOn) return null;
    const startStr = shift.start;
    // Parse "8:00 AM" → today's Date with that time.
    const m = startStr.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      mins,
      0,
      0
    );
    const deltaMin = (now.getTime() - start.getTime()) / 60000;

    // Late: now is more than `graceMinutes` PAST the start.
    if (deltaMin > graceMinutes) {
      return {
        kind: "late" as const,
        triggered: true as const,
        minutesLate: deltaMin,
        startLabel: startStr,
        nowLabel: formatClockTime(now),
        graceMinutes,
      };
    }
    // Early: now is more than `earlyGraceMinutes` BEFORE the start.
    // Mirror of the early-check-out rule. Stops a rep clocking in
    // hours before their shift actually starts.
    if (deltaMin < -earlyGraceMinutes) {
      return {
        kind: "early" as const,
        triggered: true as const,
        minutesEarly: -deltaMin,
        startLabel: startStr,
        nowLabel: formatClockTime(now),
        graceMinutes: earlyGraceMinutes,
      };
    }
    // On time (within grace either way).
    return {
      kind: "ontime" as const,
      triggered: false as const,
      deltaMin,
      startLabel: startStr,
      graceMinutes,
    };
  }, [shift, graceMinutes, earlyGraceMinutes, timingExceptionsOn]);

  // Backwards-compat alias: existing render code reads `lateInfo`.
  // Map only the late-or-not states onto the old shape.
  const lateInfo = useMemo(() => {
    if (!timingInfo) return null;
    if (timingInfo.kind === "late") return timingInfo;
    return {
      kind: "ontime" as const,
      triggered: false as const,
      minutesLate:
        timingInfo.kind === "ontime" ? timingInfo.deltaMin : 0,
      startLabel: timingInfo.startLabel,
      graceMinutes: timingInfo.graceMinutes,
    };
  }, [timingInfo]);
  const earlyInfo = useMemo(
    () => (timingInfo?.kind === "early" ? timingInfo : null),
    [timingInfo]
  );

  // Reason state — only relevant when an exception triggers.
  const [openException, setOpenException] = useState<
    "location" | "late" | "early" | null
  >(null);
  const [locationReason, setLocationReasonRaw] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [lateReason, setLateReasonRaw] = useState<string | null>(null);
  const [lateNote, setLateNote] = useState("");
  const [earlyReason, setEarlyReasonRaw] = useState<string | null>(null);
  const [earlyNote, setEarlyNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Drives the CheckingInOverlay's stepper. Stays null while the rep
  // is filling out the form; goes through "submitting" → "logging" →
  // "done" during onProceed. The overlay unmounts once we route.
  const [checkInPhase, setCheckInPhase] = useState<CheckInPhase | null>(null);

  const offsiteTriggered = offsiteInfo?.triggered === true;
  const lateTriggered = lateInfo?.triggered === true;
  const earlyTriggered = earlyInfo?.triggered === true;
  const triggeredCount =
    (offsiteTriggered ? 1 : 0) + (lateTriggered ? 1 : 0) + (earlyTriggered ? 1 : 0);

  // Auto-open the first triggered card on first detection.
  useEffect(() => {
    if (openException !== null) return;
    if (offsiteTriggered) setOpenException("location");
    else if (lateTriggered) setOpenException("late");
    else if (earlyTriggered) setOpenException("early");
  }, [offsiteTriggered, lateTriggered, earlyTriggered, openException]);

  const offsiteResolved = !offsiteTriggered || !!locationReason;
  const lateResolved = !lateTriggered || !!lateReason;
  const earlyResolved = !earlyTriggered || !!earlyReason;
  const allResolved = offsiteResolved && lateResolved && earlyResolved;
  // When switching from another shift, also require the rep to
  // explicitly pick a mode (checkout or pause) before they can
  // proceed. Two-tap protection against accidental shift
  // abandonment + makes the decision conscious.
  const switchOK = !activeShift || switchMode !== null;
  const canProceed =
    !!shift && allResolved && switchOK && !submitting && !positionLoading;
  // The "Pause" path is forbidden when the rep already has the max
  // number of paused shifts open — they'd be creating a third one
  // and we cap at MAX_PAUSED_SHIFTS to prevent ops-tangle. The
  // checkout path remains available regardless (closing the current
  // shift doesn't increase the paused-count).
  const pauseCapHit = pausedCount >= MAX_PAUSED_SHIFTS;

  const handleSetLocationReason = (newValue: string | null) => {
    setLocationReasonRaw(newValue);
    if (newValue !== null) {
      if (lateTriggered && !lateReason) setOpenException("late");
      else if (earlyTriggered && !earlyReason) setOpenException("early");
    }
  };
  const handleSetLateReason = (newValue: string | null) => {
    setLateReasonRaw(newValue);
    if (newValue !== null && offsiteTriggered && !locationReason) {
      setOpenException("location");
    }
  };
  const handleSetEarlyReason = (newValue: string | null) => {
    setEarlyReasonRaw(newValue);
    if (newValue !== null && offsiteTriggered && !locationReason) {
      setOpenException("location");
    }
  };

  const onProceed = async () => {
    if (!canProceed || !shift) return;
    setSubmitting(true);
    setCheckInPhase("submitting");
    // 1. Open the new shift. If the rep was already checked into
    //    a different shift, the picked switchMode drives the close
    //    semantics:
    //      - "checkout": close A entirely (state='complete'). Used
    //        when the rep is DONE at A — the common case.
    //      - "pause": pause A (state='on-break'). Used when the rep
    //        intends to come back to A — the "swing by next door"
    //        case. Subject to the MAX_PAUSED_SHIFTS cap.
    //    Otherwise (no active shift), regular checkInToShift.
    const result = activeShift
      ? switchMode === "pause"
        ? await pauseAndCheckIn({
            fromShiftId: activeShift.realId,
            toShiftId: shift.realId,
          })
        : await checkOutAndCheckIn({
            fromShiftId: activeShift.realId,
            toShiftId: shift.realId,
          })
      : await checkInToShift(shift.realId);
    if (!result.ok) {
      setSubmitting(false);
      setCheckInPhase(null);
      alert(`Couldn't check in: ${result.error}`);
      return;
    }
    // Move to "logging" phase before we kick off the exception events
    // so the stepper visibly advances. If there are no exceptions the
    // phase still transitions — it's brief but explicit, and keeps the
    // overlay's behaviour consistent across paths.
    setCheckInPhase("logging");
    // 2. Log dedicated exception events alongside the standard check-in.
    if (offsiteTriggered) {
      await logEvent({
        event_type: "shift.checked_in_offsite",
        shift_id: shift.realId,
        customer_id: shift.id,
        message: `Off-site check-in at ${shift.name}`,
        meta: {
          distance_m: offsiteInfo?.distanceM ?? null,
          radius_m: offsiteInfo?.radiusM ?? null,
          reason: locationReason,
          note: locationNote || undefined,
        },
      });
    }
    if (lateTriggered) {
      await logEvent({
        event_type: "shift.checked_in_late",
        shift_id: shift.realId,
        customer_id: shift.id,
        message: `Late check-in at ${shift.name} · ${formatLateness(
          lateInfo!.minutesLate
        )} late`,
        meta: {
          minutes_late: Math.round(lateInfo!.minutesLate),
          grace_minutes: graceMinutes,
          start_label: lateInfo!.startLabel,
          reason: lateReason,
          note: lateNote || undefined,
        },
      });
    }
    if (earlyTriggered && earlyInfo) {
      await logEvent({
        event_type: "shift.checked_in_early",
        shift_id: shift.realId,
        customer_id: shift.id,
        message: `Early check-in at ${shift.name} · ${formatLateness(
          earlyInfo.minutesEarly
        )} before start`,
        meta: {
          minutes_early: Math.round(earlyInfo.minutesEarly),
          grace_minutes: earlyGraceMinutes,
          start_label: earlyInfo.startLabel,
          reason: earlyReason,
          note: earlyNote || undefined,
        },
      });
    }
    // Land on the "done" phase so the overlay flashes its complete
    // state (green tick + "You're checked in!") for ~550ms before we
    // route. Without the dwell the rep barely sees the celebratory
    // frame — it's the whole point of the overlay. The router.push is
    // still preloaded by Next so the actual navigation feels instant
    // once it fires.
    //
    // Used to route to a /check-in/success confirmation page that
    // re-stated late/early/offsite reasons + had a "Start activities"
    // button. Removed (May 11) because the overlay itself already
    // confirms the check-in, the reasons are saved in the event log,
    // and the extra tap to "Start activities" was friction. Now we
    // land straight on /active where the rep can begin work.
    setCheckInPhase("done");
    await new Promise((r) => window.setTimeout(r, 550));
    router.push("/active");
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%", position: "relative" }}>
      <AppHeader title="Check in" onBack={() => router.back()} />
      {positionLoading && <LoadingBar />}

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
            logoUrl={shift?.logoUrl ?? null}
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
                ? `Scheduled ${shift.start} – ${shift.end} · Code ${formatCustomerCode(shift.code)}`
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

        {/* Pause-and-switch warning (May 13) — when the rep is
            already checked into a different shift, surface a banner
            here BEFORE the exception cards so they can't tap
            through to Proceed without acknowledging that the
            previous shift will be PAUSED (state='on-break', not
            closed — they can resume it from /shifts when they're
            done with this one). Tap "Pause & switch" to arm the
            Proceed button; "Back to previous" to bail. */}
        {activeShift && (
          <div
            style={{
              marginTop: 10,
              background: switchMode ? MC.brandTint : MC.warnTint,
              border: `1px solid ${switchMode ? MC.brand : MC.warn}55`,
              borderRadius: MC.radiusCard,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: switchMode
                    ? `${MC.brand}33`
                    : `${MC.warn}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Glyph
                  name={switchMode ? "check-circle" : "warn"}
                  size={15}
                  color={switchMode ? MC.brandDeep : MC.warn}
                  strokeWidth={2.4}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: switchMode ? MC.brandInk : "#7A560A",
                    letterSpacing: -0.1,
                  }}
                >
                  {switchMode === "checkout"
                    ? `Checking out of ${activeShift.name} → switching to ${shift?.name ?? "new shift"}`
                    : switchMode === "pause"
                    ? `Pausing ${activeShift.name} → switching to ${shift?.name ?? "new shift"}`
                    : `You're still checked into ${activeShift.name}`}
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: switchMode ? MC.ink2 : "#7A560A",
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {switchMode === "checkout"
                    ? `${activeShift.name} will be closed for the day. Tap "Tap Proceed" below to finish the switch.`
                    : switchMode === "pause"
                    ? `${activeShift.name} will be paused — you can come back and finish it from your shifts list. Any tasks or photos already done stay saved.`
                    : `Are you done at ${activeShift.name}, or just popping in here briefly? Pick one — the default is to check out, since that's the usual case.`}
                </div>
              </div>
            </div>
            {!switchMode && (
              <>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {/* Default — close A. The usual case: rep finished
                      at A and is moving on. Tinted brand so it reads
                      as the recommended action. */}
                  <button
                    type="button"
                    onClick={() => setSwitchMode("checkout")}
                    style={{
                      minHeight: 42,
                      borderRadius: 10,
                      background: MC.brandDeep,
                      color: "#fff",
                      border: "none",
                      fontFamily: MC.font,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      boxShadow: `0 4px 10px ${MC.brand}44`,
                    }}
                  >
                    <Glyph
                      name="check"
                      size={14}
                      color="#fff"
                      strokeWidth={2.4}
                    />
                    Check out of {activeShift.name} &amp; switch
                  </button>

                  {/* Alternate — pause A. Subject to the
                      MAX_PAUSED_SHIFTS cap; disabled with explainer
                      copy when the cap is hit. */}
                  <button
                    type="button"
                    onClick={() => !pauseCapHit && setSwitchMode("pause")}
                    disabled={pauseCapHit}
                    style={{
                      minHeight: 42,
                      borderRadius: 10,
                      background: "#fff",
                      color: pauseCapHit ? MC.mute : "#7A560A",
                      border: `1px solid ${pauseCapHit ? MC.line : `${MC.warn}55`}`,
                      fontFamily: MC.font,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: pauseCapHit ? "not-allowed" : "pointer",
                      opacity: pauseCapHit ? 0.5 : 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Glyph
                      name="clock"
                      size={14}
                      color={pauseCapHit ? MC.mute : "#7A560A"}
                      strokeWidth={2.4}
                    />
                    Pause &amp; come back later
                  </button>

                  {pauseCapHit && (
                    <div
                      style={{
                        fontFamily: MC.font,
                        fontSize: 11.5,
                        color: "#7A560A",
                        lineHeight: 1.4,
                        textAlign: "center",
                      }}
                    >
                      You already have {pausedCount} paused shift
                      {pausedCount === 1 ? "" : "s"} — finish one
                      first before pausing another. (Max{" "}
                      {MAX_PAUSED_SHIFTS}.)
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => router.replace("/active")}
                    style={{
                      minHeight: 38,
                      borderRadius: 10,
                      background: "transparent",
                      color: MC.mute,
                      border: "none",
                      fontFamily: MC.font,
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Back to {activeShift.name}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Quick "Call the site" pill — when the rep is off-site or
            running late, this is the fastest way to reach the contact
            person to explain. Only renders when the site has a phone. */}
        {shift?.siteContactPhone && (
          <a
            href={`tel:${shift.siteContactPhone}`}
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 99,
              background: MC.brand,
              color: "#fff",
              fontFamily: MC.font,
              fontSize: 12.5,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: `0 4px 10px ${MC.brand}55`,
            }}
          >
            <Glyph name="clock" size={13} color="#fff" strokeWidth={2.4} />
            Call site
            {shift.siteContactName ? ` · ${shift.siteContactName}` : ""}
          </a>
        )}
        {shift?.siteNotes && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "#FFF6E2",
              border: "1px solid #F2D17A",
              borderRadius: 10,
              fontFamily: MC.font,
              fontSize: 12.5,
              color: "#6d4808",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 4,
                color: "#7d5708",
              }}
            >
              Access notes
            </div>
            {shift.siteNotes}
          </div>
        )}
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
          <span>
            {triggeredCount === 0
              ? "Review before check-in"
              : `${triggeredCount} exception${triggeredCount === 1 ? "" : "s"} to resolve`}
          </span>
          {triggeredCount > 0 && (
            <span style={{ color: allResolved ? MC.ok : MC.hint }}>
              {(offsiteTriggered && locationReason ? 1 : 0) +
                (lateTriggered && lateReason ? 1 : 0) +
                (earlyTriggered && earlyReason ? 1 : 0)}
              {" / "}
              {triggeredCount} resolved
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Loading state — fetching shift / customer / GPS */}
        {(positionLoading || !shift) && !shiftError && (
          <div
            style={{
              padding: 16,
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
              {positionLoading
                ? "Checking your location…"
                : "Loading shift…"}
            </span>
          </div>
        )}

        {/* No exceptions — clean confirmation state */}
        {shift && !positionLoading && triggeredCount === 0 && (
          <div
            style={{
              padding: 16,
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
                You&apos;re good to check in
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: "#0d6a45",
                  opacity: 0.8,
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                {[
                  offsiteInfo && offsiteInfo.triggered === false
                    ? offsiteInfo.reason ||
                      `Within geofence${
                        "distanceM" in offsiteInfo && offsiteInfo.distanceM != null
                          ? ` (${formatDistance(offsiteInfo.distanceM)} of site)`
                          : ""
                      }`
                    : null,
                  lateInfo && lateInfo.triggered === false
                    ? lateInfo.minutesLate <= 0
                      ? `On time (${lateInfo.startLabel} start)`
                      : `Within ${graceMinutes}-min grace (${formatLateness(
                          lateInfo.minutesLate
                        )} after start)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        )}

        {/* Off-site exception — only if triggered */}
        {offsiteTriggered && (
          <ExceptionCard
            tone="danger"
            iconName="pin"
            title="Not at customer location"
            subtitle={
              offsiteResolved
                ? `Reason · ${locationReason}`
                : offsiteInfo!.message
            }
            open={openException === "location"}
            onToggle={() =>
              setOpenException(openException === "location" ? null : "location")
            }
            resolved={offsiteResolved}
          >
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12.5,
                color: MC.mute,
                marginTop: 6,
              }}
            >
              Checking in to <b style={{ color: MC.ink }}>{shift?.name}</b>
              {offsiteInfo && offsiteInfo.triggered && offsiteInfo.distanceM != null && (
                <>
                  {" "}—{" "}
                  <b style={{ color: MC.ink }}>
                    {formatDistance(offsiteInfo.distanceM)}
                  </b>{" "}
                  away from site (geofence is {offsiteInfo.radiusM} m).
                </>
              )}
              {offsiteInfo && offsiteInfo.triggered && offsiteInfo.distanceM == null && (
                <> — {offsiteInfo.message}</>
              )}
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
        )}

        {/* Late exception — only if triggered */}
        {lateTriggered && (
          <ExceptionCard
            tone="warn"
            iconName="clock"
            title="Late check-in"
            subtitle={
              lateResolved
                ? `Reason · ${lateReason}`
                : `${formatLateness(lateInfo!.minutesLate)} after ${lateInfo!.startLabel} start.`
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
              <Stat label="Expected" value={lateInfo!.startLabel} />
              <Stat label="Now" value={lateInfo!.nowLabel} />
              <Stat
                label="Late by"
                value={formatLateness(lateInfo!.minutesLate)}
                tone="warn"
              />
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.mute,
                marginTop: 8,
              }}
            >
              Grace period: {graceMinutes} min.
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
        )}

        {/* Early exception — only if triggered. Mirror of the late card. */}
        {earlyTriggered && earlyInfo && (
          <ExceptionCard
            tone="warn"
            iconName="clock"
            title="Early check-in"
            subtitle={
              earlyResolved
                ? `Reason · ${earlyReason}`
                : `${formatLateness(earlyInfo.minutesEarly)} before ${earlyInfo.startLabel} start.`
            }
            open={openException === "early"}
            onToggle={() => setOpenException(openException === "early" ? null : "early")}
            resolved={earlyResolved}
          >
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}
            >
              <Stat label="Scheduled" value={earlyInfo.startLabel} />
              <Stat label="Now" value={earlyInfo.nowLabel} />
              <Stat
                label="Early by"
                value={formatLateness(earlyInfo.minutesEarly)}
                tone="warn"
              />
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                color: MC.mute,
                marginTop: 8,
              }}
            >
              Grace period: {earlyGraceMinutes} min before scheduled start.
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
                Why are you checking in early?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {EARLY_REASONS.map((r) => (
                  <ReasonChip
                    key={r}
                    label={r}
                    selected={earlyReason === r}
                    onClick={() =>
                      handleSetEarlyReason(earlyReason === r ? null : r)
                    }
                  />
                ))}
              </div>
            </div>
            {earlyReason && (
              <div style={{ marginTop: 14 }}>
                <NoteField
                  label="Add a note (optional)"
                  value={earlyNote}
                  onChange={setEarlyNote}
                  placeholder="Customer asked me to come 30 min early…"
                />
              </div>
            )}
          </ExceptionCard>
        )}

        {shiftError && (
          <div
            style={{
              padding: 12,
              background: MC.dangerTint,
              color: "#9c1a3c",
              borderRadius: 12,
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {shiftError}
          </div>
        )}
      </div>

      <div style={{ padding: "20px 16px 16px" }}>
        <PrimaryButton onClick={onProceed} disabled={!canProceed} icon="check">
          {submitting
            ? "Checking in…"
            : !shift
            ? "Loading…"
            : positionLoading
            ? "Locating…"
            : !allResolved
            ? `Resolve ${
                (offsiteTriggered && !offsiteResolved ? 1 : 0) +
                (lateTriggered && !lateResolved ? 1 : 0)
              } to continue`
            : triggeredCount === 0
            ? "Confirm check-in"
            : "Proceed to check in"}
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
          {triggeredCount > 0
            ? "Reasons are logged and sent to your manager."
            : "Tap to record your check-in."}
        </div>
      </div>

      {/* Full-screen check-in animation. Mounted only while we're in
          flight so the rep sees a confident "something's happening"
          state instead of a frozen page. Parent owns the phase; this
          component is purely visual. */}
      {checkInPhase && (
        <CheckingInOverlay
          customerName={shift?.name || "your shift"}
          phase={checkInPhase}
        />
      )}
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
