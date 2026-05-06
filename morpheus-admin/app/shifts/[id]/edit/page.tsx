"use client";

/**
 * /shifts/[id]/edit — edit a scheduled shift before the rep checks in.
 *
 * Editable: customer, rep, date, start/end times, distance label,
 *           tasks_total.
 *
 * Locking rule: once the rep checks in (state moves to 'in-progress',
 * 'late' or 'complete'), this page redirects to the read-only detail
 * page. updateShift() in the store enforces the same rule server-side.
 *
 * Routing: list pages call shiftHref() from shifts-store, which sends
 * scheduled shifts here and locked ones to /shifts/[id].
 */

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import {
  getShiftById,
  updateShift,
  deleteShift,
  isShiftEditable,
} from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import {
  listProfiles,
  getProfileById,
  displayName,
  type Profile,
} from "@/lib/profiles-store";
import type { Customer } from "@/lib/types";

export default function EditShiftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [originalState, setOriginalState] = useState<string>("scheduled");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Profile[]>([]);

  // Form fields
  const [customerId, setCustomerId] = useState("");
  const [repId, setRepId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [distance, setDistance] = useState("");
  const [tasksTotal, setTasksTotal] = useState("4");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [shift, cs, rs] = await Promise.all([
        getShiftById(id),
        listCustomers(),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      if (!shift) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      // Lock: redirect locked shifts straight to the detail view so the
      // /edit URL doesn't show a stale form for a shift that's already
      // running.
      if (!isShiftEditable(shift.state)) {
        router.replace(`/shifts/${id}`);
        return;
      }

      // Hydrate the form.
      setCustomerId(shift.customer_id);
      setRepId(shift.rep_id ?? "");
      setShiftDate(shift.shift_date);
      // start_time/end_time come back as "HH:MM:SS"; <input type="time">
      // wants "HH:MM".
      setStartTime((shift.start_time || "").slice(0, 5));
      setEndTime((shift.end_time || "").slice(0, 5));
      setDistance(shift.distance_label || "");
      setTasksTotal(String(shift.tasks_total ?? 4));
      setOriginalState(shift.state);
      setCustomers(cs);

      // If the assigned rep isn't in the role='rep' list (e.g. a manager
      // who happens to have a shift for testing), back-fill them so the
      // dropdown can preserve + display the assignment.
      let repList = rs;
      if (
        shift.rep_id &&
        !rs.some((r) => r.id === shift.rep_id)
      ) {
        const extra = await getProfileById(shift.rep_id);
        if (extra && !cancelled) repList = [extra, ...rs];
      }
      setReps(repList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId]
  );

  const onSave = async () => {
    if (busy) return;
    setError(null);
    if (!customerId) return setError("Pick a customer.");
    if (!shiftDate) return setError("Pick a date.");
    if (!startTime || !endTime) return setError("Set start and end times.");
    if (startTime >= endTime) return setError("End time must be after start time.");
    const tasksNum = parseInt(tasksTotal, 10);
    if (Number.isNaN(tasksNum) || tasksNum < 0)
      return setError("Tasks must be a number.");

    setBusy(true);
    const r = await updateShift(id, {
      customer_id: customerId,
      rep_id: repId || null,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      distance_label: distance.trim(),
      tasks_total: tasksNum,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    router.push(`/schedule`);
  };

  const onDelete = async () => {
    if (busy) return;
    if (!confirm("Delete this shift? This can't be undone.")) return;
    setBusy(true);
    const r = await deleteShift(id);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't delete.");
      return;
    }
    router.push("/schedule");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Schedule", "…"]}>
        <div style={{ padding: 24, fontFamily: AC.font, color: AC.mute }}>
          Loading shift…
        </div>
      </AdminShell>
    );
  }
  if (notFound) {
    return (
      <AdminShell breadcrumbs={["Home", "Schedule", "Not found"]}>
        <div style={{ padding: 20 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink }}>
              We couldn't find that shift.
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn onClick={() => router.push("/schedule")}>Back to schedule</Btn>
            </div>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      breadcrumbs={[
        "Home",
        "Schedule",
        { label: customer?.name || "Edit shift" },
      ]}
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Edit shift</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginTop: 4,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Editing is allowed while the shift is{" "}
            <b style={{ color: AC.ink }}>scheduled</b>. Once the rep checks in,
            this page redirects to the read-only detail view.
          </div>

          <Field label="Customer" required>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={inputStyle}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · #{c.code}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Assign to rep"
            hint="Leave blank to make the shift claimable by any rep."
          >
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— Unassigned (claimable) —</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {displayName(r)} · {r.email}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Date" required>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Start time" required>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="End time" required>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <Field
              label="Distance label"
              hint="Display only — what the rep sees on their card."
            >
              <input
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="e.g. 3 km away"
                style={inputStyle}
              />
            </Field>
            <Field label="Total tasks" hint="How many tasks at this site.">
              <input
                value={tasksTotal}
                onChange={(e) =>
                  setTasksTotal(e.target.value.replace(/\D/g, ""))
                }
                style={{ ...inputStyle, fontFamily: AC.fontMono }}
              />
            </Field>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "pre-line",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginTop: 6,
            }}
          >
            <Btn kind="danger" onClick={onDelete} disabled={busy}>
              Delete
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => router.push("/schedule")} disabled={busy}>
                Cancel
              </Btn>
              <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={16}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              State
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 600,
                color: AC.ink,
                letterSpacing: -0.1,
                marginBottom: 6,
              }}
            >
              {originalState}
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.ink2,
                lineHeight: 1.55,
              }}
            >
              The shift becomes read-only the moment the rep checks in.
              Until then, you can change customer, rep, date, time, distance
              label, and total tasks here.{" "}
              <Link
                href={`/shifts/${id}`}
                style={{
                  color: AC.brandDeep,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Open detail view →
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
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
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
