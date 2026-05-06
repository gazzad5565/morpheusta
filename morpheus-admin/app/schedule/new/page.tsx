"use client";

/**
 * /schedule/new — schedule one or many shifts.
 *
 * Customer scope: All / Specific (one or many).
 * Recurrence: None / Weekly (pick weekdays + an "until" date).
 *
 * On submit, the cartesian product of (selected customers × generated
 * dates) becomes N shift rows. If the page was opened from /requests
 * we lock to a single customer + single date (the request semantics).
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import { createShift } from "@/lib/shifts-store";
import { listProfiles, getProfileById, displayName, type Profile } from "@/lib/profiles-store";
import { deleteRequest } from "@/lib/requests-store";
import { CustomerScopePicker, type CustomerScope } from "@/components/ui/CustomerScopePicker";
import { todayLocalISO, localISO } from "@/lib/format";
import type { Customer } from "@/lib/types";

const todayISO = todayLocalISO;

function addDaysISO(iso: string, days: number): string {
  // Parse as local-tz date (anchor to noon to avoid DST edge flips).
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
// Mon=0..Sun=6 (matching WEEKDAYS index above).
function jsDayToIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
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
  const fromRep = params.get("rep") || "";
  const fromCustomer = params.get("customer") || "";
  const fromRequest = params.get("request") || "";
  const fromDate = params.get("date") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Customer scope: null = all, [...] = specific (one or many).
  const [customerScope, setCustomerScope] = useState<CustomerScope>(null);
  const [repId, setRepId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState<string>(fromDate || todayISO());
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [distance, setDistance] = useState<string>("");
  const [tasksTotal, setTasksTotal] = useState<string>("4");

  // Recurrence
  const [repeatMode, setRepeatMode] = useState<"none" | "weekly">("none");
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [untilDate, setUntilDate] = useState<string>(addDaysISO(shiftDate, 28));

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Load EVERY profile (reps + managers) so the dropdown can assign
    // shifts to anyone with an account. Previously this filtered to
    // role='rep' which meant a manager couldn't pick up a shift
    // themselves and couldn't test the rep flow on their own login.
    // Sorted reps-first because that's the common case.
    Promise.all([listCustomers(), listProfiles()]).then(
      async ([cs, rs]) => {
        if (cancelled) return;
        setCustomers(cs);
        if (fromCustomer && cs.some((c) => c.id === fromCustomer)) {
          setCustomerScope([fromCustomer]);
        }
        const sorted = [...rs].sort((a, b) => {
          // role='rep' first, then by display name
          if (a.role !== b.role) return a.role === "rep" ? -1 : 1;
          return (a.name || a.email).localeCompare(b.name || b.email);
        });
        setReps(sorted);
        if (fromRep && sorted.some((r) => r.id === fromRep)) {
          setRepId(fromRep);
        } else if (fromRep) {
          // Edge case: rep id from URL isn't in profiles (deleted user?).
          // Fall back to the back-fill helper just in case.
          const extra = await getProfileById(fromRep);
          if (extra && !cancelled) {
            setReps([extra, ...sorted]);
            setRepId(fromRep);
          }
        }
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fromCustomer, fromRep]);

  // Default the "until" forward when shiftDate moves past it.
  useEffect(() => {
    if (untilDate < shiftDate) setUntilDate(addDaysISO(shiftDate, 28));
  }, [shiftDate, untilDate]);

  // Default: tick the day-of-week of the start date when toggling on weekly.
  useEffect(() => {
    if (repeatMode === "weekly" && weekdays.size === 0) {
      const dow = jsDayToIndex(new Date(shiftDate).getDay());
      setWeekdays(new Set([dow]));
    }
  }, [repeatMode, shiftDate, weekdays.size]);

  // Compute the dates the recurrence will generate.
  const generatedDates = useMemo(() => {
    if (repeatMode === "none") return [shiftDate];
    if (!untilDate || untilDate < shiftDate) return [shiftDate];
    if (weekdays.size === 0) return [];
    const out: string[] = [];
    // Anchor the date walk at noon-local so DST transitions can't flip
    // a Sunday into a Saturday and skip the wrong weekday.
    const start = new Date(shiftDate + "T12:00:00");
    const end = new Date(untilDate + "T12:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (weekdays.has(jsDayToIndex(d.getDay()))) {
        out.push(localISO(d));
      }
    }
    return out;
  }, [repeatMode, shiftDate, untilDate, weekdays]);

  // Resolve the actual customer ids being targeted.
  const targetedCustomerIds = useMemo(() => {
    if (customerScope === null) return customers.map((c) => c.id);
    return customerScope;
  }, [customerScope, customers]);

  const totalShifts = generatedDates.length * targetedCustomerIds.length;

  const toggleWeekday = (i: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const onSubmit = async () => {
    if (busy) return;
    setError(null);

    if (customerScope !== null && customerScope.length === 0) {
      return setError("Pick at least one customer, or switch to 'All customers'.");
    }
    if (targetedCustomerIds.length === 0) {
      return setError("No customers to schedule against.");
    }
    if (!shiftDate) return setError("Pick a start date.");
    if (!startTime || !endTime) return setError("Set start and end times.");
    if (startTime >= endTime) return setError("End time must be after start time.");
    if (repeatMode === "weekly") {
      if (weekdays.size === 0) return setError("Pick at least one weekday for the recurrence.");
      if (!untilDate) return setError("Pick an 'until' date for the recurrence.");
      if (untilDate < shiftDate) return setError("'Until' date must be on or after the start date.");
    }
    if (generatedDates.length === 0) {
      return setError("No dates generated by the current recurrence settings.");
    }
    const tasksNum = parseInt(tasksTotal, 10);
    if (Number.isNaN(tasksNum) || tasksNum < 0) return setError("Tasks must be a number.");

    // From-request flow forces single (single customer × single date).
    if (fromRequest && (targetedCustomerIds.length !== 1 || generatedDates.length !== 1)) {
      return setError(
        "Request approvals must be a single shift. Switch off recurrence and pick one customer."
      );
    }

    setBusy(true);
    setProgress({ done: 0, total: totalShifts });
    const errs: string[] = [];
    let done = 0;

    // Insert sequentially so we can show progress and collect errors.
    for (const date of generatedDates) {
      for (const cid of targetedCustomerIds) {
        const r = await createShift({
          customer_id: cid,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          distance_label: distance.trim(),
          tasks_total: tasksNum,
          rep_id: repId || null,
        });
        done += 1;
        setProgress({ done, total: totalShifts });
        if (!r.ok) {
          errs.push(`${date} · ${cid}: ${r.error || "failed"}`);
        }
      }
    }

    if (fromRequest && errs.length === 0) {
      const del = await deleteRequest(fromRequest, "scheduled");
      if (!del.ok) {
        // eslint-disable-next-line no-console
        console.warn("[schedule/new] couldn't delete request:", del.error);
      }
    }

    setBusy(false);
    setProgress(null);
    if (errs.length > 0) {
      setError(
        `Created ${done - errs.length} of ${done} shifts. Errors:\n` +
          errs.slice(0, 5).join("\n") +
          (errs.length > 5 ? `\n…and ${errs.length - 5} more` : "")
      );
      return;
    }
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
            Pick the customer scope, the rep (or leave unassigned for any rep to claim), the
            date and times. Use <b style={{ color: AC.ink }}>Repeat weekly</b> to spray the
            same shift across a date range.
          </div>

          <Field label="Customers" required>
            <CustomerScopePicker
              customers={customers}
              loading={loading}
              value={customerScope}
              onChange={setCustomerScope}
              allLabel="All customers"
              allSubLabel={`Will create one shift per customer (${customers.length})`}
              specificLabel="Specific customers"
              specificSubLabel="Pick one or many"
            />
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
                  {r.role !== "rep" ? ` · ${r.role}` : ""}
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
                No reps signed up yet.
              </div>
            )}
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Start date" required>
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

          {/* Recurrence */}
          <Field label="Repeat">
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <RepeatOption
                active={repeatMode === "none"}
                onClick={() => setRepeatMode("none")}
                title="One-off"
                sub="Just this date"
              />
              <RepeatOption
                active={repeatMode === "weekly"}
                onClick={() => setRepeatMode("weekly")}
                title="Weekly"
                sub="Pick weekdays + 'until' date"
              />
            </div>
            {repeatMode === "weekly" && (
              <div
                style={{
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  padding: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11,
                    color: AC.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  On these days
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {WEEKDAYS.map((label, i) => {
                    const on = weekdays.has(i);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(i)}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 99,
                          background: on ? AC.brand : "#fff",
                          color: on ? "#fff" : AC.ink2,
                          border: `1px solid ${on ? AC.brand : AC.line}`,
                          fontFamily: AC.font,
                          fontSize: 12.5,
                          fontWeight: 600,
                          letterSpacing: -0.1,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <Field label="Until (inclusive)" required>
                  <input
                    type="date"
                    value={untilDate}
                    min={shiftDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                    marginTop: 4,
                  }}
                >
                  Will generate {generatedDates.length} date{generatedDates.length === 1 ? "" : "s"}
                  {generatedDates.length > 0 && (
                    <>
                      : <b style={{ color: AC.ink2 }}>{generatedDates[0]}</b> →{" "}
                      <b style={{ color: AC.ink2 }}>{generatedDates[generatedDates.length - 1]}</b>
                    </>
                  )}
                </div>
              </div>
            )}
          </Field>

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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {progress && (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.mute,
                  marginRight: 8,
                }}
              >
                Creating {progress.done} / {progress.total}…
              </div>
            )}
            <Btn onClick={() => router.push("/schedule")} disabled={busy}>
              Cancel
            </Btn>
            <Btn
              kind="primary"
              icon="check"
              onClick={onSubmit}
              disabled={busy || customers.length === 0 || totalShifts === 0}
            >
              {busy
                ? "Saving…"
                : totalShifts === 1
                ? "Create shift"
                : `Create ${totalShifts} shifts`}
            </Btn>
          </div>
        </Card>

        {/* Preview / summary */}
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
              Summary
            </div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <SummaryRow
              label="Customers"
              value={
                customerScope === null
                  ? `All (${customers.length})`
                  : customerScope.length === 0
                  ? "—"
                  : `${customerScope.length} selected`
              }
            />
            <SummaryRow
              label="Rep"
              value={repId ? displayName(reps.find((r) => r.id === repId)!) : "Unassigned (claimable)"}
            />
            <SummaryRow
              label="Dates"
              value={
                repeatMode === "none"
                  ? shiftDate
                  : `${generatedDates.length} dates · ${shiftDate} → ${untilDate}`
              }
            />
            <SummaryRow label="Window" value={`${startTime} – ${endTime}`} />
            <div style={{ height: 1, background: AC.line, margin: "4px 0" }} />
            <div
              style={{
                padding: 12,
                background: AC.brandSoft,
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 700,
                color: AC.brandInk,
                textAlign: "center",
              }}
            >
              {totalShifts} shift{totalShifts === 1 ? "" : "s"} will be created
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          width: 80,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 13,
          color: AC.ink,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RepeatOption({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? AC.brandSoft : "#fff",
        border: `1px solid ${active ? AC.brand : AC.line}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 600,
          color: active ? AC.brandInk : AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: active ? AC.brandDeep : AC.mute,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </button>
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
