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
import { RequireCapability } from "@/components/ui/RequireCapability";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { Combobox } from "@/components/ui/Combobox";
import { TimeCombobox } from "@/components/ui/TimeCombobox";
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
import { getRepTypes, type RepTypeConfig } from "@/lib/settings-store";
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

/** Add N minutes to "HH:MM" — clamps to 23:59 (no day rollover). */
function addMinutesHHMM(t: string, mins: number): string {
  if (!isValidHHMM(t)) return "10:00";
  const total = Math.min(23 * 60 + 59, hhmmToMin(t) + mins);
  const h2 = Math.floor(total / 60);
  const m2 = total % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

/**
 * Current local time rounded UP to the next 30-min slot. Used as the
 * default start time when opening /schedule/new from scratch — way
 * more useful than a hardcoded "09:00" when the manager is
 * scheduling something for "right now-ish". If it's already past
 * 22:30 we cap at 22:30 (the TimeSelect's last visible slot is 22:00
 * so we leave room for the +30 min end-time auto-fill).
 */
function nextHalfHourSlot(): string {
  const d = new Date();
  const minsNow = d.getHours() * 60 + d.getMinutes();
  const snapped = Math.ceil(minsNow / 30) * 30;
  const clamped = Math.min(22 * 60 + 30, snapped);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  //   []   = Specific picker active, nothing chosen yet (caller
  //          treats as invalid until at least one rep is picked)
  //   [id, ...] = these reps; cartesian product with customers + dates
  // Default is [] (Specific, awaiting pick) — matches the
  // customer-scope default. Reasoning: most shifts are for a
  // specific rep, not claimable by anyone. Forcing an explicit pick
  // avoids a misclick creating an unassigned shift when the manager
  // meant to assign one. Reps creating intentionally-claimable
  // shifts flip to "Unassigned" via the picker (one tap).
  const [repScope, setRepScope] = useState<RepScope>([]);

  // Claim-radius for unassigned shifts. NULL = no restriction (the
  // shift is visible to every rep — current default). Setting a
  // value scopes the mobile "Unscheduled · available" list to reps
  // within that many metres of the customer's site. Only surfaced
  // in the UI when repScope === null (claimable mode). Stored on the
  // row even when an assigned rep is chosen so a later "release"
  // preserves the manager's intent — see migration notes.
  const [claimRadiusM, setClaimRadiusM] = useState<number | null>(null);
  // Claimable-rep-types restriction (May 27 — late). Only used when
  // repScope === null (Unassigned / claimable). Empty array = any
  // rep type can claim; non-empty restricts to those types. Mirrors
  // app_settings.rep_types vocabulary. Mobile filters client-side.
  const [claimableRepTypes, setClaimableRepTypes] = useState<string[]>([]);
  const [repTypesVocab, setRepTypesVocab] = useState<RepTypeConfig[]>([]);
  useEffect(() => {
    getRepTypes().then(setRepTypesVocab);
  }, []);

  // Time mode — "specific" is the historical default (start + end
  // pickers shown), "anytime" hides the pickers and writes the
  // org's workday window (06:00–20:00) into start_time / end_time
  // with the is_flexible_time flag set. The mobile app surfaces
  // flexible shifts as "Anytime today" and skips late / early
  // exception comparisons.
  const [timeMode, setTimeMode] = useState<"specific" | "anytime">("specific");
  // Workday bounds used when timeMode === "anytime". Hardcoded for
  // now; once org-level settings carry a workday window, read from
  // there instead.
  const ANYTIME_START = "06:00";
  const ANYTIME_END = "20:00";
  const [shiftDate, setShiftDate] = useState<string>(fromDate || todayISO());
  // Default start = next 30-min slot from now. Hardcoded "09:00" was
  // unhelpful when a manager taps + to schedule a shift starting in
  // the next hour. URL ?start= still wins for the "click empty cell
  // in the calendar" pre-fill path.
  const [startTime, setStartTime] = useState<string>(
    isValidHHMM(fromStart) ? fromStart : nextHalfHourSlot()
  );
  // End defaults to start + 30 min (was +1 h). The wrapped setter
  // below keeps them linked: change start → end snaps to start + 30.
  const [endTime, setEndTime] = useState<string>(
    isValidHHMM(fromEnd)
      ? fromEnd
      : addMinutesHHMM(
          isValidHHMM(fromStart) ? fromStart : nextHalfHourSlot(),
          30
        )
  );

  /**
   * Wrapped start-time setter: also push the end forward to start +
   * 30 min. Picking 1:00 PM as start auto-snaps end to 1:30 PM. The
   * manager can still drag end out manually after that — this wrapper
   * only fires on start changes, not on end changes, so any custom
   * end duration the manager sets gets preserved until they touch
   * start again. KISS over "preserve original duration when start
   * shifts" — that's harder to reason about and less useful in
   * practice (most shifts get re-anchored to a fresh duration).
   */
  const onStartChange = (next: string) => {
    setStartTime(next);
    setEndTime(addMinutesHHMM(next, 30));
  };
  // Recurrence — One-off, Weekly (pick weekdays), Biweekly (same
  // weekday(s) but every other week from the anchor), Monthly (same
  // day of month each month, skipping invalid days like Feb 31).
  const [repeatMode, setRepeatMode] = useState<
    "none" | "weekly" | "biweekly" | "monthly"
  >("none");
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

  // Default: tick the day-of-week of the start date when toggling on
  // weekly OR biweekly (both use the same weekday picker).
  useEffect(() => {
    if (
      (repeatMode === "weekly" || repeatMode === "biweekly") &&
      weekdays.size === 0
    ) {
      const dow = jsDayToIndex(new Date(shiftDate).getDay());
      setWeekdays(new Set([dow]));
    }
  }, [repeatMode, shiftDate, weekdays.size]);

  // Compute the dates the recurrence will generate.
  const generatedDates = useMemo(() => {
    if (repeatMode === "none") return [shiftDate];
    if (!untilDate || untilDate < shiftDate) return [shiftDate];
    // Anchor the date walk at noon-local so DST transitions can't flip
    // a Sunday into a Saturday and skip the wrong weekday.
    const start = new Date(shiftDate + "T12:00:00");
    const end = new Date(untilDate + "T12:00:00");

    if (repeatMode === "weekly" || repeatMode === "biweekly") {
      if (weekdays.size === 0) return [];
      const out: string[] = [];
      const anchorMs = start.getTime();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!weekdays.has(jsDayToIndex(d.getDay()))) continue;
        if (repeatMode === "biweekly") {
          // Only include the anchor week (week 0), week 2, week 4, …
          // Compute whole-weeks-since-anchor based on day count
          // (avoids partial-week DST drift).
          const daysSince = Math.floor((d.getTime() - anchorMs) / 86_400_000);
          const weeksSince = Math.floor(daysSince / 7);
          if (weeksSince % 2 !== 0) continue;
        }
        out.push(localISO(d));
      }
      return out;
    }

    if (repeatMode === "monthly") {
      // Same calendar day of each month from start through end.
      // Skips months where the day doesn't exist (Feb 30/31, Apr 31,
      // etc) — JS auto-rolls invalid dates so we detect the rollover
      // by comparing month+day after construction.
      const startDay = start.getDate();
      const out: string[] = [];
      let year = start.getFullYear();
      let month = start.getMonth();
      // Safety cap so a bad until-date can't loop forever.
      for (let i = 0; i < 36; i++) {
        const candidate = new Date(year, month, startDay, 12, 0, 0, 0);
        if (
          candidate.getMonth() === month &&
          candidate.getDate() === startDay
        ) {
          if (candidate > end) break;
          if (candidate >= start) out.push(localISO(candidate));
        }
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
      return out;
    }

    return [shiftDate];
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

  // Progressive-disclosure gates. The form reveals one step at a time
  // so a manager creating a one-off shift sees:
  //   1. Customers (always)
  //   2. Site picker + Reps (once customer is picked)
  //   3. Date / time / repeat (once rep choice is made — including
  //      explicit "Unassigned", which is itself a valid choice)
  // Compared to the old "everything on screen at once" form this
  // reduces the perceived friction massively for the most common
  // case (single customer, single rep, single date).
  const customerFilled =
    customerScope === null || (Array.isArray(customerScope) && customerScope.length > 0);
  const repFilled =
    repScope === null || (Array.isArray(repScope) && repScope.length > 0);

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
    if (repeatMode === "weekly" || repeatMode === "biweekly") {
      if (weekdays.size === 0) return setError("Pick at least one weekday for the recurrence.");
      if (!untilDate) return setError("Pick an 'until' date for the recurrence.");
      if (untilDate < shiftDate) return setError("'Until' date must be on or after the start date.");
    }
    if (repeatMode === "monthly") {
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
            // When timeMode === "anytime" we write the workday
            // bounds into start/end so the row still has a window
            // for the calendar + timesheet to render. The
            // is_flexible_time flag below tells the mobile app to
            // display "Anytime today" instead of the bare range.
            start_time: timeMode === "anytime" ? ANYTIME_START : startTime,
            end_time: timeMode === "anytime" ? ANYTIME_END : endTime,
            // Distance label is left blank — the rep app derives "X km
            // away" from the site's saved coordinates and the rep's
            // live location at check-in time.
            distance_label: "",
            tasks_total: tasksByCustomer.get(cid) ?? 0,
            rep_id: rid,
            series_id: seriesId,
            // Claim radius only matters when the shift is unassigned.
            // We still store it on the row in case the manager
            // releases an assigned shift later — preserves the
            // original "scope" intent without extra UI on the
            // release flow.
            claim_radius_m: claimRadiusM,
            // Same "preserve through release" rationale as claim_radius_m
            // above — store the restriction even if a specific rep is
            // assigned, so a future release-to-claimable keeps the
            // manager's intent without re-prompting.
            claimable_rep_types:
              claimableRepTypes.length > 0 ? claimableRepTypes : null,
            is_flexible_time: timeMode === "anytime",
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
      <RequireCapability cap="canScheduleShifts" action="schedule a shift">
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
            <Field label="Customers" required prominent glyph="customer">
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
              />
            </Field>

            {/* Site picker + Reps only appear once a customer has
                been picked. Before that, the form shows a single
                soft prompt where the rep block would go so the
                manager knows what comes next without being shown
                an inert input. */}
            {customerFilled ? (
              <>
                {/* Site picker — only renders for customers with
                    multiple active sites. Single-site customers
                    auto-resolve; customers with no active sites
                    surface a hard error below so the manager can't
                    accidentally schedule into a missing location. */}
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
                  label="Reps"
                  prominent
                  glyph="reps"
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

                {/* Claim radius — only surfaces when the shift is
                    going to ANY rep (repScope === null). Scopes the
                    "Unscheduled · available" list on the mobile app
                    to reps within X metres of the customer's site.
                    Null / "Anywhere" preserves the existing
                    behaviour (visible to all reps). */}
                {repScope === null && (
                  <Field
                    label="Claim radius"
                    hint="Limit who can see this in the rep app's Unscheduled list. Only matters while the shift is claimable."
                  >
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { v: null, label: "Anywhere", sub: "All reps see it" },
                        { v: 1000, label: "1 km", sub: "Same neighbourhood" },
                        { v: 5000, label: "5 km", sub: "Same suburb" },
                        { v: 15000, label: "15 km", sub: "Same city" },
                        { v: 50000, label: "50 km", sub: "Same metro" },
                      ].map((opt) => {
                        const on = claimRadiusM === opt.v;
                        return (
                          <button
                            key={String(opt.v ?? "any")}
                            type="button"
                            onClick={() => setClaimRadiusM(opt.v)}
                            title={opt.sub}
                            style={{
                              padding: "7px 12px",
                              borderRadius: 99,
                              background: on ? AC.ink : "#fff",
                              color: on ? "#fff" : AC.ink2,
                              border: `1px solid ${on ? AC.ink : AC.line}`,
                              fontFamily: AC.font,
                              fontSize: 12.5,
                              fontWeight: 600,
                              letterSpacing: -0.1,
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {claimRadiusM !== null && (
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: AC.font,
                          fontSize: 11.5,
                          color: AC.mute,
                          lineHeight: 1.4,
                        }}
                      >
                        Only reps within{" "}
                        <b style={{ color: AC.ink2 }}>
                          {claimRadiusM >= 1000
                            ? `${(claimRadiusM / 1000).toFixed(0)} km`
                            : `${claimRadiusM} m`}
                        </b>{" "}
                        of the customer's site will see this shift.
                        Reps without location permission see it
                        anyway (we don't penalise denied GPS).
                      </div>
                    )}
                  </Field>
                )}

                {/* Claimable-rep-types restriction (May 27 — late).
                    Also only surfaces when the shift is claimable.
                    Empty = any type can claim (default); checking
                    boxes narrows to those types only. Mobile filters
                    client-side. */}
                {repScope === null && repTypesVocab.length > 0 && (
                  <Field
                    label="Restrict claim by rep type"
                    hint="Empty = any rep type can claim. Tick one or more to limit the claim list to those types on the mobile app."
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {repTypesVocab.map((t) => {
                        const on = claimableRepTypes.includes(t.name);
                        return (
                          <label
                            key={t.name}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 11px",
                              borderRadius: 99,
                              background: on ? AC.brandSoft : "#fff",
                              border: `1px solid ${on ? AC.brand : AC.line}`,
                              cursor: "pointer",
                              fontFamily: AC.font,
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: on ? AC.brandInk : AC.ink2,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setClaimableRepTypes([
                                    ...claimableRepTypes,
                                    t.name,
                                  ]);
                                } else {
                                  setClaimableRepTypes(
                                    claimableRepTypes.filter(
                                      (n) => n !== t.name
                                    )
                                  );
                                }
                              }}
                              style={{
                                width: 14,
                                height: 14,
                                accentColor: AC.brand,
                              }}
                            />
                            {t.name}
                          </label>
                        );
                      })}
                    </div>
                    {claimableRepTypes.length > 0 && (
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: AC.font,
                          fontSize: 11.5,
                          color: AC.mute,
                          lineHeight: 1.4,
                        }}
                      >
                        Only reps of type{" "}
                        <b style={{ color: AC.ink2 }}>
                          {claimableRepTypes.join(" · ")}
                        </b>{" "}
                        will see this shift on the mobile claim list.
                      </div>
                    )}
                  </Field>
                )}
              </>
            ) : (
              <NextStepHint label="Pick a customer to continue." />
            )}
          </Step>

          {/* ─── Step 2 — When (only revealed once the rep choice is
              made; that includes "Unassigned" as a valid pick) ──── */}
          {!repFilled ? (
            <Step number={2} title="When?" sub="Pick or skip a rep above first." last>
              <NextStepHint
                label={
                  customerFilled
                    ? "Choose a rep (or leave Unassigned) to set the schedule."
                    : "Pick a customer first, then a rep."
                }
              />
            </Step>
          ) : (
          <Step number={2} title="When?" sub="Date and time. Switch to Weekly to repeat across a date range." last>
            {/* Time-mode toggle. "Specific" is the historical
                default (Start / End pickers). "Anytime today" hides
                the pickers and writes the workday bounds into the
                shift; the mobile app surfaces it as "Anytime
                today" and skips late / early exception logic. */}
            <Field
              label="Time"
              hint={
                timeMode === "anytime"
                  ? "Rep can show up any time during the workday."
                  : "Pick the exact start and end."
              }
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(
                  [
                    { v: "specific", label: "Specific time" },
                    { v: "anytime", label: "Anytime today" },
                  ] as const
                ).map((opt) => {
                  const on = timeMode === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setTimeMode(opt.v)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 99,
                        background: on ? AC.ink : "#fff",
                        color: on ? "#fff" : AC.ink2,
                        border: `1px solid ${on ? AC.ink : AC.line}`,
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        fontWeight: 600,
                        letterSpacing: -0.1,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  timeMode === "specific" ? "1fr 1fr 1fr" : "1fr",
                gap: 14,
              }}
            >
              <Field label="Date" required>
                <input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              {timeMode === "specific" && (
                <>
                  <Field label="Start" required>
                    <TimeCombobox value={startTime} onChange={onStartChange} />
                  </Field>
                  <Field label="End" required>
                    <TimeCombobox value={endTime} onChange={setEndTime} />
                  </Field>
                </>
              )}
            </div>

            <Field label="Repeat">
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
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
                <RepeatOption
                  active={repeatMode === "biweekly"}
                  onClick={() => setRepeatMode("biweekly")}
                  title="Biweekly"
                  sub="Every other week, same weekday(s)"
                />
                <RepeatOption
                  active={repeatMode === "monthly"}
                  onClick={() => setRepeatMode("monthly")}
                  title="Monthly"
                  sub="Same day each month"
                />
              </div>
              {(repeatMode === "weekly" || repeatMode === "biweekly") && (
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
              {/* Monthly has no weekday picker (it's "same day of
                  month") but still needs an Until date + generated-
                  date preview. */}
              {repeatMode === "monthly" && (
                <div
                  style={{
                    border: `1px solid ${AC.line}`,
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                  }}
                >
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
                    Will generate {generatedDates.length} date
                    {generatedDates.length === 1 ? "" : "s"} on the{" "}
                    {(() => {
                      const day = parseInt(shiftDate.split("-")[2] || "0", 10);
                      // Add an ordinal suffix so the copy reads naturally
                      // ("on the 14th of each month"). Falls back to the
                      // bare number for invalid input.
                      const suffix = ((d: number) => {
                        if (d >= 11 && d <= 13) return "th";
                        const last = d % 10;
                        return last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
                      })(day);
                      return Number.isFinite(day) && day > 0
                        ? `${day}${suffix} of each month`
                        : "same day each month";
                    })()}
                    {generatedDates.length > 0 && (
                      <>
                        : <b style={{ color: AC.ink2 }}>{generatedDates[0]}</b> →{" "}
                        <b style={{ color: AC.ink2 }}>
                          {generatedDates[generatedDates.length - 1]}
                        </b>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Field>
          </Step>
          )}

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
      </RequireCapability>
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
  /** Bumps the label to a real heading size with an optional glyph
   *  prefix. Used for the top-level Customer + Rep pickers in
   *  /schedule/new so the manager can't confuse which picker is
   *  which at a glance. Default false keeps the dense uppercase
   *  micro-label everywhere else. */
  prominent,
  glyph,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  prominent?: boolean;
  glyph?: GlyphName;
}) {
  return (
    <div style={{ marginBottom: prominent ? 12 : 16 }}>
      {prominent ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          {glyph && (
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                width: 26,
                height: 26,
                borderRadius: 8,
                background: AC.brandSoft,
                color: AC.brandDeep,
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AGlyph name={glyph} size={14} color={AC.brandDeep} />
            </span>
          )}
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 15,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.2,
            }}
          >
            {label}
            {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
          </div>
        </div>
      ) : (
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
      )}
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
/**
 * Soft placeholder shown when a progressive-disclosure step is gated
 * by an earlier choice. Renders a single dashed-border row with hint
 * copy so the form looks intentional, not broken — without making the
 * manager think they're missing an interactive element.
 */
function NextStepHint({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        border: `1px dashed ${AC.line}`,
        borderRadius: 12,
        background: AC.bg,
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.mute,
        display: "flex",
        alignItems: "center",
        gap: 8,
        lineHeight: 1.4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: AC.line,
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

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
  repeatMode: "none" | "weekly" | "biweekly" | "monthly";
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
    if (
      (repeatMode === "weekly" || repeatMode === "biweekly") &&
      dateCount === 0
    ) {
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


// TimeSelect moved to a shared component — every time picker in the
// admin (this form + /shifts/[id]/edit + the series-edit modal +
// /settings/check-in-rules) now uses TimeCombobox so the chrome is
// uniform: clock icon, search-as-you-type, monospace labels.

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
}: {
  customers: Customer[];
  customerScope: CustomerScope;
}) {
  // Resolve the actual ids the chips should reflect.
  const ids =
    customerScope === null
      ? customers.map((c) => c.id)
      : customerScope;
  if (ids.length === 0) return null;

  // Single-customer scope shows an address chip. Tasks chip was
  // removed (cluttered the form and managers don't price decisions
  // on task count at scheduling time — they manage tasks separately
  // from the /tasks page).
  const singleCustomer =
    ids.length === 1 ? customers.find((c) => c.id === ids[0]) : null;
  if (!singleCustomer?.address) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 10,
      }}
    >
      {/* Address chip — single-customer only. */}
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
    </div>
  );
}
