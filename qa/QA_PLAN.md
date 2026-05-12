# Morpheus 2.0 — Master QA & E2E Test Plan

**Version:** 1.0  · **Date:** 2026-05-07  · **Owner:** QA (Gary)
**Stack note:** Backend is **Supabase** (Postgres + Auth + RLS + Realtime), not Django. "API tests" below = Supabase integration tests against the same client/policies the apps use.

---

## 0. How to read this document

- §1 Coverage map by screen (admin + mobile)
- §2 E2E test checklist (Playwright)
- §3 API / data-layer test checklist (Supabase)
- §4 Data-integrity checklist
- §5 Playwright file structure
- §6 Supabase test file structure
- §7 Example tests (see `playwright/` and `api/` folders)
- §8 Bugs & risks found during audit
- §9 What to test next (priorities)

A **fully covered** flow has: happy path + at least one negative + a data-integrity assertion afterwards. "Page loads" alone is **not coverage.**

---

## 1. Coverage map by screen

### 1.1 Admin console (`/Users/gary/Claude/morpheus-admin`)

| # | Route | Purpose | Critical actions | DB tables touched | Has loading/empty/error? |
|---|-------|---------|------------------|-------------------|--------------------------|
| 1 | `/login` | Manager sign-in / sign-up | Submit, error banner | `auth.users`, `profiles` | L · E n/a · ER yes |
| 2 | `/` | Live ops dashboard | Read-only (KPIs, map, feed) | `shifts`, `rep_locations`, `shift_events` | L · E partial · ER no |
| 3 | `/customers` | Customer list (grid/table/map) | Filter, search, view toggle, click row | `customers` | L · E yes · ER yes |
| 4 | `/customers/new` | Create customer | Geocode, save, cancel | `customers` (INSERT) | L · ER yes |
| 5 | `/customers/[id]` | Customer detail (7 tabs) | Toggle active, edit geofence, manage reps/tasks/library/shifts/custom fields, delete | `customers`, `rep_customer_assignments`, `customer_tasks`, `library_files`, `shifts`, `custom_field_values` | L · E per-tab · ER yes |
| 6 | `/customers/[id]/edit` | Edit customer | Save, cancel, geocode | `customers` (UPDATE) | L · ER yes |
| 7 | `/tasks` | All tasks (admin view) | Filter, search, edit, delete | `customer_tasks` | L · E yes · ER yes |
| 8 | `/tasks/new` | Create task (1..N rows by customer scope) | Save, cancel | `customer_tasks` (INSERT) | L · ER yes |
| 9 | `/tasks/[id]/edit` | Edit task | Save, cancel | `customer_tasks` (UPDATE) | L · ER yes |
| 10 | `/schedule` | Weekly calendar (Days/Reps view) | Week nav, view toggle, filter, drag-drop, +/click cell, count summary chip | `shifts` | L · E yes · ER yes |
| 11 | `/schedule/new` | Create shift (1..N if recurring) | Cartesian product (dates × customers × reps), save, cancel | `shifts` (INSERT, multi-row) | L · ER yes |
| 12 | `/schedule/manage` | Series + standalone manager, **typed-RESET wipe** | Edit series, cancel series, edit one, edit future, delete, RESET | `shifts` (UPDATE/DELETE) | L · E yes · ER yes |
| 13 | `/shifts/[id]` | Shift detail (read-only or minimal edit) | Mark complete, mark late, delete, navigate to edit | `shifts`, `shift_events` | L · ER yes |
| 14 | `/shifts/[id]/edit` | Edit shift + repeat-across toggle | Save, cancel, sibling spawn (series_id) | `shifts` (UPDATE + multi INSERT) | L · ER yes |
| 15 | `/reps` | Rep + manager list | Filter, search, sort, view toggle | `profiles`, `shifts` | L · E yes · ER yes |
| 16 | `/reps/[id]` | Rep detail | Edit, deactivate, delete (manager-only) | `profiles`, assignments, shifts | L · ER yes |
| 17 | `/library` | File manager | Upload, download, delete | `library_files`, `storage.objects` | L · ER yes |
| 18 | `/library/[id]/edit` | Edit file metadata | Save, cancel | `library_files` (UPDATE) | L · ER yes |
| 19 | `/requests` | Pending shift requests (Realtime) | Approve → `/schedule/new?request=`, decline | `requested_shifts` | L · E yes · realtime |
| 20 | `/reports` | Reports hub | Tile click → sub-route | none | L n/a |
| 21 | `/reports/operations` | 30-day KPIs | Period picker | `shifts`, `shift_events` | L · ER yes |
| 22 | `/reports/rep-performance` | Leaderboard | Sort, period, CSV export | `shifts`, `shift_events` | L · ER yes |
| 23 | `/reports/timesheet` | Hours per rep per shift | Filter, date range, CSV export | `shifts`, `shift_events` | L · ER yes |
| 24 | `/settings` | Settings hub | Tile click | none | L n/a |
| 25 | `/settings/managers` | Manager CRUD | Invite, edit, delete | `profiles` (via `/api/users`) | L · ER yes |
| 26 | `/settings/managers/[id]/edit` | Edit manager | Save | `/api/users` PATCH | L · ER yes |
| 27 | `/settings/check-in-rules` | Geofence + grace defaults | Save | `app_settings` | L · ER yes |
| 28 | `/settings/organisation` | Org name, logo, region | Save, logo upload | `app_settings`, `storage.objects` | L · ER yes |
| 29 | `/settings/custom-fields` | Custom field defs CRUD | Create, edit, delete | `custom_fields` | L · E yes · ER yes |
| 30 | `/settings/fields/new` | Create custom field | Save, cancel | `custom_fields` INSERT | L · ER yes |
| 31 | `/settings/fields/[id]/edit` | Edit custom field | Save, cancel | `custom_fields` UPDATE | L · ER yes |
| 32 | `/settings/notifications` | Notification rules (placeholder) | Save | `app_settings` | partial |
| 33 | `/settings/billing` | Billing / invoices (placeholder) | Read-only | none yet | partial |
| 34 | `/notify` | **Unknown / suspect** | n/a | n/a | n/a |
| 35 | `/api/geocode` | OSM proxy | GET | none | — |
| 36 | `/api/geocode/suggest` | OSM autocomplete | GET | none | — |
| 37 | `/api/users` | Manager CRUD | POST/PATCH/DELETE | `auth.users`, `profiles` | — |

