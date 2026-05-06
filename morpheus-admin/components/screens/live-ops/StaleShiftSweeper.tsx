"use client";

/**
 * StaleShiftSweeper — invisible client component that runs the
 * "auto-checkout past cutoff" sweep on every Live Ops home mount.
 *
 * Reps sometimes forget to tap Check out. Without this, their shift
 * stays as `state="in-progress"` and their dot stays green on the
 * admin map for days. The sweep marks any in-progress shift past the
 * `auto_checkout_time` setting (default 23:59) — or any shift from
 * earlier days — as complete, and clears matching rep_locations.
 *
 * Renders nothing. The sibling KpiStrip / ShiftsList subscribe to
 * shifts via realtime, so when sweepStaleShifts() updates rows they
 * will re-render with the corrected counts automatically.
 */

import { useEffect } from "react";
import { sweepStaleShifts } from "@/lib/shifts-store";

export function StaleShiftSweeper() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const r = await sweepStaleShifts();
        if (cancelled) return;
        if (r.swept > 0) {
          // eslint-disable-next-line no-console
          console.info(`[sweep] auto-checked-out ${r.swept} stale shift(s)`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[sweep] failed:", err);
      }
    };
    run();
    // Also re-run when the tab is brought back to focus — covers the
    // case where the admin leaves the tab open across midnight.
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
