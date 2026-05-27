/**
 * Settings store (mobile) — read-only mirror of admin's settings store.
 * Reps need to know the grace periods to compute their own check-in /
 * check-out exception state.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export const DEFAULT_LATE_GRACE_MINUTES = 10;
export const DEFAULT_EARLY_GRACE_MINUTES = 15;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  if (!isSupabaseConfigured() || !supabase) return fallback;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return (data as { value: unknown }).value as T;
}

export async function getLateGraceMinutes(): Promise<number> {
  const v = await readSetting<number>("late_grace_minutes", DEFAULT_LATE_GRACE_MINUTES);
  return typeof v === "number" && v >= 0 ? v : DEFAULT_LATE_GRACE_MINUTES;
}

export async function getEarlyGraceMinutes(): Promise<number> {
  const v = await readSetting<number>("early_grace_minutes", DEFAULT_EARLY_GRACE_MINUTES);
  return typeof v === "number" && v >= 0 ? v : DEFAULT_EARLY_GRACE_MINUTES;
}

/**
 * "Approval not needed" toggle — when true, reps tapping
 * /add-shift's Request bypass the requested_shifts queue and the
 * shift is created immediately. Default false.
 */
export async function getShiftRequestAutoApprove(): Promise<boolean> {
  const v = await readSetting<boolean>("shift_request_auto_approve", false);
  return Boolean(v);
}

/**
 * Org name / logo — set by admin in /settings/organisation. Used on
 * the rep dashboard to personalise the welcome banner. Both are
 * optional; the UI falls back gracefully when they're empty.
 */
export async function getOrganisationName(): Promise<string> {
  const v = await readSetting<string>("organisation_name", "");
  return typeof v === "string" ? v : "";
}

export async function getOrganisationLogoUrl(): Promise<string> {
  const v = await readSetting<string>("organisation_logo_url", "");
  return typeof v === "string" ? v : "";
}

/**
 * Exception toggles — org-wide on/off for the two kinds of check-in
 * exception the mobile app surfaces. Both default ON. When OFF, the
 * mobile check-in page hides the corresponding exception card and
 * skips the dedicated event log. Per-customer overrides on the
 * customers table take precedence (handled at the call site).
 */
export async function getLocationExceptionsEnabled(): Promise<boolean> {
  const v = await readSetting<boolean>("location_exceptions_enabled", true);
  return v === false ? false : true;
}

export async function getTimingExceptionsEnabled(): Promise<boolean> {
  const v = await readSetting<boolean>("timing_exceptions_enabled", true);
  return v === false ? false : true;
}

/**
 * Org-wide gate for the /route page's "Optimize stop order" toggle.
 * Set in admin /settings/check-in-rules. When false, the mobile
 * Plan-my-day page hides the Optimize toggle entirely so reps can't
 * reshuffle a day that has customers on strict appointment slots.
 * Default ON for backwards compatibility.
 */
export async function getRouteOptimizationAllowed(): Promise<boolean> {
  const v = await readSetting<boolean>("route_optimization_allowed", true);
  return v === false ? false : true;
}

// ─── Rep types (May 27, 2026) ─────────────────────────────────────
//
// Mirror of the admin's RepTypeConfig vocabulary, read-only. The
// mobile app checks per-type capability flags client-side to decide
// what affordances to show — currently `canCreateCustomers` drives
// the Add Customer button visibility on the dashboard + shifts flow.
//
// Defensive parsing: an unknown / unset rep_type defaults to
// allow-all so reps who haven't been categorised yet don't get
// silently blocked from existing flows.
//
// SECURITY NOTE: this is UX-level enforcement, not RLS. A motivated
// rep with curl + JWT could still INSERT a customer regardless.
// Hard block would require tightening RLS to look up rep_type +
// capability — deferred.

export interface RepTypeConfig {
  name: string;
  canCreateCustomers: boolean;
}

const DEFAULT_REP_TYPES: ReadonlyArray<RepTypeConfig> = [
  { name: "Sales Rep", canCreateCustomers: true },
  { name: "Merchandiser", canCreateCustomers: false },
  { name: "Driver", canCreateCustomers: false },
] as const;

function parseRepTypes(raw: unknown): RepTypeConfig[] {
  if (!Array.isArray(raw)) return [...DEFAULT_REP_TYPES];
  const seen = new Set<string>();
  const out: RepTypeConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { name?: unknown; canCreateCustomers?: unknown };
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name,
      canCreateCustomers: r.canCreateCustomers === false ? false : true,
    });
  }
  return out.length > 0 ? out : [...DEFAULT_REP_TYPES];
}

export async function getRepTypes(): Promise<RepTypeConfig[]> {
  const v = await readSetting<unknown>("rep_types", null);
  return parseRepTypes(v);
}

/** Pure capability check — caller fetches once via getRepTypes()
 *  and calls this per check. Unknown / null type → allow-all so
 *  uncategorised reps don't get silently blocked from existing
 *  flows. */
export function repTypeCan(
  types: RepTypeConfig[],
  typeName: string | null | undefined,
  capability: "canCreateCustomers"
): boolean {
  if (!typeName) return true;
  const entry = types.find(
    (t) => t.name.toLowerCase() === typeName.toLowerCase()
  );
  if (!entry) return true;
  return entry[capability];
}
