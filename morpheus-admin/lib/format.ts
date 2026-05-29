/**
 * Shared formatting + date helpers.
 *
 * Created during the stabilisation pass. Pages used to inline their
 * own copies of these — 6 of `todayLocalISO`, 9 of `deriveInitials`,
 * 5 of `formatTime` variants, etc — which drifted in subtle ways.
 * Anything that's not page-specific lives here.
 */

// ─── Customer codes ────────────────────────────────────────────────────

/**
 * Display formatter for `customers.code`. The column was changed from
 * integer to text on May 28 (Mariska's B5) so codes can carry the
 * SKU-style values real tenants use (e.g. SP-001, ACME-JHB). To
 * preserve the existing UI for pre-migration customers — every
 * existing tenant's codes are pure integers like 12, 47 — we keep the
 * `#0012` zero-padded look ONLY when the code is purely numeric.
 * Alphanumeric codes render as-is.
 *
 *   formatCustomerCode("12")        → "#0012"
 *   formatCustomerCode("0012")      → "#0012"
 *   formatCustomerCode("SP-001")    → "SP-001"
 *   formatCustomerCode("ACME-JHB")  → "ACME-JHB"
 *   formatCustomerCode("")          → ""
 *   formatCustomerCode(null)        → ""
 */
export function formatCustomerCode(code: string | null | undefined): string {
  if (code == null) return "";
  const trimmed = String(code).trim();
  if (!trimmed) return "";
  if (/^\d+$/.test(trimmed)) {
    return `#${trimmed.padStart(4, "0")}`;
  }
  return trimmed;
}

// ─── Dates ──────────────────────────────────────────────────────────────

/**
 * "Today" in the user's local timezone, formatted YYYY-MM-DD.
 *
 * Important: don't use `toISOString().slice(0, 10)` here — that gives
 * UTC, which at e.g. 1 AM local in UTC+2 returns yesterday's date.
 */
export function todayLocalISO(): string {
  return localISO(new Date());
}

/** YYYY-MM-DD for any Date in the user's local timezone. */
export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO date `daysAgo` calendar days before today (local tz). */
export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localISO(d);
}

// ─── Times ──────────────────────────────────────────────────────────────

/**
 * Format a "HH:MM" or "HH:MM:SS" 24h string as 12h with am/pm.
 * Returns "" for empty input. Pass `compact: true` to drop the space
 * between the time and the meridian.
 */
export function formatTime(t: string, opts?: { compact?: boolean }): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  const sep = opts?.compact ? "" : " ";
  return `${h12}:${mm}${sep}${ampm}`;
}

/** "8:00 AM – 5:00 PM" */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/**
 * "HH:MM" → minutes-since-midnight. Used by the calendar grid +
 * TimeCombobox + any other code that needs to do arithmetic on a
 * time-of-day string. Returns 0 for empty/invalid input rather than
 * NaN so callers can safely Math.max/min with it.
 */
export function timeToMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Inverse of timeToMin: minutes-since-midnight → zero-padded "HH:MM". */
export function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "Jan 12, 2026" or "Friday, January 12, 2026" if `long: true`. */
// ─── Tenant date format (G15) ───────────────────────────────────────────
//
// The admin picks how numeric dates render org-wide (Site settings →
// Date format). formatDate is synchronous and called from dozens of
// client components, so the preference lives in a module-level cache:
// seeded synchronously from localStorage on first import (instant, no
// flash of the wrong format) and revalidated against app_settings on
// app boot — see settings-store.getDateFormat, invoked from the Sidebar.
// "auto" keeps the browser-locale textual format the app shipped with.
export type DateFormat = "auto" | "DMY" | "MDY" | "ISO";

const DATE_FORMAT_STORAGE_KEY = "morpheus_date_format";

function readCachedDateFormat(): DateFormat {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
    if (v === "DMY" || v === "MDY" || v === "ISO" || v === "auto") return v;
  } catch {
    /* localStorage blocked — fall through to default */
  }
  return "auto";
}

let _dateFormat: DateFormat = readCachedDateFormat();

/** Update the org date-format preference used by formatDate. Persists
 *  to localStorage so the next page load paints in the chosen format
 *  immediately. Called by settings-store on read (boot) + on save. */
export function setDateFormatPref(f: DateFormat): void {
  _dateFormat = f;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DATE_FORMAT_STORAGE_KEY, f);
    } catch {
      /* ignore */
    }
  }
}

export function getDateFormatPref(): DateFormat {
  return _dateFormat;
}

/** Render an ISO date in an EXPLICIT format — used by the Site settings
 *  preview so each option can show a live example regardless of the
 *  currently-saved preference. */
export function formatDateAs(
  iso: string,
  f: DateFormat,
  opts?: { long?: boolean }
): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (!opts?.long) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (f === "ISO") return `${yyyy}-${mm}-${dd}`;
    if (f === "DMY") return `${dd}/${mm}/${yyyy}`;
    if (f === "MDY") return `${mm}/${dd}/${yyyy}`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (f === "auto") {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  // Explicit numeric formats keep the weekday prefix for the long form.
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday}, ${formatDateAs(iso, f)}`;
}

export function formatDate(iso: string, opts?: { long?: boolean }): string {
  return formatDateAs(iso, _dateFormat, opts);
}

/** "57s" / "12m" / "3h" / "5d" — relative time, no units below seconds. */
export function formatRelative(iso: string, suffix: string = ""): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s${suffix}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${suffix}`;
  const days = Math.floor(h / 24);
  return `${days}d${suffix}`;
}

// ─── People ─────────────────────────────────────────────────────────────

/**
 * Two-letter initials from a name, falling back to the local part of an
 * email if the name is empty. e.g. "Sasha Whittle" → "SW", "j.verde" → "JV".
 */
export function initialsFromNameOrEmail(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const src = (name?.trim() || (email || "").split("@")[0] || "").trim();
  if (!src) return "??";
  const parts = src.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}

/** Title-case a `first.last@domain` style email into "First Last". */
export function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
