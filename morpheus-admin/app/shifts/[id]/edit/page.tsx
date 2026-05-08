"use client";

/**
 * /shifts/[id]/edit — edit a scheduled shift before the rep checks in.
 *
 * Editable: customer, rep, date, start/end times. Distance label was
 * removed from this form (the rep app derives "X km away" from the
 * customer's saved coords + the rep's live position). Total tasks
 * is now display-only — derived from customer_tasks count for the
 * shift's customer (specific + universal). The shifts.tasks_total
 * column is still updated on save so existing reports stay aligned.
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
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import {
  getShiftById,
  updateShift,
  createShift,
  deleteShift,
  isShiftEditable,
} from "@/lib/shifts-store";
import { listCustomers } from "@/lib/customers-store";
import { listSitesForCustomer, type CustomerSite } from "@/lib/sites-store";
import {
  listProfiles,
  getProfileById,
  displayName,
  type Profile,
} from "@/lib/profiles-store";
import { countTasksForCustomers } from "@/lib/tasks-store";
import { localISO } from "@/lib/format";
import type { Customer } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
function jsDayToIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

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
  // Sites for the currently-selected customer + the chosen site_id.
  // Auto-resolves when the customer has a single active site;
  // requires a manual pick when there are multiple.
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // Live count of customer_tasks rows for the currently-selected
  // customer (specific + universal). Derived; not editable. Falls
  // back to the row's stored tasks_total while we wait for the
  // first count to arrive.
  const [liveTaskCount, setLiveTaskCount] = useState<number | null>(null);
  const [storedTasksTotal, setStoredTasksTotal] = useState<number>(0);
  // Existing series id, if this shift came from a recurring create.
  // We preserve it so any siblings spawned from this edit page join the
  // same group.
  const [seriesId, setSeriesId] = useState<string | null>(null);

  // Recurrence section — off by default. When toggled, the manager can
  // promote this single shift into a series by ticking weekdays + an
  // until-date. On save we update this row AND insert siblings for the
  // other dates, all sharing the same series_id.
  const [repeatOn, setRepeatOn] = useState(false);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [untilDate, setUntilDate] = useState<string>("");

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
      setSiteId(shift.site_id ?? "");
      setRepId(shift.rep_id ?? "");
      setShiftDate(shift.shift_date);
      // start_time/end_time come back as "HH:MM:SS"; <input type="time">
      // wants "HH:MM".
      setStartTime((shift.start_time || "").slice(0, 5));
      setEndTime((shift.end_time || "").slice(0, 5));
      setStoredTasksTotal(shift.tasks_total ?? 0);
      setSeriesId(shift.series_id ?? null);
      setOriginalState(shift.state);
      setCustomers(cs);
      // Default until = +27 days from this shift's date. Same
      // off-by-one-safe value /schedule/new uses.
      setUntilDate(addDaysISO(shift.shift_date, 27));
      // Pre-tick today's weekday so the picker isn't empty when the
      // manager flicks Repeat on.
      setWeekdays(
        new Set([jsDayToIndex(new Date(shift.shift_date + "T12:00:00").getDay())])
      );

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

  // Recompute the live task count whenever the customer changes —
  // including the initial hydrate. Falls back to the row's stored
  // value if the count call fails for any reason.
  useEffect(() => {
    if (!customerId) {
      setLiveTaskCount(null);
      return;
    }
    let cancelled = false;
    countTasksForCustomers([customerId]).then((m) => {
      if (cancelled) return;
      setLiveTaskCount(m.get(customerId) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  // Load the customer's active sites. Auto-resolve to the only site
  // when there's exactly one (so single-site customers never see a
  // picker). When the customer changes, clear the existing site_id
  // unless it's still valid for the new customer.
  useEffect(() => {
    if (!customerId) {
      setSites([]);
      return;
    }
    let cancelled = false;
    listSitesForCustomer(customerId).then((rows) => {
      if (cancelled) return;
      setSites(rows);
      setSiteId((prev) => {
        if (rows.length === 1) return rows[0].id;
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return "";
      });
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const effectiveTaskTotal = liveTaskCount ?? storedTasksTotal;

  // When Repeat is on, compute the additional sibling dates we'd
  // generate. Excludes the current shift's date (already covered by
  // the update). Empty when repeat is off or settings are invalid.
  const siblingDates = useMemo(() => {
    if (!repeatOn) return [];
    if (!shiftDate || !untilDate || untilDate < shiftDate) return [];
    if (weekdays.size === 0) return [];
    const out: string[] = [];
    const start = new Date(shiftDate + "T12:00:00");
    const end = new Date(untilDate + "T12:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = localISO(d);
      if (iso === shiftDate) continue; // skip the row we're editing
      if (weekdays.has(jsDayToIndex(d.getDay()))) {
        out.push(iso);
      }
    }
    return out;
  }, [repeatOn, shiftDate, untilDate, weekdays]);

  const toggleWeekday = (i: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const onSave = async () => {
    if (busy) return;
    setError(null);
    if (!customerId) return setError("Pick a customer.");
    if (sites.length === 0) {
      return setError(
        "This customer has no active sites. Open the customer's Sites tab and add one before scheduling."
      );
    }
    if (!siteId) return setError("Pick a site for this shift.");
    if (!shiftDate) return setError("Pick a date.");
    if (!startTime || !endTime) return setError("Set start and end times.");
    if (startTime >= endTime) return setError("End time must be after start time.");
    if (repeatOn && weekdays.size === 0) {
      return setError("Pick at least one weekday for the recurrence.");
    }
    if (repeatOn && untilDate && untilDate < shiftDate) {
      return setError("Until-date must be on or after this shift's date.");
    }

    setBusy(true);

    // 1. Decide whether we need a series_id. Reuse the existing one
    //    if the shift is already part of a series; mint a fresh uuid
    //    when promoting a one-off into a series for the first time.
    //    If repeat is off and there are no siblings to create, leave
    //    the existing series_id untouched.
    let nextSeriesId = seriesId;
    if (repeatOn && siblingDates.length > 0 && !nextSeriesId) {
      nextSeriesId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // 2. Update this shift first.
    const updateRes = await updateShift(id, {
      customer_id: customerId,
      site_id: siteId || null,
      rep_id: repId || null,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      tasks_total: effectiveTaskTotal,
      // updateShift doesn't currently accept series_id in its patch
      // shape — that's fine, the row's existing series_id is left
      // untouched on update. Siblings below pick it up via createShift.
    });
    if (!updateRes.ok) {
      setBusy(false);
      setError(updateRes.error || "Couldn't save.");
      return;
    }

    // 3. Spawn siblings. Sequential so we can collect partial errors;
    //    same pattern as /schedule/new.
    const errs: string[] = [];
    for (const date of siblingDates) {
      const cr = await createShift({
        customer_id: customerId,
        site_id: siteId || null,
        rep_id: repId || null,
        shift_date: date,
        start_time: startTime,
        end_time: endTime,
        tasks_total: effectiveTaskTotal,
        distance_label: "",
        series_id: nextSeriesId,
      });
      if (!cr.ok) errs.push(`${date}: ${cr.error || "failed"}`);
    }

    setBusy(false);
    if (errs.length > 0) {
      setError(
        `Saved this shift, but ${errs.length} sibling${
          errs.length === 1 ? "" : "s"
        } failed:\n` +
          errs.slice(0, 5).join("\n") +
          (errs.length > 5 ? `\n…and ${errs.length - 5} more` : "")
      );
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
            <Combobox
              value={customerId || null}
              onChange={(v) => setCustomerId(v ?? "")}
              triggerIcon="customer"
              placeholder="Pick a customer…"
              clearable={false}
              options={customers.map((c) => ({
                value: c.id,
                label: c.name,
                sublabel: `#${c.code}`,
                color: c.color || undefined,
              }))}
            />
          </Field>

          {/* Site picker — only renders for multi-site customers.
              Single-site customers auto-resolve so the field is
              invisible. Customers with no active sites surface the
              warning state. */}
          {customerId && sites.length === 0 && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 12.5,
                marginBottom: 14,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>
                This customer has no active sites yet. Open their <b>Sites</b>{" "}
                tab to add one before scheduling.
              </span>
            </div>
          )}
          {sites.length > 1 && (
            <Field label="Site" required hint="Where will this shift happen?">
              <Combobox
                value={siteId || null}
                onChange={(v) => setSiteId(v ?? "")}
                triggerIcon="pin"
                placeholder="Pick a site…"
                clearable={false}
                options={sites.map((s) => ({
                  value: s.id,
                  label: s.name,
                  sublabel: s.address ?? undefined,
                }))}
              />
            </Field>
          )}

          <Field
            label="Assign to rep"
            hint="Leave blank to make the shift claimable by any rep."
          >
            <Combobox
              value={repId || null}
              onChange={(v) => setRepId(v ?? "")}
              triggerIcon="reps"
              placeholder="— Unassigned (claimable) —"
              options={reps.map((r) => ({
                value: r.id,
                label: displayName(r),
                sublabel: r.email,
              }))}
            />
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

          {/* Distance label removed — derived live from customer coords
              + rep location on the mobile card. Total tasks is now
              auto-derived from customer_tasks; we surface the count as
              a read-only chip so the manager can see what the shift
              will display, but they edit it via the Tasks page,
              not here. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: AC.bg,
              border: `1px solid ${AC.lineDim}`,
              marginBottom: 16,
            }}
          >
            <AGlyph name="tasks" size={14} color={AC.mute} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  color: AC.mute,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                Tasks
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink,
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {effectiveTaskTotal} task{effectiveTaskTotal === 1 ? "" : "s"}{" "}
                <span
                  style={{
                    color: AC.mute,
                    fontWeight: 500,
                    fontSize: 12,
                  }}
                >
                  · auto-counted from customer
                </span>
              </div>
            </div>
            <Link
              href="/tasks"
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                fontWeight: 600,
                color: AC.brandDeep,
                textDecoration: "none",
              }}
            >
              Manage tasks →
            </Link>
          </div>

          {/* Repeat / promote-to-series — same controls as
              /schedule/new's Step 2 recurrence panel. Off by default
              (the common case is "edit just this one"). When on, we
              keep this row + spawn siblings for the picked weekdays
              within the until-date range, all sharing series_id so
              they show up linked on /schedule/manage. */}
          <div
            style={{
              border: `1px solid ${AC.line}`,
              borderRadius: 10,
              background: "#fff",
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setRepeatOn((v) => !v)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 22,
                  borderRadius: 99,
                  background: repeatOn ? AC.brand : AC.line,
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 160ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: repeatOn ? 17 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: 99,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(10,15,30,.25)",
                    transition: "left 160ms ease",
                  }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  Repeat across more days
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {seriesId
                    ? "This shift is part of an existing series. Adding more days extends it."
                    : "Promote this single shift into a recurring series — new shifts share the same customer, rep, and time."}
                </div>
              </div>
              <AGlyph
                name={repeatOn ? "chev-u" : "chev-d"}
                size={14}
                color={AC.mute}
              />
            </button>
            {repeatOn && (
              <div
                style={{
                  borderTop: `1px solid ${AC.lineDim}`,
                  padding: 14,
                  background: AC.bg,
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
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
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
                    fontSize: 12,
                    color: AC.ink2,
                    background: "#fff",
                    border: `1px solid ${AC.lineDim}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    marginTop: 6,
                    lineHeight: 1.4,
                  }}
                >
                  {siblingDates.length === 0
                    ? "No additional dates from these settings — pick more weekdays or extend the until-date."
                    : `Will create ${siblingDates.length} additional shift${
                        siblingDates.length === 1 ? "" : "s"
                      } between ${siblingDates[0]} and ${
                        siblingDates[siblingDates.length - 1]
                      }, plus update this one. ${
                        siblingDates.length + 1
                      } total.`}
                </div>
              </div>
            )}
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
                {busy
                  ? "Saving…"
                  : siblingDates.length > 0
                  ? `Save + create ${siblingDates.length} more`
                  : "Save changes"}
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
              Until then, you can change customer, rep, date, and time
              here.{" "}
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
