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
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getLateGraceMinutes,
  setLateGraceMinutes,
  getEarlyGraceMinutes,
  setEarlyGraceMinutes,
  getDefaultGeofenceRadius,
  setDefaultGeofenceRadius,
} from "@/lib/settings-store";

export default function CheckInRulesPage() {
  const [lateMin, setLateMin] = useState<string>("10");
  const [earlyMin, setEarlyMin] = useState<string>("15");
  const [defaultRadius, setDefaultRadius] = useState<string>("100");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getLateGraceMinutes(),
      getEarlyGraceMinutes(),
      getDefaultGeofenceRadius(),
    ]).then(([late, early, radius]) => {
      setLateMin(String(late));
      setEarlyMin(String(early));
      setDefaultRadius(String(radius));
      setLoaded(true);
    });
  }, []);

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

  return (
    <SettingsShell
      section="check-in-rules"
      description="Thresholds that gate when the mobile app shows an exception card on check-in / check-out. Below each threshold no exception UI appears and the rep can proceed straight away."
    >
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
            label="Early check-out grace"
            unit="min"
            value={earlyMin}
            onChange={setEarlyMin}
            onSave={saveEarly}
            saving={savingKey === "early"}
            disabled={!loaded}
            hint={`Reps checking out within ${
              earlyMin || 0
            } min of the scheduled end see no exception. Earlier than that, the early-check-out card appears and a reason is required.`}
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
