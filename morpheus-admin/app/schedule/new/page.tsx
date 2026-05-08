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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Combobox } from "@/components/ui/Combobox";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import { listSitesByCustomerIds, type CustomerSite } from "@/lib/sites-store";
import { createShift, listShiftsInRange } from "@/lib/shifts-store";
import { listProfiles, getProfileById, displayName, type Profile } from "@/lib/profiles-store";
import { deleteRequest } from "@/lib/requests-store";
import { countTasksForCustomers } from "@/lib/tasks-store";
import { CustomerScopePicker, type CustomerScope } from "@/components/ui/CustomerScopePicker";
import { RepScopePicker, type RepScope } from "@/components/ui/RepScopePicker";
import { todayLocalISO, localISO } from "@/lib/format";
import type { Customer } from "@/lib/types";

const todayISO = todayLocalISO;

function addDaysISO(iso: string, days: number): string {
  // Parse as local-tz date (anchor to noon to avoid DST edge flips).
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "08:30" → 510 (minutes since midnight). Returns 0 on garbage. */
function hhmmToMin(t: string): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const m = parseInt(mm, 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Add one hour to "HH:MM" — clamps to 23:59 (no day rollover). */
function addHourHHMM(t: string): string {
  if (!isValidHHMM(t)) return "10:00";
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  const h2 = Math.min(23, h + 1);
  return `${String(h2).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  // ?start=HH:MM optionally pre-fills the start time. End time always
  // defaults to start + 1h unless ?end=HH:MM is also supplied.
  const fromStart = params.get("start") || "";
  const fromEnd = params.get("end") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reps, setReps] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Customer scope: null = all, [...] = specific (one or many).
  // Default to [] (Specific, nothing picked) instead of null (All), so a
  // manager can't accidentally bulk-create one shift per customer just
  // by hitting Create. Forces an explicit pick — the most common case
  // is a single shift, not a 16-customer spray.
  const [customerScope, setCustomerScope] = useState<CustomerScope>([]);
  // Rep scope mirrors the customer pattern:
  //   null = unassigned (rep_id = NULL on the created shift)
  //   []   = none picked yet (caller treats as invalid)
  //   [id, ...] = these reps; cartesian product with customers + dates
  // Default is null (single shift, claimable) which preserves the
  // previous form's "leave it blank" behaviour.
  const [repScope, setRepScope] = useState<RepScope>(null);
  const [shiftDate, setShiftDate] = useState<string>(fromDate || todayISO());
  const [startTime, setStartTime] = useState<string>(
    isValidHHMM(fromStart) ? fromStart : "09:00"
  );
  const [endTime, setEndTime] = useState<string>(
    isValidHHMM(fromEnd)
      ? fromEnd
      : addHourHHMM(isValidHHMM(fromStart) ? fromStart : "09:00")
  );
  // Recurrence
  const [repeatMode, setRepeatMode] = useState<"none" | "weekly">("none");
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  // Default until-date sits 27 days out (NOT 28). The cartesian walk
  // includes both endpoints, so a 28-day inclusive range hits the
  // starting weekday five times — turning a "4 weeks of Mon-Fri"
  // intent into 21 shifts instead of 20. 27 days = exactly 4 calendar
  // weeks regardless of which day-of-week the rep starts on.
  const [untilDate, setUntilDate] = useState<string>(addDaysISO(shiftDate, 27));

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live "tasks per customer" map. Updates whenever the customer
  // scope changes so the form can show "5 tasks · auto-counted"
  // alongside the picker — same chip the Edit page surfaces.
  const [tasksByCustomer, setTasksByCustomer] = useState<Map<string, number>>(
    () => new Map()
  );

  // Sites per customer. Populated for every selected customer so we
  // know whether to show the per-customer site picker (>1 active site)
  // or auto-resolve invisibly (exactly 1 active site). Customers with
  // ZERO active sites can't be scheduled — the form blocks with a
  // clear "add a site to this customer first" error.
  const [sitesByCustomer, setSitesByCustomer] = useState<
    Record<string, CustomerSite[]>
  >({});
  // Manager's chosen site per customer. Filled in automatically for
  // single-site customers; required user pick for multi-site.
  const [siteChoice, setSiteChoice] = useState<Record<string, string>>({});

  // Conflicts found for the picked (rep × date × time) tuple. Each
  // entry represents a shift that already exists for one of the
  // selected reps on one of the generated dates and overlaps the
  // chosen time window. Empty = clear to schedule.
  interface ConflictHit {
    repId: string;
    repName: string;
    date: string;
    customerName: string;
    start: string;
    end: string;
  }
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);

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
          setRepScope([fromRep]);
        } else if (fromRep) {
          // Edge case: rep id from URL isn't in profiles (deleted user?).
          // Fall back to the back-fill helper just in case.
          const extra = await getProfileById(fromRep);
          if (extra && !cancelled) {
            setReps([extra, ...sorted]);
            setRepScope([fromRep]);
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

  // Resolve the rep ids each shift will be created for. `null` means
  // "one shift, unassigned" — a single null entry keeps the cartesian
  // multiplication clean.
  const targetedRepIds = useMemo<(string | null)[]>(() => {
    if (repScope === null) return [null];
    return repScope;
  }, [repScope]);

  const totalShifts =
    generatedDates.length * targetedCustomerIds.length * targetedRepIds.length;

  // Refresh the per-customer task count whenever the customer scope
  // settles. Debounced via the dependency on the resolved-id array
  // string so we don't re-query on every render. countTasksForCustomers
  // batches into two queries no matter the input size.
  useEffect(() => {
    let cancelled = false;
    if (targetedCustomerIds.length === 0) {
      setTasksByCustomer(new Map());
      return;
    }
    countTasksForCustomers(targetedCustomerIds).then((m) => {
      if (!cancelled) setTasksByCustomer(m);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately stringifying so we don't refetch on every render
    // when the array reference is fresh but contents haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetedCustomerIds.join(",")]);

  // Load sites for every selected customer. Auto-resolve to the only
  // active site when a customer has exactly one (so single-site
  // customers never see a picker), preserve existing manual choices
  // when the scope grows.
  useEffect(() => {
    let cancelled = false;
    if (targetedCustomerIds.length === 0) {
      setSitesByCustomer({});
      setSiteChoice({});
      return;
    }
    listSitesByCustomerIds(targetedCustomerIds).then((map) => {
      if (cancelled) return;
      setSitesByCustomer(map);
      setSiteChoice((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const cid of targetedCustomerIds) {
          const sites = map[cid] ?? [];
          if (sites.length === 0) {
            delete next[cid];
          } else if (sites.length === 1) {
            // Single-site → auto-pick. Always overwrite so a stale pick
            // from a previously-multi-site customer can't linger.
            next[cid] = sites[0].id;
          } else if (!next[cid] || !sites.some((s) => s.id === next[cid])) {
            // Multi-site: leave unset until the manager picks. If the
            // previously chosen site is no longer in the active list
            // (deactivated since), clear it so the form forces a re-pick.
            delete next[cid];
          }
        }
        // Drop choices for customers no longer in scope.
        for (const id of Object.keys(next)) {
          if (!targetedCustomerIds.includes(id)) delete next[id];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetedCustomerIds.join(",")]);

  // Customers in scope that need a manual site pick (>1 active site
  // and the manager hasn't chosen yet). Used both to show the picker
  // section and to gate Submit.
  const customersNeedingSite = useMemo(() => {
    return targetedCustomerIds.filter((cid) => {
      const sites = sitesByCustomer[cid] ?? [];
      return sites.length > 1 && !siteChoice[cid];
    });
  }, [targetedCustomerIds, sitesByCustomer, siteChoice]);

  // Customers in scope with NO active sites at all. These can't be
  // scheduled — the form surfaces them as a hard error.
  const customersWithoutSite = useMemo(() => {
    return targetedCustomerIds.filter(
      (cid) => (sitesByCustomer[cid] ?? []).length === 0
    );
  }, [targetedCustomerIds, sitesByCustomer]);

  // Detect collisions: any existing shift for one of the picked reps
  // on one of the generated dates that overlaps the chosen time
  // window. Skipped when scope is "Unassigned" (null) since unassigned
  // shifts are claimable and can stack freely.
  useEffect(() => {
    let cancelled = false;
    if (
      repScope === null ||
      repScope.length === 0 ||
      generatedDates.length === 0 ||
      !startTime ||
      !endTime ||
      startTime >= endTime
    ) {
      setConflicts([]);
      return;
    }
    const startISO = generatedDates[0];
    const endISO = generatedDates[generatedDates.length - 1];
    listShiftsInRange(startISO, endISO).then((rows) => {
      if (cancelled) return;
      const repIdSet = new Set(repScope);
      const dateSet = new Set(generatedDates);
      const newStartMin = hhmmToMin(startTime);
      const newEndMin = hhmmToMin(endTime);
      const hits: ConflictHit[] = [];
      for (const r of rows) {
        if (!r.rep_id || !repIdSet.has(r.rep_id)) continue;
        if (!dateSet.has(r.shift_date)) continue;
        const sStart = hhmmToMin((r.start_time || "").slice(0, 5));
        const sEnd = hhmmToMin((r.end_time || "").slice(0, 5));
        if (sStart >= newEndMin || sEnd <= newStartMin) continue;
        const profile = reps.find((p) => p.id === r.rep_id);
        hits.push({
          repId: r.rep_id,
          repName: profile ? displayName(profile) : "Rep",
          date: r.shift_date,
          customerName: r.customers?.name || "another customer",
          start: (r.start_time || "").slice(0, 5),
          end: (r.end_time || "").slice(0, 5),
        });
        // Cap output so a misconfigured "All reps × every weekday"
        // doesn't print 200 warnings.
        if (hits.length >= 8) break;
      }
      if (!cancelled) setConflicts(hits);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    repScope === null ? "_unassigned" : (repScope || []).join(","),
    generatedDates.join(","),
    startTime,
    endTime,
  ]);

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
    if (customersWithoutSite.length > 0) {
      const names = customersWithoutSite
        .map((cid) => customers.find((c) => c.id === cid)?.name || cid)
        .join(", ");
      return setError(
        `These customers have no active site — add one before scheduling: ${names}`
      );
    }
    if (customersNeedingSite.length > 0) {
      const names = customersNeedingSite
        .map((cid) => customers.find((c) => c.id === cid)?.name || cid)
        .join(", ");
      return setError(`Pick a site for: ${names}`);
    }
    if (repScope !== null && repScope.length === 0) {
      return setError("Pick at least one rep, or switch to 'Unassigned'.");
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

    // From-request flow forces a single shift (single customer × single
    // date × single rep — the requester themselves).
    if (
      fromRequest &&
      (targetedCustomerIds.length !== 1 ||
        generatedDates.length !== 1 ||
        targetedRepIds.length !== 1)
    ) {
      return setError(
        "Request approvals must be a single shift. Switch off recurrence and pick one customer + one rep."
      );
    }

    setBusy(true);
    setProgress({ done: 0, total: totalShifts });
    const errs: string[] = [];
    let done = 0;

    // Auto-derive the per-customer task count once, up front. Each
    // shift created below will use the count for its target customer
    // (specific tasks + universal tasks) — no manual entry needed.
    // If the count helper fails we fall back to 0 (the rep app will
    // simply show no tasks until the customer is given some).
    const tasksByCustomer = await countTasksForCustomers(targetedCustomerIds);

    // Series id — every shift created in this single submission shares
    // one uuid so we can later offer "edit / cancel this AND future
    // in the series" actions. Single one-off shifts (one date × one
    // customer × one rep) leave it null since "series of 1" is not a
    // useful concept.
    const seriesId =
      totalShifts > 1 && typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : null;

    // Insert sequentially so we can show progress and collect errors.
    // Cartesian product: dates × customers × reps. When the rep scope
    // is "Unassigned" the rep loop runs once with rep_id = null.
    for (const date of generatedDates) {
      for (const cid of targetedCustomerIds) {
        for (const rid of targetedRepIds) {
          const r = await createShift({
            customer_id: cid,
            site_id: siteChoice[cid] ?? null,
            shift_date: date,
            start_time: startTime,
            end_time: endTime,
            // Distance label is left blank — the rep app derives "X km
            // away" from the site's saved coordinates and the rep's
            // live location at check-in time.
            distance_label: "",
            tasks_total: tasksByCustomer.get(cid) ?? 0,
            rep_id: rid,
            series_id: seriesId,
          });
          done += 1;
          setProgress({ done, total: totalShifts });
          if (!r.ok) {
            errs.push(`${date} · ${cid}${rid ? ` · ${rid}` : ""}: ${r.error || "failed"}`);
          }
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
        <Card padding={0}>
          <div style={{ padding: "20px 20px 8px" }}>
            <SectionTitle>Schedule a shift</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              Two quick steps. The summary on the right tells you exactly
              what will be created before you hit Create.
            </div>
          </div>

          {/* ─── Step 1 — Who & where ───────────────────────────────── */}
          <Step number={1} title="Who's going where?" sub="Pick at least one customer. Reps can be assigned now or left claimable.">
            <Field label="Customer(s)" required>
              <CustomerScopePicker
                customers={customers}
                loading={loading}
                value={customerScope}
                onChange={setCustomerScope}
                allLabel="All customers"
                allSubLabel={`One shift per customer (${customers.length})`}
                specificLabel="Specific"
                specificSubLabel="Pick one or many"
              />
              {/* Tasks + address preview chips — same pattern as the
                  Edit page but adapted for multi-customer scope. Tells
                  the manager "this is what the rep will be doing" and
                  "this is where they're going" without leaving the
                  form. Renders nothing when no customer is picked. */}
              <CustomerContextChips
                customers={customers}
                customerScope={customerScope}
                tasksByCustomer={tasksByCustomer}
              />
            </Field>

            {/* Site picker — only renders for customers with multiple
                active sites. Single-site customers auto-resolve;
                customers with no active sites surface a hard error
                below so the manager can't accidentally schedule into
                a missing location. */}
            <SitesNeedingPick
              customers={customers}
              targetedCustomerIds={targetedCustomerIds}
              sitesByCustomer={sitesByCustomer}
              siteChoice={siteChoice}
              onPick={(cid, siteId) =>
                setSiteChoice((prev) => ({ ...prev, [cid]: siteId }))
              }
              customersWithoutSite={customersWithoutSite}
            />

            <Field
              label="Rep(s)"
              hint="Pick one to assign, several to spawn one shift per rep, or leave Unassigned."
            >
              <RepScopePicker
                reps={reps}
                loading={loading}
                value={repScope}
                onChange={setRepScope}
                unassignedLabel="Unassigned"
                unassignedSubLabel="Claimable by any rep"
                specificLabel="Specific"
                specificSubLabel="Pick one or many"
              />
            </Field>
          </Step>

          {/* ─── Step 2 — When (last step now that distance/tasks are
              auto-derived from the customer record) ──────────────── */}
          <Step number={2} title="When?" sub="Date and time. Switch to Weekly to repeat across a date range." last>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="Date" required>
                <input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Start" required>
                <TimeSelect value={startTime} onChange={setStartTime} />
              </Field>
              <Field label="End" required>
                <TimeSelect value={endTime} onChange={setEndTime} />
              </Field>
            </div>

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
                  sub="Pick weekdays + an 'until' date"
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
          </Step>

          {/* Distance + total tasks used to live here as Step 3 — both
              are now derived automatically. Distance comes from the
              customer's address (admin geocodes on save) and the rep's
              current location; total tasks comes from the customer_tasks
              table count. So the manager only has to answer Steps 1 + 2. */}

          <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${AC.line}`, paddingTop: 20 }}>

          {/* Conflict warnings — picked rep already has a shift on
              one of the generated dates that overlaps the chosen
              time window. Soft warning (not a blocker) since a
              manager might genuinely intend to add another touch
              that day; the createShift call doesn't refuse on
              overlap so the manager has the final word. */}
          {conflicts.length > 0 && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.warnTint,
                color: "#7A560A",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 500,
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                <AGlyph name="warn" size={14} color="#7A560A" />
                <span>
                  {conflicts.length === 1
                    ? "1 conflict on this slot"
                    : `${conflicts.length} conflicts on this slot`}
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {conflicts.slice(0, 5).map((c, i) => (
                  <li key={i} style={{ marginTop: 2 }}>
                    <b style={{ color: AC.ink2 }}>{c.repName}</b> already has{" "}
                    <b style={{ color: AC.ink2 }}>{c.customerName}</b> on{" "}
                    {c.date} {c.start}–{c.end}.
                  </li>
                ))}
                {conflicts.length > 5 && (
                  <li style={{ marginTop: 2, color: AC.mute }}>
                    …and {conflicts.length - 5} more.
                  </li>
                )}
              </ul>
            </div>
          )}

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
              // Stays enabled even when totalShifts === 0 (empty
              // customer scope, missing weekday picks, etc) so an
              // explicit click surfaces the inline validation error
              // instead of silently doing nothing. Was previously
              // disabled-and-dead which made the "+" add-shift entry
              // from the calendar feel broken — clicking did nothing
              // because the Create button was already inert.
              disabled={busy || customers.length === 0}
            >
              {busy
                ? "Saving…"
                : totalShifts === 0
                ? "Create shift"
                : totalShifts === 1
                ? "Create shift"
                : `Create ${totalShifts} shifts`}
            </Btn>
          </div>
          </div>
        </Card>

        {/* Live preview — what hitting Create will actually do. Designed
            to be scannable in one glance: a big number, a plain-English
            sentence, then the structured rows underneath for verification. */}
        <Card padding={0} style={{ position: "sticky", top: 20 }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${AC.line}` }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 700,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              About to create
            </div>
          </div>

          {/* Big total — green/brand when valid, muted when blocked. */}
          <div style={{ padding: 16 }}>
            <div
              style={{
                padding: "16px 12px",
                background: totalShifts > 0 ? AC.brandSoft : "#f6f7f9",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 36,
                  fontWeight: 800,
                  color: totalShifts > 0 ? AC.brandInk : AC.mute,
                  letterSpacing: -0.8,
                  lineHeight: 1,
                }}
              >
                {totalShifts}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 700,
                  color: totalShifts > 0 ? AC.brandDeep : AC.mute,
                  marginTop: 6,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {totalShifts === 1 ? "shift will be created" : "shifts will be created"}
              </div>
            </div>
          </div>

          {/* Plain-English sentence: what + who + when. Drops gracefully
              to a hint when the form is incomplete so the user knows what
              to fix next. */}
          <div
            style={{
              padding: "0 16px 14px",
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.ink,
              lineHeight: 1.55,
            }}
          >
            <PreviewSentence
              totalShifts={totalShifts}
              customers={customers}
              customerScope={customerScope}
              reps={reps}
              repScope={repScope}
              shiftDate={shiftDate}
              untilDate={untilDate}
              repeatMode={repeatMode}
              dateCount={generatedDates.length}
              startTime={startTime}
              endTime={endTime}
            />
          </div>

          {/* Structured rows for verification at-a-glance. */}
          <div
            style={{
              padding: "12px 16px 16px",
              borderTop: `1px solid ${AC.line}`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <SummaryRow
              label="Customers"
              value={
                customerScope === null
                  ? `All (${customers.length})`
                  : customerScope.length === 0
                  ? "Pick at least one →"
                  : customerScope.length === 1
                  ? customers.find((c) => c.id === customerScope[0])?.name || "1 customer"
                  : `${customerScope.length} selected`
              }
            />
            <SummaryRow
              label="Reps"
              value={
                repScope === null
                  ? "Unassigned (claimable)"
                  : repScope.length === 0
                  ? "Pick at least one →"
                  : repScope.length === 1
                  ? (() => {
                      const r = reps.find((x) => x.id === repScope[0]);
                      return r ? displayName(r) : "1 rep";
                    })()
                  : `${repScope.length} reps selected`
              }
            />
            <SummaryRow
              label="Dates"
              value={
                repeatMode === "none"
                  ? formatDateLabel(shiftDate)
                  : `${generatedDates.length} dates · ${formatDateLabel(shiftDate)} → ${formatDateLabel(untilDate)}`
              }
            />
            <SummaryRow label="Time" value={`${startTime} – ${endTime}`} />
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

/**
 * Numbered step wrapper — gives the form a clear "do step 1, then 2, then 3"
 * shape. Bottom border separates each step except the last so the action
 * buttons feel attached to step 3.
 */
function Step({
  number,
  title,
  sub,
  last,
  children,
}: {
  number: number;
  title: string;
  sub?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "18px 20px 8px",
        borderBottom: last ? "none" : `1px solid ${AC.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: AC.brand,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 700,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {number}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 15,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.2,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {sub && (
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 3,
                lineHeight: 1.45,
              }}
            >
              {sub}
            </div>
          )}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** "2026-05-07" → "Wed May 7". Anchors at noon to dodge DST flips. */
