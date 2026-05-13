/**
 * Mobile-side fire-and-forget trigger for manager-targeted pushes.
 *
 * Mirrors morpheus-admin/lib/push-notify.ts but lives on the rep
 * app and dispatches cross-origin to the admin's
 * /api/push/notify endpoint with the rep's bearer token. The admin
 * server verifies the JWT, confirms the rep owns the shift, then
 * fans out the push to every manager in the org.
 *
 * Cross-origin: the admin app runs on a different Vercel project
 * (NEXT_PUBLIC_ADMIN_URL). The admin route exposes CORS for this
 * mobile origin so the call lands cleanly. If the env var isn't
 * configured the helper silently no-ops — push is best-effort and
 * the surrounding rep action (raiseUnableToAttend) has already
 * succeeded by the time we get here.
 */

import { supabase } from "./supabase";

const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "https://morpheus-admin.vercel.app";

export type ManagerNotifyEvent = "attention-raised";

/** Fire a push to managers for a rep-initiated event. Returns
 *  immediately — actual delivery is async on the admin server. */
export function notifyManagersOfAttention(
  event: ManagerNotifyEvent,
  shiftId: string
): void {
  void (async () => {
    try {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch(`${ADMIN_URL}/api/push/notify`, {
        method: "POST",
        mode: "cors",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ event, shiftId }),
        keepalive: true,
      });
    } catch {
      /* Push is best-effort. Swallow errors — the rep's
       * attention-raise has already succeeded in the DB. */
    }
  })();
}