Legend: **L**=loading, **E**=empty, **ER**=error.

### 1.2 Mobile rep app (`/Users/gary/Claude/morpheus-mobile`)

| # | Route | Purpose | Critical actions | DB tables touched |
|---|-------|---------|------------------|-------------------|
| M1 | `/login` | Rep sign-in | Submit, error | `auth.users`, `profiles` |
| M2 | `/` | Today dashboard, Up Next card, map, travel/break, segmented View-all+plan pill | Start travel, start break, preview directions | `shifts`, `rep_locations`, `shift_events` |
| M3 | `/shifts` | All shifts list w/ filters + countdown + per-row ETA + Plan-route pill + claimable distance | Claim, request, search, Start travelling on expanded row | `shifts`, `requested_shifts` |
| M4 | `/check-in` | Geo-validated check-in + exception capture. **Routes straight to `/active`** (no `/check-in/success` interstitial — removed May 11) | Submit (with reason if exception) | `shifts` UPDATE, `shift_events` INSERT, `rep_locations` |
| M5 | `/active` | Tasks, break, travel, check-out. Tasks accordion auto-opens iff compulsory tasks exist | Toggle task complete, start/end break, check-out gate | `task_completions`, `shifts`, `shift_events` |
| M6 | `/check-out` | Validation gate + capture; wrap-up overlay then **routes home `/`** (no `/summary` page — removed May 12) | Submit (compulsory tasks block) | `shifts` UPDATE (state=complete, check_out_at), `shift_events` INSERT, `rep_locations` DELETE |
| M7 | `/route` | Plan-my-day ordering view. No per-leg Maps / Leave-now (May 12 strip). Persistent "Re-checked at HH:MM" caption | Toggle optimize, Re-check, Save this order | none (Option A — localStorage only) |
| M8 | `/day` | **End-of-day recap (NEW May 12)**. Reached from home "All shifts done" card. Cinematic hero + 4 stat tiles (shifts/hours/tasks/travel) + per-stop timeline + exception banner. Read-only | None — display only | `shifts` SELECT, `shift_task_completions` SELECT, `shift_events` SELECT (all batched on mount) |
| M9 | `/add-shift` | Request a shift | Submit request | `requested_shifts` INSERT |
| M10 | `/profile` | Name edit, sign-out | Save, sign-out | `profiles` UPDATE |
| M11 | `/library` | Manager docs | Open file | `library_files`, `storage.objects` |
| M12 | `/support` | Static help | n/a | none |