function formatDateLabel(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Plain-English description of what the form will create. Composed from the
 * same state the totals are derived from so it can never disagree with the
 * "X shifts will be created" badge.
 */
function PreviewSentence({
  totalShifts,
  customers,
  customerScope,
  reps,
  repScope,
  shiftDate,
  untilDate,
  repeatMode,
  dateCount,
  startTime,
  endTime,
}: {
  totalShifts: number;
  customers: Customer[];
  customerScope: CustomerScope;
  reps: Profile[];
  repScope: RepScope;
  shiftDate: string;
  untilDate: string;
  repeatMode: "none" | "weekly";
  dateCount: number;
  startTime: string;
  endTime: string;
}) {
  // Empty / blocked state — tell the user the next thing to do.
  if (totalShifts === 0) {
    if (customerScope !== null && customerScope.length === 0) {
      return (
        <span style={{ color: AC.mute }}>
          Pick at least one customer in <b style={{ color: AC.ink2 }}>Step 1</b> to
          continue.
        </span>
      );
    }
    if (repScope !== null && repScope.length === 0) {
      return (
        <span style={{ color: AC.mute }}>
          Pick at least one rep in <b style={{ color: AC.ink2 }}>Step 1</b>, or switch
          to Unassigned.
        </span>
      );
    }
    if (repeatMode === "weekly" && dateCount === 0) {
      return (
        <span style={{ color: AC.mute }}>
          Pick at least one weekday in <b style={{ color: AC.ink2 }}>Step 2</b> for the
          recurrence.
        </span>
      );
    }
    return <span style={{ color: AC.mute }}>Fill in the steps to see a preview.</span>;
  }

  const customerPiece: React.ReactNode = (() => {
    if (customerScope === null) {
      return (
        <>
          all <b style={{ color: AC.ink2 }}>{customers.length} customers</b>
        </>
      );
    }
    if (customerScope.length === 1) {
      const c = customers.find((x) => x.id === customerScope[0]);
      return <b style={{ color: AC.ink2 }}>{c?.name || "1 customer"}</b>;
    }
    return <b style={{ color: AC.ink2 }}>{customerScope.length} customers</b>;
  })();

  const repPiece: React.ReactNode = (() => {
    if (repScope === null) {
      return (
        <>
          {" "}
          (<span style={{ color: AC.mute }}>claimable, no rep assigned</span>)
        </>
      );
    }
    if (repScope.length === 1) {
      const r = reps.find((x) => x.id === repScope[0]);
      return (
        <>
          {" "}
          for <b style={{ color: AC.ink2 }}>{r ? displayName(r) : "1 rep"}</b>
        </>
      );
    }
    return (
      <>
        {" "}
        for <b style={{ color: AC.ink2 }}>{repScope.length} reps</b>
      </>
    );
  })();

  const datePiece: React.ReactNode =
    repeatMode === "none" ? (
      <>
        on <b style={{ color: AC.ink2 }}>{formatDateLabel(shiftDate)}</b>
      </>
    ) : (
      <>
        on <b style={{ color: AC.ink2 }}>{dateCount} dates</b> between{" "}
        <b style={{ color: AC.ink2 }}>{formatDateLabel(shiftDate)}</b> and{" "}
        <b style={{ color: AC.ink2 }}>{formatDateLabel(untilDate)}</b>
      </>
    );

  return (
    <span>
      Shift at {customerPiece}
      {repPiece}, {datePiece},{" "}
      <b style={{ color: AC.ink2 }}>
        {startTime}–{endTime}
      </b>
      .
    </span>
  );
}


/**
 * TimeSelect — clean 30-minute-increment dropdown for start / end
 * times. Replaces the native `<input type="time">` which feels fiddly
 * on desktop (steppers + manual typing). Pre-populates the visible
 * range (06:00–22:00 in 30-min steps); if the current value falls
 * outside that range we still show it as the selected option so
 * historical shifts at unusual times (06:15 or 22:30) round-trip
 * correctly.
 */
function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    opts.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  // Keep the current value in the list even when it does not fall on
  // a 30-minute boundary inside our default range.
  if (value && !opts.includes(value)) opts.unshift(value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, fontFamily: AC.fontMono }}
    >
      {opts.map((t) => (
        <option key={t} value={t}>
          {formatTimeLabel(t)}
        </option>
      ))}
    </select>
  );
}

