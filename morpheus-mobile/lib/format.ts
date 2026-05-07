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

/**
 * "5s" / "12m" / "3h" / "2d" — short relative time string. Accepts a
 * Date, an ISO string, or a unix-ms number. Returns "just now" for
 * anything under 5 seconds.
 */
export function formatRelativeShort(when: Date | string | number): string {
  const ms = typeof when === "number"
    ? Date.now() - when
    : Date.now() - new Date(when).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
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