Routes removed:
- `/check-in/success` — interstitial deleted May 11. /check-in now routes directly to /active on success.
- `/summary` — post-shift stats page deleted May 12. /check-out's wrap-up overlay is the entire confirmation moment; routes to home after ~1.2s.

---

## 2. E2E test checklist (Playwright)

Each item is one Playwright `test()`. **All-caps** items are mandatory before any release.

### 2.1 Auth & permissions (admin)
- [ ] **LOGIN-A1** Manager logs in with valid creds → lands on `/`
- [ ] LOGIN-A2 Wrong password → error banner, stays on `/login`
- [ ] LOGIN-A3 Empty email/password → button disabled or inline error
- [ ] **LOGIN-A4** Rep logs in to admin → lock screen with sign-out
- [ ] LOGIN-A5 Unauthenticated visit to `/customers` → redirect to `/login`
- [ ] **LOGOUT-A1** Sign-out clears session and redirects to `/login`
- [ ] LOGIN-A6 Session persists across page reload

### 2.2 Customers (admin)
- [ ] **CUST-1** Create customer with geocoded address → row appears in list, lat/lng populated
- [ ] CUST-2 Create customer without address → saved with null geocode, no map pin
- [ ] **CUST-3** Duplicate customer name → either rejected or warned (assert no two identical rows)
- [ ] **CUST-4** Edit customer name → list reflects new name, no second row created
- [ ] CUST-5 Set geofence radius via slider → assert `customers.geofence_radius_m` updated
- [ ] CUST-6 Toggle active/inactive → `customers.active = false`, filter "Inactive" surfaces it
- [ ] CUST-7 Delete customer with shifts → confirm modal appears, delete blocked or cascades correctly
- [ ] CUST-8 Search filters customer list (case-insensitive)
- [ ] CUST-9 Grid/Table/Map view toggle preserves filters

### 2.3 Tasks (admin)
- [ ] TASK-1 Create universal task → row added, attached to all customers
- [ ] **TASK-2** Create customer-specific task (multi-customer) → N rows, one per customer
- [ ] TASK-3 Compulsory toggle persists
- [ ] TASK-4 Edit task duration → persists; existing shifts unaffected
- [ ] TASK-5 Delete task → row removed; pending `task_completions` orphan check
- [ ] TASK-6 Filter by Compulsory / Optional works

### 2.4 Schedule & shifts (admin)
- [ ] **SHIFT-1** Create single shift → appears on calendar, state='scheduled'
- [ ] **SHIFT-2** Create recurring 4-week weekly shift → exactly N expected rows (e.g. Mon-Fri × 4 = 20)
- [ ] SHIFT-3 Create shift without rep → claimable=true, rep_id null
- [ ] SHIFT-4 Off-by-one: 4-week recurring on a Monday ends on the 4th-week Friday (no extra week)
- [ ] **SHIFT-5** Drag-drop shift to new day/time → updates `shift_date`/`start_time`, no duplicate
- [ ] SHIFT-6 Calendar count-summary chip appears once a day exceeds visible lanes (consistent)
- [ ] SHIFT-7 Click "+" empty cell → `/schedule/new?date=…&rep=…` pre-filled
- [ ] **SHIFT-8** Edit shift only (no repeat) → no extra rows created
- [ ] **SHIFT-9** Edit-with-repeat: same series_id assigned to all spawned siblings
- [ ] **SHIFT-10** "Edit future" on a series mid-week → only future rows changed; past kept
- [ ] **SHIFT-11** Cancel series → all future shifts state='cancelled' (or deleted) in one txn
- [ ] **SHIFT-12** RESET-confirm wipe → every shift dated >= today is gone regardless of state
- [ ] SHIFT-13 Conflict warning: same rep, overlapping time → UI warns
- [ ] SHIFT-14 Double-click on Save does not create two shifts (debounce / disable)

