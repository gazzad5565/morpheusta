/**
 * Route improvement watcher.
 *
 * Every hour (while the app is open / foregrounded) re-runs
 * Plan-my-day against the rep's CURRENT location + remaining
 * shifts, compares the optimised total drive time vs. the
 * chronological (or saved) total drive time, and flips a
 * "better route available" flag if the optimised version saves
 * at least IMPROVEMENT_MIN_SECONDS.
 *
 * The flag drives the two-state icon on the home page + /shifts
 * page (Gary's design — May 14):
 *
 *   - flag OFF (default) → calm check-circle icon — "your route
 *     is still the best we can do; nothing to act on"
 *   - flag ON           → action target icon w/ subtle pulse —
 *     "tap to see a better order"
 *
 * Scope choices (see chat — Gary signed off):
 *   • CLIENT-SIDE only. Runs in the foregrounded PWA. When the
 *     app is closed the watcher pauses; no server-side cron in v1.
 *     If we add push-based notifications later, mirror this logic
 *     in a Vercel Cron route.
 *   • THRESHOLD = 5 minutes total drive-time saving. Below that
 *     the diff is noise — could be the API returning a slightly
 *     different ordering for trivial reasons. We don't want to
 *     poke reps for 30-second wins.
 *   • COMPARE optimised vs. CHRONOLOGICAL (start_time asc). If
 *     the rep has a saved order, that's their explicit choice and
 *     the saved order is treated as "current"; otherwise compare
 *     against chronological. Keeping the comparison consistent so
 *     reps don't see the icon flip flop between visits.
 */

import { planMyDay } from "./route-planner";
import { readShiftOrder, applySavedOrder } from "./shift-order-store";

const TICK_MS = 60 * 60 * 1000;                  // 1 hour
const IMPROVEMENT_MIN_SECONDS = 5 * 60;          // 5 minutes
const LS_KEY = "morpheus.route.improvement";
const CHANGE_EVENT = "morpheus.route.improvement_changed";

interface ImprovementState {
  /** True when the optimiser found a route at least IMPROVEMENT_MIN_SECONDS
   *  faster than the current (saved or chronological) order. */
  available: boolean;
  /** Total drive-time saving in seconds — surface in tooltips /
   *  aria labels. Always >= IMPROVEMENT_MIN_SECONDS when available. */
  savingsSeconds: number;
  /** ms-epoch when we last computed this. Lets UI show "checked X
   *  min ago" if useful. */
  checkedAt: number;
}

const EMPTY: ImprovementState = {
  available: false,
  savingsSeconds: 0,
  checkedAt: 0,
};

/** Read the latest watcher state from localStorage. Synchronous so
 *  the pills can compute their initial state on first paint
 *  without a flicker. */
export function readImprovementState(): ImprovementState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.available === "boolean" &&
      typeof parsed.savingsSeconds === "number" &&
      typeof parsed.checkedAt === "number"
    ) {
      return parsed as ImprovementState;
    }
  } catch {
    /* corrupt — fall through to EMPTY */
  }
  return EMPTY;
}

function writeImprovementState(s: ImprovementState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* quota / disabled — drop silently */
  }
}

/** Clear the flag — called when the rep saves a new order from
 *  /route (so the icon flips back to calm immediately) and when
 *  the day completes (no remaining shifts to optimise). */
export function clearImprovementState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

/** Subscribe to state changes — fires after every successful tick
 *  (whether or not the flag changed). Returns the unsubscribe fn. */
export function subscribeImprovement(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** Run one check. Exposed for the layout-level watcher hook AND for
 *  any place that wants to force a recheck (e.g. immediately after
 *  the rep saves a new order). Idempotent. */
export async function checkRouteImprovement(): Promise<ImprovementState> {
  // Run both calls in parallel — the API supports a single request
  // but the two-call shape keeps the math obvious. Total ~1s round
  // trip when both use the same provider.
  let chronological;
  let optimised;
  try {
    [chronological, optimised] = await Promise.all([
      planMyDay({ optimize: false }),
      planMyDay({ optimize: true }),
    ]);
  } catch (err) {
    // Network blip / API down — leave the existing state alone so
    // the icon doesn't flap on transient failures.
    // eslint-disable-next-line no-console
    console.warn("[route-watcher] check failed", err);
    return readImprovementState();
  }

  // Need at least 2 stops to even talk about an "improvement" — a
  // single-stop day has nothing to reorder.
  if (chronological.stopsInOrder.length < 2) {
    const next: ImprovementState = {
      available: false,
      savingsSeconds: 0,
      checkedAt: Date.now(),
    };
    writeImprovementState(next);
    return next;
  }

  // "Current" baseline: if the rep has saved an order, compute the
  // total drive time of THAT order (using the chronological route's
  // leg data, re-summed in saved order). Otherwise chronological is
  // the baseline. Treats the rep's saved choice as canonical so we
  // don't gaslight them ("you saved order X 5 min ago — now order
  // Y is 3 min better"... below threshold anyway, but still).
  const savedOrder = readShiftOrder();
  let baselineSeconds = chronological.route.totalSeconds;
  if (savedOrder && savedOrder.length > 0) {
    const orderedShifts = applySavedOrder(chronological.stopsInOrder, savedOrder);
    // Build a per-stop seconds lookup from the chronological legs.
    // Each leg's toStopId tells us the destination; we re-add the
    // legs in the saved order to get a total. Fine-grained:
    // chronological + saved orders share the same set of stops, so
    // every saved-order stop has a corresponding leg.
    const legBySid = new Map(chronological.route.legs.map((l) => [l.toStopId, l]));
    let total = 0;
    for (const s of orderedShifts) {
      const leg = legBySid.get(s.realId);
      if (leg) total += leg.driveSeconds;
    }
    if (total > 0) baselineSeconds = total;
  }

  const savings = baselineSeconds - optimised.route.totalSeconds;
  const available = savings >= IMPROVEMENT_MIN_SECONDS;
  const next: ImprovementState = {
    available,
    savingsSeconds: available ? Math.max(0, Math.round(savings)) : 0,
    checkedAt: Date.now(),
  };
  writeImprovementState(next);
  return next;
}

/**
 * Start the hourly recheck. Returns the stop function. Designed to
 * be called once at app mount (e.g. in MenuShell). Multiple starts
 * are safe — they each get their own interval handle, but you only
 * really want one.
 *
 * Behaviour:
 *   - Fires immediately on start (so reps who just opened the app
 *     see fresh state right away, not stale-from-last-session)
 *   - Then every TICK_MS while running
 *   - Also re-runs on visibilitychange visible → catches the case
 *     where the user backgrounded the app for hours and just came
 *     back; the next-scheduled tick might still be 50 min away.
 */
export function startRouteImprovementWatcher(): () => void {
  if (typeof window === "undefined") return () => {};
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    void checkRouteImprovement();
  };

  // First tick immediate, then hourly.
  tick();
  const interval = window.setInterval(tick, TICK_MS);

  const onVis = () => {
    if (stopped) return;
    if (document.visibilityState !== "visible") return;
    // Refresh if last check was more than 15 min ago — covers the
    // app-was-backgrounded case without spamming the API on quick
    // tab flips.
    const state = readImprovementState();
    if (Date.now() - state.checkedAt > 15 * 60 * 1000) tick();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVis);
  };
}
