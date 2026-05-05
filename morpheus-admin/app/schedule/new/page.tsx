"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import { createShift } from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { deleteRequest } from "@/lib/requests-store";
import type { Customer } from "@/lib/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewShiftPageWrapper() {
  return (
    <Suspense fallback={null}>
      <NewShiftPage />
    </Suspense>
  );
}

function NewShiftPage() {
  const router = useRouter();
  const params = useSearchParams();
  // When the page is opened from /requests via "Approve & schedule", these
  // params pre-fill the form and trigger a request deletion on save.
  const fromRep = params.get("rep") || "";
  const fromCustomer = params.get("customer") || "";
  const fromRequest = params.get("request") || "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerId, setCustomerId] = useState<string>("");
  const [repId, setRepId] = useState<string>(""); // "" = unassigned (claimable)
  const [shiftDate, setShiftDate] = useState<string>(todayISO());
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [distance, setDistance] = useState<string>("");
  const [tasksTotal, setTasksTotal] = useState<string>("4");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomers(), listProfiles({ role: "rep" })]).then(
      ([cs, rs]) => {
        if (cancelled) return;
        setCustomers(cs);
        // Pre-fill from a rep request when present, otherwise default to first.
        const initialCustomer =
          fromCustomer && cs.some((c) => c.id === fromCustomer)
            ? fromCustomer
            : cs[0]?.id || "";
        setCustomerId(initialCustomer);
        setReps(rs);
        if (fromRep && rs.some((r) => r.id === fromRep)) {
          setRepId(fromRep);
        }
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fromCustomer, fromRep]);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedRep = reps.find((r) => r.id === repId);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!customerId) return setError("Pick a customer.");
    if (!shiftDate) return setError("Pick a date.");
    if (!startTime || !endTime) return setError("Set start and end times.");
    if (startTime >= endTime) return setError("End time must be after start time.");
    const tasksNum = parseInt(tasksTotal, 10);
    if (Number.isNaN(tasksNum) || tasksNum < 0) return setError("Tasks must be a number.");

    setBusy(true);
    const result = await createShift({
      customer_id: customerId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      distance_label: distance.trim(),
      tasks_total: tasksNum,
      rep_id: repId || null, // empty string → null (claimable)
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error || "Failed to create shift.");
      return;
    }
    // If we got here from a rep request, clean up that pending row so the
    // Requests inbox reflects that this is now scheduled.
    if (fromRequest) {
      const del = await deleteRequest(fromRequest);
      if (!del.ok) {
        // Don't block the navigation — the shift is created. Just log.
        // eslint-disable-next-line no-console
        console.warn("[schedule/new] couldn't delete request:", del.error);
      }
    }
    setBusy(false);
    router.push(fromRequest ? "/requests" : "/schedule");
  };

  return (
    <AdminShell breadcrumbs={["Home", "Schedule", "New shift"]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Schedule a shift</SectionTitle>
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
            Creates an unassigned shift. Reps see it under{" "}
            <b style={{ color: AC.ink }}>Unscheduled · Available</b> on their phone, and can{" "}
            <b style={{ color: AC.ink }}>Claim</b> it to take it on. Phase 4 will let you
            assign directly to a specific rep.
          </div>

          <Field label="Customer" required>
            {loading ? (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                  padding: 12,
                }}
              >
                Loading customers…
              </div>
            ) : customers.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                  background: AC.bg,
                  borderRadius: 8,
                }}
              >
                No customers in the database yet. Add one first via the{" "}
                <a
                  href="/customers/new"
                  style={{ color: AC.brandDeep, fontWeight: 600 }}
                >
                  Customers page
                </a>
                .
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={inputStyle}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.code} · {c.region}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label="Assign to rep"
            hint="Leave blank to make the shift claimable by any rep."
          >
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              style={inputStyle}
              disabled={loading}
            >
              <option value="">— Unassigned (claimable) —</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {displayName(r)} · {r.email}
                </option>
              ))}
            </select>
            {!loading && reps.length === 0 && (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.warn,
                  marginTop: 6,
                }}
              >
                No reps signed up yet. Have a rep sign up via the mobile app first, or leave
                this blank to allow any rep to claim the shift.
              </div>
            )}
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
            <Field label="Distance label" hint="Display only — what the rep sees on their card.">
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
                onChange={(e) => setTasksTotal(e.target.value.replace(/\D/g, ""))}
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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => router.push("/schedule")}>Cancel</Btn>
            <Btn
              kind="primary"
              icon="check"
              onClick={onSubmit}
              disabled={busy || customers.length === 0}
            >
              {busy ? "Saving…" : "Create shift"}
            </Btn>
          </div>
        </Card>

        {/* Preview */}
        <Card padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${AC.line}` }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
          </div>
          {selectedCustomer ? (
            <>
              <div
                style={{
                  height: 64,
                  background: `${selectedCustomer.color}18`,
                  position: "relative",
                }}
              >
                <div style={{ position: "absolute", left: 16, bottom: -16 }}>
                  <CustomerSwatch customer={selectedCustomer} size={44} />
                </div>
              </div>
              <div style={{ padding: "24px 16px 14px" }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {selectedCustomer.name}
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                    marginTop: 2,
                  }}
                >
                  {shiftDate} · {startTime}–{endTime}
                  {distance && ` · ${distance}`}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: "6px 9px",
                    borderRadius: 6,
                    background: selectedRep ? AC.brandSoft : AC.bg,
                    fontFamily: AC.font,
                    fontSize: 11,
                    color: selectedRep ? AC.brandInk : AC.mute,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <AGlyph
                    name={selectedRep ? "reps" : "info"}
                    size={12}
                    color={selectedRep ? AC.brandDeep : AC.mute}
                  />
                  {selectedRep
                    ? `Assigned to ${displayName(selectedRep)}`
                    : "Unassigned — reps can claim it"}
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 20,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Pick a customer to preview
            </div>
          )}
        </Card>
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
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