### 2.5 Reps (admin)
- [ ] REP-1 Filter "With shifts today" matches DB count
- [ ] REP-2 Click rep row → `/reps/[id]` loads
- [ ] REP-3 Edit rep name → reflected on shift cards too

### 2.6 Library
- [ ] LIB-1 Upload PDF → row added, signed URL retrievable
- [ ] LIB-2 Delete file → DB row gone AND storage object gone
- [ ] LIB-3 Customer scope All vs specific → filters correctly
- [ ] LIB-4 Download click → 200 response, correct mimetype

### 2.7 Requests (admin)
- [ ] **REQ-1** New rep request appears in admin inbox without reload (Realtime)
- [ ] REQ-2 Approve → opens `/schedule/new?request=…` pre-filled
- [ ] REQ-3 Decline → row removed, audit event logged
- [ ] REQ-4 Approving twice does not create two shifts

### 2.8 Reports
- [ ] RPT-1 Operations 30d KPIs match a SQL spot-check
- [ ] RPT-2 Rep-performance leaderboard sums equal raw shift counts
- [ ] RPT-3 Timesheet hours = `check_out_at - check_in_at` (sub-minute tolerance)
- [ ] RPT-4 CSV export contains exactly the rows shown in UI

### 2.9 Settings
- [ ] SET-1 Update default geofence → new customers default to it; existing not changed
- [ ] **SET-2** Invite manager → `/api/users` POST → can sign in
- [ ] SET-3 Delete manager → cannot sign in
- [ ] SET-4 Custom field create + assign on customer detail → value persists
- [ ] SET-5 Required custom field blocks save when empty

### 2.10 Mobile rep app
- [ ] **M-LOGIN** Rep logs in → `/` shows today
- [ ] **M-CHECKIN-OK** On-time, on-site → state='in_progress', no exception event
- [ ] **M-CHECKIN-LATE** After grace → exception event with type='late' and reason chip
- [ ] **M-CHECKIN-OFFSITE** Outside geofence → exception type='off_site'
- [ ] M-CHECKIN-EARLY-OK Before grace window → blocked or warns
- [ ] **M-TASK-COMPLETE** Toggle compulsory task → row in `task_completions`
- [ ] **M-CHECKOUT-BLOCKED** Compulsory task incomplete → check-out disabled
- [ ] **M-CHECKOUT-OK** All compulsory done → state='complete', `check_out_at` set, wrap-up overlay reaches "Done" frame, then **routes to `/`** (home). NOT `/summary` (deleted May 12).
- [ ] M-BREAK Start/end break → timestamps persisted; localStorage cleared on end
- [ ] M-CLAIM Claim a claimable shift → `rep_id` set; reappears on Today; pre-claim `claim_radius_m` distance gate filtered list correctly
- [ ] M-REQUEST Submit shift request → row in `requested_shifts`; admin sees it (cross-app)
- [ ] **M-PLAN-PILL-STATES** Plan-route pill on /shifts header renders correctly across all four states: hidden (0 shifts), "Plan route" (no saved order + ≥1 shift), "Optimized · HH:MM" (saved order + work remaining), "Day complete" (all shifts done/cancelled). Same on home segmented pill except home doesn't have a "Day complete" variant yet (queued nit).
- [ ] **M-PLAN-SYNC** Tap Save on /route → both home segmented pill AND /shifts header pill flip to "Optimized · HH:MM" within the same render. Wall-clock timestamp matches the "Order optimized at HH:MM" banner on /route.
- [ ] **M-PLAN-PERSIST** "Re-checked at HH:MM" caption on /route is hydrated from localStorage on cold open (visible before fresh fetch lands), refreshed by `route.computedAt` once the fetch completes.
- [ ] **M-PLAN-LOCAL-ONLY** `saveShiftOrder` writes ONLY to localStorage (no DB write). Confirm by snapshotting `shifts.start_time` before + after — must be unchanged.
- [ ] **M-ACTIVE-TASKS-ACCORDION** Customer with compulsory tasks → Tasks section auto-opens on mount. Customer with no compulsory → stays collapsed. Manual rep toggle is preserved on re-render.
- [ ] **M-FLEX-TIME** Shift with `is_flexible_time=true` → mobile shows "Anytime today" instead of start–end range; countdown pill suppressed; ETA pill renders neutrally (`scheduledAt === null`).
- [ ] **M-DAY-ENTRY** Home dashboard with every shift in terminal state → "All shifts done" card shows chevron + "tap to see your recap" cue; tap navigates to `/day`.
- [ ] **M-DAY-NUMBERS** /day aggregates correctly: shiftsDone = count of `state='complete'` rows today, hoursWorked = sum of (check_out_at - check_in_at), tasksCompleted = count of `shift_task_completions` rows with shift_id in today's complete set, travelTime = sum of paired travel_started/travel_ended events from `shift_events`.
- [ ] **M-DAY-EXCEPTIONS** /day exception banner shows count of `shift.checked_in_offsite|late|early` + `shift.checked_out_offsite|early` + `shift.rep_unable_to_attend` events for today's shifts. Hidden when 0.
- [ ] **M-DAY-EMPTY** Direct nav to `/day` with no completed shifts today → renders calm empty state ("No completed shifts today"), no crash.
- [ ] **M-DAY-REDUCED-MOTION** Enable prefers-reduced-motion in OS settings → confetti hidden, all keyframe animations replaced with end-state instant render; count-ups short-circuit.

