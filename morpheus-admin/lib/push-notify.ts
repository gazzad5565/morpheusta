/**
 * Client-side helper for kicking off a push notification after a
 * shift mutation. Fire-and-forget — the surrounding mutation
 * (createShift, reassignShift, etc) has already succeeded by the
 * time this runs, and we never want push delivery latency to slow
 * down the manager's UI.
 *
 * The server endpoint /api/push/notify does all the real work:
 * looks up the affected rep's subscriptions, builds the payload
 * from server-side data, signs + sends, prunes dead endpoints.
 * Caller just says "this happened to this shift".
 */

import { supabase } from "./supabase";

export type ShiftNotifyEvent =
  | "shift-assigned"
  | "shift-reassigned"
  | "shift-cancelled";

/** Fire a push notify request for a shift mutation. Returns
 *  immediately — actual delivery is async on the server. Caller
 *  should NOT await this in a path that blocks the UI. */
export function notifyShiftEvent(
  event: ShiftNotifyEvent,
  shiftId: string,
  opts?: { previousRepId?: string | null }
): void {
  void (async () => {
    try {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/push/notify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event,
          shiftId,
          previousRepId: opts?.previousRepId ?? null,
        }),
        keepalive: true,
      });
    } catch {
      /* Push is best-effort. Swallow errors silently — the
       * surrounding admin action has already succeeded. */
    }
  })();
}
