/**
 * Settings store (admin) — read/write the app_settings key/value table.
 * Used today for the late + early grace periods that gate the
 * mobile check-in / check-out exception logic.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { notifySaved, notifySaveError } from "./save-status";

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
  value: unknown,
  /** Optional label for the global save indicator. Pass `null` to skip. */
  notifyLabel: string | null = "settings"
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    if (notifyLabel) notifySaveError(error.message, notifyLabel);
    return { ok: false, error: error.message };
  }
  if (notifyLabel) notifySaved(notifyLabel);
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

// ─── Organisation contact details ──────────────────────────────────────
//
// Free-text fields, all optional. KISS: anything you type is what we store.
// Each is its own app_settings row so updates can be partial without
// stomping the rest. Used today only on the printable invoice / bill of
// materials placeholder + the settings page itself; future surfaces
// (rep app footer, exported PDF, etc) read the same values.

const ORG_TEXT_KEYS = [
  "organisation_address",
  "organisation_phone",
  "organisation_email",
  "organisation_tax_number",
  "organisation_website",
  "organisation_registration_number",
] as const;
type OrgTextKey = (typeof ORG_TEXT_KEYS)[number];

async function readOrgText(key: OrgTextKey): Promise<string> {
  const v = await readSetting<string>(key, "");
  return typeof v === "string" ? v : "";
}

async function writeOrgText(
  key: OrgTextKey,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting(key, value.trim());
}

export const getOrganisationAddress = () => readOrgText("organisation_address");
export const setOrganisationAddress = (v: string) =>
  writeOrgText("organisation_address", v);

export const getOrganisationPhone = () => readOrgText("organisation_phone");
export const setOrganisationPhone = (v: string) =>
  writeOrgText("organisation_phone", v);

export const getOrganisationEmail = () => readOrgText("organisation_email");
export const setOrganisationEmail = (v: string) =>
  writeOrgText("organisation_email", v);

export const getOrganisationTaxNumber = () => readOrgText("organisation_tax_number");
export const setOrganisationTaxNumber = (v: string) =>
  writeOrgText("organisation_tax_number", v);

export const getOrganisationWebsite = () => readOrgText("organisation_website");
export const setOrganisationWebsite = (v: string) =>
  writeOrgText("organisation_website", v);

export const getOrganisationRegistrationNumber = () =>
  readOrgText("organisation_registration_number");
export const setOrganisationRegistrationNumber = (v: string) =>
  writeOrgText("organisation_registration_number", v);

/**
 * Address coordinates — stored as two settings keys so they upsert
 * independently of the address string itself. We round to 6 dp on
 * write (~10 cm precision is plenty for "where's the office on a map").
 */
export async function getOrganisationAddressCoords(): Promise<{
  lat: number;
  lng: number;
} | null> {
  const [lat, lng] = await Promise.all([
    readSetting<number | null>("organisation_address_lat", null),
    readSetting<number | null>("organisation_address_lng", null),
  ]);
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function setOrganisationAddressCoords(
  coords: { lat: number; lng: number } | null
): Promise<{ ok: boolean; error?: string }> {
  // Clearing: write nulls to both keys. Setting: round to 6 dp.
  const r1 = await writeSetting(
    "organisation_address_lat",
    coords ? Math.round(coords.lat * 1e6) / 1e6 : null,
    null // address coords already get a "Saved" toast via the address writer
  );
  if (!r1.ok) return r1;
  return writeSetting(
    "organisation_address_lng",
    coords ? Math.round(coords.lng * 1e6) / 1e6 : null,
    null
  );
}

// ─── Shift-request auto-approve ────────────────────────────────────────
//
// When this is on, a rep tapping "Request a customer" creates the shift
// directly instead of going through the manager's approval queue. Useful
// for orgs that trust their reps to self-schedule. Default OFF so a
// brand-new install still routes everything through the manager.

export async function getShiftRequestAutoApprove(): Promise<boolean> {
  const v = await readSetting<boolean>("shift_request_auto_approve", false);
  return Boolean(v);
}

export async function setShiftRequestAutoApprove(
  on: boolean
): Promise<{ ok: boolean; error?: string }> {
  return writeSetting("shift_request_auto_approve", !!on);
}

/** One-shot fetch of every org text field for a settings form. */
export async function getOrganisationDetails(): Promise<{
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  website: string;
  registrationNumber: string;
  coords: { lat: number; lng: number } | null;
}> {
  const [
    address,
    phone,
    email,
    taxNumber,
    website,
    registrationNumber,
    coords,
  ] = await Promise.all([
    getOrganisationAddress(),
    getOrganisationPhone(),
    getOrganisationEmail(),
    getOrganisationTaxNumber(),
    getOrganisationWebsite(),
    getOrganisationRegistrationNumber(),
    getOrganisationAddressCoords(),
  ]);
  return {
    address,
    phone,
    email,
    taxNumber,
    website,
    registrationNumber,
    coords,
  };
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

