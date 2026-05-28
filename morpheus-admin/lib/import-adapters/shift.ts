/**
 * Shift import adapter (Phase D — D5, May 25).
 *
 * CSV columns:
 *   customer_code | rep_email | start_date | end_date | days_of_week |
 *   start_time | end_time | recurrence
 *
 * Recurrence:
 *   - "once":   creates a single shift on start_date
 *   - "weekly": expands into one shift per matching day in
 *               [start_date, end_date] where the day-of-week is in
 *               days_of_week (e.g. "Mon|Wed|Fri").
 *
 * Dedup key: (customer_code, rep_email, start_date, start_time). Two
 * CSV rows with the same key are treated as duplicates of each other.
 * The adapter ALSO dedup-checks each expanded instance against the
 * shifts table — if a shift already exists for that
 * (customer_id, rep_id, shift_date, start_time), skip or update per
 * mode. Per-instance failures (e.g. one date already booked) don't
 * fail the row — they're tracked as warnings in the error message.
 *
 * Customer must exist (looked up by code → id). Rep must exist
 * (looked up by email → uuid). Site is the customer's first active
 * site; left NULL if the customer has none (Phase E geocoder handles
 * the pin-it-later flow).
 */

import { supabase } from "@/lib/supabase";
import type {
  DuplicateMode,
  ImportAdapter,
  RawRow,
  UpsertOutcome,
} from "@/lib/import-types";

