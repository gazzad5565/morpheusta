# Ops — deployment, migrations, Vercel, push pipeline

> Operational knowledge: how to deploy, where env vars live, which
> Vercel hostnames are real, when crons fire, what the push system
> looks like under the hood. Read this when something's broken in
> prod OR when adding new infrastructure.

---

## Sections

- [Migrations applied (cloud status)](#migrations-applied-today-cloud-status)
- [Deployment — auto + manual + rollback](#deployment)
- [⚠ Vercel deployment traps](#-vercel-deployment-traps-learned-the-hard-way-may-13)
- [Web Push — architecture, kill switch, timing](#web-push-notifications-shipped-may-13)
- [Push phase 2 — late + EOD reminders, manager broadcasts](#web-push-phase-2-shipped-later-may-13)
- [Auto-checkout vs push reminders — precise timing](#auto-checkout-vs-push-reminders--precise-timing)

---

### Migrations applied today (cloud status)

**Status as of end of May 13 session:**
- May 12 and earlier — all applied.
- May 13 — `2026_05_13_push_subscriptions.sql`,
  `2026_05_13_customers_created_by_rep.sql`, and
  `2026_05_13_task_photos.sql` applied during the session
  (Gary confirmed "i did them").
- **Pending — run before next test pass:**
  - `db/migrations/2026_05_13_task_signatures.sql` (Feature D)
  - `db/migrations/2026_05_13_messages.sql` (Feature E)

Each file is idempotent — safe to re-run.

May 14 (applied):

- `2026_05_14_requested_shifts_role_scoped.sql` — RLS leak fix, applied mid-day.
- `2026_05_14_phase4_rls_hardening.sql` — comprehensive Phase 4 RLS pass via `is_manager()` SECURITY DEFINER helper. 19 tables + 3 storage buckets. **APPLIED** evening May 14 after two small fixes (shift_events `actor_id` not `rep_id`; dropped the bogus `public.organisation` block — org settings live in `app_settings` rows). Smoke-test checklist at the bottom of the file.

May 13 (applied or pending — see status above):

- `2026_05_13_push_subscriptions.sql` — Web Push subscriptions table + RLS
- `2026_05_13_customers_created_by_rep.sql` — Feature A column + per-manager-seen table
- `2026_05_13_task_photos.sql` — Feature C columns, table, storage bucket + RLS
- `2026_05_13_task_signatures.sql` — Feature D column + table (PENDING)
- `2026_05_13_messages.sql` — Feature E messages + message_recipients tables (PENDING)

May 12 (applied):

- `2026_05_12_customer_contacts.sql` — multi-contact support per
  customer (admin /customers/[id]/edit Identity tab).
- `2026_05_12_shifts_claim_radius.sql` — `shifts.claim_radius_m
  integer`; claimable-shift distance filtering on mobile.
- `2026_05_12_shifts_flexible_time.sql` — `shifts.is_flexible_time
  boolean`; "Anytime today" toggle on /schedule/new.

May 11 (applied):

- `2026_05_11_shifts_attention.sql` — cancellation overlay
- `2026_05_11_shifts_attention_resolution.sql` — rep-feedback pill
- `2026_05_11_shifts_notes.sql` — `shifts.rep_notes text`
- `2026_05_11_profile_avatars.sql` — `profiles.avatar_url text`
- `2026_05_11_exception_toggles.sql` — per-customer overrides
- `2026_05_11_perf_indexes.sql` — engineering pass (4 hot-path indexes)
- `2026_05_11_customers_logo.sql` — `customers.logo_url text`

May 7 (applied):

- `2026_05_07_custom_fields_organisation.sql`
- `2026_05_07_shifts_series_id.sql`

May 6 (already in cloud):

- `2026_05_06_shifts_indexes.sql`
- `2026_05_06_organisation.sql`
- `2026_05_06_rep_locations_manager_delete.sql`
- `2026_05_06_shift_task_completions.sql`
- `2026_05_06_shifts_check_out_at.sql`
- `2026_05_06_library_files_realtime.sql`


---

## Deployment

### Auto-deploy (preferred)

Both Vercel projects are connected to this GitHub repo. Pushing to `main` triggers a redeploy of both apps in parallel:

```bash
# Edit a file
git add .
git commit -m "Describe change"
git push                  # ← Vercel auto-deploys both apps from this push
```

Vercel knows which subfolder to build via the "Root Directory" setting:
- `morpheusta` Vercel project → Root Directory: `morpheus-mobile`
- `morpheus-admin` Vercel project → Root Directory: `morpheus-admin`

A push that only changes files in `morpheus-mobile/` still triggers BOTH deploys — Vercel doesn't currently skip unchanged subfolders. (Not a problem at this scale; if it becomes one, configure [ignored builds](https://vercel.com/docs/projects/overview#ignored-build-step).)

### Manual deploy (when you can't push)

```bash
cd morpheus-mobile           # or morpheus-admin
npx vercel --prod
```

### Where env vars live

| Place | Used for | How to update |
|---|---|---|
| `morpheus-{admin,mobile}/.env.local` | Local dev | Edit the file |
| Vercel project Settings → Environment Variables | Live deploys | Vercel dashboard, OR `npx vercel env add NAME production --value "..."` |

> ⚠️ Vercel UI silently saves empty strings if paste doesn't register. If a deploy says "Database not configured", check Vercel env vars by running `npx vercel env pull --environment production .tmp.env` from the project folder and inspecting the file. Note: `pull` redacts values for security — to be sure the values are non-empty, use the CLI's `--value` flag when adding rather than relying on the UI.

### Rollback

Vercel keeps every deployment. If a push breaks production:

1. Vercel dashboard → project → **Deployments**
2. Find the last good one → ⋯ menu → **Promote to Production**

Or via CLI: `npx vercel rollback`.

---


---

### ⚠ Vercel deployment traps (learned the hard way May 13)

Spent ~45 minutes debugging "admin won't deploy" — leaving notes
so the next person doesn't hit the same wall.

**Trap 1: Vercel Hobby plan + sub-daily crons silently kills the deploy.**

If `vercel.json` contains a cron with a schedule like `"*/5 * * * *"`
and the project is on **Hobby**, Vercel rejects the entire deploy
(not just the cron) with:
> Hobby accounts are limited to daily cron jobs. This cron
> expression (*/5 * * * *) would run more than once per day.

The error surfaces in the deployment detail page but **does not
appear** in the deployments list view. Every push silently fails
the build pipeline. Mobile (`morpheusta`) deploys fine because it
has no `vercel.json`.

**Current state:** `morpheus-admin/vercel.json` has the crons
parked (empty config). When upgrading to Vercel Pro, restore:
```json
{
  "crons": [
    { "path": "/api/cron/shift-reminders", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/auto-checkout",   "schedule": "*/15 * * * *" }
  ]
}
```

Or — even on Hobby — daily-only schedules sometimes still fail
the post-build step (untested theory: Hobby caps cron count at 1).
If you must run cron on Hobby, register just one endpoint and
have it dispatch to both sweep functions internally.

**Trap 2: `outputFileTracingRoot` in next.config breaks Vercel
post-build silently.**

Setting `outputFileTracingRoot: import.meta.dirname` in
`morpheus-admin/next.config.ts` silences the Next.js 16 warning
about it mismatching `turbopack.root`, but causes the Vercel
deploy to fail AFTER "Build Completed in /vercel/output [N s]"
with status: Error and no further explanation in the logs.

Vercel's platform expects `outputFileTracingRoot` to resolve to
`/vercel/path0` (the monorepo root) and validates the deploy
artifact against that path. Hard-coding it to the admin subdir
breaks that contract.

**Rule:** leave `outputFileTracingRoot` unset in next.config.
Live with the cosmetic warning. See the comment block in
`morpheus-admin/next.config.ts` for the longer version.


---

### Web Push notifications (shipped May 13)

**What works end-to-end now:**
- Rep opens `/profile` → **Notifications** card. iOS Safari shows "Add to Home Screen first" instructions; installed PWAs + Android show the Enable button. Tap → browser asks permission → subscription is saved to `push_subscriptions` in Supabase.
- Admin schedules / reassigns / cancels a shift → push fires automatically to the affected rep's device(s). Tapping the notification opens the app on `/shifts`.
- Multi-device support: one rep + N devices = N subscription rows. All get the push.
- Dead-subscription cleanup is automatic: `web-push` returns 404/410 → admin-side lib prunes the row.

**Architecture (left to right):**

```
Rep's phone           Mobile app               Admin code              Push service
─────────────         ──────────────           ──────────────          ────────────
SW: /sw.js     ◀──    /api/push/subscribe  ──▶ push_subscriptions     (FCM / Mozilla / Apple)
   ▲              (saves endpoint+keys)          table
   │
   └─────── push delivery ◀───── /api/push/notify (manager-gated)
                                      │
                                      ▼
                                 lib/push-send.ts (signs with VAPID, sends, prunes 410s)
```

**Files of note:**
- `db/migrations/2026_05_13_push_subscriptions.sql` — table + RLS (rep owns own rows)
- `morpheus-mobile/public/sw.js` — service worker, push + notificationclick handlers (no offline caching — deliberate)
- `morpheus-mobile/lib/push.ts` — client API: `pushSupportState()`, `subscribeToPush()`, `unsubscribeFromPush()`, plus the iOS-needs-install detection (`navigator.standalone` + `display-mode: standalone` checks)
- `morpheus-mobile/app/api/push/subscribe/route.ts` — saves/deletes subscriptions using the rep's bearer token (RLS enforces ownership)
- `morpheus-mobile/app/profile/page.tsx` — `<NotificationsCard>` (inline at the bottom of the file). Renders 7 distinct states: loading / unsupported / ios-needs-install / needs-vapid-key / denied / off / on.
- `morpheus-admin/lib/push-send.ts` — server-side `sendPushToRep()` + payload builders (`buildShiftAssignedPayload` etc). Reads `VAPID_PRIVATE_KEY` from env; configures `web-push` once.
- `morpheus-admin/lib/push-notify.ts` — fire-and-forget client helper used by admin store code
- `morpheus-admin/app/api/push/notify/route.ts` — manager-gated dispatch; takes `{event, shiftId, previousRepId?}`, looks up the shift + customer, builds payload server-side, sends.
- Triggers wired in `morpheus-admin/lib/shifts-store.ts`: `createShift` (when `rep_id` set), `updateShift` (when `rep_id` changes), `reassignShift`, `cancelShiftFromAttention`.

**Env vars (all set May 13 in Vercel by Gary):**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — both apps, all 3 environments
- `VAPID_PRIVATE_KEY` — admin only, marked Sensitive
- `VAPID_SUBJECT=mailto:gazzad@mac.com` — admin only

**iOS install requirement (non-obvious):**
iOS Safari (16.4+) refuses to expose the permission API to plain browser tabs. The PWA must be installed to home screen first. The Notifications card detects this and shows a 4-step installer card instead of an Enable button. Reps need to (1) tap Share, (2) tap "Add to Home Screen", (3) tap Add, (4) open the app from the home-screen icon and try again.

**Smoke test (after Vercel deploys):**
1. On Android Chrome OR an installed-as-PWA iPhone: open `/profile` → Notifications card. Tap **Enable**.
2. Browser permission popup → Allow.
3. Card should flip to "Notifications on" + green check.
4. In Supabase Table Editor → `push_subscriptions` should show a new row for your `rep_id`.
5. On admin (separate browser, signed in as a manager): `/schedule/new` → create a shift assigned to that rep → Save.
6. Phone should buzz with "New shift assigned · {customer name} · today · {time}".
7. Tap the notification → app opens (or focuses) on `/shifts`.

### Web Push phase 2 (shipped later May 13)

Two add-ons sitting on the v1 foundation:

**A. Scheduled reminders — Vercel Cron driven.**

Endpoint: `morpheus-admin/app/api/cron/shift-reminders/route.ts`
Schedule: every 5 minutes (`morpheus-admin/vercel.json` → `*/5 * * * *`).
Each tick runs two sweeps in parallel:

1. **Running-late sweep** — finds shifts where:
   - `shift_date` is today or yesterday (TZ fringe safety)
   - `state = 'scheduled'` (not yet checked in)
   - `rep_id IS NOT NULL` and `is_flexible_time = false`
   - `start_time` has passed by ≥ `app_settings.late_grace_minutes` (default 10)
   - No `shift.reminder_late_sent` event exists for the shift yet
   Sends `buildRunningLatePayload()` and logs a `shift.reminder_late_sent` event row (idempotency marker — second sweep can't double-send).

2. **EOD-checkout sweep** — finds shifts where:
   - `state IN ('in-progress', 'on-break')`
   - `end_time` has passed by ≥ 30 minutes (EOD_BUFFER_MINUTES constant — promote to app_settings later if needed)
   - No `shift.reminder_eod_sent` event exists for the shift yet
   Sends `buildEODCheckoutPayload()` directing the rep to `/active` for a one-tap check-out.

Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. The route rejects anything else with 401 so it can't be hit from the open web.

**B. Manager broadcast — rep flags an unable-to-attend.**

When a rep raises an attention flag on the mobile app, the new `notifyManagersOfAttention()` helper POSTs cross-origin to admin's `/api/push/notify` with the rep's Supabase JWT. The admin route:
1. Validates the JWT.
2. Confirms the caller is the `rep_id` on that shift.
3. Sanity-checks that `attention = 'unable_to_attend'` is actually set (prevents a malicious rep from spamming managers with arbitrary "attention raised" pushes).
4. Calls `sendPushToManagers()` — fans out to every profile with `role='manager'`.

CORS: `/api/push/notify` exposes `Access-Control-Allow-Origin` to the mobile origin only (`NEXT_PUBLIC_MOBILE_URL` env var, falls back to the prod URL). Random sites can't trigger pushes.

**New files:**
- `morpheus-admin/app/api/cron/shift-reminders/route.ts` — cron sweep endpoint
- `morpheus-admin/vercel.json` — cron schedule registration
- `morpheus-mobile/lib/push-notify-managers.ts` — fire-and-forget client helper for rep-initiated manager pushes

**Extended files:**
- `morpheus-admin/lib/push-send.ts` — added `buildRunningLatePayload`, `buildEODCheckoutPayload`, `buildAttentionRaisedPayload`, and `sendPushToManagers()` (fan-out)
- `morpheus-admin/app/api/push/notify/route.ts` — added `attention-raised` event with rep-JWT auth + ownership check + CORS for mobile origin
- `morpheus-mobile/lib/shifts-store.ts` — `raiseUnableToAttend()` now fires `notifyManagersOfAttention()` after the successful DB write

**New env vars (must be set in Vercel before pushing real users at this):**
- `CRON_SECRET` — admin only. Any random hex string (`openssl rand -hex 32`). Vercel Cron uses this as a Bearer token to authenticate the cron endpoint. Without it the cron returns 500.
- `NEXT_PUBLIC_MOBILE_URL` — admin only (optional). Defaults to `https://morpheusta.vercel.app`. Override if the mobile project has a different production URL.
- `NEXT_PUBLIC_ADMIN_URL` — mobile only. Defaults to `https://morpheus-admin.vercel.app`. The mobile push-notify-managers helper POSTs cross-origin to this URL.

**Smoke test (after Vercel deploys + env vars set):**
1. **Late reminder:** create a shift in the past (today's date, start_time = "08:00:00") assigned to your test rep, leave them as state='scheduled' (don't check in). Within 5 min the cron should fire a "Running late?" push and log a `shift.reminder_late_sent` event.
2. **EOD reminder:** find a shift you're already checked into, set its `end_time` to 31+ min ago via SQL. Within 5 min you should get "Don't forget to check out" and a `shift.reminder_eod_sent` event.
3. **Manager broadcast:** as a rep, raise an unable-to-attend on a shift. Every manager subscribed via /profile → Notifications should get "Rep raised attention" within seconds.

**Limits still deferred:**
- No admin UI for sending arbitrary test pushes. Could be added on `/reps/[id]` as a "Send test" button if useful for debugging.
- ~~EOD_BUFFER_MINUTES is a constant (30) — could be promoted to `app_settings`~~ ✅ Done. Now `app_settings.eod_reminder_buffer_minutes`, editable from `/settings/notifications`. Cron reads it on every tick with a 30-min fallback if the row's missing or unparseable.


---

### Push kill switch — `/settings/notifications` (shipped May 13)

Org-wide on/off for every Web Push delivery path. The toggle lives at
`/settings/notifications` on the admin console; the backing setting is
`app_settings.push_notifications_enabled` (boolean, default ON).

**What this toggle covers (gated inside `lib/push-send.ts`):**
- Shift assigned / reassigned / cancelled (manager-initiated)
- Running-late + EOD-checkout reminders (Vercel Cron sweep)
- Rep raised attention flag → broadcast to managers

The gate is enforced inside `pushNotificationsEnabled()` in `push-send.ts`,
called at the top of BOTH `sendPushToRep` and `sendPushToManagers`. Every
push path funnels through one of those two functions, so adding a new
event type can't accidentally bypass the gate.

**What this toggle does NOT touch — IMPORTANT:**
- **Auto-checkout sweep (`sweepStaleShifts`)** still runs unchanged.
  A rep who forgets to check out gets force-completed at
  `app_settings.auto_checkout_time` (default 23:59) regardless of
  whether pushes are on or off. The push reminder is the **nudge**;
  auto-checkout is the **safety net**.
- In-app realtime notifications (the manager's "Needs action" badge)
  keep firing — that's a separate channel.
- Push subscription registration is unaffected. Reps can still
  subscribe / unsubscribe from `/profile`; if a manager flips the
  org switch back on later, delivery resumes without anyone having
  to re-subscribe.

### Auto-checkout vs push reminders — precise timing

Two completely independent code paths. Don't confuse them.

| Concern | Push reminder | Auto-checkout |
|---|---|---|
| **Code** | `morpheus-admin/app/api/cron/shift-reminders/route.ts` | `morpheus-admin/lib/shifts-store.ts → sweepStaleShifts()` |
| **Trigger** | Vercel Cron, every 5 min | Admin Live Ops home mount + tab-focus event |
| **Frequency** | Predictable, server-driven | Opportunistic — only runs when a manager has the admin tab open |
| **What it does** | Sends a push notification to the rep's phone | Marks the shift as `state='complete'`, stamps `check_out_at`, logs `shift.auto_checked_out` |
| **EOD threshold** | `app_settings.eod_reminder_buffer_minutes` past `end_time` (default 30, editable on `/settings/notifications`) | `app_settings.auto_checkout_time` (default `23:59`, editable on `/settings/check-in-rules`) |
| **Modifies shift state?** | ❌ No — only sends a notification | ✅ Yes — sets `state='complete'` + `check_out_at` |
| **Affected by push kill switch?** | ✅ Yes — silenced when the toggle is off | ❌ No — completely independent |
| **Required for production?** | Nice-to-have nudge | Mandatory safety net |

**The chain of events on a "rep forgot to check out" day:**

1. Rep's shift `end_time` = 17:00. They check in at 13:00, work, then leave without tapping Check out.
2. **17:30** (end_time + 30 min) — `/api/cron/shift-reminders` fires the EOD push. Rep sees "Don't forget to check out" on their phone.
3. **17:30+** — rep either taps the notification → `/active` → Check out (resolves cleanly), OR ignores it.
4. **23:59** (or whatever `auto_checkout_time` is) — the next admin tab focus triggers `sweepStaleShifts()` which force-completes the shift. `check_out_at = NOW()`, state → `complete`, `shift.auto_checked_out` event logged.
5. Timesheet shows the shift as complete with the auto-checkout timestamp; the audit event distinguishes it from a real rep check-out.

**If push notifications are OFF in the org settings**, step 2 silently no-ops. Steps 1, 3, 4, 5 all still work. The rep just doesn't get the nudge. The shift still closes.

**Auto-checkout is no longer admin-presence dependent.** A second Vercel Cron route (`/api/cron/auto-checkout`, every 15 min — see `vercel.json`) replicates the `sweepStaleShifts()` logic using the service-role client. Runs hands-off regardless of whether anyone has admin open. The client-side `StaleShiftSweeper` still fires on admin Live Ops mount + tab-focus as a belt-and-braces opportunistic sweep; whichever runs first does the work, the audit log shows `source: "cron"` in the event meta so you can tell which path completed the row.

The May 11 "calendar — add second shift to occupied slot" ask
shipped on May 12 (commits `adc7ed6`, `8197bf1`, `2bf4e8a`): the
quick popover now has "Add another here" + "Edit here" inline
actions alongside Delete + Full edit. ✅

Open the `/reports` hub to see what works visually, the Timesheet report to see how the events log + new `check_out_at` column come together for payroll, and `/schedule/new` to see the multi-rep × multi-customer × recurrence pattern.

