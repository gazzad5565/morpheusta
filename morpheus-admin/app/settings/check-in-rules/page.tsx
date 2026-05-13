"use client";

/**
 * /settings/check-in-rules — late grace, early grace, default geofence
 * radius. Each setting writes to app_settings and is read by the mobile
 * app on /check-in and /check-out.
 *
 * Extracted from the previous single-page /settings; this is now its
 * own route. See components/shell/SettingsShell.tsx for the rail.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { TimeCombobox } from "@/components/ui/TimeCombobox";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getLateGraceMinutes,
  setLateGraceMinutes,
  getEarlyGraceMinutes,
  setEarlyGraceMinutes,
  getDefaultGeofenceRadius,
  setDefaultGeofenceRadius,
  getAutoCheckoutTime,
  setAutoCheckoutTime,
  getLocationExceptionsEnabled,
  setLocationExceptionsEnabled,
  getTimingExceptionsEnabled,
  setTimingExceptionsEnabled,
  getRouteOptimizationAllowed,
  setRouteOptimizationAllowed,
  getShiftRequestAutoApprove,
  setShiftRequestAutoApprove,
  getPhotoQualityTier,
  setPhotoQualityTier,
  PHOTO_QUALITY_TIERS,
  type PhotoQualityTier,
} from "@/lib/settings-store";

export default function CheckInRulesPage() {
  const [lateMin, setLateMin] = useState<string>("10");
  const [earlyMin, setEarlyMin] = useState<string>("15");
  const [defaultRadius, setDefaultRadius] = useState<string>("100");
  const [autoCheckoutTime, setAutoCheckoutTimeState] = useState<string>("23:59");
  const [locationOn, setLocationOn] = useState<boolean>(true);
  const [timingOn, setTimingOn] = useState<boolean>(true);
  const [routeOptimizeOn, setRouteOptimizeOn] = useState<boolean>(true);
  const [autoApproveOn, setAutoApproveOn] = useState<boolean>(false);
  const [photoTier, setPhotoTier] = useState<PhotoQualityTier>("standard");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getLateGraceMinutes(),
      getEarlyGraceMinutes(),
      getDefaultGeofenceRadius(),
      getAutoCheckoutTime(),
      getLocationExceptionsEnabled(),
      getTimingExceptionsEnabled(),
      getRouteOptimizationAllowed(),
      getShiftRequestAutoApprove(),
      getPhotoQualityTier(),
    ]).then(([late, early, radius, autoTime, locOn, timeOn, routeOn, autoApprove, tier]) => {
      setLateMin(String(late));
      setEarlyMin(String(early));
      setDefaultRadius(String(radius));
      setAutoCheckoutTimeState(autoTime);
      setLocationOn(locOn);
      setTimingOn(timeOn);
      setRouteOptimizeOn(routeOn);
      setAutoApproveOn(autoApprove);
      setPhotoTier(tier);
      setLoaded(true);
    });
  }, []);

  // Org-wide toggle handlers. Optimistic update — flip the UI first
  // so the switch animates immediately, then revert on failure.
  const toggleLocation = async (next: boolean) => {
    setLocationOn(next);
    setSavingKey("locOn");
    const r = await setLocationExceptionsEnabled(next);
    setSavingKey(null);
    if (!r.ok) {
      setLocationOn(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Location exceptions enabled — off-site check-ins will surface a reason card."
        : "Location exceptions disabled — off-site check-ins no longer prompt for a reason."
    );
  };
  const toggleTiming = async (next: boolean) => {
    setTimingOn(next);
    setSavingKey("timeOn");
    const r = await setTimingExceptionsEnabled(next);
    setSavingKey(null);
    if (!r.ok) {
      setTimingOn(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Timing exceptions enabled — late and early check-ins will surface a reason card."
        : "Timing exceptions disabled — late and early check-ins no longer prompt for a reason."
    );
  };
  const toggleRouteOptimize = async (next: boolean) => {
    setRouteOptimizeOn(next);
    setSavingKey("routeOpt");
    const r = await setRouteOptimizationAllowed(next);
    setSavingKey(null);
    if (!r.ok) {
      setRouteOptimizeOn(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Route optimization enabled — reps can reorder their day on Route."
        : "Route optimization disabled — reps see their shifts in chronological order only."
    );
  };
  const changePhotoTier = async (next: PhotoQualityTier) => {
    const prev = photoTier;
    setPhotoTier(next);
    setSavingKey("photoTier");
    const r = await setPhotoQualityTier(next);
    setSavingKey(null);
    if (!r.ok) {
      setPhotoTier(prev);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    const t = PHOTO_QUALITY_TIERS[next];
    setMessage(`Photo quality set to ${t.label} (~${t.expectedKB}KB per photo, max ${t.maxDimension}px).`);
  };

  const toggleAutoApprove = async (next: boolean) => {
    setAutoApproveOn(next);
    setSavingKey("autoApprove");
    const r = await setShiftRequestAutoApprove(next);
    setSavingKey(null);
    if (!r.ok) {
      setAutoApproveOn(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Approval bypass on. Reps' new shift requests now schedule themselves immediately."
        : "Approval bypass off. Reps' new shift requests now go to your inbox."
    );
  };

  const saveLate = async () => {
    setMessage(null);
    const n = parseInt(lateMin, 10);
    if (Number.isNaN(n) || n < 0) return setMessage("Late grace must be a number ≥ 0.");
    setSavingKey("late");
    const r = await setLateGraceMinutes(n);
    setSavingKey(null);
    if (!r.ok) return setMessage(r.error || "Couldn't save.");
    setMessage(`Late grace saved (${n} min).`);
  };
  const saveEarly = async () => {
    setMessage(null);
    const n = parseInt(earlyMin, 10);
    if (Number.isNaN(n) || n < 0) return setMessage("Early grace must be a number ≥ 0.");
    setSavingKey("early");
    const r = await setEarlyGraceMinutes(n);
    setSavingKey(null);
    if (!r.ok) return setMessage(r.error || "Couldn't save.");
    setMessage(`Early grace saved (${n} min).`);
  };
  const saveRadius = async () => {
    setMessage(null);
    const n = parseInt(defaultRadius, 10);
    if (Number.isNaN(n) || n < 1) return setMessage("Radius must be at least 1 m.");
    setSavingKey("radius");
    const r = await setDefaultGeofenceRadius(n);
    setSavingKey(null);
    if (!r.ok) return setMessage(r.error || "Couldn't save.");
    setMessage(`Default radius saved (${n} m).`);
  };

  const saveAutoCheckout = async () => {
    setMessage(null);
    setSavingKey("autoCheckout");
    const r = await setAutoCheckoutTime(autoCheckoutTime);
    setSavingKey(null);
    if (!r.ok) return setMessage(r.error || "Couldn't save.");
    setMessage(`Auto check-out time saved (${autoCheckoutTime}).`);
  };

  return (
    <SettingsShell
      section="check-in-rules"
      description="Thresholds that gate when the mobile app shows an exception card on check-in / check-out. Below each threshold no exception UI appears and the rep can proceed straight away."
    >
      {/* Exception toggles — quietest, biggest-blast-radius setting,
          so they sit at the very top. Each toggle is a per-org master
          switch; per-customer overrides on the customer's Address tab
          take precedence when set. Flipping either OFF here silences
          the corresponding exception card across the entire mobile
          app for every customer that hasn't explicitly opted-in. */}
      <Card padding={20} style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
            marginBottom: 4,
          }}
        >
          Show exception cards on check-in
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          When ON, reps checking in off-site or outside the timing
          window have to pick a reason before they can proceed (and the
          event is logged for the audit trail). When OFF, the check-in
          is silent — useful for orgs that trust their reps and don't
          want the friction. Per-customer overrides live on each
          customer&apos;s edit page.
        </div>
        <ToggleRow
          title="Location exceptions"
          subtitle="Trigger when the rep's GPS is further than the customer's geofence radius from the site."
          on={locationOn}
          saving={savingKey === "locOn"}
          disabled={!loaded}
          onChange={toggleLocation}
        />
        <div style={{ height: 1, background: AC.lineDim, margin: "10px 0" }} />
        <ToggleRow
          title="Timing exceptions"
          subtitle="Trigger for late check-ins (past start + grace) and early check-ins (before start − grace)."
          on={timingOn}
          saving={savingKey === "timeOn"}
          disabled={!loaded}
          onChange={toggleTiming}
        />
        <div style={{ height: 1, background: AC.lineDim, margin: "10px 0" }} />
        {/* Route optimization gate. Lives here next to the exception
            toggles because it's the same shape of org-wide rule —
            gates a piece of mobile-app behaviour from the admin.
            Some merch teams have customers with strict appointment
            times (school deliveries, retail-shelf-reset slots) where
            a re-ordered route would breach an SLA. Flipping this off
            hides the Optimize toggle on /route entirely. */}
        <ToggleRow
          title="Allow Route to optimize stop order"
          subtitle="When off, reps see their shifts in chronological order only — they can't reshuffle the day on the route planner. Turn off if customers have strict appointment slots."
          on={routeOptimizeOn}
          saving={savingKey === "routeOpt"}
          disabled={!loaded}
          onChange={toggleRouteOptimize}
        />
        <div style={{ height: 1, background: AC.lineDim, margin: "10px 0" }} />
        {/* Shift-request auto-approve. Moved here from
            /settings/organisation (May 13) so all rep-workflow
            governance toggles sit in one place. When on, reps
            tapping "Request a customer" on the mobile app bypass
            the requested_shifts queue and the shift is scheduled
            immediately for them. Default off so a fresh install
            routes everything through the manager. */}
        <ToggleRow
          title="Auto-approve shift requests from reps"
          subtitle="When on, reps' shift requests skip your inbox and the shift is scheduled straight away. You can still edit / cancel the resulting shifts via Schedule."
          on={autoApproveOn}
          saving={savingKey === "autoApprove"}
          disabled={!loaded}
          onChange={toggleAutoApprove}
        />
      </Card>

      <Card padding={20}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <NumberSetting
            label="Late check-in grace"
            unit="min"
            value={lateMin}
            onChange={setLateMin}
            onSave={saveLate}
            saving={savingKey === "late"}
            disabled={!loaded}
            hint={`Reps checking in within ${
              lateMin || 0
            } min of the shift's start time see no exception. After that, the late-check-in card appears and a reason is required.`}
          />
          <NumberSetting
            label="Early grace (check-in & check-out)"
            unit="min"
            value={earlyMin}
            onChange={setEarlyMin}
            onSave={saveEarly}
            saving={savingKey === "early"}
            disabled={!loaded}
            hint={`Symmetric: reps checking IN within ${
              earlyMin || 0
            } min of the scheduled start, OR checking OUT within ${
              earlyMin || 0
            } min of the scheduled end, see no exception. Outside that window the early card appears and a reason is required.`}
          />
        </div>

        <div style={{ height: 1, background: AC.line, margin: "20px 0" }} />

        <NumberSetting
          label="Default geofence radius for new customers"
          unit="m"
          value={defaultRadius}
          onChange={setDefaultRadius}
          onSave={saveRadius}
          saving={savingKey === "radius"}
          disabled={!loaded}
          full
          hint={
            <>
              Newly added customers start with this radius. You can override it per
              customer on{" "}
              <Link
                href="/customers"
                style={{ color: AC.brandDeep, textDecoration: "none" }}
              >
                each customer's Address tab
              </Link>
              . Off-site exceptions on check-in / check-out trigger when the rep's
              GPS is further than the customer's radius from the store.
            </>
          }
        />

        <div style={{ height: 1, background: AC.line, margin: "20px 0" }} />

        {/* Auto check-out time */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Auto check-out time (24h)
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 360 }}>
            <div style={{ flex: 1 }}>
              <TimeCombobox
                value={autoCheckoutTime}
                onChange={setAutoCheckoutTimeState}
                // Auto-checkout sweep runs at end-of-day; default window
                // 18:00–23:59 makes sense to most managers but we leave
                // the full 06:00–22:00 default since this is the same
                // 30-min grid the rest of the app uses.
                disabled={!loaded || savingKey === "autoCheckout"}
              />
            </div>
            <Btn
              size="sm"
              kind="primary"
              onClick={saveAutoCheckout}
              disabled={!loaded || savingKey === "autoCheckout"}
            >
              {savingKey === "autoCheckout" ? "Saving…" : "Save"}
            </Btn>
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            Reps sometimes forget to tap Check out. Any shift still in
            progress past this time is automatically marked complete and the
            rep's live-map dot is cleared. Default is <b style={{ color: AC.ink2 }}>23:59</b>{" "}
            (just before midnight local time). Yesterday's stragglers are
            always swept regardless of this time.
          </div>
        </div>

        <div style={{ height: 1, background: AC.line, margin: "20px 0" }} />

        {/* Photo quality tier (Feature C — May 13). Three named
            presets pick the maxDimension + JPEG quality for client-
            side compression before the rep uploads. Drives the size
            vs sharpness tradeoff for the photos that later end up
            in client-facing reports. */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Photo quality
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["standard", "high", "maximum"] as const).map((tier) => {
              const t = PHOTO_QUALITY_TIERS[tier];
              const active = photoTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => changePhotoTier(tier)}
                  disabled={!loaded || savingKey === "photoTier"}
                  style={{
                    flex: "1 1 0",
                    minWidth: 110,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: active ? AC.brand : "#fff",
                    color: active ? "#fff" : AC.ink,
                    border: `1px solid ${active ? AC.brand : AC.line}`,
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    opacity: !loaded ? 0.55 : 1,
                  }}
                >
                  <div>{t.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      opacity: 0.85,
                      marginTop: 2,
                    }}
                  >
                    ~{t.expectedKB}KB · {t.maxDimension}px
                  </div>
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            Used for rep-uploaded shift photos. <b style={{ color: AC.ink2 }}>Standard</b>{" "}
            (~400KB) is enough for most client reports. Bump to{" "}
            <b style={{ color: AC.ink2 }}>High</b> or{" "}
            <b style={{ color: AC.ink2 }}>Maximum</b> when print-grade quality
            matters. Hard cap of 2MB per photo is enforced regardless of tier.
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop: 14,
              padding: "8px 10px",
              background: AC.brandSoft,
              color: AC.brandInk,
              borderRadius: 8,
              fontFamily: AC.font,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {message}
          </div>
        )}
      </Card>
    </SettingsShell>
  );
}

