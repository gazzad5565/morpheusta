/**
 * Settings store (admin) — read/write the app_settings key/value table.
 * Used today for the late + early grace periods that gate the
 * mobile check-in / check-out exception logic.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

interface SettingRow {
  key: string;
  value: unknown;
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  if (!isSupabaseConfigured() || !supabase) return fallback;
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return (data as SettingRow).value as T;
}

async function writeSetting(
  key: string,
  value: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Typed accessors ───────────────────────────────────────────────────

export const DEFAULT_LATE_GRACE_MINUTES = 10;
export const DEFAULT_EARLY_GRACE_MINUTES = 15;

export async function getLateGraceMinutes(): Promise<number> {
  const v = await readSetting<number>("late_grace_minutes", DEFAULT_LATE_GRACE_MINUTES);
  return typeof v === "number" && v >= 0 ? v : DEFAULT_LATE_GRACE_MINUTES;
}

export async function setLateGraceMinutes(
  minutes: number
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("late_grace_minutes", Math.max(0, Math.round(minutes)));
}

export async function getEarlyGraceMinutes(): Promise<number> {
  const v = await readSetting<number>("early_grace_minutes", DEFAULT_EARLY_GRACE_MINUTES);
  return typeof v === "number" && v >= 0 ? v : DEFAULT_EARLY_GRACE_MINUTES;
}

export async function setEarlyGraceMinutes(
  minutes: number
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("early_grace_minutes", Math.max(0, Math.round(minutes)));
}
