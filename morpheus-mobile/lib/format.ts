/**
 * Shared formatting + date helpers (mobile mirror of morpheus-admin's
 * lib/format.ts). Kept as a copy because the apps deploy
 * independently — no monorepo shared package layer yet.
 */

// ─── Dates ──────────────────────────────────────────────────────────────

/**
 * "Today" in the user's local timezone, formatted YYYY-MM-DD.
 * Don't use toISOString() here — that's UTC and shifts at midnight.
 */
export function todayLocalISO(): string {
  return localISO(new Date());
}

export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Times ──────────────────────────────────────────────────────────────

export function formatTime(t: string, opts?: { compact?: boolean }): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  const sep = opts?.compact ? "" : " ";
  return `${h12}:${mm}${sep}${ampm}`;
}

// ─── People ─────────────────────────────────────────────────────────────

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

export function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