function NumberSetting({
  label,
  unit,
  value,
  onChange,
  onSave,
  saving,
  disabled,
  hint,
  full,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  hint?: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label} ({unit})
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          maxWidth: full ? 360 : "100%",
        }}
      >
        <input
          type="number"
          min={0}
          value={value}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          style={{
            flex: 1,
            padding: "9px 11px",
            borderRadius: 10,
            border: `1px solid ${AC.line}`,
            background: "#fff",
            fontFamily: AC.fontMono,
            fontSize: 14,
            color: AC.ink,
          }}
        />
        <Btn size="sm" kind="primary" onClick={onSave} disabled={disabled || saving}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>
      {hint && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 6,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * ToggleRow — pill-style on/off switch with title + subtitle. Used for
 * the two exception toggles at the top of the page; designed to be
 * keyboard-accessible (the outer element is a button so Space and
 * Enter both flip the state) and to render the saving state as a
 * faded knob mid-transition.
 */
function ToggleRow({
  title,
  subtitle,
  on,
  saving,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  saving: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const isOff = !disabled && !on;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => !disabled && !saving && onChange(!on)}
      disabled={disabled || saving}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "8px 4px",
        border: "none",
        background: "transparent",
        cursor: disabled || saving ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13.5,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div
        aria-hidden
        style={{
          width: 42,
          height: 24,
          borderRadius: 99,
          background: on ? AC.brand : isOff ? "#cbd5e1" : AC.line,
          position: "relative",
          transition: "background .2s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            transition: "left .2s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,.18)",
            opacity: saving ? 0.6 : 1,
          }}
        />
      </div>
    </button>
  );
}