### 2.11 Cross-app journeys (the "golden path")
- [ ] **GOLD-1** Admin creates customer → admin creates shift for rep tomorrow → rep logs in tomorrow → checks in on time/on site → completes tasks → checks out → admin sees shift state='complete' with timesheet hours
- [ ] **GOLD-2** Same as GOLD-1 but rep is late + outside geofence → two exceptions raised → manager opens `/` Live Ops, sees exceptions → resolves
- [ ] GOLD-3 Rep requests shift → admin approves → admin sees on calendar → rep sees on Today

---

## 3. API / Supabase test checklist

These run against the same Supabase instance the apps use, with a service-role key for setup and an authenticated user-role key for assertions.

### 3.1 RLS (row-level security)
- [ ] **RLS-1** Rep cannot SELECT `app_settings`
- [ ] **RLS-2** Rep cannot UPDATE another rep's shift
- [ ] **RLS-3** Rep can UPDATE their own shift state to in_progress / complete
- [ ] **RLS-4** Rep cannot DELETE any row
- [ ] **RLS-5** Manager can CRUD all rows
- [ ] **RLS-6** Anon role gets no rows back from any table

### 3.2 Constraints & integrity
- [ ] CONS-1 `customers.code` UNIQUE — INSERT duplicate fails
- [ ] CONS-2 `shifts.start_time < end_time` — CHECK constraint or app validation
- [ ] CONS-3 Deleting a customer with shifts: ON DELETE behavior is `RESTRICT` or `CASCADE` — assert which
- [ ] CONS-4 `task_completions` UNIQUE on (shift_id, task_id) — no double-completion rows