/** "08:00" → "8:00 AM". Easier to scan than 24h in the dropdown. */
function formatTimeLabel(t: string): string {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

/**
 * Compact context chips that sit beneath the customer scope picker.
 * Shows the manager what the rep is walking into — task count and
 * address — so the form mirrors the at-a-glance richness of the
 * Edit page without expanding into a full preview.
 *
 *   - "All customers" scope: ranges (e.g. "Tasks: 2–7 across 16
 *     customers") + a "Manage tasks →" jump.
 *   - Specific (1 customer): exact task count + address chip if the
 *     customer record has one.
 *   - Specific (multi customer): summary range + customer count.
 *   - Empty (nothing picked): renders nothing.
 */
/**
 * Renders one row per selected customer that needs a site decision.
 * - Customers with exactly one active site auto-resolve and render
 *   nothing (the picker stays invisible — single-site is the common
 *   case and we don't want to add UI noise for it).
 * - Customers with multiple active sites get a Combobox to pick from.
 * - Customers with zero active sites surface a red banner so the
 *   manager fixes that before submitting.
 */
function SitesNeedingPick({
  customers,
  targetedCustomerIds,
  sitesByCustomer,
  siteChoice,
  onPick,
  customersWithoutSite,
}: {
  customers: Customer[];
  targetedCustomerIds: string[];
  sitesByCustomer: Record<string, CustomerSite[]>;
  siteChoice: Record<string, string>;
  onPick: (customerId: string, siteId: string) => void;
  customersWithoutSite: string[];
}) {
  const multiSite = targetedCustomerIds.filter(
    (cid) => (sitesByCustomer[cid] ?? []).length > 1
  );
  if (multiSite.length === 0 && customersWithoutSite.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      {customersWithoutSite.length > 0 && (
        <div
          style={{
            padding: "10px 12px",
            background: AC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 12.5,
            fontWeight: 500,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <AGlyph name="warn" size={14} color="#9c1a3c" />
          <span>
            <b>
              {customersWithoutSite.length} customer
              {customersWithoutSite.length === 1 ? "" : "s"}
            </b>{" "}
            with no active site. Open the customer&apos;s Sites tab and add one
            before scheduling:{" "}
            {customersWithoutSite
              .map((cid) => customers.find((c) => c.id === cid)?.name || cid)
              .join(", ")}
            .
          </span>
        </div>
      )}
      {multiSite.length > 0 && (
        <div
          style={{
            padding: 12,
            background: AC.bg,
            border: `1px solid ${AC.line}`,
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Site for each customer
          </div>
          {multiSite.map((cid) => {
            const customer = customers.find((c) => c.id === cid);
            const sites = sitesByCustomer[cid] ?? [];
            const value = siteChoice[cid] ?? null;
            return (
              <div
                key={cid}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
              >
                <div
                  style={{
                    flex: "0 0 auto",
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                    minWidth: 140,
                  }}
                >
                  {customer?.name || cid}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Combobox
                    value={value}
                    onChange={(v) => v && onPick(cid, v)}
                    triggerIcon="pin"
                    placeholder="Pick a site…"
                    clearable={false}
                    options={sites.map((s) => ({
                      value: s.id,
                      label: s.name,
                      sublabel: s.address ?? undefined,
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerContextChips({
  customers,
  customerScope,
  tasksByCustomer,
}: {
  customers: Customer[];
  customerScope: CustomerScope;
  tasksByCustomer: Map<string, number>;
}) {
  // Resolve the actual ids the chips should reflect.
  const ids =
    customerScope === null
      ? customers.map((c) => c.id)
      : customerScope;
  if (ids.length === 0) return null;

  // Aggregate counts. We only show a chip when we actually have
  // numbers (counts may still be loading on first render).
  const counts = ids
    .map((id) => tasksByCustomer.get(id))
    .filter((n): n is number => typeof n === "number");
  const minTasks = counts.length > 0 ? Math.min(...counts) : null;
  const maxTasks = counts.length > 0 ? Math.max(...counts) : null;

  // Single-customer chip can show address.
  const singleCustomer =
    ids.length === 1 ? customers.find((c) => c.id === ids[0]) : null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 10,
      }}
    >
      {/* Tasks chip */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: AC.bg,
          border: `1px solid ${AC.lineDim}`,
          flex: "1 1 220px",
          minWidth: 0,
        }}
      >
        <AGlyph name="tasks" size={14} color={AC.mute} />
        <div style={{ minWidth: 0, flex: 1 }}>
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
              fontSize: 12.5,
              color: AC.ink,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {counts.length === 0 ? (
              <span style={{ color: AC.mute, fontWeight: 500 }}>
                Counting…
              </span>
            ) : ids.length === 1 ? (
              <>
                {minTasks} task{minTasks === 1 ? "" : "s"}{" "}
                <span
                  style={{
                    color: AC.mute,
                    fontWeight: 500,
                  }}
                >
                  · auto-counted from customer
                </span>
              </>
            ) : minTasks === maxTasks ? (
              <>
                {minTasks} task{minTasks === 1 ? "" : "s"}{" "}
                <span style={{ color: AC.mute, fontWeight: 500 }}>
                  · per customer × {ids.length}
                </span>
              </>
            ) : (
              <>
                {minTasks}–{maxTasks} tasks{" "}
                <span style={{ color: AC.mute, fontWeight: 500 }}>
                  · range across {ids.length} customers
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href="/tasks"
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            fontWeight: 700,
            color: AC.brandDeep,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Manage →
        </Link>
      </div>

      {/* Address chip — single-customer only. Multi gets the count
          chip above; address per-customer would be too noisy. */}
      {singleCustomer?.address && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 10,
            background: AC.bg,
            border: `1px solid ${AC.lineDim}`,
            flex: "1 1 240px",
            minWidth: 0,
          }}
        >
          <AGlyph name="pin" size={14} color={AC.mute} />
          <div style={{ minWidth: 0, flex: 1 }}>
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
              Address
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink,
                fontWeight: 500,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={singleCustomer.address}
            >
              {singleCustomer.address}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
