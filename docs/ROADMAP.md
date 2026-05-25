# Roadmap — what's next, what's done, what's deferred

> Start here if a fresh chat is asking "what should I work on?".
> The priority list at the top is in actionable order — top item
> is what to tackle next.
>
> Sections:
> - [What the next chat should do first](#what-the-next-chat-should-do-first)
> - [Done vs deferred](#whats-done-vs-whats-deferred)
> - [Recent decisions worth knowing](#recent-decisions-worth-knowing)

---

### What the next chat should do first

Top of the queue (in priority order):

0. **Import hub + email welcome — Phases A + B + C landed May 25, D + E to ship.** Foundation in (Phase A): `import_runs` table, `geocode_status` on customers + sites, Resend wiring, `/settings/import` page. First user-visible feature in (Phase B): "Email this user" button on `/settings/managers/[id]/edit` + `/reps/[id]` actions slot. Second user-visible feature in (Phase C): `/import` hub + 5-step `/import/[entity]` stepper (Source → Map → Settings → Preview → Result) for all five entity types, consolidated `Import` CTAs across `/customers`, `/reps`, `/settings/managers`, `/schedule`, the customer-detail `SitesTab`, and a new top-level "Import" sidebar nav entry. All five adapters' Phase-C stubs throw "Phase D not wired up" on Commit — the wizard surfaces that cleanly on the Result step.

   **Operator actions still owed before A + B are end-to-end testable** (C doesn't add new ops needs — its acceptance test for the picker / parser / preview wizard works without writes):
   - Run both migrations in Supabase SQL Editor: `db/migrations/2026_05_25_import_runs_and_geocode_status.sql` and `db/migrations/2026_05_25_profiles_last_credentials_sent_at.sql`.
   - Add `RESEND_API_KEY` to the morpheus-admin Vercel project (Production + Preview + Development); verify `gazzad@mac.com` as a recipient in Resend (free tier `onboarding@resend.dev` only delivers to verified recipients until a sending domain is added — Gary set up `morpheusops.app` is in flight; once verified in Resend, set `RESEND_FROM=Morpheus Ops <hello@morpheusops.app>` in Vercel too).
   - Confirm `NEXT_PUBLIC_ADMIN_URL` + `NEXT_PUBLIC_MOBILE_URL` are in the Supabase Auth Redirect URLs allowlist (Authentication → URL Configuration) so the recovery-link path lands users in the right app rather than the Supabase default redirect. Both URLs are likely already there from existing login flows.

   **Next phases (ship one at a time):** D — entity adapters that replace the Phase-C stubs in `lib/import-adapter-registry.ts` with real upsert paths (D1 customers, D2 sites, D3/D4 reps + managers, D5 shifts with recurring expansion). Each adapter writes an `import_runs` row + per-row `errors_json` entries. E — every-minute geocoder cron consuming the new `geocode_status = 'pending'` queue.

1. **Set `NEXT_PUBLIC_MOBILE_URL` on the morpheus-admin Vercel project** (belt-and-braces). Today's fix made push URLs relative so they can't ship to the wrong host even if the env var is missing, but the var is still used by the CORS check in `/api/push/notify`. Set it to `https://morpheusta-khaki-omega.vercel.app` on **Production + Preview + Development** so the fallback never fires.
2. **One-time SQL cleanup for any check_in_at > check_out_at rows** (Mariska-style bad data from before today's fix). The data-integrity guard in `checkInToShift` prevents NEW bad rows but doesn't retroactively repair existing ones:
   ```sql
   -- Run this in the Supabase SQL Editor to inspect first:
   SELECT id, customer_id, rep_id, shift_date, check_in_at, check_out_at, state
   FROM shifts
   WHERE check_in_at IS NOT NULL
     AND check_out_at IS NOT NULL
     AND check_in_at > check_out_at;
   -- Then a scoped repair (sets check_out_at = check_in_at so hours = 0):
   UPDATE shifts
   SET check_out_at = check_in_at, state = 'complete'
   WHERE check_in_at IS NOT NULL
     AND check_out_at IS NOT NULL
     AND check_in_at > check_out_at;
   ```
3. **Add `GOOGLE_ROUTES_API_KEY` to Vercel `morpheusta`** if Plan-my-day is going to real reps. Without it the `/route` page works but shows mock-data ETAs. See "Optional env vars" for the setup walkthrough.
4. ~~**Phase 4 RLS**~~ ✅ **APPLIED to prod end of May 14** (`826ea1c`). Migration `db/migrations/2026_05_14_phase4_rls_hardening.sql` runs an `is_manager()` SECURITY DEFINER helper + role-aware policies on 19 tables + 3 storage buckets. Two small bugs caught and fixed during the apply: `shift_events.actor_id` not `rep_id`, and dropped a bogus `public.organisation` block (org settings live as rows inside `app_settings`). Smoke-test checklist at the bottom of the file. The three-week-old top-of-deferred-list item is closed.
5. ~~**iOS location permission prompt re-asks every session**~~ ✅ Mitigated May 14 with the new `/profile` `<LocationCard>` (`531d7f8`). Detects the "iOS forgot the previous Allow Once" state via a localStorage stamp + explains the exact step to fix ("when iOS asks, pick Allow on Every Visit"). iOS controls the prompt itself — we can't bypass it programmatically — but reps now have a visible, self-service way to understand + fix.
6. **Capacitor wrap** only if background GPS becomes a priority. Push alone doesn't need it.
7. **Custom report builder** if reporting is the priority. The foundations are in place (photos + signatures stored per-(shift, task); a future generator can embed them in a customer-facing PDF).

Recently cleared (May 14 — polish + bug-fix day):

- ✅ **Mariska's timesheet bug** (check_in_at > check_out_at) — both root causes fixed: Vercel crons restored on Pro plan, `checkInToShift` data-integrity guard added. See May 14 session entry above for the full trace. (`2778e3f`)
- ✅ **Push URLs shipping to wrong Vercel hostname** — push payloads now use relative URLs so the service worker resolves against its own origin. (`4a649f7`)
- ✅ **Late-reminder push fired every 5 min** — cron now writes the idempotency marker BEFORE the push so a failed marker insert can't leave us re-firing every tick. (`ff1fcf6`)
- ✅ **/active crashed with React error #310** on cold load — early-return guard moved below every hook so the hook count never differs between renders. (`57e419b`)
- ✅ **/active emptied when rep tapped Pause** — `getMyActiveShift` now matches `on-break` in addition to `in-progress`. (`1fdedae`)
- ✅ **Pause as a first-class action on /active** — single button toggles Pause ↔ Resume with state-aware styling; Check-out locked while paused. (`bac96bb`, `4a23742`)
- ✅ **Route pill icon-only with two states** (calm check-circle / brand-deep target + pulse) — hourly auto-recheck via the new `route-improvement-watcher`; calm taps open a celebratory sheet, action taps go to `/route`. (`5693bf7`, `1cfeea3`, `1aa0205`, `6076a7b`)
- ✅ **Geocode card removes every "flag your manager" dead-end** — rep can always self-pin; `setCustomerSiteCoords` looks up or creates a site row when shifts.site_id is null. Address tile gets an inline MapPreview. (`33910b1`, `392a1de`)
- ✅ **Live Ops Today's Shifts: needs-action rows redirect per-row** to the Live Feed Needs Action tab regardless of which tab is open. (`2e55737`)
- ✅ **Admin /customers New filter + recently-added pinned to top**. (`9d6b923`)
- ✅ **Calendar drag-drop overlaps now warn-but-allow** — "8 stops same day, pick your order" pattern works again. (`bac96bb`)
- ✅ **Composer cleanup** — Subject the only required text field, two explicit `[Send now]` + `[Schedule for later]` buttons. (`392a1de`)
- ✅ **Mobile chrome polish** — Tasks expandable sub-nav with locked Pro tiles, profile up + logout down + power glyph, viewport-fit=cover, footer slimmed, sidebar tagline+shimmer, home logo↔menu swap, /active hero slim. (`bfb041a`, `9896db4`, `f03dd10`, `ed4c588`, `723f829`, `9283ec6`, `51296be`)
- ✅ **Sidebar org-logo first-paint flicker** killed via localStorage cache. (`a9f31ff`)
- ✅ **Morpheus Ops rebrand on admin** — layout title, login hero, sidebar capitalisation. (`6b22fe3`, `380ee77`)
- ✅ **Hidden 5-tap debug reveal** on `error.tsx` (localStorage `morpheus.debug=1` for persistent on). (`0ed3096`)
- ✅ **requested_shifts RLS leak** — reps were seeing other reps' pending requests via the realtime channel because the SELECT policy was `USING (true)`. Migration `2026_05_14_requested_shifts_role_scoped.sql` re-scopes by role. Gary ran it. (`839b6b6`)
- ✅ **Phase 4 RLS hardening — APPLIED to prod.** `db/migrations/2026_05_14_phase4_rls_hardening.sql` runs an `is_manager()` SECURITY DEFINER helper + role-aware policies on 19 tables + 3 storage buckets. Two fixes during the apply: shift_events.actor_id (not rep_id), and dropped the bogus public.organisation block (org settings live in app_settings). The three-week-old top-of-deferred item is closed. (`37efa95`, `0f89517`, `4d99f55`, `826ea1c`)
- ✅ **/profile LocationCard** — iOS Allow Once / re-prompt explainer with localStorage stamping + iOS Settings deep-link copy. Mitigates the long-standing "permission keeps asking" complaint without us being able to bypass iOS itself. (`531d7f8`)
- ✅ **Library tap-to-open dead on iOS PWA** — root cause was `await getLibraryDownloadUrl()` between tap and `window.open()` breaking the user-gesture chain. Now pre-generates signed URLs via batched `createSignedUrls` and renders each row as a real `<a href>` anchor. Storage RLS and bucket setup were always correct. (`cf04b9d`)
- ✅ **Live Ops realtime tighter + visible** — LiveFeedPanel poll 60s→15s, window `focus` refetch added, and a green `<LivePulse>` heartbeat in the panel header that fires for ~1.2s on every real realtime event (never on polling ticks). (`cf04b9d`)
- ✅ **Needs Action count drift across surfaces** ("2 / 1 / 0" on the same screen) — root cause was three independent subscribers + three independent fetches. Replaced with a single `NeedsActionContext` provider mounted in AdminShell. One subscription, one 15s poll, 1s+3s replica-lag retry after each realtime event. Sidebar/LiveFeedPanel/ShiftsList all derive from the same state → identical numbers in the same React frame. (`9e18116`)
- ✅ **"Unassigned" filter tab removed** from Today's Shifts per Gary — managers pair reps with shifts at creation time, dedicated filter was dead weight. STATE_MAP + row-label fallback for null-rep rows preserved inside the "All" tab. (`27f3a72`)
- ✅ **Photo capture dead on iOS PWA — the ACTUAL fix.** Every previous attempt was correct in spirit but missed the real bug: `await refreshPhotoCount()` inside `startPhotoFlow` was breaking iOS's transient user-activation flag, and `requestAnimationFrame(() => click())` was breaking it too. Camera popup was silently blocked. Fixed by making startPhotoFlow synchronous (read cached `taskPhotoCounts` Map; fire input.click() in the same call stack as the tap) AND replacing the rAF-based auto-chain between photos with a per-photo "Take photo N of M" button in the bottom overlay. Each button-tap is a fresh user gesture iOS respects. (`447fc82`)

Recently cleared (May 15 — overnight sidebar polish):

- ✅ **Bigger nav links + brand pill on "In real time" + bottom-fade gradient on the dark sidebar.** Pure design pass — font 13→14, glyph 17→18, vertical pad 8→10, tagline split with the "In real time" half wearing the same cyan rounded chip the OPS pill uses elsewhere, and a 0 → 100% gradient that warms the void below the nav. (`189a90a`)
- ✅ **Tasks sub-nav toggles + animates.** Re-clicking Tasks while on /tasks now collapses it via a local `tasksExpanded` state (was a no-op nav before). Animation uses `cubic-bezier(.22, 1, .36, 1)` — max-height + opacity + a tiny inner translateY for slide-from-top. Caret on the row rotates 90° to track. Auto-opens when the user lands on /tasks from elsewhere. (`f3f55b5`)
- ✅ **Org name accent colour at /settings/organisation.** Native colour picker + hex text input + live preview pill + Clear button, saved together with the name via the existing Save button. Sidebar repaints instantly via the existing `morpheus.org.changed` event — no reload. Subtle text-shadow when a custom colour is set so brand reds / yellows don't wash out on the dark sidebar. Local org-cache bumped to v2 to carry the colour, v1 entries silently ignored on read. **Live Ops needs-action wiring verified intact** — the badge, the deep-link, the shared NeedsActionContext, the LIVE pulse, the tab-title alert all still work as before. (`f3f55b5`)
- ✅ **Tagline forced onto one line at 240px sidebar width.** Font 12.5→11, flexWrap nowrap, muted prefix truncates first while the brand pill stays whole via flexShrink:0. (`b1a739b`)
- ✅ **Paused timer was still ticking** — hero timer on /active now freezes at the pause moment + resumes from where it stopped via a localStorage-backed pauseOffsetMs accumulator. (`b2deb97`)
- ✅ **Paused shift was hard to spot in the list** — `/shifts` row gets a "Paused" warn-tint chip + paused shifts sort to the top with in-progress. (`b2deb97`)
- ✅ **/route had no way to apply a watcher-found better route** — Save button stayed hidden forever after first save, so when the watcher found "17 min faster" there was no action target. Now reappears as "Apply this new route". (`a981b2d`)
- ✅ **Route pill icons rebranded** — new `route-alert` / `route-done` glyphs that read as a route (start dot → S-curve → end dot, end dot replaced by a ringed check in the calm state). Action tone moved from brand-blue to amber so it doesn't fight everything else blue on the app. (`6c518ea`)
- ✅ **Mariska double-shift bug** — `approveRequest` now atomically claims the request via UPDATE status='approving' WHERE status='pending' before creating the shift, so a double-tap or two-manager race can't produce duplicate shifts. (`6c518ea`)

Recently cleared (May 13 — afternoon + evening session):

- ✅ **Feature A — Rep adds customer + NEW badge** (`d11675b`, `b7f129c` bugfix)
- ✅ **Feature B — Rep geocodes existing site** (`8465ff5`)
- ✅ **Feature C — Photos on tasks** end-to-end with direct-camera flow + iOS PWA fix (`3ae6d6f`, `ab9a4db`, `cda34ac`)
- ✅ **Feature D — Customer signatures on tasks** with photo+sig chain (`a44a579`)
- ✅ **Feature E — Messaging** (admin composer, push + in-app, scheduled) (`54b70ab`)
- ✅ **Live Ops Needs Action deep-link** from sidebar badge + Today's Shifts rows (`37860b0`, `f9f73e9`)
- ✅ **Pending-pill expand-on-tap** (`f9f73e9`)
- ✅ **Pause-and-switch check-in** with max-2-paused cap (`cda34ac`, `038ba80`)
- ✅ **Add-customer typeahead + map preview + flow polish** (`2bf42b0`, `038ba80`)
- ✅ **Shift dashboard address surface** (`a44a579`)
- ✅ **Morpheus Ops rebrand** with brand-tinted pill everywhere (`038ba80`, `0c9bcb0`)
- ✅ **Compulsory linking** — task `compulsory` and `photos_compulsory` now share one toggle so they can't drift
- ✅ **Messaging nav entry de-greyed** — was `comingSoon: true` from the placeholder era (`27a120e`)
- ✅ **Messages migration ADD PUBLICATION made idempotent** — re-running `2026_05_13_messages.sql` no longer errors with `42710` (`e2a250a`)
- ✅ **Composer no longer auto-excludes the sender from the audience** — Slack-style "everyone in the audience gets a copy, including the composer" behaviour (`8874347`)
- ✅ **Specific-user picker shows rep avatars + selected-summary strip** — uses existing `<RepAvatar>` component; "N picked · Clear" bar keeps the audience visible while scrolling; list maxHeight bumped to 320 px (`a1cbf2f`)

Recently cleared (May 13 — morning):
- ✅ **Auto-checkout cron shipped** — `/api/cron/auto-checkout` runs every 15 min via Vercel Cron. The "auto-checkout only fires when an admin has Live Ops open" pre-existing limitation is now closed. Client-side `StaleShiftSweeper` kept as a belt-and-braces opportunistic sweep.
- ✅ **Push kill switch + notification reference shipped** — org-wide on/off at `/settings/notifications`, with a structured reference list of every notification + automatic action grouped by category (push to reps / push to managers / auto-actions / in-app realtime). EOD reminder buffer is now an admin setting too.
- ✅ **Web Push phase 2 shipped** — scheduled "Running late" + "EOD checkout" reminders (Vercel Cron every 5 min) and manager broadcast pushes when a rep raises an unable-to-attend flag. See "Web Push notifications" section below.
- ✅ **Web Push v1 shipped** (rep notifications for shift assigned / reassigned / cancelled). See dedicated section below.
- ✅ "Plan my day" renamed to "Route" + icon-only status pill on `/shifts` so the page stops shouting wordy "Optimized · 2:42 PM" when there's nothing to act on.
- ✅ All May 7 / 11 / 12 migrations applied to Supabase.
- ✅ `saveShiftOrder` atomicity — order + meta now written in one `setItem` (v2 payload in `lib/shift-order-store.ts`, with v1 read fallback for one release).
- ✅ Home segmented pill — "Day complete" calm state mirrors `/shifts`; pill no longer shouts "Plan route" when the celebration card is showing.
- ✅ `qa/QA_PLAN.md` already refreshed (May 12) — `/check-in/success` + `/summary` are documented as dead routes, `M-CHECKOUT-OK` asserts the new "routes to `/`" behaviour.


---

## What's done vs what's deferred

### ✅ Done

- All UI screens for both apps (~22 pages total) ported pixel-close to the design handoff
- PWA setup on both apps (installs to phone home screen)
- Live deployments on Vercel
- Custom domain available via Vercel (not yet purchased — using `*.vercel.app`)
- **Auth:** real Supabase Auth, both apps, with AuthGate redirects
- **Customers table** in Supabase, admin creates → mobile fetches the live list
- **Rep-requested shifts table** in Supabase, scoped per-user via RLS
- **Shifts table** in Supabase — admin schedules → rep sees on phone (the real loop)
- **Optional rep assignment** when scheduling a shift (drop-down picker, NULL = leave for any rep to claim)
- **Mobile claim flow** — unassigned shifts show a "Claim" button that sets `rep_id = auth.uid()` race-safely
- **Mobile check-in writes to DB** — sets `state='in-progress'` + `check_in_at` timestamp
- **Mobile check-out writes to DB** — "Confirm check-out" calls `checkOutOfShift()` (state→`complete`, stores tasks_done) and `clearRepLocation()` (drops the green dot from the admin map via Realtime)
- **Admin Requests inbox** — `/requests` page lists pending rep-requested shifts; manager taps "Schedule" to open `/schedule/new` pre-filled with rep + customer (and the request id), which on save creates the shift and deletes the request so the inbox stays clean. "Decline" deletes the request directly. Same inbox is also surfaced as a "Requests" tab on the home page Live Feed.
- **Realtime Live Ops board** — KpiStrip and ShiftsList both subscribe to `shifts` table changes via Supabase Realtime. When a rep checks in / claims / completes, or a manager schedules, the dashboard updates without a refresh.
- **Customer tasks** — admin manages a task library at `/tasks` with full CRUD: create at `/tasks/new` (scope to **all customers** = universal, **specific** = one, or **multiple** = sprays one row per ticked customer), edit individual rows at `/tasks/[id]/edit`, or delete inline. Mobile `/active` fetches the customer's specific tasks PLUS any universal ones and renders them under the timer. Compulsory tasks block check-out until done; `tasks_done` count goes back to the DB on check-out.
- **Library categories + edit** — every uploaded file carries a category (`Documents` / `Photos` / `Training` / `Forms` / `Reference` / `Other`). Admin picks a category at upload time and can change it (or the customer association, or the display name) via `/library/[id]/edit`. Mobile `/library` shows category-filter chips above the file list.
- **Clickable admin breadcrumbs** — every breadcrumb segment except the current page now links back via a label-to-href map in `TopBar.tsx`. Pages can opt a segment out of linking by passing `{ label: "Some Name" }` (no href) — used for things like the rep's name on `/reps/[id]`.
- **Admin /schedule week planner** — full real-data 7-day grid: rows are reps (plus an "Unassigned" row at the top for claimable shifts), columns are Mon-Sun. Each cell shows that rep's shifts on that day with state-coloured accents (in-progress = brand, complete = green dimmed/struck-through, late = red, scheduled = customer color). Empty cells get a + button that opens `/schedule/new?rep=X&date=YYYY-MM-DD` pre-filled. Customer filter narrows visible shifts. Week navigation (← / Today / →) refetches via `listShiftsInRange`. Today's column is highlighted.
- **Multi-customer + recurring shifts on `/schedule/new`** — customer scope picker (All / Specific one-or-many) × recurrence picker (One-off / Weekly with day-of-week chips + an "until" date) creates the cartesian product as N shift rows. Live preview shows the count before save. Sequential creation with progress ("Creating 3 of 12…"); per-row errors are surfaced in a summary so partial successes are visible.
- **Library multi-customer** — `library_files.customer_id` is now a `customer_ids text[]` array. NULL = "shared with all"; populated = those specific customers. Admin upload + `/library/[id]/edit` use the same reusable `<CustomerScopePicker />` component as `/tasks/new` and `/schedule/new`. Each row shows up to 3 customer chips + a "+N" overflow.
- **Reusable `CustomerScopePicker`** — single component (`components/ui/CustomerScopePicker.tsx`) used for any "All / Specific (one or many)" customer selection. Drives /tasks/new, /schedule/new, /library upload, /library/[id]/edit. Maintains UI consistency wherever customers are picked.
- **Rep ↔ Customer assignments** — new `rep_customer_assignments` join table. Visible AND editable from BOTH directions: `/customers/[id]` has an "Assigned reps" multi-select editor; `/reps/[id]` has an "Assigned customers" multi-select editor. Both write to the same join via `setRepsForCustomer` / `setCustomersForRep` (idempotent diff — only the delta is touched).
- **Customer detail page on real data, tabbed** — `/customers/[id]` is now a tabbed page: **Overview** (counts at-a-glance), **Address & geofence** (real MapLibre map with the customer's pin + a live-updating geofence circle whose radius is editable via slider), **Reps** (assigned-reps multi-select, persists via `rep_customer_assignments`), **Tasks** (real `customer_tasks` with inline edit/delete + "Add task"), **Library** (files attached to this customer or universal), **Today's shifts** (real shift rows + rep links), **Custom fields** (the dynamic `<CustomFieldsCard />`). Header card stays visible across tabs.
- **Customers list page on real data** — `/customers` has working filters (All / Active / Inactive / On the map) with real counts, a search box (name / code / address), and three working views: **Grid** (cards with real status + address indicator), **Table** (dense rows for many customers), **Map** (MapLibre with every customer pin, click-through to detail page). Mock filter chips and the Import button are gone — the Add customer CTA stays.
- **Custom fields system** — admin defines per-entity custom fields under `/settings`. Each field has a name, type (Short text / Long text / Number / Date / Yes-No / Dropdown), required flag, and order. Define once, fill on every entity's detail page via the `<CustomFieldsCard />`. Backed by `custom_fields` (definitions) + `custom_field_values` (polymorphic values: only one of `value_text` / `value_number` / `value_date` / `value_bool` is populated per row). Required fields are flagged at save time. Customer detail page already renders the card; reps/shifts/tasks/library_files render points are deferred.
- **Customer geofence radius is real** — `customers.geofence_radius_m` is a real column (default 100m). The customer detail Address tab has a slider + quick-pick buttons (50/75/100/150/250m), persisted to the DB.
- **`shift_events` activity log** — every meaningful action across both apps writes a row to `shift_events`: shift scheduled / claimed / checked-in / checked-out / deleted, request submitted / scheduled / declined, customer created / deactivated / reactivated / deleted, library file uploaded / deleted, task created / deleted. Each row has actor, customer/shift links, a pre-rendered display message, and an optional JSON `meta` blob (off-site distance, late mins, etc). The Live Feed "All activity" tab streams this in real time via `subscribeEvents` (postgres_changes INSERT). Mobile app and admin both write to the same log.
- **Live Feed merged + live** — the dashboard panel now has just two tabs: **Needs action** (pending rep requests with Schedule/Decline; subscribed to `requested_shifts`) and **All activity** (the `shift_events` log; subscribed to inserts). Both tabs flip in real time. The previous third "Requests" tab was redundant with "Needs action" and is gone.
- **Mobile breaks restored** — `/active` Breaks section now offers Short (15m) / Lunch (30m) / Long (60m) options. Tapping any opens the existing break sheet — Start break starts a timer, End break stops it. Tasks sections show clean "no compulsory/optional tasks for this customer yet" empty states when there's nothing defined.
- **Auth role separation** — mobile signups land as `role='rep'`, admin signups land as `role='manager'`. Trigger `handle_new_user()` reads the role from `raw_user_meta_data`, clamps to `{rep, manager}`. Admin AuthGate refuses non-managers with an "Admin console only" lock screen + Sign out button. Both signout paths (lock screen, sidebar) and the mobile menu logout are now fire-and-forget + clear local Supabase tokens + hard-reload to /login, so a stalled signOut() can't strand the user.
- **Managers list under Settings** — `/settings/managers` lists every user with role badge, joined date, filter chips. Promote / Demote button on each row toggles role with a confirm dialog (extra warning when self-demoting). RLS opens profiles UPDATE to any-authed for now (Phase 4 narrows to manager only).
- **User CRUD via service-role server route** — `/api/users` (POST/PATCH/DELETE) uses the Supabase service-role key (env var `SUPABASE_SERVICE_ROLE_KEY`, marked Sensitive in Vercel) to call `auth.admin.createUser` / `updateUserById` / `deleteUser`. Every call verifies the caller's session token belongs to a manager. "+ Add user" modal on `/settings/managers` collects name + email + role + an auto-generated password (with regenerate / copy / show-hide); success screen shows credentials once with copy-all. "Edit" pencil per row → `/settings/managers/[id]/edit` to change name / email / role / reset password / delete. Deleting your own account is blocked.
- **Real check-in / check-out exception logic** — exceptions only render when an actual rule fires:
  - Off-site = browser geolocation Haversine distance to customer's lat/lng > customer's `geofence_radius_m` (default 100m, override per-customer on Address tab).
  - Late check-in = `(now − start_time) > late_grace_minutes` (org-wide setting, default 10).
  - Early check-out = `(end_time − now) > early_grace_minutes` (org-wide setting, default 15).
  - GPS denied / unavailable → off-site exception with "Location unavailable" message.
  - When zero exceptions fire → green "Ready to check in/out" card with one-tap confirm; no reason chips, no friction.
  - Each fired exception writes a dedicated event (`shift.checked_in_offsite`, `shift.checked_in_late`, `shift.checked_out_offsite`, `shift.checked_out_early`) with distance / minutes / reason / note in `meta`. Live Feed shows them with `danger` / `warn` accents.
- **`/settings` restructured into sticky-nav sections** — 240px left rail with Managers / Check-in rules / Custom fields / Org / Notifications / Billing. Click any to smooth-scroll; active section highlights as the user scrolls. Adding a new section is two lines in `NAV_SECTIONS` + a `<Section>` block. Check-in rules contains the late grace + early grace + default geofence radius inputs (the latter is a new `default_geofence_radius_m` org setting in `app_settings`).
- **Today timezone bug fix** — both shifts-stores compute "today" via a local-tz formatter (`getFullYear`/`getMonth`/`getDate`) instead of `toISOString().slice(0,10)`. Past midnight in non-UTC timezones, the dashboard now shows today's shifts, not yesterday's. Admin Live Ops `KpiStrip` + `ShiftsList` and the mobile dashboard also refetch on `document.visibilitychange` so a tab left open across midnight wakes up with today's data.
- **Dedup guard on Live Feed events** — the realtime subscription dedups by `id` so a near-simultaneous initial fetch + INSERT delivery can't double-render the same row.
- **Mobile shifts list shows state** — `/shifts` "Scheduled for me" sorts in-progress → scheduled → complete (so finished shifts sink to the bottom), with a green "Complete" badge on done shifts (dimmed, struck-through times) and a brand "In progress" badge with a "Resume shift" button on the active one.
- **Mobile dashboard is fully real-data** — date is today's actual date, "last sync" is real now, shift count + progress bar reflect today's DB shifts (green segment for complete, brand for in-progress, grey for scheduled), Library shortcut shows real file count, "Up next" picks the in-progress shift first (with "Resume shift") then the next scheduled (with "Check in"), and the route-preview card is a real MapLibre map plotting today's customer pins + the rep's GPS dot.
- **Library** — admin uploads files at `/library` (with optional customer association) into Supabase Storage bucket `library` + metadata in `library_files`. Mobile `/library` lists everything reps can see; tap any file to open it via a short-lived signed URL.
- **Real-data only** — `/active`, `/check-out`, and the Live Feed's "Needs action" / "All activity" tabs no longer fall back to mock samples. With an empty database, every page shows a clean empty state ready to be populated.
- **Profiles table + auto-trigger** — `handle_new_user()` creates a profile row on signup; carries `role` ('rep' | 'manager') and display `name`
- **Reps section in admin** — list view + per-rep detail page (today's shifts, lifetime stats)
- **Live Ops board reads real data** — KPI strip + shifts table compute from Supabase
- **Real field map (admin)** — MapLibre GL + OpenFreeMap vector tiles, replaces the SVG faux map. Plots active customers with coordinates.
- **Customer addresses + geocoding** — `address`/`latitude`/`longitude` columns on `customers`; address autocomplete via Nominatim (server-proxied to satisfy User-Agent ToS); `app/api/geocode/{route.ts,suggest/route.ts}` are the two server routes.
- **Edit + soft-delete customers** — `app/customers/[id]/edit` to set/change address; deactivate/reactivate via the `active` flag (INACTIVE badge in list); hard-delete still available. Customer detail page is a client component now (server components couldn't see auth, RLS was silently returning empty).
- **Live rep tracking on the field map** — mobile pushes GPS to `rep_locations` (throttled to 30s, only while the active-shift screen is open); admin map subscribes via Supabase Realtime and renders rep dots that update live.
- **DB migrations folder** — `db/migrations/` holds canonical SQL for every schema change (still applied by hand in Supabase SQL Editor; CLI promotion is deferred).
- Side menu navigation on mobile (with both back-button + menu access on top-level pages)
- Map shows route preview when "Directions" is tapped, animates when "Start travelling" is active
- Personalised dashboard greeting using the logged-in user's profile name (fallback to email)
- "Take a break" works outside of an active shift

### ⏳ Deferred

These are the next obvious chunks of work, roughly in order of impact:

1. **Phase 4: Tighten RLS by role.** Right now any authenticated user can write to `customers`/`shifts`/`customer_tasks`/`library_files`/`profiles`. Use the `profiles.role` column to restrict INSERT/UPDATE/DELETE on those tables to `role = 'manager'`. SELECT can stay open. Mobile reps would only see DB-level errors if they try to misbehave through the API. Note: profiles UPDATE was deliberately opened to any-authed in Phase 3 so the managers list could promote/demote — that policy needs narrowing first.
2. **Background location tracking on mobile.** Today GPS only updates while the active-shift screen is in the foreground (browser limitation). For background tracking we'd need a Capacitor wrap or a service worker with `periodicSync` (limited support).
3. **Sparklines on KPI strip use real time-series.** Today they're placeholder shapes. Needs daily aggregation queries on top of the `shift_events` log.
4. **Per-shift task completion log.** Customer tasks now flow rep ↔ admin, but *which tasks were done on which shift* is only counted (`shifts.tasks_done`), not stored row-by-row. A `shift_task_completions` join table would let the admin see exactly which tasks the rep ticked off on a given shift.
5. **Render custom fields on every entity's detail page.** The data model is universal — `applies_to` ∈ {`customer`, `rep`, `shift`, `task`, `library_file`} — but only `/customers/[id]` currently renders the `<CustomFieldsCard />`. Drop it into the rep / shift / task / library-file detail pages too.
6. **Email confirmation** turned back on for production. Note: admin-created users are already auto-confirmed (`email_confirm:true` in `/api/users` POST), so this only matters for self-signup.
7. **Promote `db/migrations/` to the Supabase CLI** so migrations apply automatically per environment instead of being pasted into the SQL Editor by hand.
8. **Tests.** No tests yet — for production, add at minimum smoke tests for auth + critical CRUD.
9. **Native apps** (Capacitor wrap of the PWA, or React Native rewrite) for App Store / Play Store presence — also unlocks proper background location.

---


---

## Recent decisions worth knowing

These are calls we made along the way that future-you should understand:

1. **Inline styles instead of Tailwind.** Phase 1 needed pixel-perfect match to the design files, fast. Inline styles + a tokens object was the fastest path. A future refactor to Tailwind / CSS Modules / styled-components is mechanical (~1 week of work) but currently not blocking anything. Keep this in mind if you're tempted to rewrite the styling — there's nothing wrong with what's there, it just looks different from typical Next.js code.

2. **Two Vercel projects, one repo.** The original setup had two separate folders deploying separately. Keeping them in one repo makes Justin's life easier (one clone), at the cost of slightly fancier Vercel config (Root Directory). Worth it.

3. **No backend code (yet) — Supabase does it all.** Database, auth, RLS — all in Supabase. Next.js doesn't have any server-side route handlers in this repo. If you need server-only logic (e.g. a webhook receiver, or admin-only mutations that bypass RLS), add Next.js API routes under `app/api/` and use the Supabase service-role key (which is secret — keep it server-side only).

4. **Customer detail page is a client component, not server.** When it was a server component the authenticated Supabase session wasn't visible to it, so RLS silently returned empty rows. Switching to a client component fixed it. Same pattern applies to any page that needs the signed-in user's view of an RLS-gated table.

5. **Composite primary key on `requested_shifts`.** The row id is `${userId}-${customerId}` so two different users can both request the same customer. Customer-level matching uses `customer_id` everywhere in code, not `id`.

6. **Logout uses `window.location.href`, not `router.replace`.** See the Auth section. This is intentional — don't change it back.

7. **Geocoding is server-proxied, not called from the browser.** Nominatim's ToS requires a descriptive User-Agent. The two routes under `app/api/geocode/` set that header server-side; the client only ever talks to our own endpoints. Don't move these calls to the browser.

8. **`rep_locations` uses upsert with `onConflict: "rep_id"`.** One row per rep. We don't keep a history table — only "where are they right now." If we ever need a breadcrumb trail, that's a separate `rep_location_history` table, not a schema change here.

9. **Mock customer fallback was removed.** Both apps now require Supabase to be configured for customers. Mocks remain for shifts/profiles fallback in dev, but customers is DB-only.

10. **`rep_locations` joins to `profiles` are done in two queries, not one.** PostgREST can't auto-resolve a join between `rep_locations` and `profiles` because both tables FK to `auth.users` (in another schema), not to each other. The admin's `listRepLocations` does two simple queries and merges in JS — see `lib/rep-locations-store.ts`. If you ever try to use an embedded resource like `profiles(name, email)` here, it'll silently return `[]`.

11. **Check-out deletes the rep_locations row.** When a rep confirms check-out, the mobile app calls `clearRepLocation()` so the admin map's green dot disappears instantly via Realtime, instead of dimming to "stale" for 5 minutes. Requires the DELETE RLS policy in `db/migrations/2026_05_05_rep_locations_self_delete.sql`.

---

If anything is unclear or out of date, edit this README and push. It's the single source of truth for "what is this thing and how does it work."
