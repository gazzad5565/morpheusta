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