const DAY_TO_NUM: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function parseDaysOfWeek(s: string): number[] {
  return s
    .split(/[|,;\/\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0)
    .map((d) => DAY_TO_NUM[d])
    .filter((n): n is number => typeof n === "number");
}

/** Expand [start_date, end_date] into an array of YYYY-MM-DD strings
 *  for each date whose day-of-week is in `days`. */
function expandWeekly(
  startDate: string,
  endDate: string,
  days: number[]
): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const cur = new Date(start);
  while (cur <= end) {
    if (days.includes(cur.getUTCDay())) {
      out.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export const SHIFT_ADAPTER: ImportAdapter = {
  entity: "shift",
  requiredFields: [
    "customer_code",
    "rep_email",
    "start_date",
    "start_time",
    "end_time",
    "recurrence",
  ],
  optionalFields: ["end_date", "days_of_week"],
  fieldLabels: {
    customer_code: "Customer code (any text — must match an existing customer)",
    rep_email: "Rep email (must exist as a registered user)",
    start_date: "Start date (YYYY-MM-DD)",
    end_date: "End date (YYYY-MM-DD) — required for weekly recurrence",
    days_of_week:
      "Days of week (Mon|Wed|Fri) — required for weekly recurrence",
    start_time: "Start time (HH:MM, 24h)",
    end_time: "End time (HH:MM, 24h)",
    recurrence: "Recurrence (once | weekly)",
  },
  fieldKinds: {
    customer_code: "link",
    rep_email: "link",
    start_date: "id",
    start_time: "id",
  },
  linksTo: {
    customer_code: "customer",
    rep_email: "rep",
  },
  matchRule:
    "Each row is one shift (or one weekly pattern that expands into N shifts). customer_code links to an existing customer and rep_email links to an existing rep — import both first if needed. Two rows with the same customer_code + rep_email + start_date + start_time = duplicate.",
  dedupKey: (row) => {
    const code = (row.customer_code || "").trim();
    const email = (row.rep_email || "").trim().toLowerCase();
    const date = (row.start_date || "").trim();
    const time = (row.start_time || "").trim();
    return code && email && date && time
      ? `shift:${code}::${email}::${date}::${time}`
      : "";
  },
  validate: (row) => {
    const errs: string[] = [];
    // customer_code is opaque text since May 28 (Mariska B5) — was
    // integer. Non-empty is the only structural check; the upsert
    // step verifies it matches an existing customer.
    const cc = (row.customer_code || "").trim();
    if (!cc) errs.push("customer_code is required");
    else if (cc.length > 64) {
      errs.push(`customer_code is too long (max 64 chars)`);
    }
    const email = (row.rep_email || "").trim();
    if (!email) errs.push("rep_email is required");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errs.push(`rep_email "${email}" doesn't look valid`);
    }
    if (!row.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date.trim())) {
      errs.push("start_date must be ISO format (YYYY-MM-DD)");
    }
    if (row.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date.trim())) {
      errs.push("end_date must be ISO format (YYYY-MM-DD)");
    }
    const startT = (row.start_time || "").trim();
    const endT = (row.end_time || "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startT)) {
      errs.push("start_time must be HH:MM (24h)");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endT)) {
      errs.push("end_time must be HH:MM (24h)");
    }
    if (
      /^([01]\d|2[0-3]):[0-5]\d$/.test(startT) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(endT) &&
      startT >= endT
    ) {
      errs.push("end_time must be after start_time");
    }
    const recurrence = (row.recurrence || "once").trim().toLowerCase();
    if (recurrence !== "once" && recurrence !== "weekly") {
      errs.push("recurrence must be 'once' or 'weekly'");
    }
    if (recurrence === "weekly") {
      if (!row.end_date) errs.push("weekly recurrence requires end_date");
      if (!row.days_of_week)
        errs.push("weekly recurrence requires days_of_week");
      else if (parseDaysOfWeek(row.days_of_week).length === 0) {
        errs.push(
          `days_of_week didn't parse — use Mon|Tue|Wed|... (got "${row.days_of_week}")`
        );
      }
    }
    return errs;
  },
  upsert: async (row: RawRow, mode: DuplicateMode): Promise<UpsertOutcome> => {
    if (!supabase) throw new Error("Supabase not configured");

    // customer_code is opaque text (May 28). No parseInt — pass as-is.
    const code = row.customer_code.trim();
    const repEmail = row.rep_email.trim().toLowerCase();
    const startDate = row.start_date.trim();
    const endDate = (row.end_date || "").trim();
    const startTime = row.start_time.trim();
    const endTime = row.end_time.trim();
    const recurrence = row.recurrence.trim().toLowerCase();

    // Lookup customer + first active site.
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (custErr) throw new Error(custErr.message);
    if (!customer) {
      throw new Error(`customer with code="${code}" not found`);
    }
    const customerId = (customer as { id: string }).id;

    const { data: sites } = await supabase
      .from("customer_sites")
      .select("id")
      .eq("customer_id", customerId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    const siteId =
      ((sites as { id: string }[] | null)?.[0]?.id ?? null) || null;

    // Lookup rep by email.
    const { data: rep, error: repErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", repEmail)
      .maybeSingle();
    if (repErr) throw new Error(repErr.message);
    if (!rep) {
      throw new Error(
        `rep with email="${repEmail}" not found — import the rep first or check the email`
      );
    }
    const repId = (rep as { id: string }).id;

    // Build the date list.
    const dates: string[] =
      recurrence === "once"
        ? [startDate]
        : expandWeekly(startDate, endDate, parseDaysOfWeek(row.days_of_week));

    if (dates.length === 0) {
      throw new Error(
        "no matching dates after recurrence expansion — check start/end dates + days_of_week"
      );
    }

    // For each date: upsert one shift. Track per-instance outcomes.
    // Row-level outcome: "created" if at least one instance was
    // created, "updated" if any were updated, "skipped" if all
    // instances were skipped. Per-instance errors bubble up as
    // a single row-level throw with a summary message.
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const instanceErrors: string[] = [];

    for (const date of dates) {
      try {
        // Dedup at the instance level — check for existing shift on
        // this (customer_id, rep_id, shift_date, start_time).
        const { data: existing, error: lookupErr } = await supabase
          .from("shifts")
          .select("id")
          .eq("customer_id", customerId)
          .eq("rep_id", repId)
          .eq("shift_date", date)
          .eq("start_time", startTime)
          .maybeSingle();
        if (lookupErr) throw new Error(lookupErr.message);

        if (existing) {
          if (mode === "skip") {
            skippedCount += 1;
            continue;
          }
          const { error: updErr } = await supabase
            .from("shifts")
            .update({
              site_id: siteId,
              end_time: endTime,
            })
            .eq("id", (existing as { id: string }).id);
          if (updErr) throw new Error(updErr.message);
          updatedCount += 1;
          continue;
        }

        const { error: insErr } = await supabase.from("shifts").insert({
          customer_id: customerId,
          site_id: siteId,
          rep_id: repId,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          tasks_total: 4,
        });
        if (insErr) throw new Error(insErr.message);
        createdCount += 1;
      } catch (e) {
        instanceErrors.push(
          `${date}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // If every instance errored AND nothing succeeded, surface as a
    // row-level failure so it lands in errors_json.
    if (
      createdCount === 0 &&
      updatedCount === 0 &&
      skippedCount === 0 &&
      instanceErrors.length > 0
    ) {
      throw new Error(
        `all ${dates.length} expanded instances failed — ${instanceErrors[0]}` +
          (instanceErrors.length > 1
            ? ` (+${instanceErrors.length - 1} more)`
            : "")
      );
    }

    // If SOME instances failed but others succeeded, surface a
    // warning-style throw that still completes the row but logs the
    // partial errors. The wizard's catch will treat this as a row
    // failure — adjust if we want a "warn" outcome later.
    if (instanceErrors.length > 0) {
      throw new Error(
        `Partial success: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped, ${instanceErrors.length} instances failed (first: ${instanceErrors[0]})`
      );
    }

    if (createdCount > 0) return "created";
    if (updatedCount > 0) return "updated";
    return "skipped";
  },
};