### 3.3 Functions / RPC
- [ ] If any RPCs exist (e.g. `claim_shift`, `approve_request`), each gets:
  - happy path
  - permission denied for wrong role
  - re-entry safe (calling twice doesn't double-write)

### 3.4 Realtime
- [ ] RT-1 INSERT on `requested_shifts` triggers admin subscription
- [ ] RT-2 UPDATE on `shifts.state` triggers Live Ops update

### 3.5 Storage
- [ ] STO-1 Library file uploaded, signed URL valid for 60s+
- [ ] STO-2 Org logo upload writes to storage and URL persists

---

## 4. Data-integrity checklist

Run after every major action, in tests AND in manual smoke:

- [ ] **DI-1** No duplicate row for the same logical entity (customer name, manager email, shift identity)
- [ ] **DI-2** Edit ≠ insert: row count unchanged after edit
- [ ] **DI-3** Cartesian product on shift create matches expected count (dates × customers × reps)
- [ ] **DI-4** `series_id` is identical for siblings, `null` for one-offs
- [ ] **DI-5** Soft-delete vs hard-delete is consistent: archived rows are filtered out of all lists by default
- [ ] **DI-6** No orphan `task_completions` after task delete
- [ ] **DI-7** No orphan `shift_events` after shift delete
- [ ] **DI-8** Storage object deleted alongside `library_files` row
- [ ] **DI-9** RESET wipes scheduled + non-scheduled future shifts (in_progress, complete, late, cancelled) — was a real bug, fixed 2026-05-07
- [ ] **DI-10** Logo upload doesn't leave previous file behind (versioning or replace)
- [ ] **DI-11** After any mutation, refetch matches what UI shows (no stale view)

---

## 5. Playwright file structure

```
qa/
├─ playwright.config.ts                  # baseURLs, projects, reporters
├─ package.json                          # @playwright/test, dotenv
├─ .env.example                          # SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_EMAIL/PWD, REP_EMAIL/PWD
├─ playwright/
│  ├─ fixtures/
│  │  ├─ auth.ts                         # adminPage, repPage fixtures
│  │  └─ seed.ts                         # createCustomer/createShift via service role
│  ├─ helpers/
│  │  ├─ supabase.ts                     # service-role + anon clients
│  │  ├─ geolocation.ts                  # mock GPS coords
│  │  └─ time.ts                         # freeze clock
│  ├─ admin/
│  │  ├─ auth.spec.ts                    # LOGIN-A1..6, LOGOUT-A1
│  │  ├─ customers.spec.ts               # CUST-1..9
│  │  ├─ tasks.spec.ts                   # TASK-1..6
│  │  ├─ schedule.spec.ts                # SHIFT-1..14
│  │  ├─ shift-edit.spec.ts              # series, edit-future, repeat-across
│  │  ├─ reps.spec.ts                    # REP-1..3
│  │  ├─ library.spec.ts                 # LIB-1..4
│  │  ├─ requests.spec.ts                # REQ-1..4 (uses Realtime)
│  │  ├─ reports.spec.ts                 # RPT-1..4
│  │  └─ settings.spec.ts                # SET-1..5
│  ├─ mobile/
│  │  ├─ auth.spec.ts
│  │  ├─ checkin.spec.ts                 # M-CHECKIN-OK/LATE/OFFSITE/EARLY
│  │  ├─ active-tasks.spec.ts            # M-TASK-COMPLETE, breaks, travel
│  │  ├─ checkout.spec.ts                # M-CHECKOUT-OK/BLOCKED
│  │  ├─ claim-request.spec.ts           # M-CLAIM, M-REQUEST
│  │  └─ profile.spec.ts
│  └─ e2e/
│     ├─ golden-shift.spec.ts            # GOLD-1
│     ├─ golden-exception.spec.ts        # GOLD-2
│     └─ request-approval.spec.ts        # GOLD-3
└─ api/
   ├─ rls.test.ts                        # RLS-1..6
   ├─ constraints.test.ts                # CONS-1..4
   ├─ realtime.test.ts                   # RT-1..2
   ├─ storage.test.ts                    # STO-1..2
   └─ helpers.ts                         # service-role + role-scoped clients
```

---

## 6. Supabase test file structure (replaces "Django tests")

API tests are plain Vitest/Node tests using `@supabase/supabase-js`:
- Service-role client = setup/teardown (truth)
- Anon + user-role JWT clients = the things you assert against (RLS surface)

Naming: `qa/api/*.test.ts` · runner: `vitest run` · isolated test schema if possible (`pg_temp` not available in Supabase, so seed/teardown by tag column or a dedicated `qa_` row prefix).

---

## 7. Example tests

See files in this folder:
- `playwright/fixtures/auth.ts` — login fixtures
- `playwright/helpers/supabase.ts` — Supabase client helper
- `playwright/admin/auth.spec.ts` — login + role gate tests
- `playwright/admin/customers.spec.ts` — full customer CRUD with data-integrity assertions
- `playwright/e2e/golden-shift.spec.ts` — admin → rep → admin journey
- `api/rls.test.ts` — Supabase RLS examples
- `api/constraints.test.ts` — uniqueness + check-constraint assertions

---

## 8. Bugs & risks found during this audit

### Critical
- **C1** `lib/shifts-store.ts: deleteAllUpcomingShifts()` previously skipped non-scheduled rows because of `.eq("state", "scheduled")`. RESET appeared to work but stranded in_progress/complete/late/cancelled rows reappeared on next refetch. **Fixed 2026-05-07** — state filter removed; typed-RESET prompt is the safety net. Regression test required (DI-9 / SHIFT-12).
- **C2** Calendar threshold inconsistency: Wed (7 shifts) collapsed to count chip, Thu (3 shifts) showed `+2 MORE` lane overflow. **Fixed 2026-05-07** — `DAY_SHIFT_LIMIT = MAX_VISIBLE_LANES` so any day with more than visible lanes uses count chip. Regression test required (SHIFT-6).

### High
- **H1** `bulkDeleteShifts`, `cancelShiftSeries`, `updateShiftSeries` still filter `.eq("state", "scheduled")`. Probably intentional (don't nuke mid-shift work), but the silent partial-success can confuse users. Add UI surface: "X of Y deleted; Z were in_progress and skipped."
- **H2** Mobile `haversineMeters` is duplicated in both `/check-in` and `/check-out` — DRY by lifting to `lib/geo.ts`. Test once, reused everywhere.
- **H3** Admin `/notify` page exists but unknown purpose; possible dead route. Confirm and remove or document.
- **H4** Mobile `/shifts` Directions button has no `onClick` — dead button.
- **H5** Mobile dashboard `setDirectionsOpen` state is set but never read — orphaned.
- **H6** No PWA service worker yet on mobile; offline check-in not viable. Risk to ground reps with poor connectivity.
- **H7** Admin app has zero automated tests — every change is currently regression-tested by hand.
- **H8** Manager creation goes through `/api/users` but the route's auth check should be re-verified end-to-end (privilege escalation risk if anon hits POST).

### Medium
- **M1** `/settings/billing` and `/settings/notifications` are scaffolded but partial — cover with a test that asserts the "coming soon" state and prevents accidental shipping of half-baked UI.
- **M2** Sidebar nav items don't all show active state cleanly on detail routes — visual regression risk.
- **M3** Recurring 4-week off-by-one was an actual bug a few commits ago; lock it down with SHIFT-4.
- **M4** Geocode autocomplete depends on OSM Nominatim; rate-limited and no fallback. Add a test for the failure mode (fall back to manual lat/lng entry).
- **M5** No idempotency token on `Save` buttons — fast double-click could create two shifts. Tests in SHIFT-14 and CUST-4 catch this; also fix in code via disabled-while-busy.
- **M6** `task_completions` may not have a UNIQUE constraint on `(shift_id, task_id)` — verify and add (CONS-4).
- **M7** Drag-drop on calendar uses HTML5 dnd; no test of "drop on different week" edge case.

### Low
- **L1** Color picker in `/customers/new` is unconstrained — invalid hex would silently save. Add validation.
- **L2** Sort indicator arrows on table headers don't always update for the active column — cosmetic.
- **L3** No "Last edited by / at" field on customers/shifts — audit trail gap (workable via `shift_events` for shifts; nothing for customers).
- **L4** No CSV import of customers — high-friction onboarding for new tenants.

---

## 9. What to test next (priority order)

1. **GOLD-1 + GOLD-2** end-to-end journey — biggest coverage per minute of effort.
2. SHIFT-12 (RESET wipe) — regression on the bug we just fixed.
3. SHIFT-6 (count chip consistency) — regression on the bug we just fixed.
4. M-CHECKIN-LATE / M-CHECKIN-OFFSITE — exception engine is the heart of the product.
5. M-CHECKOUT-BLOCKED — compulsory tasks must hold the line.
6. RLS-1..6 — security baseline; one bad RLS = total data leak.
7. CUST-3 / SHIFT-14 — duplicate prevention on rapid clicks.
8. REQ-4 — approve-twice idempotency.
9. SET-2/SET-3 — manager invite + delete (privilege boundary).
10. RPT-1..4 — reports must equal SQL truth, otherwise payroll bugs.

---

## Appendix A — Test data conventions

- Prefix every test-created row with `qa_` (customer code, customer name suffix, manager email `qa+TIMESTAMP@…`).
- Use the service-role client to seed and tear down within a `beforeAll` / `afterAll`.
- Never share test users across spec files; create a fresh user per spec to avoid interference.
- For mobile geolocation tests, mock via Playwright `context.setGeolocation()` rather than depending on real GPS.

## Appendix B — Running the suite

```bash
cd /Users/gary/Claude/qa
npm install
npx playwright install
cp .env.example .env   # fill in SUPABASE creds + test user creds
npm run test:admin     # admin Playwright suite
npm run test:mobile    # mobile Playwright suite
npm run test:e2e       # cross-app journeys
npm run test:api       # Supabase integration (Vitest)
npm run test:all       # everything
```
