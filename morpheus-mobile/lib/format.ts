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

/**
 * Contextual countdown / overdue label for a shift on the rep's
 * Today list. Given the shift's date + start_time + end_time (and
 * optionally its current state) returns:
 *
 *   { label: "in 50 min", tone: "soon"   }   → starts within 60 min
 *   { label: "in 3h",     tone: "later"  }   → starts later today
 *   { label: "starting now", tone: "now" }   → start time = ±2 min
 *   { label: "10 min late",  tone: "late"}   → past start, not in-progress
 *   { label: "ends in 20m",  tone: "live"}   → in-progress, end approaching
 *   { label: "ran 10m over", tone: "late"}   → in-progress, past end
 *   null                                       → completed / not actionable
 *
 * Lives in format.ts so both the dashboard and /shifts can render the
 * same phrasing — no risk of one screen saying "in 50 min" and
 * another "starts soon" for the same shift.
 */
export type ShiftTimingTone = "soon" | "later" | "now" | "late" | "live";
export interface ShiftTiming {
  label: string;
  tone: ShiftTimingTone;
}

export function formatShiftCountdown(
  shiftDate: string,
  startTime: string,
  endTime: string,
  state: string,
  now: Date = new Date()
): ShiftTiming | null {
  if (state === "complete") return null;
  if (!shiftDate || !startTime) return null;

  const startTs = new Date(`${shiftDate}T${normalizeTime(startTime)}:00`).getTime();
  const endTs = endTime
    ? new Date(`${shiftDate}T${normalizeTime(endTime)}:00`).getTime()
    : startTs;
  const nowTs = now.getTime();

  // Live / in-progress shift — countdown to end (or "running over").
  if (state === "in-progress" || state === "travelling" || state === "on-break") {
    const diffEnd = endTs - nowTs;
    if (diffEnd >= 0) {
      return { label: `ends ${humanizeFuture(diffEnd)}`, tone: "live" };
    }
    return { label: `ran ${humanizePast(-diffEnd)} over`, tone: "late" };
  }

  // Scheduled shift — pre-start countdown or "X min late".
  const diffStart = startTs - nowTs;
  if (Math.abs(diffStart) <= 2 * 60 * 1000) {
    return { label: "starting now", tone: "now" };
  }
  if (diffStart > 0) {
    const tone: ShiftTimingTone = diffStart <= 60 * 60 * 1000 ? "soon" : "later";
    return { label: `in ${humanizeFuture(diffStart)}`, tone };
  }
  // Past start, still scheduled = late.
  return { label: `${humanizePast(-diffStart)} late`, tone: "late" };
}

function normalizeTime(t: string): string {
  // Accept "HH:MM" or "HH:MM:SS"; normalise to HH:MM (ISO-friendly with :00 appended).
  return (t || "").slice(0, 5);
}
function humanizeFuture(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function humanizePast(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
