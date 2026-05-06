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

// Cutoff time after which any still-in-progress shift is auto-completed.
// Stored as HH:MM (24h). Default 23:59 — sweeps everything before midnight
// so reps who forget to check out don't show as "in shift" the next day.
export const DEFAULT_AUTO_CHECKOUT_TIME = "23:59";

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export async function getAutoCheckoutTime(): Promise<string> {
  const v = await readSetting<string>("auto_checkout_time", DEFAULT_AUTO_CHECKOUT_TIME);
  return typeof v === "string" && isValidHHMM(v) ? v : DEFAULT_AUTO_CHECKOUT_TIME;
}

export async function setAutoCheckoutTime(
  time: string
): Promise<{ ok: boolean; error?: string }> {
  const t = (time || "").trim();
  if (!isValidHHMM(t)) {
    return { ok: false, error: "Time must be in HH:MM (24-hour) format, e.g. 23:59." };
  }
  return writeSetting("auto_checkout_time", t);
}

// Default geofence radius for new customers (per-customer override on
// each customer's Address tab takes precedence).
export const DEFAULT_GEOFENCE_RADIUS_M = 100;

export async function getDefaultGeofenceRadius(): Promise<number> {
  const v = await readSetting<number>(
    "default_geofence_radius_m",
    DEFAULT_GEOFENCE_RADIUS_M
  );
  return typeof v === "number" && v > 0 ? v : DEFAULT_GEOFENCE_RADIUS_M;
}

export async function setDefaultGeofenceRadius(
  meters: number
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("default_geofence_radius_m", Math.max(1, Math.round(meters)));
}

// ─── Organisation (name + logo) ────────────────────────────────────────

export async function getOrganisationName(): Promise<string> {
  const v = await readSetting<string>("organisation_name", "");
  return typeof v === "string" ? v : "";
}

export async function setOrganisationName(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("organisation_name", name.trim());
}

export async function getOrganisationLogoUrl(): Promise<string> {
  const v = await readSetting<string>("organisation_logo_url", "");
  return typeof v === "string" ? v : "";
}

export async function setOrganisationLogoUrl(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("organisation_logo_url", url);
}

/**
 * Upload an org logo to the public `org_assets` bucket and return its
 * public URL. Each upload uses a fresh path so cached browsers / sidebars
 * pick up the new logo immediately (no manual cache-bust query needed).
 *
 * Caller is responsible for then calling setOrganisationLogoUrl(url).
 */
export async function uploadOrgLogo(
  file: File
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "File must be an image (PNG, JPG, SVG, etc)." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "Logo must be under 2 MB." };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `logo-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("org_assets")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
  if (upErr) return { ok: false, error: upErr.message };
  const { data: pub } = supabase.storage.from("org_assets").getPublicUrl(path);
  return { ok: true, url: pub.publicUrl };
}

