/**
 * Shared formatting + date helpers.
 *
 * Created during the stabilisation pass. Pages used to inline their
 * own copies of these — 6 of `todayLocalISO`, 9 of `deriveInitials`,
 * 5 of `formatTime` variants, etc — which drifted in subtle ways.
 * Anything that's not page-specific lives here.
 */

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

/** "Jan 12, 2026" or "Friday, January 12, 2026" if `long: true`. */
export function formatDate(iso: string, opts?: { long?: boolean }): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(
    undefined,
    opts?.long
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
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
