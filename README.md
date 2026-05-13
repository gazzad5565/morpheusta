# Morpheus Field Operations Suite

> **🤖 Reading this from a fresh AI chat?**
> Latest commit: **`e529b6f`** (May 11, 2026 — late evening). Long, multi-phase day — **40+ commits** total. Three feature passes (cancellation, polish + identity + exception toggles, engineering review), then a fourth late push for the big deferred items (**traffic-aware Plan-my-day routing** + **per-customer logo uploads**), then a fifth tail of UX fixes from manager testing (success-page skip, "Wrapping up…" wording on check-out tap, dynamic Up Next picker, dead Directions button removal, customer edit page reorganised into Identity / Location / Check-in exceptions sections, and the Plan-my-day card collapsed into slim right-aligned pills under Up Next + on /shifts).
> 1. **Cancellation / "Can't make this shift" feature** (8 commits) — rep can flag an assigned shift they can't make from anywhere, manager sees it in Live Ops "Needs action", four resolutions (Reassign / Reopen as unassigned / Keep · rep stays on / Cancel · do not refill), banners + pills + audit trail end-to-end.
> 2. **Polish, identity, and exception-toggle pass** (10 commits) — rep notes per shift, banner watcher for shift assignments, "awesome" check-in overlay + shimmering skeletons, /schedule/manage row actions cleanup, mobile chrome cleanup, house glyph for customer markers + face/photo for rep markers everywhere, rep profile photo upload, and org-wide + per-customer exception toggles.
> 3. **Plan my day · /route (mobile)** — server-side `/api/route/plan` with Google Routes (TRAFFIC_AWARE) when `GOOGLE_ROUTES_API_KEY` is set, mock fallback otherwise; client wrapper with 5-min cache + GPS fallback; `/route` page with provider chip, Optimize toggle, ETA + Leave-by pills, per-leg Open in Maps + whole-day Open in Maps. Entry pills on home (under Up Next) and /shifts header, only when 2+ stops.
> 4. **Per-customer logo upload** — admin `/customers/[id]/edit` gets an Identity-section logo upload (client-side compressed to ~96×96 letterboxed JPEG, 5-15KB base64 in a new `customers.logo_url text` column). `CustomerSwatch` (admin) + `CustomerTile` (mobile) auto-branch on `logoUrl` so the logo shows everywhere — shift rows, /active hero, /check-in / -out, /add-shift picker, /route badges, map markers — without per-call-site changes.
> 5. **UX fixes from manager testing** — `/check-in/success` page deleted (routes straight to `/active`); "Wrapping up…" overlay on the /active → /check-out tap (was "Opening…"); Up Next picker now matches any non-terminal state (was missing 'travelling', 'on-break', 'late' → reps saw a lying "No shift assigned today" card); dead Directions buttons removed from /shifts row expansions; customer edit page reorganised into Identity / Location / Check-in exceptions Cards instead of one giant fields dump.
> All May 7 / 11 / 12 migrations have been applied to the shared Supabase project (May 12). No migrations pending. `GOOGLE_ROUTES_API_KEY` is optional but recommended in prod — see "Optional env vars". Working tree clean.
> Repo: https://github.com/gazzad5565/morpheusta · Live: https://morpheus-admin.vercel.app + https://morpheusta-khaki-omega.vercel.app · DB: Supabase project `otweltzwwhrvhtvaqsci`
> **Don't ask the user for context — read this whole file first.** Section "Where things stand right now" (around line 100) is the canonical handover. The "Today's session — what shipped" sections list every commit by hash, newest day first. The "Top of the deferred list" tells you what to start on next.
> If you make changes, update this file before you push. Phase 4 RLS is still the highest-priority open item; do not deploy to real users without it.

---

Two-app system for field merchandising teams: an **admin console** for Field Ops Managers and a **mobile rep app** for the field. Both share one Supabase backend.

```
Field rep on phone           Manager on laptop
       │                            │
       ▼                            ▼
┌──────────────┐            ┌──────────────┐
│ morpheusta   │            │ morpheus-    │
│ (mobile PWA) │            │ admin        │
└──────┬───────┘            └──────┬───────┘
       │                           │
       └───────┐         ┌─────────┘
               ▼         ▼
            ┌──────────────┐
            │   Supabase   │  ← Postgres + Auth + RLS
            └──────────────┘
```

## Live URLs

| App | URL | For |
|---|---|---|
| Mobile (rep app, PWA) | https://morpheusta-khaki-omega.vercel.app | Field reps; install to phone home screen |
| Admin (manager console) | https://morpheus-admin.vercel.app | Managers; desktop browser |

Both share a single Supabase project (URL: `https://otweltzwwhrvhtvaqsci.supabase.co`).

---

## Repo layout (monorepo)

```
/                                  ← this repo (gazzad5565/morpheusta)
├── README.md                      ← you are here
├── .gitignore
├── db/
│   └── migrations/                ← SQL migrations (run manually in Supabase SQL Editor; safe to re-run)
├── morpheus-admin/                ← Next.js app: admin console (desktop)
│   ├── app/                       ← routes (one folder = one page)
│   │   ├── api/geocode/           ← server proxies for Nominatim (search + suggest)
│   │   └── customers/[id]/edit/   ← edit customer (address + name)
│   ├── components/                ← AdminShell, Sidebar, AuthGate, UI
│   ├── lib/
│   │   ├── supabase.ts            ← Supabase client
│   │   ├── auth.ts                ← signIn / signUp / signOut helpers
│   │   ├── customers-store.ts     ← customers CRUD + soft delete (active flag)
│   │   ├── shifts-store.ts        ← list + create + delete shifts in DB
│   │   ├── profiles-store.ts      ← list reps/managers from profiles table
│   │   ├── rep-locations-store.ts ← read live rep GPS + Realtime subscription
│   │   ├── tokens.ts              ← AC design tokens
│   │   └── mock-data.ts           ← fallback data for shifts/profiles when DB unconfigured (customers no longer use this)
│   └── public/                    ← PWA manifest, icons
└── morpheus-mobile/               ← Next.js app: mobile rep app (PWA)
    ├── app/
    ├── components/
    ├── lib/
    │   ├── supabase.ts            ← Supabase client
    │   ├── auth.ts                ← signIn / signUp / signOut
    │   ├── shift-store.ts         ← rep-requested shifts (separate table)
    │   ├── shifts-store.ts        ← assigned/unassigned shifts + check-in
    │   ├── profiles-store.ts      ← read/update own profile (greeting name)
    │   ├── customers-store.ts     ← read customers from DB (read-only)
    │   ├── location-tracker.ts    ← upserts GPS to rep_locations while active shift screen is open
    │   ├── tokens.ts              ← MC design tokens
    │   └── mock-data.ts           ← fallback static data
    └── public/                    ← PWA manifest, icons, app icon
```

**Two apps, one repo.** Each Vercel project is configured to build a specific subfolder via "Root Directory" setting in Vercel Settings → General.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | React + routing + serverless functions in one |
| UI | React 19 + TypeScript | Type-safe components |
| Styling | Inline styles + design tokens (`AC` admin / `MC` mobile) | Matches design handoff pixel-perfect; refactor to Tailwind later if wanted |
| Backend | Supabase (Postgres + Auth + RLS + Realtime) | DB + auth + realtime in one service, generous free tier |
| Maps | MapLibre GL + OpenFreeMap tiles | Free vector tiles, no API key, swappable for Mapbox later if needed |
| Geocoding | Nominatim (OpenStreetMap) via server proxy | Free, used for customer address autocomplete + lat/lng lookup |
| Hosting | Vercel | Zero-config Next.js deploys, free tier covers small usage |
| Auth | Supabase Auth (email + password) | Email confirmation OFF for fast iteration |
| PWA | Custom manifest + icons | Installs to home screen on iOS/Android |

No tests yet. No CI beyond Vercel auto-deploy on push to `main`.

---

## Working from another machine

If you switch computers (or hand this project to a developer), this section is the complete onboarding. You shouldn't need anything that isn't here.

### Where things stand right now (handover for the next chat)

**Last commit:** `b2a9e30` — "Engineering pass — DB indexes, realtime gaps, duplicate utilities" (May 11, 2026 — evening; 37 commits through the day across three phases: morning feature work + afternoon friction fixes + evening engineering review / stabilisation)
**Live URLs:** https://morpheus-admin.vercel.app · https://morpheusta-khaki-omega.vercel.app
**Repo:** https://github.com/gazzad5565/morpheusta

**Working end-to-end on real data — both apps build clean, all admin + mobile routes return 200, no mock fallbacks left in the rep flow.**

#### Cancellation / "Can't make this shift" (May 11 — new today)

- **Attention overlay model.** Rather than expanding the shifts state machine, we layer `shifts.attention` ("unable_to_attend") + `attention_reason` + `attention_note` + `attention_raised_at` / `_resolved_at` / `_resolved_by` / `_resolution` columns. State stays `scheduled` so cancellation interleaves cleanly with everything else (check-in, drag-drop, series edits). Schema: `db/migrations/2026_05_11_shifts_attention.sql` + `_resolution.sql`.
- **Rep raises** — `/shifts` row, home up-next card, and `/active` all expose "Can't make this shift" when the row is `scheduled` and owned by the rep. Opens `UnableToAttendSheet` with 6 reasons + free-text note. Withdraw button is offered until the manager actions it.
- **Manager sees it in Live Ops** — pulsing red "Needs action" pill on the sidebar, calendar pill on the affected shift, attention banner on `/shifts/[id]`. Four resolution buttons:
  - **Reassign** — opens a rep picker with on-the-fly conflict check; on save clears the attention and reassigns + logs `shift.attention_reassigned`.
  - **Reopen as unassigned** — nulls `rep_id`, clears attention; row becomes claimable. Logs `_reopened`.
  - **Keep · rep stays on** — softer of the four (originally labelled "Acknowledge"; renamed after testing showed managers expected it to mean "rep is off the hook"). Logs `_acknowledged`.
  - **Cancel · do not refill** — soft-cancels the shift outright. Logs `_cancelled`.
- **Resolution feedback pill** — after the manager actions it, the rep sees a brief banner on `/shifts` (and the home card) explaining the outcome ("Manager confirmed — you're still on this shift" / "Reassigned to someone else" / etc) for ~4 hours via the `attention_resolution` column + `resolvedAttentionFeedback()` helper.
- **Re-raise edge case** — when a rep raises "Can't make it" on a shift that was previously resolved, we clear the stale resolution fields so the manager sees the new flag cleanly. Caught in testing — see `e723c68`.

#### Identity + photos (May 11 — new today)

- **Customer = house glyph, rep = face glyph / photo.** All four MapLibre maps (mobile DashboardMap, admin CustomersMap / CustomerAddressMap / live-ops MapPanelClient) now read at a glance: rounded-square + house = site, circle + face/photo = rep. Same visual grammar across both apps.
- **Rep profile photo upload.** Mobile `/profile` got a tappable avatar tile with a camera badge. Tap → file picker (with selfie capture on phones) → image is compressed client-side to a 96×96 JPEG (~10–15 KB) → saved as a base64 data URL on `profiles.avatar_url`. Schema: `db/migrations/2026_05_11_profile_avatars.sql`. Photo then appears on:
  - Mobile DashboardMap "you are here" marker
  - Admin `/reps` grid and table (`RepAvatar` picks photo over initials when present)
  - Admin `/reps/[id]` detail card
  - Admin live-ops map rep markers + the popup header
- **Why base64 not Storage:** at this size (~15 KB per row), a text column in `profiles` is fine and works the moment the migration runs — no bucket / policy setup. Easy to migrate to Storage later.

#### Exception toggles (May 11 — new today)

- **Org-wide on/off** for two kinds of check-in exception, both default ON: location (off-site / geofence) and timing (late + early). Live in `app_settings` under keys `location_exceptions_enabled` and `timing_exceptions_enabled`. Configured in **`/settings/check-in-rules`** with pill-style switches at the top of the page.
- **Per-customer override** (tri-state: Inherit / Always show / Never show) on `/customers/[id]/edit`. NULL on the customer row = inherit the org default; explicit TRUE/FALSE wins. Schema: `db/migrations/2026_05_11_exception_toggles.sql` adds two nullable boolean columns to `customers`.
- **Wired into mobile check-in.** A useMemo computes effective on/off per type (customer override falls back to org default); the existing exception detection blocks return null when disabled, which propagates as `offsiteTriggered=false` / `lateTriggered=false` so the cards never render and the dedicated event-log entries never fire.

#### Polish pass (May 11 — new today)

- **Shift notes per shift.** New `shifts.rep_notes text` column (migration `2026_05_11_shifts_notes.sql`). Rep can write freeform notes from `/active`, auto-saved on blur with "Saving… / Saved ✓" feedback. Admin sees them read-only on `/shifts/[id]`.
- **Shift-assignment notification.** `ShiftAssignmentWatcher` mounted at the mobile layout level: subscribes to `shifts` INSERT + UPDATE realtime, banners when `rep_id = me` AND the shift hasn't been seen before. Two copy variants ("New shift assigned" / "Shift reassigned to you"). Mirrors `RequestResolutionWatcher` shape; seen-set in localStorage keeps cold-start quiet.
- **Awesome check-in loading.** `CheckingInOverlay` replaces the previous "button text just changes" feedback with a full-screen brand-tinted overlay: pulsing rings, animated progress bar, 3-step stepper ("Saving · Logging · Ready"), and a green-tick dwell frame before routing to `/check-in/success`.
- **Awesome shifts-list skeletons.** Shimmering rows that match the real `ShiftRow` silhouette (customer tile + headline + sub-line + chevron), staggered 100ms each. Also fixes a silent bug: `mc-skel` keyframe was referenced but never defined.
- **Mobile dashboard chrome cleanup.** Black `AppHeader` band gone from the home page — hamburger menu is now inline on the welcome card right edge (same line as "Good afternoon, Gary"). Saves ~52px. Small "Last sync · …" folded under the card.
- **Site address on shift cards.** Small grey pin line under the time row, both on `/shifts` and home page next-up. Ellipses on overflow + tooltip with full string.
- **Always-on dashboard map.** Map renders from first paint regardless of shifts; pins layer in as shifts load. No more "popping in" reflow when the rep cold-starts the app.
- **Map attribution collapsed by default.** All four MapLibre maps start with the OSM attribution closed. The (i) toggle still expands it. Tiles weren't actually being respected as compact on wider screens; we now actively remove the `maplibregl-compact-show` class on map load.
- **/schedule/manage row actions cleanup.** Previous 4-button layout (View · Edit future · Cancel future · "All") was cramped + ambiguous. Now: `[View] [Edit future] [⋮]`, with both cancel actions tucked into the kebab dropdown with full-context labels ("Cancel upcoming N shifts" / "Cancel entire series · N shifts") and explainer sublabels.
- **Admin /shifts/[id] live activity card.** While the shift is in-progress or on-break, the detail page shows a live "checked in at X · now Y · elapsed Zm" card with a pulsing dot, plus the rep's currently-running task ("started X ago"). 30s refresh tied to a refresh effect.
- **/schedule/new** — bigger Customer/Rep section headings, smart time defaults (start = next 30-min slot from now, end = start + 30 min). The "Tasks" chip was removed entirely from the customer context strip — managers don't price scheduling decisions on task count, and the chip was just noise. Address chip stays for single-customer scope.

#### Customers + sites (May 8 — new today)

- **Multi-site model.** Customers have ≥1 site; each site holds its own address, lat/lng, geofence radius, contact (name/phone/email), and access notes. Schema: `customer_sites` with FK to `customers`, plus `shifts.site_id` FK with `ON DELETE SET NULL`.
- **`/customers/[id]` Overview tab** — head-office card prominent (map + geofence + address + contact + access notes + Edit), additional-sites section listing the rest. Single-site customers see only the head-office card.
- **`/customers/[id]` Sites tab** — full CRUD per site. SiteEditor is two-column: form with AddressAutocomplete + geofence slider + Contact section on the left, live map preview with geofence circle on the right.
- **Schedule integration** — `/schedule/new` site picker only renders for customers with >1 active site (single-site auto-resolves invisibly). Customers with 0 sites show a hard-error blocking Submit. `/shifts/[id]/edit` mirrors the same pattern.
- **Geofence** — `/check-in` and `/check-out` haversine target the **site**'s coords + radius, with fallback to legacy customer fields for pre-2026-05-08 rows.
- **Mobile site display** — site name shown as a sublabel when not "Head office" on dashboard up-next, `/shifts` rows, `/active` header. Tap-to-call + email pills + access notes block on `/active`, on expanded `/shifts` rows, and on `/check-in` (right under the customer header so a rep who's off-site or late can call the contact in one tap).
- **Audit trail** — `customer.site_added` / `_updated` / `_deactivated` / `_reactivated` / `_deleted` event types with labels and tones (delete=danger, deactivate/reactivate=warn).

#### Admin (manager console)

- **Live Ops home**: realtime KPI strip with **8-day sparklines on real data** (daily aggregates from shifts), MapLibre map with live rep dots + customer pins, Live Feed (Needs action + All activity tabs, both pulse + alert), today's shifts table (now also shows pending **Requested** rows alongside real shifts).
- **Reports** (`/reports` hub) with 3 working dashboards:
  - `/reports/operations` — daily Scheduled vs Completed line chart, on-time rate trend, state donut, top-customers bar chart, KPIs with period-over-period deltas (7/30/90d).
  - `/reports/rep-performance` — leaderboard with sortable columns + Δ vs prev period + coloured progress bars (Good/Warn/Danger thresholds).
  - `/reports/timesheet` — payroll-grade hours per shift, joins `shifts.check_out_at` (or events fallback), CSV export.
- **Schedule / Calendar** — single time-axis Days view (06:00–20:00 in 30-min slots, 28 × 24px = 672px tall). Drag scheduled shifts to move (snaps to 30 min, conflict check, optimistic + rollback). Click empty slot → /schedule/new with date+time pre-filled. Click a shift → centred quick-info popover with View/Edit + Delete. Lane allocator splits overlapping shifts into ≤ 3 side-by-side lanes; "+N more" pill opens a popover when a cluster overflows. Rep filter dropdown; weekend columns are NOT dimmed.
- **`/schedule/manage`** — series-based shift management. One row per `series_id` with customer(s), rep(s), date range, time, count + upcoming/past split. Actions: View / Edit future / Cancel future / All. Series-edit modal applies to scheduled shifts from today forward only.
- **Shift edit page** — `/shifts/[id]/edit`. Editable while `state='scheduled'`; redirects to read-only detail once the rep checks in. Server-enforces the lock too. Distance label removed; tasks_total is auto-derived from `customer_tasks` count and shown as a read-only chip.
- **Customers / Reps / Tasks / Library** — all four list pages share the same toolbar shape: filter chips with counts, search input, secondary filter dropdown / view toggle. `/customers` also has Grid/Table/Map views.
- **Schedule/new** — multi-customer × multi-rep × weekly recurrence cartesian product (e.g. 3 reps × 5 customers × Mon-Fri = 75 shifts in one save), with shared `series_id` so all the rows are linked. Three numbered steps + live "About to create" preview. 30-min time picker dropdowns.
- **User CRUD** — sidebar nav link is now **"Users"** but route stays `/settings/managers`. Add User modal, edit page, role promote/demote. Server route at `/api/users` uses the service-role key, gates by `profiles.role='manager'`. Reps detail "Edit" routes to the same editor.
- **Settings hub + sub-pages** — `/settings` is a tile hub; each section is its own route under `SettingsShell` (Users, Check-in rules, Custom fields, Organisation, Notifications, Billing). Notifications/Billing are "Soon" placeholders.
- **Organisation page** — name, logo (uploaded to Supabase Storage), address w/ autocomplete + map preview, phone, email, tax number, website, registration number, custom fields, **"Approval not needed" toggle** (auto-approve rep requests).
- **Topbar search** — live filter across reps, managers, customers, tasks. ⌘K focuses; ↑↓ + Enter navigates.
- **Honest "Saved" pill** in the topbar — only renders during/after a real mutation. Wired into shifts / customers / tasks / requests / settings stores.
- **Sidebar Live Ops badge** — flashing red pill + browser tab title prefix when there are pending rep requests, visible from any page. Refreshes via realtime + visibilitychange + 60s poll + every navigation.
- **Sidebar "Powered by Morpheus TA" footer**.

#### Mobile (rep PWA)

- **Today / Shifts / Active / Library** all auto-refresh in real time via Supabase Realtime + visibilitychange + 60s poll fallbacks.
- **Today's Shifts** — date header, search box (4+ shifts), pending requests pinned to top in their own "Awaiting approval" section, contextual countdown pills per row (`in 50 min` / `10 min late` / `ends in 20m` / `ran 10m over`).
- **Floating PendingRequestPill** — bottom-right, follows the rep across every page until the request is resolved. Cross-checks against today's shifts so it clears the moment the approved shift INSERTs.
- **`<RequestResolutionWatcher>`** — toast banners on approve / decline, mounted at layout level so they fire on whatever page the rep is on.
- **Check-in animated success page** — `/check-in/success` is fully data-driven and includes a cinematic celebration sequence (pop-in icon, three pulsing rings, stroke-drawn check, staggered fade-up). Respects `prefers-reduced-motion`.
- **Off-site / Late / Early check-in** all detected and gated. **Early check-out** symmetric. Configurable grace periods on `/settings/check-in-rules`.
- **Task / Break / Travel** all log dedicated events AND flip `shifts.state` so admin Live Ops tabs surface mid-shift state.
- **Break duration chooser** — slide-up sheet with 15/30/60/open-ended; no more accidental auto-start.
- **Travel UI** — `<UpNextCard>` Start/Stop, post-checkout `/summary` "What's next?" tiles. State persists in `localStorage`.
- **Active task / break / travel state** persists across screen lock + app close via `localStorage`.
- **Event queue** — failed `logEvent` calls are queued in localStorage and retried on the next mount or visibility-change. Up to 200 events buffered.
- **Auto-checkout sweep** — admin home + tab-focus runs `sweepStaleShifts()` which marks any active-state shift past the configured cutoff as complete, also clears orphan `rep_locations` rows. Cutoff is configurable in `/settings/check-in-rules` (default 23:59).
- **Auto-approve flow** — when org has "Approval not needed" on, `selfCreateImmediateShift` is called instead of `addRequestedShift`; toast says "Shift added · Ready to check in".

#### Database

- **Activity log** (`shift_events`) is the audit trail. **Every** in-app action writes a row: shift scheduled / claimed / checked-in (incl. offsite/late/early variants) / checked-out (incl. offsite/early/auto variants) / task-started / task-completed / break-started / break-ended / travel-started / travel-ended / shift-deleted / customer-CRUD / library-CRUD / task-CRUD / request submitted/scheduled/declined.
- **Indexes** on hot paths (added during the stabilisation pass): `shifts (shift_date)`, `shifts (rep_id, shift_date)`, partial `shifts (state)` on active states only, `shifts (customer_id)`, `requested_shifts (status, requested_at)`, `requested_shifts (rep_id)`. Plus everything in `db/migrations/*` already indexed.
- **`shifts.check_out_at`** is now a real column (was inferred from events) — backfilled from event log via migration; mobile checkout + admin sweep both stamp it.
- **`shift_task_completions`** logs which tasks the rep ticked off on a given shift (cascades on shift / task delete; unique on (shift, task)).

### Today's session — what shipped (May 7, 2026)

Long, varied day. Roughly in narrative order:

#### Mobile UX

- **Pending request UX** — `<RequestResolutionWatcher>` toast banners for approval/decline; pending cards now have a clear "Awaiting approval" warn-tone state with a "Waiting for manager · X ago" line (`196bc67`).
- **Approval flow polish** — duplicate-row lag killed (cross-check pending against today's shifts so the pill clears the moment the new shift INSERTs); post-tap toast confirmation; resolution banner now fires app-wide via layout-mounted watcher (`ebb9310`, `2f9c7f3`).
- **Resolution banner grace gate dropped** — used to require admin to act within 5 min, otherwise the banner silently never fired. Now it just checks "did the rep ever request this customer in this session" (`2f9c7f3`).
- **Floating PendingRequestPill** — bottom-right reminder mounted at layout level, follows the rep across every page until resolved. Cross-checks against today's shifts so it clears instantly when the approved shift INSERTs (`07080de`, `2f9c7f3`).
- **`/shifts` redesign** — pending requests pinned to top above "Scheduled for me"; today's-date header line; search box (4+ shifts); compact "Request a customer" pill in the corner; loading spinner on Resume / Check-in buttons; **contextual countdown pill** per row (`in 50 min` / `10 min late` / `ends in 20m` / `ran 10m over`) ticking on a 30s page-level timer (`d97e56b`, `5ee80c6`, `7a63ac2`).
- **Dashboard tightened** — AppHeader uses `env(safe-area-inset-top)` so non-notched devices get a slimmer band; `compact` mode hides the redundant "Dashboard" title; "View all" promoted from a tiny text link to a brand-tinted pill button (`07080de`, `2f9c7f3`).
- **Break duration chooser** — homepage "Take a break" no longer auto-starts; opens a slide-up sheet with 15/30/60/open-ended; negative-timer bug fixed by clamping elapsed at zero (`6d3b46a`).
- **Live state flips** — mobile now flips `shifts.state` on `on-break` / `travelling` transitions so admin Live Ops "On break" / "Travelling" tabs actually surface the rep mid-shift. `setShiftBreakState` is permissive (in-progress / travelling / on-break all OK as source) so taking a break right after travelling works (`c3d15dd`, `2f9c7f3`, `7a63ac2`).
- **`/add-shift` cleanup** — chunky black "View N pending" sticky bar removed (the global pill does the job); chunky CTA card replaced with compact pill (`07080de`, `2f9c7f3`).

#### Calendar (admin)

- **Time-axis Days view** with 30-min slot grid (06:00–20:00, 28 slots × 24px = 672px tall) + drag-and-drop with snap, conflict detection, optimistic update + rollback (`deb1ad3`).
- **Lane allocator** — overlapping shifts split into side-by-side lanes via sweep-line per overlap cluster. Past `MAX_VISIBLE_LANES = 3` the rightmost slot becomes a brand-tinted "+N more" pill that opens a popover listing the rest (`07080de`, `c3d15dd`).
- **Drag-on-busy-day fix** — overflow pill at `zIndex:3` was swallowing dragOver/drop. Now `pointerEvents:none` while a drag is active so the column underneath catches the drop (`e16a08f`).
- **Weekend dimming dropped** — Sat/Sun look like normal workdays; today still highlights (`e16a08f`).
- **Click-to-add** — click any empty spot in a column → `/schedule/new` with date + clicked time pre-filled (snapped to 30 min). Uses `router.push`, not `window.location.assign`, so calendar state survives the round-trip (`2f9c7f3`, `6282384`).
- **Quick-info popover** on click — centred modal via `createPortal` to escape stacking contexts. Shows customer + initials, rep, date/time, tasks, state pill. Buttons: View / Edit + Delete (scheduled only, inline confirm) (`e16a08f`, `c028b0a`).
- **Days/Reps toggle retired** — rep dropdown filter took over the use case. Reps view + ~520 LOC of unreachable components deleted (`07080de`).
- **Time picker** — native `<input type="time">` replaced with a 30-min select (06:00–22:00 in AM/PM labels). Existing odd-minute values still round-trip (`e16a08f`).

#### Schedule / shifts management

- **Numbered-step `/schedule/new`** flow + live "About to create" preview (`96e9684`).
- **Customer scope default = empty** so a misclick can't bulk-create one shift per customer (`96e9684`).
- **Distance + total-tasks fields removed** from create AND edit forms — distance derives from customer coords + rep location; tasks_total auto-counts from `customer_tasks` (specific + universal). Live count chip on the edit page; Live Ops bar uses `liveTaskTotal` per row from a single batched `countTasksForCustomers` call (`96e9684`, `2f9c7f3`, `e16a08f`).
- **Auto-derived `series_id`** on every multi-shift creation (one UUID per /schedule/new submission). One-off shifts leave it null (`7a63ac2`).
- **`/schedule/manage` page** — series-based shift management. One row per series with customer(s), rep(s), date range, time, count + upcoming/past split. Actions: View / Edit future / Cancel future / All. Top-of-calendar "Manage shifts" link next to "New shift" (`d97e56b`).
- **Edit-future modal** — change customer / rep / start / end across every still-scheduled shift in a series from today onward. Smart prefill (single-customer/rep series prefill exact; multi-* start blank with "(unchanged)" placeholder) (`c028b0a`).

#### Admin UX pass

- **Honest "Saved" indicator** in the TopBar — the global pill only surfaces during/after actual mutations (was previously rendering "Auto-saved" always, which was misleading because most pages still need explicit Save buttons). Wired into shifts / customers / tasks / requests / settings stores (`6d3b46a`, `53dc28a`).
- **Disabled `<Btn>`** actually looks disabled — primary/danger go gray with not-allowed cursor (`6d3b46a`).
- **`<RepAvatar>`** now derives a stable color from rep id (or initials) using a 12-color palette. Same rep, same color everywhere — Reps list, reports, pickers, Live Ops table, map dots (`a4afc62`).
- **`<CustomerScopePicker>`** got a search box matching the rep picker (`a4afc62`).
- **Schedule rep-filter dropdown** in the calendar toolbar (`6d3b46a`).
- **Live Ops Today's Shifts** — count badges per tab (subtle pill next to label, brand-tinted when >0); "On break" + "Travelling" tabs now reflect real state; "Issues" dead tab removed (`90bcfb3`, `c3d15dd`).
- **Live Ops Live Feed** — caught-up empty state surfaces 5 most-recent activity events below "All caught up"; All activity gets a Today / 7d / 30d / All time dropdown (defaults to Today) (`5ee80c6`).
- **Live Ops Map popover** — rep marker shows rep + current customer + state pill + click-through to shift detail (`a4afc62`).
- **Reps detail Edit button** wired (was a dead button) — routes to existing `/settings/managers/[id]/edit` (`e662f17`).

#### Settings

- **Organisation page expanded** — Address with `<AddressAutocomplete>` + map preview (reuses `<CustomerAddressMap>` with new `showGeofence` prop), Phone, Email, Tax number, Website, Registration number. Plus mounted `<CustomFieldsCard entity="organisation">` so org-level custom fields are now first-class. (`6d3b46a`, `cbf6966`).
- **`organisation` added to `FIELD_ENTITIES`** + DB migration `2026_05_07_custom_fields_organisation.sql` to relax the CHECK constraint (`cbf6966`).
- **"Approval not needed" toggle** — when on, rep "Request a customer" bypasses the requested_shifts queue and a shift is scheduled directly. Mobile branches the toast text accordingly (`5ee80c6`).
- **Sidebar "Powered by Morpheus TA" footer** + dropped the duplicate subtitle (`6d3b46a`, `53dc28a`).

#### Library

- **Search box** above the file table (matches Customers / Reps / Tasks affordance).
- **Free-text categories** — upload form's category dropdown is now an input + datalist of existing categories. Sidebar shows the union of seed + free-text categories.
- **"Close upload" → "Cancel upload"** with x glyph (`53dc28a`).

#### Tasks page

- **Search box** added to the toolbar matching the Customers/Reps/Library pattern. Filters across name, description, and joined customer name. (Tasks / Library list pages now share the toolbar shape with Reps + Customers.)

#### Drag, popover, polish

- Calendar popover migrated from card-child to `createPortal(document.body)` so it escapes the card's stacking context (was rendering visually behind sibling overflow pills) (`c028b0a`).

#### Migrations applied today

- `2026_05_07_custom_fields_organisation.sql` — extends `custom_fields.applies_to` CHECK to include `'organisation'`
- `2026_05_07_shifts_series_id.sql` — adds nullable `shifts.series_id uuid` + partial index

Both must be run once in the Supabase SQL Editor before the relevant features hit prod.

#### Late-session push (May 7 evening — `ac939c1`..`HEAD`)

Done as one push, in narrative order:

- **Calendar count-chip consistency** — `DAY_SHIFT_LIMIT` now mirrors `MAX_VISIBLE_LANES` (2). Any day that would need a `+N more` overflow pill collapses to the count chip instead. Same UX whether a day has 3 shifts or 7 (`a30b89e`).
- **RESET wipes every future state, not just `scheduled`** — `deleteAllUpcomingShifts()` lost its `.eq("state", "scheduled")` filter. Earlier reset appeared to work but stranded `in_progress` / `complete` / `late` / `cancelled` rows that reappeared on next refetch. Per-row `bulkDeleteShifts` keeps the scheduled-only guard (mid-shift safety). Manage-page prompt copy updated to match new behavior (`a30b89e`, this push).
- **QA suite groundwork** — full master plan at `qa/QA_PLAN.md` (37 admin routes + 12 mobile routes mapped; coverage map / e2e checklist / Supabase integration checklist / data-integrity checklist / prioritized bug list). Playwright scaffold with config, fixtures (`adminPage` / `repPage` with real login), seed helpers, helpers (service / anon / user Supabase clients with QA tagging), and 5 exemplar specs. Vitest API tests for RLS + uniqueness constraints. Reusable skill at `~/.claude/skills/qa-audit/SKILL.md` so future audits stay consistent (`5295f0c`).
- **Dead-button purge round 1** — `/reps` lost `Import CSV` and `Invite rep` (no onClick, no Link wrap). `/reps/[id]` lost the `Message` button for the same reason. Edit on `/reps/[id]` still routes to the unified user editor (`3c81462`).
- **`Combobox` rollout** — new `components/ui/Combobox.tsx`: reusable single + multi-select dropdown with auto search (>8 options), optional left icon glyph, color swatches, sublabels, keyboard nav, click-outside, and portal rendering so overflow:hidden parents don't clip it. Migrated every customer / rep / category / region / type filter across `/tasks`, `/schedule`, `/schedule/manage`, `/shifts/[id]/edit`, `/tasks/[id]/edit`, `/library/[id]/edit`, `/customers/new`, `/customers/[id]/edit`, `/reports/timesheet`, Live Feed range, Custom Fields builder + value entry. Native `<select>` retained only for the 30-min time picker (OS picker on mobile is better) and the disabled preview select inside the custom-fields form (`8729d42`).
- **`/reps` got a Manage shifts header link** — parallels the calendar's button so managers can jump from the rep list to `/schedule/manage` in one click.
- **Mobile welcome strip rebuilt** — thin Morpheus-cyan gradient card with a glassy logo tile (uses the org logo from `/settings/organisation` if uploaded, else a sparkle glyph), org name + date row, time-aware greeting (`Good morning` / `Good afternoon` / `Good evening` / `Working late`), first-name only (`755e4a3`).
- **Honest empty/all-done state on the dashboard** — when every shift is complete the card flips to a green "All shifts done — nice work" celebration. The old "No shift assigned today" message was always a lie post-checkout (`755e4a3`).
- **Break or travel** — homepage `BreakCard` is now `BreakOrTravelCard`. Chooser sheet leads with a prominent cyan "Travel now" button alongside the four break-length options. Active travel timer renders inline on the dashboard with an "Arrived" stop button (`755e4a3`).
- **Footer sticks to the bottom** — `.phone-content > *` is a flex column, AppFooter uses `margin-top: auto`. Profile / Library / Support no longer leave the black bar floating mid-screen on short content. Mobile `lib/settings-store.ts` gained `getOrganisationName` / `getOrganisationLogoUrl` reads.
- **Customer edit form rewrite** — `/customers/[id]/edit` was a one-field form (only address). Now exposes name, code, initials, avatar colour swatch, region, address (re-geocoded if changed), and the geofence slider — same shape as `/customers/new` but pre-filled, with a live preview card on the right. `CustomerPatch` extended so `updateCustomer` actually accepts those fields. Customer detail header: name is now a clickable button with an edit glyph; standalone Edit button removed (one canonical entry point) (`755e4a3`, this push).
- **Loading awareness** — new `LoadingBar` (thin animated cyan bar pinned to top of content) + `Spinner` + `Skeleton` primitives in both apps. Plumbed into the worst offenders: admin `/schedule`, `/schedule/manage`, `/customers/[id]`, `/reports/operations`, `/reports/rep-performance`, `/reports/timesheet`; mobile `/`, `/active`, `/check-in`, `/check-out`. Mobile dashboard hero metric is a real skeleton block while shifts load instead of showing `—`.
- **Dead-button purge round 2** — `/notify` was a static design preview with a dozen non-functional buttons (Save draft, Send now, channel toggles, etc.). Stubbed to a "Coming soon" card until a real notifications backend exists. The route still resolves so existing links aren't broken.
- **Stale comment in `/schedule/manage` reset prompt** corrected to match the new "every state" wipe behavior.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`).

### Today's session — what shipped (May 12, 2026)

A long iteration day on Plan-my-day, the /shifts list, and the
end-of-shift flow — mostly driven by live testing rounds from Gary.
Net effect: one less screen (/summary deleted), a much calmer /route
page, consistent timestamps everywhere a saved order is referenced,
and a Plan-route pill that's always reachable.

#### Plan-my-day overhaul (mobile `/route`)

`/route` is now a pure ordering view. Stripped out:
- Per-leg "Leave now / X min late / X min early" schedule banners
- Per-leg "Open in Maps" buttons
- "Open whole day in Maps" CTA at the bottom
- "Update saved order" button (Gary asked for this multiple times)
- The 60s `nowTick` + `dayMapsUrl` memo + `computeScheduleStatus` +
  `buildArrivalISOLocal` + `formatClock` helpers that fed those views

Added:
- Prominent **"Order optimized at HH:MM"** banner under the totals
  (was a 10.5px hint line tucked inside the toggle subtitle —
  Gary's flagged this 10+ times).
- Always-visible **"Re-checked at HH:MM"** caption, hydrated from
  localStorage on mount and refreshed whenever the planner returns
  a route. Independent of saved-order state — visible every visit.
- Same-address legs (two stops at one site → driveSeconds≈0) now
  show "Same address as previous stop" instead of broken
  "— drive · —".
- Header restructured into clean rows so nothing wraps on iPhone
  widths: Row 1 LIVE chip + Re-check button, Row 2 "Total drive
  time: 16 min · 8.3 km", Row 3 "Re-checked at 3:26 PM".
- "Total drive" → "Total drive time" (lead number, own row, 15px/700).

All timing affordances (Leave-now / ETA / Maps handoff / Start
travelling) now live on /shifts only — two screens can no longer
disagree about the same number.

#### /shifts Plan-route pill

The pill is now the ONLY link to /route (the Plan-my-day side-menu
entry was removed earlier). Old rule hid it when remaining stops
< 2 — that stranded reps with "1 of 2 done · 1 left" on a page
with zero entry to /route. New rule: render whenever the rep has
any shifts today. Three states:

| State | Label | Look |
|---|---|---|
| All shifts done/cancelled | `Day complete` | okTint + green check |
| Saved order + work remaining | `Optimized · 2:42 PM` | okTint + green check |
| No saved order + work remaining | `Plan route` | brand-deep CTA + target |

Icon pair (`check-circle` / `target`) and size (15px) match the
home segmented pill exactly so the affordance reads as one feature
from either screen.

#### /shifts claimable card layout

The "Unscheduled · available" card was being squeezed — time
wrapping, AVAILABLE pill + distance on different lines, full
address sprawling across 4 lines — because the Claim button sat
in-line on the right and took half the card. Restructured: for
claimable rows the outer flex is now COLUMN. Tile + content take
a top row at full width; Claim button drops to a footer row
right-aligned. Non-claimable rows use `display:contents` on the
wrapper so their layout is unchanged.

Also added: **"3.2 km away"** distance pill on claimable rows
(crow-flies haversine from rep GPS, computed client-side — fast,
zero API calls, hidden when GPS denied), and the full street/
suburb wraps to two lines instead of single-line truncating.

#### /summary deleted, check-out routes home

The post-shift `/summary` page (stat tiles, activity timeline,
recorded exceptions recap) was redundant: the rep filed every
exception on `/check-out`, the wrap-up overlay already says
"Checked out · Highmark Retail", and the dashboard is where they
want to land to pick up the next shift.

New flow: tap Check out → exception form → wrap-up overlay plays
Saving → Logging → Done → **"You're checked out!"** frame visible
~1.2s (bumped from 0.55s) → `router.push("/")`.

Deleted:
- `app/summary/` directory (718 lines)
- `/summary` path from `SideMenu`'s `TODAY_PATHS`
- URL-param construction in `/check-out` that fed the deleted page

The wrap-up overlay animation (the one Gary loves — pulsing brand
circle, SAVING/LOGGING/READY stepper, "Logging the details… ·
Closing out your shift at Highmark Retail") is untouched. That's
the entire end-of-shift celebration now.

#### /active task accordion defaults

When `/active` mounts, the Tasks section now auto-opens **only**
if the customer has compulsory tasks. No compulsory (or no tasks
at all) → stays collapsed. Optional + Breaks accordions stay
collapsed in both cases. Guarded by a `useRef` so once the rep
manually toggles, the rule never overrides them again.

#### Home Up Next + segmented pill

- Auto-fire of the directions preview on the home Up Next card
  was reverted. Explicit Directions button back next to Start
  travelling. Per Gary: the home map should default to a clean
  day-overview pin view, not a route line. /shifts kept the
  auto-fire on expanded rows because expanding is itself a
  deliberate "show me this stop" gesture — different surfaces,
  different defaults.
- Home segmented pill (View all + plan icon) now renders the
  plan slot whenever there are any shifts today (was hidden
  under remaining < 2). When unplanned, the target glyph sits
  on a solid brand-deep fill (was transparent — Gary said it
  wasn't loud enough as a CTA). When planned, okTint + check.

#### Migrations to run for May 12

Three new migrations — all idempotent, all wrapped in
`BEGIN; … COMMIT;`:

- `2026_05_12_customer_contacts.sql` — `customer_contacts` table
  for multi-contact support per customer (Identity tab on admin
  customer edit). RLS matches the rest of the schema.
- `2026_05_12_shifts_claim_radius.sql` — `shifts.claim_radius_m
  integer` for the "rep must be within N metres to claim"
  filter on unscheduled shifts.
- `2026_05_12_shifts_flexible_time.sql` — `shifts.is_flexible_time
  boolean` for the "Anytime today" toggle on /schedule/new.
  When true, mobile renders "Anytime today" instead of a
  start–end range, and the countdown pill is suppressed.

#### /day · End-of-day recap (late-evening addition — `b5cc77e`)

After EOD QA, added the **wow feature**: a cinematic end-of-day
recap page reached from the home dashboard's "All shifts done —
nice work" card once every shift today is in a terminal state.

The recap (`app/day/page.tsx` — 766 lines):
- Cinematic hero — 3 pulsing rings, bouncy stage, stroke-drawn
  check, 36-particle CSS confetti burst, shimmer sweep. Same
  animation grammar recovered from the deleted /summary page so
  the visual language stays consistent.
- 2×2 stat tile grid with count-up animations:
  · **Shifts done** (sum of complete shifts)
  · **Hours worked** (sum of check_in_at → check_out_at)
  · **Tasks completed** (count of shift_task_completions joined by shift_id)
  · **Travel time** (paired shift.travel_started / shift.travel_ended events)
- "Your day" timeline — each completed shift shows customer logo,
  check-in → check-out clock window, green tick.
- Exception count banner (only if there were any: off-site, late,
  early check-out, unable-to-attend).
- Single "Back to dashboard" CTA.

Wiring:
- Home "All shifts done — nice work" card is now a `<Link>` to
  `/day`. Subtitle gains "· tap to see your recap" cue, right-side
  chevron makes the affordance discoverable.
- New ShiftWithMeta field: `checkOutAt: string | null`. Column
  already in the DB since May 6 (`2026_05_06_shifts_check_out_at`),
  just exposed it on the TS type + rowToShift mapper.

No new DB migrations. Pure aggregation over existing tables.
Cross-platform: pure React + Supabase + CSS — identical on iOS
Safari/PWA, Android Chrome/PWA, desktop. Respects
`prefers-reduced-motion`: every animation short-circuits and
the end-state renders instantly.

This replaces the per-shift `/summary` we deleted earlier today.
Per-shift `/summary` fired after EVERY check-out — too much.
`/day` fires at most once a day, when the work's done. One
celebration, real payoff.

##### `/day` cinematic iterations (`e3e00e2` → `c8bff98` → `1206990` → `0d354bc`)

Four follow-up commits to make the entry actually feel like a
moment, not a transition. Gary's testing rounds drove each fix:

- **`e3e00e2`** — reduced-motion override scoped to only the
  `.dm-gradient` class. Playwright at iPhone 14 reduced-motion
  viewport caught that the universal `.dm-*` rule was killing
  tile backgrounds and label colours alongside the gradient
  text. Fix: keep `animation: none` global, restrict the
  `-webkit-text-fill-color` + `background: none` overrides to
  the gradient headline only.
- **`c8bff98`** — Gary feedback: "almost fell asleep." Wrapped
  the hero number in a `CountUp` so the digit visibly ticks from
  0 → N over 1.5s instead of just appearing; bumped tile label
  opacity from 0.7 → 1.0 (real iOS Safari was rendering the
  compounded opacity near-invisible); extended hero entry from
  0.9s → 1.8s with bigger overshoot; added a second
  `<SecondaryConfetti>` (48 particles) that fires from the tile
  area as the tiles drop to give the cinematic a "phase 2" hit;
  re-timed the whole arc with discrete beats.
- **`1206990`** — Gary feedback: "no movement, no nothing
  besides the start." Added SIX continuous ambient animations
  that loop forever after the entry settles, so the screen
  never goes static:
    · `dm-flash` — bright radial white-out at t=0 (one-shot)
    · `dm-glow-breathe` — hero number text-shadow pulses (3.4s loop)
    · `dm-bob` — hero number micro-bobs (4.5s loop)
    · 18 ambient floating particles drifting up forever
    · `dm-shimmer-loop` — diagonal light wash (5.5s loop)
    · `dm-tile-glow` — each tile's box-shadow breathes (3.2s loop)
- **`0d354bc`** — Gary feedback: "still no animation when it
  starts." Root cause: three CSS animations (entry, bob,
  glow-breathe) stacked on the same DOM element were competing
  for the `transform` property — iOS Safari's composite resolver
  was letting the looping `bob` bleed into the entry window and
  suppressing the entry arc entirely. Fix: split into THREE
  nested wrappers so each transform owns its own element:
    · outer `.dm-impact-shake` — one-shot screen-shake at 0.55s
    · middle `.dm-hero-bob` — infinite bob (transform)
    · inner `.dm-hero-num` — entry drop + count-up (transform +
      filter + opacity) and glow-breathe (text-shadow, doesn't
      conflict)
  Also made the entry MUCH more dramatic: number now drops from
  `translateY(-280px)` at scale 0.3 with -22° rotation and 50px
  motion blur, crashes down through a 3-stage bounce. Tiles now
  slide in from the SIDES (left from -80px, right from +80px)
  instead of straight-drop. Added `will-change: transform,
  opacity, filter` + `backface-visibility: hidden` for iOS GPU
  acceleration.

##### Verified by Playwright

A live-fire test (`/Users/gary/Claude/qa/day-record-test.mjs`,
since deleted after success) stubs Supabase auth + REST queries
and drives `/day` at iPhone 14 + Pixel 7 viewports with frame
snapshots every 150ms. The recording confirms:
  - 0ms: "TALLYING YOUR DAY…" pulse on dark backdrop
  - 150ms: "0" appears with bright radial flash behind, confetti
    firing outward
  - 300ms: count-up has ticked to "2", number scaled in fully
  - 600ms: settled on final number, "Day done." headline rises
  - 2400-3000ms: 4 tiles slide in from sides with their own
    count-ups
  - 3100ms+: per-stop timeline cascades, exception banner,
    CTA fades in
  - Continuous: ambient particles drift, hero glow breathes,
    shimmer sweeps, tile shadows pulse — forever.

##### iOS PWA cache-busting note (for the next debugger)

Recurring symptom Gary hit: "I just pushed and I'm still seeing
the old animation." iOS PWAs cache the JS bundle aggressively
through the service worker — Vercel deploying does NOT
immediately update what the installed PWA serves.

To force-bust on iPhone:
  1. Swipe up + swipe up on the Morpheus tile to fully kill the
     PWA from the app switcher (not just minimise).
  2. Wait ~10s so the service worker can check for updates on
     next launch.
  3. Reopen from the home screen — fresh bundle should load.
  4. Nuclear option if the above fails: delete the PWA from the
     home screen, reopen the URL in Safari, Share → Add to Home
     Screen. Forces a completely fresh install.

This is iOS-specific. Android Chrome PWAs honour the
Service-Worker-Allowed cache headers more aggressively and
usually pick up the new bundle within a minute.

#### Files changed today

`app/page.tsx`, `app/shifts/page.tsx`, `app/route/page.tsx`,
`app/active/page.tsx`, `app/check-out/page.tsx`,
`app/summary/page.tsx` (**deleted**), `app/day/page.tsx` (**new**),
`lib/shifts-store.ts`, `components/SideMenu.tsx`.

Mobile build green (`npm run build`), admin build still green
(no admin files changed today), working tree clean. All commits
on `origin/main`, both Vercel projects auto-deployed.

#### Web push notifications — answered for the next chat

User asked: "can you only do push notifications with native apps?"
Answer: **no**, Web Push works from the PWA on both iOS and
Android.
- Android Chrome / PWA: full Web Push (banner + action buttons).
- iOS Safari **as a home-screen PWA** since iOS 16.4 (March 2023):
  banner + sound. **Not** available in iOS Safari without
  installing to home screen.
- Implementation outline when this becomes a build:
  1. Generate VAPID keys (one pair, server-side secret).
  2. Service worker that handles `push` events.
  3. On first launch after install, `Notification.requestPermission()`
     + `PushManager.subscribe({ userVisibleOnly: true,
     applicationServerKey: VAPID_PUBLIC })`.
  4. Persist the subscription endpoint per-rep in Supabase
     (new `push_subscriptions` table: `rep_id`, `endpoint`,
     `p256dh`, `auth`, `created_at`).
  5. Send pushes from a Supabase Edge Function (or a tiny Vercel
     route) using the `web-push` npm package.
- iOS gotcha: build a "Install to home screen for notifications"
  nudge on first launch when the user-agent is iOS Safari and
  `window.matchMedia('(display-mode: standalone)').matches` is
  false. One-screen onboarding, not a Capacitor wrap.
- Capacitor wrap stays on the deferred list — it's about
  **background GPS** when the app is closed (PWAs sleep), not
  push. Don't conflate the two when scoping.

#### QA audit summary

Full regression review at end of day (via `/qa-audit`). No
blockers, no high-severity issues. Two medium nits:

1. `saveShiftOrder` writes order + meta in two sequential
   `setItem` calls — not strictly atomic if localStorage quota
   is hit between them. UI handles gracefully (shows
   "Optimized" without time when meta missing). Worth tightening
   someday: combine into one `{ order, savedAt }` payload.
2. Home segmented pill has no "Day complete" calm state — when
   all shifts are done AND no saved order, the plan slot still
   shows the brand-deep CTA with target glyph. Cosmetic
   inconsistency with /shifts. 5-line fix: mirror the
   `dayComplete` logic.

Verified end-to-end: shift-order-store consistency, localStorage
namespace, subscribeShiftOrder propagation across home / /shifts
/ /route, applySavedOrder edge cases (deleted customer mid-day,
quota miss), /shifts column-vs-row layout via `display:contents`,
/active accordion useRef guard, /summary fully removed from
code, /check-out submit flow + DB writes, openMapsLink
iOS/Android branching, _gpsCache module-level sharing. No new
DB migrations needed for any May 12 *code* change beyond the
three already listed above.

### Today's session — what shipped (May 11, 2026)

The longest session to date — eighteen commits across two themes that
both ended up touching most of the app. First half of the day was the
**cancellation / "I can't make this shift" feature** end-to-end (rep
flag → manager Needs-action queue → four resolutions → audit trail).
Second half was a sweeping **polish + identity + exception-toggle
pass** — rep photos, house/face icons on maps, mobile chrome
cleanup, exception toggles, notes per shift, banner notifications,
nicer loading states, /schedule/manage row-actions rebuild.

Then a third late push for the two biggest deferred items:
**traffic-aware Plan-my-day routing** and **per-customer logo upload**.

#### Plan my day · /route (mobile)

The "perfect routing" feature we'd been deferring. End-to-end:

- **Server-side API route `/api/route/plan`** (`morpheus-mobile/app/api/route/plan/route.ts`). POST origin + ordered stops, get back per-leg ETA + distance + polyline. Provider-agnostic: when `GOOGLE_ROUTES_API_KEY` is set, calls Google Routes v2 (`computeRoutes`) with `TRAFFIC_AWARE` preference and an explicit field mask; when unset, falls back to a mock that estimates from haversine × 1.4 winding × 30 km/h urban average. The mock keeps the feature usable for UX testing without burning Google quota and is the default in local dev.
- **Greedy nearest-neighbour optimizer** (`optimizeOrder`) kicks in when the client passes `optimize: true`. O(n²) which is trivial at the 3–8 stops a rep visits per day; gets within ~5–10% of optimal in practice. Hard cap at 25 stops on the server.
- **Fail-open**: any Google API failure (non-200, bad shape, network) silently falls back to mock + a `warning` field the client surfaces as a non-blocking pill. Reps never see a broken Plan-my-day.
- **Client wrapper `lib/route-planner.ts`** with two flavours: `planRoute(origin, stops)` for direct calls, `planMyDay({ optimize })` as the convenience that grabs the rep's today shifts (excluding complete / cancelled / "unable to attend" / no-coord rows), gets GPS, calls the API, returns shifts in visit order. 5-minute in-memory cache keyed by (coords, stop ids, optimize flag) so mashing Refresh doesn't blow through Google quota. Cache cleared explicitly on user-initiated refresh.
- **GPS fallback**: when the rep denies location, we ground the route at the first stop's coordinates and set `originFromFirstStop: true` so the UI can warn that ETAs are measured from there, not from the rep's current position.
- **Mobile `/route` page** (`morpheus-mobile/app/route/page.tsx`). Sticky summary band: provider chip ("Live traffic" green when Google + traffic-aware, "Estimated" grey for mock), total duration + distance, Refresh button, Optimize-order pill switch. Vertical leg list with numbered step badges (1, 2, 3…), customer name + drive time + drive distance, ETA pill ("Arrive 9:42 AM"), Leave-by pill with three tones — green ("Leave by 9:18"), warn ("less than 10 min slack"), danger ("Late · sched 9:30"). Per-leg "Open in Maps" deep link. Bottom "Open whole day in Maps" button that emits a multi-waypoint Google Maps URL (iOS routes maps.google.com to Apple Maps, Android opens Google Maps).
- **Dashboard entry point** — when the rep has ≥ 2 stops today, a "Plan my day" card appears below the dashboard map ("N stops · live traffic ETAs + Leave-by reminders"). Single stop = card hidden; Up Next already covers that case in one tap.
- **Side-menu link** — "Plan my day" sits between "Today" and "Request shift".

No new DB migration — the planner reads existing shifts/sites only. `GOOGLE_ROUTES_API_KEY` is documented under "Optional env vars" further down.

#### Per-customer logo upload (admin → mobile)

Mirror of the rep-avatar pattern, applied to customers. Replaces the coloured-initials tile with the customer's actual branding everywhere on the rep's device — without sending huge image files.

- **DB migration `2026_05_11_customers_logo.sql`** — adds a single `customers.logo_url text` column. Same storage choice as profile avatars: base64 data URL in a text column, no Supabase Storage bucket needed. Tiny on the wire because of step 3.
- **Compression on upload** — admin uses `compressCustomerLogo()` (in `lib/customers-store.ts`) which decodes the file, paints onto a 96×96 white canvas (letterbox, not square-crop, because logos are usually wordmarks not faces), and exports JPEG quality 0.82. Result is typically 5–15 KB per logo. White background means transparent PNGs still read on dark UI tints. 12 MB hard limit on source files before decode so a 50MP camera shot doesn't blow up.
- **Customer edit form** — `/customers/[id]/edit` gains a "Customer logo" field below "Avatar colour" with a 64×64 preview tile, "Upload logo" / "Replace logo" / "Remove" buttons. Saves immediately on file pick (separate commit-step from the main form Save — managers want to see the logo land before fiddling with the rest).
- **Auto-flows everywhere** — `CustomerSwatch` (admin) and `CustomerTile` (mobile) both branch on `logoUrl`: when set, render the logo on a white tile; when null, fall back to the original coloured-initials swatch. No call-site changes needed beyond passing the prop. Mobile call sites updated for: home up-next card, /shifts row, /active hero, /check-in hero, /check-in/success preview, /check-out hero, /add-shift customer picker, and /route leg badges.
- **Shifts join carries the logo** — `lib/shifts-store.ts` (mobile) joins `customers(logo_url)` in every query so the logo travels with the shift row in one round-trip. `ShiftWithMeta.logoUrl` is the flat property the UI reads.
- **Audit** — saves write a `customer.updated` event to `shift_events` (new event type added to the EventType union).

Eighteen commits in order:

#### Cancellation feature (8 commits, `7229cc4`..`e723c68`)

- **Stage 2A — schema + rep flow (`7229cc4`)** — `db/migrations/2026_05_11_shifts_attention.sql` adds the attention overlay columns to `shifts`. New `UnableToAttendSheet` with 6 reasons + free-text note. `/shifts` rows expose "I can't make this shift" + Withdraw when applicable. `lib/shifts-store.ts` (mobile) gains `raiseUnableToAttend` / `withdrawUnableToAttend` and the attention fields on `ShiftWithMeta`.
- **Stage 2A.1 — same affordance on the home up-next card (`e64362e`)** so the rep doesn't have to drill into `/shifts` to use it. Same sheet, same store fn.
- **Stage 2B — manager Needs action + 4 resolutions (`2629f06`)** — Live Ops "Needs action" tab shows attention-raised shifts at the top; `/shifts/[id]` shows an attention banner with `[Reassign] [Reopen as unassigned] [Acknowledge] [Cancel · don't refill]`. Each resolution writes a dedicated `shift.attention_*` event for audit.
- **Sidebar badge + calendar pill + shift-detail banner (`6279bc4`)** — flashing red sidebar pill propagates "N pending" across every admin page; calendar cards carry an inline pill; shift detail surfaces the rep's reason + note.
- **Stage 2B.1 — resolution feedback, conflict check, edit escape hatch (`64c7c3d`)** — Reassign now does a conflict check on the picked rep + shows clean error inline; resolution writes (`attention_resolution` column from `_resolution.sql` migration) drive a brief rep-side feedback pill; "Edit…" link on the banner lets the manager amend without resolving.
- **Stage 2B.2 — softer label, relaxed states, silent-fail guard (`ca487eb`)** — "Acknowledge" renamed to **"Keep · rep stays on"** after testing showed managers mis-read it as "rep is off the hook". Read-back verification on the UPDATE catches silent no-ops (the RLS rule was too tight; now the `.select()` after `.update()` flags it). Mobile flow accepts a wider set of source states so cancelling after a state flip still works.
- **Stage 2B.3 + 2B.4 — diagnostic logging on the raise path (`0f77859`, `72b4ba0`)** — added `[unable]` `console.warn` traces at each step so the user could pinpoint where their home-page raise died silently. Closed the bug; logs left in (cheap, quiet).
- **Stage 2B.5 — re-raise must clear stale resolution fields (`e723c68`)** — re-raising "Can't make it" on a previously-actioned row was sticking in a half-resolved state. Fix: `raiseUnableToAttend` now clears `attention_resolved_at / _resolved_by / _resolution` alongside setting the new `attention` flag.

#### /schedule/new polish (`54ba1c7`)

- Customer and Rep section headings bumped from 11.5px caps to 13px+700 (the eye should land on the picker, not the label above it).
- Smart time defaults — start = next 30-min slot from now (so opening the form at 14:07 prefills 14:30), end = start + 30 min. Old hard-coded `09:00 / 17:00` defaults were a constant micro-friction.

#### Always-on dashboard map + admin live shift card (`592bdde`)

- Mobile `DashboardMap`: removed the `placed.length === 0` gate. Map mounts on first render regardless of shifts; pins layer in. No more cold-start reflow.
- Admin `/shifts/[id]`: new `LiveActivityCard` appears for in-progress/on-break shifts. Shows checked-in time + live clock + elapsed + the rep's currently-running task with a "started X ago" line, pulsing dot, 30s refresh.
- New helper `getActiveTaskForShift(shiftId)` queries `shift_events` for the latest `task_started` whose task hasn't been completed.

#### Notes feature end-to-end (`f96bfcb`)

- `db/migrations/2026_05_11_shifts_notes.sql` adds `shifts.rep_notes text`.
- Mobile: `lib/shifts-store.ts` gains `saveShiftNotes(shiftId, notes)` with auth-gated filter (`rep_id = userId`). `/active` renders `ShiftNotesCard` between Breaks and AppFooter — textarea, auto-save on blur, "Saving… / Saved ✓" inline feedback.
- Admin: `/shifts/[id]` shows the rep's notes in a read-only "Notes from rep" card in the right column when present.

#### Notification watcher for shift assignments (`1baaf9d`)

- New `ShiftAssignmentWatcher` mounted in `app/layout.tsx` alongside `RequestResolutionWatcher`. Subscribes to `shifts` INSERT + UPDATE on realtime; banners when `rep_id = me` AND `shift.id` isn't in the localStorage seen-set.
- Two copy variants: "New shift assigned" (INSERT) / "Shift reassigned to you" (UPDATE). Seen-set is seeded on mount with `listMyShiftsToday()` so existing shifts don't toast on cold start. Auto-dismiss 9s; stale shifts (`shift_date < today`) silently marked seen so back-dated edits don't toast.

#### Awesome loading states (`27e7b90`)

- New `CheckingInOverlay` component for the mobile check-in flow. Full-screen brand-tinted overlay with pulsing rings, animated progress bar, 3-step stepper ("Saving · Logging · Ready"). Parent-owned `CheckInPhase` ("submitting" | "logging" | "done") drives the visual; lands on "done" for ~550ms before routing to `/check-in/success` so the celebration registers.
- `/shifts` skeletons rebuilt: previously a single flat grey box, now a stack of 3 (mine) / 2 (unassigned) shimmering rows matching the real `ShiftRow` silhouette (customer tile + 2 stub lines + chevron), staggered 100ms each.
- Bug fix: `mc-skel` keyframe referenced by the `Skeleton` primitive was never defined in `globals.css` — the old skeleton was just a static stripe. Keyframe is now in place along with new `mc-ring-pulse` and `mc-rise` for the overlay.

#### /schedule/manage row actions cleanup (`8b18df0`)

- Previous 4-button layout (`[View] [Edit future] [Cancel future] [All]`) was wrapping to two lines + the bare "All" button left managers guessing.
- Now: `[View] [Edit future] [⋮]` on one line. The `⋮` opens a small dropdown menu with the two cancel actions fully spelled out:
  - "Cancel upcoming N shifts" — "From today onward · running and complete shifts kept"
  - "Cancel entire series · N shifts" — "Only state='scheduled' rows are deleted · audit trail kept"
- Menu closes on outside click, escape, or after an item fires. Column template moved to a shared `SERIES_GRID` constant; header gained an "Actions" label.

#### Polish: chrome, address line, quieter maps (`b514454`)

- **Tasks chip removed** from `/schedule/new` customer-context strip. Address chip stays for single-customer scope.
- **Site address on shift cards** — small grey pin line under the time row, both on `/shifts` rows and the home next-up card. Truncates on overflow; tooltip carries the full string.
- **Mobile home menu icon moved inline.** Black `AppHeader` band removed entirely from the dashboard. The welcome strip now owns the hamburger button on its right edge (same glassy style as the org-logo tile on the left), folded "Last sync" line under the card, safe-area inset moved onto the welcome card itself.
- **Map attribution collapsed by default** across all four MapLibre maps (mobile DashboardMap, admin CustomerAddressMap / CustomersMap / live-ops MapPanelClient). The (i) toggle stays for anyone who wants to expand it.

#### Identity pass — house vs face + rep photos (`42054a8`)

- New `house` and `face` glyphs added to both `Glyph` (mobile) and `AGlyph` (admin) so they're available for non-map UI too.
- All four map customer markers rebuilt: small white house glyph on the customer's brand colour, rounded-square shape. Reads instantly as "a building / site". Rep markers stay circular pills for visual contrast — same colour-coding as before, but with the rep's photo (when uploaded) or a generic face glyph instead of initials text.
- Mobile `/profile` got an avatar uploader: tappable tile with a small camera badge, hidden `<input type="file">`, `capture="user"` so phones offer the selfie cam. `compressAvatar(file)` does square crop + downscale to 96×96 + JPEG quality 0.82 → typically ~10–15 KB encoded. `updateMyAvatar(dataUrl)` writes to `profiles.avatar_url`. Inline "Saving photo… / error / Remove" status row under the email.
- The photo plumbs everywhere: mobile DashboardMap user marker, admin `/reps` grid + table (`RepAvatar` chooses photo over initials when present), `/reps/[id]` detail card, admin live-ops map rep markers + popup header.
- `lib/rep-locations-store.ts` extended to read `profiles.avatar_url` alongside the existing name/initials; `RepLocation` interface gains `avatarUrl: string | null`.
- Schema: `db/migrations/2026_05_11_profile_avatars.sql` adds a single `avatar_url text` column to `profiles`. NULL falls back to the face glyph everywhere.

#### Exception toggles — org-wide + per-customer (`86dc436`)

- `db/migrations/2026_05_11_exception_toggles.sql` adds `location_exceptions_enabled` and `timing_exceptions_enabled` nullable boolean columns to `customers`. NULL = inherit org default. Both columns have `COMMENT ON` describing the inherit semantics.
- Org-wide pair lives in `app_settings` under keys `location_exceptions_enabled` and `timing_exceptions_enabled`. Both default ON so existing installs behave exactly the same as before.
- Admin UI on `/settings/check-in-rules`: new card at the top of the page with two pill-style toggle switches + explainer subtitles. `ToggleRow` component is reusable; pressed-state visuals + optimistic updates with rollback on error.
- Per-customer override on `/customers/[id]/edit`: tri-state pill group (Inherit org default / Always show / Never show) for each exception type. Stored as `null | true | false` on the customer row.
- Mobile check-in page (`/check-in`): two new `useMemo`s compute `locationExceptionsOn` and `timingExceptionsOn` from the customer override (when set) falling back to the org default; the existing `offsiteInfo` / `timingInfo` blocks short-circuit to `null` when off, propagating to `triggered=false` everywhere downstream. Cards never render and dedicated event-log entries never fire when disabled.

#### Migrations to run for May 11

Six new files in `db/migrations/` — run in order in the Supabase SQL editor before the May 11 features hit prod:

1. `2026_05_11_shifts_attention.sql` — cancellation overlay columns (`attention`, `attention_reason`, `attention_note`, `attention_raised_at`, `attention_resolved_at`, `attention_resolved_by`) + indexes
2. `2026_05_11_shifts_attention_resolution.sql` — adds `attention_resolution` column for the rep-side feedback pill
3. `2026_05_11_shifts_notes.sql` — adds `rep_notes text` to shifts (note feature)
4. `2026_05_11_profile_avatars.sql` — adds `avatar_url text` to profiles (rep photo upload)
5. `2026_05_11_exception_toggles.sql` — adds `location_exceptions_enabled` + `timing_exceptions_enabled` boolean overrides to customers
6. `2026_05_11_perf_indexes.sql` — engineering pass; adds four hot-path indexes (`shift_events.shift_id` partial, `profiles.role`, `rep_locations.rep_id`, `customer_sites.active`)
7. `2026_05_11_customers_logo.sql` — adds `logo_url text` to customers (per-customer logo upload)

All seven are idempotent and wrapped in `BEGIN; … COMMIT;` so failures roll back cleanly. The org-wide pair for the exception toggles is written into `app_settings` lazily on first admin UI save — no migration needed for them.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`). Smoke-tested key routes return 200 on a local prod-mode boot.

#### Late-session push (May 11 afternoon — `8283df0`..`6deb0d3`)

Seventeen more commits between the morning batch and end-of-day,
driven by the manager testing the morning's drops and flagging
friction. Roughly grouped:

Mobile chrome + flows
  • `8283df0` Hide Directions / Start travelling on the up-next card
    once the shift is in-progress (and auto-end travelling on
    check-in so the timer doesn't run forever in localStorage).
  • `380cbd4` Side-menu name no longer ellipsis-clips ("Garydurbach"
    issue) — the wrapping flex container was missing `flex: 1`. Same
    commit drops the redundant "IN PROGRESS" pill that was stacking
    next to "ENDS 1H 25M" on shifts rows.
  • `901e624` Shift notes: debounced auto-save (don't rely on
    onBlur, which doesn't fire reliably on iOS PWA back-buttons) +
    read-back verification via `.select().single()` so saving says
    "Saved ✓" only when a row actually updated. Friendlier error
    when the migration hasn't run.
  • `d300fa3` Loading overlay covers every check-in / check-out
    tap end-to-end. `CheckingInOverlay` now supports three modes
    (in / out / opening) — Check-out gets the full 3-phase
    stepper, all the "Open from CTA" jumps get the lighter Opening
    variant so there's no silent gap between tap and destination.
  • `cfdeca8` Greeting wraps for long names; up-next card dropped
    the wordy yellow info banner; /shifts "Request" nav has the
    Opening overlay.
  • `4f1cbf2` Welcome card folded "Last sync" into the small-caps
    top line + tightened padding.
  • `fc43f16` Then dropped Last-sync off the welcome card entirely
    and moved it to the side-menu footer — managers wanted the
    hero clean. Heartbeat indicator is still one tap away.
  • `c7c4d89` Mobile /profile gained an Account-settings sheet —
    full name + email + password edit from the app. New helpers
    `updateMyEmail` (Supabase Auth confirmation flow) +
    `updateMyPassword` (instant via active session). Three dead
    menu rows (Notifications / Sync status / About) removed.

Calendar (admin)
  • `55da568` Per-rep view never collapses to a count chip + full
    status pills (Cancelled, Scheduled, Done, etc) on every card.
  • `fb29b6e` Density tiers for short cards (initial fix —
    superseded by the next one).
  • `40aeb2f` Single-rep view never builds an overflow "+N MORE"
    cluster — `assignLanes` got a `{ singleRep }` shortcut so a
    long cancelled shift can't drag the rest of the day into a
    popover.
  • `ac35ef0` All cards now render the same content shape
    regardless of duration. Min card height = 46 px in single-rep
    mode, 60 px in multi-rep mode, so a 30-min card and a 1-hour
    card both show customer + time + state pill identically.
  • `a57d6cf` /schedule/manage gained a Cadence column derived
    from each series's actual shift_date set ("Weekly · Mondays",
    "Weekdays", "Daily", etc). The View button now passes
    customer + rep + date params; /schedule reads them at mount.
    `updateShiftSeries` surfaces zero-row updates as a clear error
    instead of fake success.
  • `8283df0`-era density work plus `55da568`'s status pills now
    use one consistent `STATE_DOT` table covering every state
    (scheduled / in-progress / travelling / on-break / late /
    complete / cancelled).

Admin housekeeping pass
  • `27e7b90` "Awesome" loading states (initial check-in overlay +
    shimmering /shifts skeletons; superseded structurally by the
    overlay generalization).
  • `8b18df0` /schedule/manage row actions rebuilt — `[View]`
    `[Edit future]` `[⋮]` overflow with full-sentence cancel
    actions, replacing the cramped 4-button layout with a bare
    "All" red button.
  • `2e81c54` **Dropdown audit** — every native `<select>` and
    `<input type="time">` in the admin replaced by the shared
    `Combobox` / new `TimeCombobox`. Icons, search-as-you-type,
    multi-select where applicable. One consistent dropdown chrome
    across every entity form.
  • `fb921e4` Closing-batch — break-or-travel sheet handle now
    actually closes the sheet (iOS pattern); rep map markers
    shrunk from 32 px to 28 px to match house markers; Today's
    Shifts gained a red "Needs action" tab surfacing
    `attention='unable_to_attend'`; /customers defaults to Table
    view + persists across nav via localStorage.
  • `0e16dac` /schedule/manage: redundant "Reset upcoming
    schedule" section removed (the per-series Cancel + standalone
    Delete-all already cover it). Live Feed "All activity" pill
    now reads a real `countRecentEvents()` total instead of being
    capped at 50 by the display limit.
  • `6deb0d3` Form button audit — every entity create/edit page
    follows the same layout. "Add customer"/"Add site" renamed to
    "Create customer"/"Create site"; customer edit gained a
    Delete button (was the only entity edit without one);
    consistent `[Delete <entity>] ··· [Cancel] [Save changes]`
    split on every edit page.

Working tree clean. All commits on origin/main; both apps
auto-deployed via Vercel.

#### Evening UX fixes + Plan-my-day pill (May 11 evening — `73e29f9`..`e529b6f`)

Four commits after the engineering pass, driven by another round of
manager testing.

- **`73e29f9`** — the big late push. Plan-my-day routing end-to-end
  (mobile `/route` page, server `/api/route/plan` with Google Routes
  v2 TRAFFIC_AWARE + mock fallback, client wrapper with 5-min cache,
  GPS fallback to first stop, per-leg + whole-day Open in Maps).
  Per-customer logo upload (migration `2026_05_11_customers_logo.sql`,
  admin /customers/[id]/edit field with client-side letterboxed JPEG
  compression to ~5-15KB base64, CustomerSwatch + CustomerTile both
  auto-branch on `logoUrl` so the logo shows everywhere — shift rows,
  /active hero, /check-in / -out, /add-shift picker, /route badges).
  UX fixes: `/check-in/success` page deleted (routes straight to
  `/active` — the success-page "Start activities" tap was friction
  on top of an overlay that already confirms the check-in); new
  `"leaving"` CheckMode on `CheckingInOverlay` for the /active →
  /check-out tap (was confusingly saying "Opening…" while the rep
  was leaving the store — now "Wrapping up…"); Up Next picker on
  dashboard fixed (was only matching `in-progress` / `scheduled`, so
  reps with their remaining shift in `travelling`, `on-break`, or
  `late` saw "No shift assigned today" even though work was clearly
  left — now matches any non-terminal state with sensible priority
  order); dead Directions buttons removed from /shifts row
  expansions (had no onClick, did literally nothing — the dashboard
  Up Next card carries the real Directions preview, /route page has
  per-leg deep-links).
- **`a2bdf20`** — customer edit page reorganised. Was one giant Card
  with twelve fields jammed together including the per-customer
  exception override pickers, which made the exceptions look like
  standalone settings rather than overrides on top of the org
  defaults at `/settings/check-in-rules`. Now four clearly-labelled
  sections in the left column: **Identity** (name, code, initials,
  colour, logo) · **Location** (region, address, geofence) ·
  **Check-in exceptions** (override pickers with an inline explainer
  paragraph making the hierarchy explicit) · **Action row** outside
  the cards (Delete left, Cancel + Save right).
- **`e529b6f`** — Plan-my-day card collapsed to slim pills. The
  initial drop had added a chunky full-width "Plan my day" card
  between the dashboard map and the Up Next card; that pushed Up
  Next down and competed visually with the "No shift assigned
  today" / "All shifts done" block the user actually liked. Now it
  lives as two small right-aligned okTint pills — one directly under
  Up Next on home, one in the header row next to Request on
  /shifts — only when the rep has 2+ stops today (single-stop days
  are already covered by Up Next's own Directions / Resume CTAs).

Plus one fix from earlier in this same session that's worth calling
out separately: **`73e29f9` also fixes the dashboard's `allDone`
check** to treat both `complete` and `cancelled` as terminal, so the
"All shifts done — nice work" celebration fires even if a manager
cancelled one of the day's shifts.

Migration added today: `2026_05_11_customers_logo.sql` (single
`ADD COLUMN IF NOT EXISTS logo_url text` on `customers`, idempotent).
Optional env: `GOOGLE_ROUTES_API_KEY` (server-side, mobile project,
NOT NEXT_PUBLIC_) — without it Plan my day uses the mock provider.
See "Optional env vars" further down for full setup.

Both apps build clean (`npm run build`). Mobile + admin TypeScript
clean (`npx tsc --noEmit`). Working tree clean, all commits on
origin/main, both Vercel projects auto-deployed.

### Today's session — what shipped (May 8, 2026)

The whole day was one feature shipped end-to-end: **multi-site customers**.
Earlier the system modelled every customer as a single location (one
address, one geofence). Real customers — chains, multi-warehouse
retailers, anything with more than one physical site — couldn't be
modelled, so managers had been creating "Aria Cosmetics — Cape Town"
and "Aria Cosmetics — Sea Point" as two separate customer records.
Now the customer is the company; each customer has one or more
**sites**; every shift pins to a specific site.

Seven commits, in order:

#### Stage 1A — schema + admin Sites tab (`6f98c48`)

- New `customer_sites` table: `id uuid pk`, `customer_id text fk→customers`, `name`, `address`, `latitude`, `longitude`, `geofence_radius_m`, `active`, timestamps. Trigger keeps `updated_at` fresh. Realtime publication on. RLS matches the rest of the schema (permissive Phase-pre-4: any authenticated user, separate select/insert/update/delete policies).
- `shifts.site_id` nullable FK with `ON DELETE SET NULL` + partial index.
- Backfill: every existing customer becomes a "Main" site (renamed to "Head office" later in this session). Every existing shift's `site_id` is filled in to that backfilled site. Both backfills are NOT-EXISTS-guarded so re-runs are safe.
- New `lib/sites-store.ts`: list / get / create / update / deactivate / reactivate / hard-delete. Hard-delete refuses if any shift references the site (suggests deactivate). Every action emits a `customer.site_*` audit event.
- New `components/customers/SitesTab.tsx`: per-customer Sites tab on the customer detail page. SiteCard with map + geofence + per-site actions; SiteEditor with AddressAutocomplete + slider (extended later this session into a two-column layout with a live map preview).
- `createCustomer` auto-creates a Head-office site so single-site customers never see a "now add a site" step.
- Customer detail's old `Address & geofence` tab and the dead `AddressTab` component (~180 LOC) deleted.
- Four new event types — `customer.site_added` / `_updated` / `_deactivated` / `_reactivated` / `_deleted` — with labels in `EVENT_LABEL` and tones in `eventTone()`.

#### Stage 1B + 1C — shifts know their site, geofence uses site coords (`4a155f1`)

- Admin `ShiftRow` + mobile `ShiftWithMeta` types both gain a joined `site` block. Every `select(...)` for shifts pulls the site row.
- `/schedule/new`: site picker only renders for customers with >1 active site (single-site auto-resolves invisibly). Customers with 0 active sites surface a hard-error banner blocking Submit. The cartesian (dates × customers × reps) writes `site_id` per row.
- `/shifts/[id]/edit`: same picker pattern; ShiftPatch + sibling-create both pass `site_id`.
- `/schedule` calendar popover + `/shifts/[id]` detail header: show site name + address when it's not the default ("Head office" after this session's rename).
- Mobile dashboard up-next card, `/shifts` list rows, `/active` header all show the site name as a sublabel when not default.
- `/check-in` + `/check-out` `offsiteInfo` memo prefers `shift.siteLat` / `siteLng` / `siteGeofenceM`; falls back to legacy customer fields for pre-2026-05-08 rows. The haversine target is the **site**, so multi-site customers get the right geofence per shift.

#### Audit fixes round 1 (`6b6224d`)

Self-review found four issues:

- `updateSite` / `deactivateSite` / `deleteSite` weren't firing audit events. Each now reads name + customer_id before mutating, fires the right `event_type`, activity feed gets a row per change.
- `reactivateSite` was firing the generic `site_updated` instead of a dedicated event. Added `customer.site_reactivated` (label + warn tone).
- Mobile `DashboardMap` was pinning shifts at the **customer's** lat/lng — two shifts at different sites of the same customer would have collapsed onto one pin. Now prefers `shift.siteLat`/`Lng`; falls back to customer coords for legacy rows. Two shifts at the same customer but different sites correctly drop two separate pins.
- Mobile `shifts-store` had triple-union type artifacts (`Array<ShiftWithMeta|ShiftWithMeta|ShiftWithMeta>`) left over from a perl bulk-replace during the rollout. Collapsed.
- `customer.site_deleted` added to the **danger** tone group in `eventTone()` so deletes show red in the activity feed.

#### Migration FK type fix (`8e13ce5`)

- The first version of the customer_sites migration declared `customer_id uuid`. `customers.id` is actually a slug-style **text** key (e.g. `aria-cosmetics-x9f2`). Supabase rejected the FK with `42804: incompatible types: uuid and text`.
- Changed to `customer_id text` (matches `customer_tasks`, `library_files`, `shifts`, every other FK to customers).
- Whole migration wrapped in `BEGIN; … COMMIT;` so a partial apply can never leave the schema half-broken.
- Realtime `ALTER PUBLICATION supabase_realtime ADD TABLE` guarded by a `pg_publication_tables` check so re-running doesn't error with "relation already member".

#### Migration RLS posture aligned (`54ba85f`)

- The first version had stricter manager-only writes via `profiles.role = 'manager'`. That diverged from the rest of the schema (`customer_tasks`, `custom_fields`, `library_files` are all permissive `TO authenticated USING (true) WITH CHECK (true)` until Phase 4 tightens everything in one pass).
- Aligned: split into `customer_sites_select` / `_insert` / `_update` / `_delete` policies, all permissive for authenticated users. Phase 4 will tighten them along with every other table.

#### Head office Overview + live map preview + rename "Main" → "Head office" (`48d20a9`)

Three product feedback items in one push:

- **Overview tab is rich again.** Head office (the customer's primary site) renders prominently in its own card: map with live geofence circle, address, coords, geofence radius, plus a one-click "Edit" button that jumps to the Sites tab. Below, an "Additional sites" list appears only when the customer has more than one site — each row links to Sites for full CRUD. Single-site customers see only the head-office card and no noise.
- **SiteEditor is now a two-column layout.** Form on the left (name, address, geofence slider, contact section), live map preview on the right. Map updates as the manager picks an address from the autocomplete OR slides the geofence radius — geofence circle shown by default. The AddressAutocomplete is the same component `/customers/new` uses, so the type-to-search-then-pick flow is identical and the geocode-on-save fallback still kicks in if the manager skips the suggestions.
- **Auto-seeded site name renamed** from "Main" to "Head office" (the term Gary actually uses). Schema migration `2026_05_08_customer_sites_head_office.sql` renames any row still named "Main". The "show site only when not <default>" heuristic in 5 places (admin `/schedule` popover + `/shifts/[id]` header + mobile dashboard up-next + `/shifts` list rows + `/active` header) updated to compare against "Head office".

#### Per-site contact details (`9b501d1`)

- Migration `2026_05_08_customer_sites_contact.sql`: 4 nullable text columns added to `customer_sites` — `contact_name`, `contact_phone`, `contact_email`, `notes`. Idempotent.
- `lib/sites-store.ts` types extended (CustomerSite + NewSite + SitePatch).
- Mobile `ShiftSiteFields` gained `siteContactName` / `siteContactPhone` / `siteContactEmail` / `siteNotes`. Every shift `select()` (admin + mobile) pulls the contact columns.
- Admin SiteEditor adds a "Contact (optional)" section: name + phone (`type=tel`) + email (`type=email`) + access notes textarea.
- Admin SiteCard renders a contact block (tap-to-call/mailto in admin too) + an amber "Access notes" call-out.
- Admin Overview head-office card mirrors the same contact + notes block.
- Mobile `/active` shift screen: cyan "Call · phone" pill (tap-to-call) + Email button + amber Access notes block under the customer header.
- Mobile `/shifts` list expanded row: "Call site · contact name" tap-to-call pill + access notes block.
- Mobile `/check-in`: Call pill + access notes shown right under the customer header so a rep who's off-site or running late can call the contact in one tap to explain.

#### Migrations to run for May 8

Three new files in `db/migrations/` — run in order in the Supabase SQL editor before the May 8 features hit prod:

1. `2026_05_08_customer_sites.sql` — creates the table, FK on shifts, backfill, trigger, RLS, realtime
2. `2026_05_08_customer_sites_head_office.sql` — renames the auto-seeded `Main` rows to `Head office`
3. `2026_05_08_customer_sites_contact.sql` — adds the 4 contact columns

All three are idempotent and wrapped in `BEGIN; … COMMIT;` so failures roll back cleanly.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`).

### Today's session — what shipped (May 6, 2026)

Big day. Roughly in order:

- **Per-shift task completion log** + admin `/shifts/[id]` detail page (`a478033`)
- **KPI strip sparklines** computed from real 8-day shift history (`e677b9a`)
- **Sidebar nav** — Schedule renamed to "Schedule / Calendar"; Notifications marked SOON; schedule cards now show rep+customer+state and link to `/shifts/[id]` (`dca47c3`)
- **Custom fields** rendered on rep / task / library-file detail pages (`9e08777`)
- **Shifts table indexes** (`shift_date`, `(rep_id, shift_date)`, partial state, `customer_id`) + UTC date bug fix on `/schedule/new` + shared `lib/format.ts` (`12c0b2f`)
- **Settings split** into separate pages with shared `<SettingsShell>` + new Organisation page with logo upload (`7d654b3`)
- **Live Feed default tab** flipped to "All activity"; Needs Action gets a pulsing red badge + browser tab title alert (`9a1cbb1`)
- **`rep_locations` manager-delete RLS** so the orphan-cleanup sweep actually works (`16d8164`)
- **Schedule view toggle** Days / Reps + persisted in localStorage (`9a1cbb1`)
- **Editable scheduled shifts** at `/shifts/[id]/edit` with a server-enforced lock once in-progress (`a72d717`)
- **Mobile realtime everywhere** — shifts, library, active screen all auto-refresh; visibility refetch covers websocket suspension (`3b01ee2`, `75d6490`, `16bfec1`)
- **Reps + Customers list pages aligned** — shared toolbar shape, sortable columns, search, Grid/Table view toggle (`c6b2a5c`)
- **"Users" rename** in settings nav (route stays `/settings/managers`) (`a6f0383`)
- **Schedule grid bug** — `minmax(0, 1fr)` so a long address can't blow out neighbouring cells. Removed Requests from sidebar; Live Ops badge for pending requests live across every page (`58a8135`)
- **Topbar search** — live filter across reps / managers / customers / tasks with ⌘K + arrow nav (`049292f`)
- **Schedule/new smart default times** — clicking + Add on a day cell defaults start to "after the latest shift's end" or "next round hour" (today) or "09:00"; end = start+1h (`8727109`)
- **Three reports** at `/reports`: Operations Overview, Rep Performance leaderboard, Timesheet with CSV export. Includes `<KpiBig>`, `<LineChart>`, `<BarChart>`, `<DonutChart>` SVG primitives (`d964a29`, `3fa84b9`)
- **Activity tracking gaps closed** — task_started / task_completed / break_started / break_ended / travel_started / travel_ended event types, all wired from mobile `/active`. New `shifts.check_out_at` column with backfill (`735843f`)
- **Pending request count** — Sidebar pill flashes + tab title prefix; defence-in-depth refresh (realtime + visibility + 60s poll + nav). Today's shifts list also shows requests as rows (`608050f`)
- **Travel UI** — entry from `<UpNextCard>` Start/Stop, post-checkout `/summary` "What's next?" tiles, auto-end on next check-in. State persists in localStorage (`90e5765`)
- **Offline event queue** + active-task persistence + fix for "approved request stuck in Unscheduled" (`c4bd851`)
- **Check-in success page** rewired from static defaults to real data + animated celebration sequence (`f1fea66`, `ab36e4e`)
- **Multi-rep picker on Schedule/new** — `<RepScopePicker>` mirrors `<CustomerScopePicker>`; cartesian product expands by rep too (`1dd067d`)
- **End-of-day stabilisation** — final type-check + build + 18-route smoke test all clean. README rewritten as full handover doc (`893250e`)
- **Shift Complete cinematic** — 3-second one-shot animation on `/summary`: bouncy hero icon + 3 pulsing rings + stroke-drawn check + shimmer sweep + 36-particle brand-coloured confetti + staggered title/subtitle + cascading stat tiles with **easeOutCubic count-up numbers** + activity timeline draws line-by-line with dots popping in as it passes. Pure CSS + one tiny RAF count-up component. Respects `prefers-reduced-motion` (`ad08c62`)

### Migrations applied today (cloud status)

**All migrations through May 12 have been applied to the shared Supabase project.** Nothing pending. The lists below are kept as a record of what landed and when; each file is safe to re-run on a fresh Supabase environment.

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

### What the next chat should do first

Top of the queue (in priority order):

1. **Add `GOOGLE_ROUTES_API_KEY` to Vercel `morpheusta`** if Plan-my-day is going to real reps. Without it the `/route` page works but shows mock-data ETAs. See "Optional env vars" for the setup walkthrough.
2. **Add `CRON_SECRET` to Vercel `morpheus-admin` + `NEXT_PUBLIC_ADMIN_URL` to Vercel `morpheusta`** — Web Push phase 2 needs both:
   - `CRON_SECRET` on admin → any random hex string. Vercel Cron sends this as a Bearer token to authenticate the `/api/cron/shift-reminders` endpoint. Without it the cron returns 500.
   - `NEXT_PUBLIC_ADMIN_URL` on mobile → e.g. `https://morpheus-admin.vercel.app`. Mobile's `notifyManagersOfAttention()` POSTs cross-origin to this URL when a rep raises an unable-to-attend flag.
3. **Phase 4 RLS** — still the highest production blocker. Locks down the database against malicious-rep API access. See the deferred list below for the threat model.
4. **Capacitor wrap** only if background GPS becomes a priority. Push alone doesn't need it.
5. **Custom report builder** if reporting is the priority.

Recently cleared (May 13):
- ✅ **Web Push phase 2 shipped** — scheduled "Running late" + "EOD checkout" reminders (Vercel Cron every 5 min) and manager broadcast pushes when a rep raises an unable-to-attend flag. See "Web Push notifications" section below.
- ✅ **Web Push v1 shipped** (rep notifications for shift assigned / reassigned / cancelled). See dedicated section below.
- ✅ "Plan my day" renamed to "Route" + icon-only status pill on `/shifts` so the page stops shouting wordy "Optimized · 2:42 PM" when there's nothing to act on.
- ✅ All May 7 / 11 / 12 migrations applied to Supabase.
- ✅ `saveShiftOrder` atomicity — order + meta now written in one `setItem` (v2 payload in `lib/shift-order-store.ts`, with v1 read fallback for one release).
- ✅ Home segmented pill — "Day complete" calm state mirrors `/shifts`; pill no longer shouts "Plan route" when the celebration card is showing.
- ✅ `qa/QA_PLAN.md` already refreshed (May 12) — `/check-in/success` + `/summary` are documented as dead routes, `M-CHECKOUT-OK` asserts the new "routes to `/`" behaviour.

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
- EOD_BUFFER_MINUTES is a constant (30) — could be promoted to `app_settings` if managers want to tune it.

The May 11 "calendar — add second shift to occupied slot" ask
shipped on May 12 (commits `adc7ed6`, `8197bf1`, `2bf4e8a`): the
quick popover now has "Add another here" + "Edit here" inline
actions alongside Delete + Full edit. ✅

Open the `/reports` hub to see what works visually, the Timesheet report to see how the events log + new `check_out_at` column come together for payroll, and `/schedule/new` to see the multi-rep × multi-customer × recurrence pattern.

### One critical env var on top of the standard ones

The user-CRUD server route (`/api/users`) needs the Supabase **service-role key** (sometimes shown as `sb_secret_*` in newer Supabase dashboards). Without it, Add User / Edit User / Delete User return a 500 with a helpful error.

In Vercel (admin project only):
```
SUPABASE_SERVICE_ROLE_KEY = sb_secret_…   (mark as Sensitive)
```
Already added to **production**, **preview**, **development** for `morpheus-admin` on Gary's account. **Do not** prefix with `NEXT_PUBLIC_` — that would ship the key to the browser. **Never** commit this key to git.

For local dev on a new machine, add the same line to `morpheus-admin/.env.local` (gitignored).

### You do NOT need to run any migration on the new machine

Schema lives on the shared Supabase project, code lives on GitHub. Just clone + `npm install` + `npm run dev` on each app. The migration files in `db/migrations/` are kept for the historical record + brand-new Supabase environment setup.

**Migrations applied to the shared Supabase project** (DO NOT re-run on a new machine — they're already in the cloud; safe to re-run if you ever spin up a fresh DB). Listed in chronological order:

| File in `db/migrations/` | What it does |
|---|---|
| `2026_05_05_app_settings.sql` | Key/value table for grace periods, org settings, etc |
| `2026_05_05_custom_fields.sql` | `custom_fields` definitions + `custom_field_values` polymorphic store |
| `2026_05_05_customer_tasks.sql` | `customer_tasks` table |
| `2026_05_05_customer_tasks_nullable.sql` | Makes `customer_tasks.customer_id` nullable (universal tasks) |
| `2026_05_05_customers_active_flag.sql` | `customers.active` boolean (soft-delete) |
| `2026_05_05_customers_address_geo.sql` | `customers` gains `address`, `latitude`, `longitude` |
| `2026_05_05_customers_geofence.sql` | `customers.geofence_radius_m` (per-customer override) |
| `2026_05_05_default_geofence_radius.sql` | Seeds `default_geofence_radius_m = 100` in app_settings |
| `2026_05_05_handle_new_user_role.sql` | Trigger reads `role` from signup metadata (mobile=rep, admin=manager) |
| `2026_05_05_library.sql` | `library_files` table + Storage bucket "library" + RLS |
| `2026_05_05_library_files_category.sql` | `library_files.category` + UPDATE policy |
| `2026_05_05_library_multi_customer.sql` | Swaps `library_files.customer_id` for `customer_ids text[]` |
| `2026_05_05_profiles_admin_update.sql` | Opens profiles UPDATE so admin Promote/Demote works |
| `2026_05_05_rep_customer_assignments.sql` | Rep ↔ customer many-to-many join table |
| `2026_05_05_rep_locations.sql` | `rep_locations` table + RLS + Realtime publication |
| `2026_05_05_rep_locations_self_delete.sql` | DELETE policy so check-out clears the dot |
| `2026_05_05_requested_shifts_admin_access.sql` | Opens SELECT/UPDATE/DELETE on `requested_shifts` so admin can see + handle |
| `2026_05_05_requested_shifts_realtime.sql` | Adds `requested_shifts` to the `supabase_realtime` publication |
| `2026_05_05_shift_events.sql` | Central activity log + RLS + Realtime + indexes |
| `2026_05_05_shifts_realtime.sql` | Adds `shifts` to the `supabase_realtime` publication |
| `2026_05_06_library_files_realtime.sql` | Adds `library_files` to Realtime so mobile /library auto-updates |
| `2026_05_06_organisation.sql` | `organisation_name` + `organisation_logo_url` keys + public `org_assets` Storage bucket |
| `2026_05_06_rep_locations_manager_delete.sql` | Manager-can-delete-any-row policy so the orphan-cleanup sweep works |
| `2026_05_06_shift_task_completions.sql` | Per-shift task completion log (which tasks the rep ticked off, when) |
| `2026_05_06_shifts_check_out_at.sql` | Adds `shifts.check_out_at` column + backfills from events log |
| `2026_05_06_shifts_indexes.sql` | Hot-path indexes on shifts + requested_shifts (perf — was missing) |
| `2026_05_07_custom_fields_organisation.sql` | Extends `custom_fields.applies_to` CHECK to include `'organisation'` |
| `2026_05_07_shifts_series_id.sql` | Nullable `shifts.series_id uuid` + partial index for grouped series edits |
| `2026_05_08_customer_sites.sql` | `customer_sites` table + `shifts.site_id` FK + backfill + RLS + realtime |
| `2026_05_08_customer_sites_head_office.sql` | Renames auto-seeded `Main` rows to `Head office` |
| `2026_05_08_customer_sites_contact.sql` | Adds `contact_name` / `contact_phone` / `contact_email` / `notes` columns |
| `2026_05_11_shifts_attention.sql` | "Can't make this shift" overlay — `attention` / `attention_reason` / `attention_note` / `attention_raised_at` / `attention_resolved_at` / `attention_resolved_by` columns on `shifts` |
| `2026_05_11_shifts_attention_resolution.sql` | `attention_resolution` column for the rep-feedback pill after manager actions |
| `2026_05_11_shifts_notes.sql` | `shifts.rep_notes text` — per-shift freeform rep notes |
| `2026_05_11_profile_avatars.sql` | `profiles.avatar_url text` — base64 data URL for rep profile photos |
| `2026_05_11_exception_toggles.sql` | Per-customer override columns for location + timing check-in exceptions |
| `2026_05_11_perf_indexes.sql` | Hot-path indexes — `shift_events.shift_id`, `profiles.role`, `rep_locations.rep_id`, `customer_sites.active` |
| `2026_05_11_customers_logo.sql` | `customers.logo_url text` — per-customer logo (base64 JPEG) |
| `2026_05_12_customer_contacts.sql` | `customer_contacts` table — multi-contact support per customer + role-based RLS template |
| `2026_05_12_shifts_claim_radius.sql` | `shifts.claim_radius_m integer` — per-shift override for claimable-shift distance filter |
| `2026_05_12_shifts_flexible_time.sql` | `shifts.is_flexible_time boolean` — "Anytime today" scheduling |

### Engineering review · 2026-05-11 (handoff for the senior engineer)

A focused engineering pass landed late on May 11 (`b2a9e30`) ahead of
senior-engineer review. Some items were shipped, the rest are
documented here with concrete starting points so the senior engineer
can pick them up cold.

#### What landed in the engineering pass (commit `b2a9e30`)

- **Four missing hot-path indexes** in `db/migrations/2026_05_11_perf_indexes.sql`:
  `shift_events.shift_id` (partial NOT NULL), `profiles.role`,
  `rep_locations.rep_id`, `customer_sites.active`. Idempotent +
  transactional; safe to re-run.
- **Realtime channel-name collision fixed** in
  `lib/rep-locations-store.ts` — `subscribeRepLocations` was using a
  hardcoded `"rep_locations_live"` channel name so two simultaneous
  subscribers silently shared one channel. Now uses
  `Date.now()`+counter suffix like every other subscriber in the codebase.
- **Realtime subscriptions added** for `/reps` and `/customers` list
  pages. Both were mount-only fetches; a concurrent admin's edits
  showed stale data until a manual refresh. New `subscribeProfiles()`
  and `subscribeCustomers()` helpers in their respective stores.
- **Duplicate utilities deduplicated.** 9 copies of `deriveInitials`,
  3 copies of `formatTimeRange`, and 2 copies of `timeToMin`/`minToTime`
  collapsed into shared exports in `lib/format.ts`. `schedule/page.tsx`'s
  `deriveInitials` was dead code, removed entirely.
- **Bounded query** for `getCheckoutTimesForShifts` in
  `lib/events-store.ts` — was relying on PostgREST's 1000-row default
  ceiling; now caps at `max(50, shiftIds.length × 4)` so a buggy
  shift with many checkout events can't crowd out the others.

#### Documented findings for the senior-engineer review

The audit surfaced a handful of items that need a dedicated session
each, with risk of regression too high to do under time pressure.
Listed with file paths + suggested approaches so they can be picked
up cold:

**Architecture / scaling**

1. **`listProfiles()` is called from ~5 components independently per
   page render** on the Live Ops home (KpiStrip + ShiftsList +
   LiveFeedPanel + TopBar typeahead + …). Each component fetches the
   full profile list. The fix is a page-level context (or a swr-style
   cache) that fetches once and shares — but it's a multi-file
   plumbing change with real regression risk. Worth doing the moment
   the user count climbs past ~50 reps.
2. **DB row shapes leak into UI code.** Components reference
   `shift.start_time`, `shift.shift_date`, `s.customer_id` directly,
   so any DB-side rename ripples through the entire component tree.
   The fix is a mapper layer at every `lib/*-store.ts` boundary that
   returns a domain shape with camelCase fields. Already done
   partially in `lib/shifts-store.ts` (mobile) which has
   `ShiftWithMeta`. Apply the same pattern elsewhere.
3. **`shifts.customer_id` may not have an enforced FK** to
   `customers(id)`. The base shifts table is older than the
   `db/migrations/` directory so the constraint isn't tracked here.
   Check `\d+ public.shifts` in the Supabase SQL editor; if missing,
   add a `FOREIGN KEY (customer_id) REFERENCES customers(id)` migration
   alongside Phase 4 RLS.
4. **Soft-delete inconsistency** across the schema:
   - `customers`, `customer_sites` use `active boolean`
   - `shifts` uses `state='cancelled'` (state machine)
   - everything else hard-deletes
   Pick a convention and apply it. The state-machine version on
   shifts is the right choice for that table (audit trail); for
   library_files and tasks consider adding `deleted_at timestamptz`
   so the activity log isn't broken by cascade deletes.
5. **`app_settings` table has no `created_at` column** — only
   `updated_at`. Trivial migration, useful for future "when did the
   org first configure X?" reports.

**Big files that would benefit from extraction**

The user-visible behaviour is correct, but the following modules are
large enough that onboarding a new dev means reading a lot of inline
code per page. None of these are urgent — extract sub-components
opportunistically the next time a feature touches them. Listed
biggest first:

- `morpheus-admin/app/schedule/page.tsx` — **2,621 lines.** Calendar +
  drag-drop + lane allocator + day-summary chip + day-detail panel +
  edit popover. Suggested extraction:
    `components/schedule/DaysCalendar.tsx` (the grid)
    `components/schedule/DayColumn.tsx` (per-column logic)
    `components/schedule/DraggableShiftCard.tsx` (the card)
    `components/schedule/DaySummaryChip.tsx` + `DayDetailPanel.tsx`
    `lib/schedule/lanes.ts` (assignLanes + cluster logic)
- `morpheus-mobile/app/page.tsx` — **2,052 lines.** Dashboard +
  UpNextCard + BreakOrTravelCard + WelcomeStrip + map embed. Suggested:
    `components/dashboard/WelcomeStrip.tsx`
    `components/dashboard/UpNextCard.tsx`
    `components/dashboard/BreakOrTravelCard.tsx`
- `morpheus-admin/app/schedule/new/page.tsx` — **1,643 lines.** The
  cartesian-product form. The CustomerContextChips + TimeSelect
  helpers can move out cleanly.
- `morpheus-mobile/app/active/page.tsx` — **1,539 lines.** Task sheet +
  shift notes + break/travel state — TaskSheet is already its own
  component; `ShiftNotesCard` would extract cleanly.
- `morpheus-admin/components/screens/live-ops/LiveFeedPanel.tsx` — **1,410 lines.**
  Live feed + needs-action panel + reassign modal. Split the
  reassign modal into its own file.

**Security**

- **Phase 4 RLS is still the top open item** (see item 3 below). All
  tables currently `USING (true)` for authenticated users; the apps
  enforce role at the UI but not at the DB. A motivated rep with
  Supabase credentials could write any table.

**Lower-priority quality items (left alone deliberately)**

- 82 `console.log` / `console.warn` calls across stores. Most are
  intentional error reports (`// eslint-disable-next-line no-console`)
  but worth swapping for a `logger.warn(...)` abstraction that strips
  in prod.
- 11 empty `catch {}` blocks in the admin app. Most are graceful
  degradations on optional storage / geocoding paths. Add inline
  comments to each so the senior engineer can verify intent.
- 15 files write `window.localStorage` directly — worth a
  `lib/storage.ts` typed wrapper.
- No `<ErrorBoundary>` at the layout level on either app.

**What was NOT touched (with reasons)**

- **Big file refactors above.** They're listed not because they're
  broken but because they're large. Refactoring 2.6k lines of
  drag-drop calendar code under time pressure is the fastest way to
  introduce regressions; deferred to the senior engineer or to a
  feature-driven extraction.
- **`listProfiles` page-level cache.** Would touch 5+ files and
  every existing test/QA hook to thread context. Senior engineer
  pick.
- **Phase 4 RLS.** Already #1 on the deferred list. Needs a single
  coordinated migration + staging-Supabase test pass, not a quick fix.
- **Resizable table columns** on `/reps`, `/customers`, `/tasks`,
  `/library`. Currently the four list tables use a fixed
  `gridTemplateColumns` string per page. Making them drag-resizable
  cleanly needs:
  • per-column width state with a stable key per table (e.g.
    `morpheus.reps_table_widths.v1`)
  • a `<ResizableHeader>` primitive in `components/ui/` exposing a
    drag handle on the right edge of every non-last column
  • pointer-down/move/up handlers honouring touch vs mouse, min/max
    widths per column, and the sort-button shouldn't trigger drag
  • a small `useColumnWidths(tableKey, defaults)` hook that returns
    a memoised `gridTemplateColumns` string + a renderHandle helper
  Roughly a half-day of focused work + per-page replacement. I
  considered shipping a pilot on `/reps` only but the inconsistency
  (one table resizable, three not) would feel worse than uniformly
  fixed-width while waiting for the proper feature.

  My recommendation: use `@tanstack/react-table` for this. It
  handles resize, sort, filter, virtualization in one consistent
  API, and four list pages × four concerns means the table library
  pays for itself on the first table.

---

**Top of the deferred list — pick any one and run with it next session:**

1. ~~**Cancellation / unable-to-attend flow**~~ ✅ SHIPPED May 11 — see "Today's session — what shipped (May 11)" above. Eight commits across Stage 2A + 2B; attention overlay model rather than state-machine expansion. Migrations `2026_05_11_shifts_attention.sql` + `_resolution.sql`.
2. **Real routing + traffic** ⚠️ THE BIG ONE (now top of the actually-deferred list). Server-proxied Google Routes API for ETAs + optimization. Mobile `/route` page with deep links to Google Maps for actual nav. Risk pills per leg ("Leave by 13:50"). Site-aware (already works post-May-8 since shifts have site coords). Cap spending with per-rep daily quotas. ~$10/month at full scale. 3 commits to ship the foundation; Google API key wired later as a flip-on.
3. **Phase 4 RLS — security debt** ⚠️ HIGHEST PRIORITY before opening to real users. Every table is currently `TO authenticated USING (true)`. Reps and managers have the same DB write powers; the apps gate by role at the UI but the DB doesn't. A motivated rep could `curl` Supabase directly and modify customers / shifts / tasks / library files / app_settings / profiles. The path: write a single coordinated migration that uses an `is_manager()` SECURITY DEFINER helper and rewrites every table's policies. `customer_sites` already follows the permissive Phase-pre-4 pattern so it'll tighten alongside everything else. Test in a staging Supabase first. Note: `profiles` UPDATE was deliberately opened for promote/demote AND avatar uploads (May 11) — narrow that too.
4. **Capacitor wrap** for proper background GPS + push notifications. Browsers don't expose persistent background geolocation, so the rep app can only track location while `/active` is foregrounded. Wrapping the existing React app in Capacitor (1-2 weeks) gives: real background location, push notifications, App Store / Play Store presence. The codebase doesn't change much — replace `navigator.geolocation` calls with `@capacitor/geolocation` (same API), plus shell config + permission requests.
5. **Custom report builder.** The 3 fixed reports (Operations / Rep performance / Timesheet) are good but the user wanted "users can build their own". Picture: a builder UI where a manager picks metrics, dimensions, filters, and a chart type, then saves. Multi-week project — needs builder UI + query AST + saved-report storage + per-user permissions on saves.
6. **Background sweep (`pg_cron`).** Today `sweepStaleShifts()` only runs when an admin opens the Live Ops home or focuses the tab. If no admin opens for several days, stale shifts and orphan rep_locations rows accumulate. Either a Vercel Cron route hitting `/api/sweep` or a Postgres `pg_cron` job (cleaner). 1-hour task.
7. **Error monitoring.** Drop in Sentry or Vercel Analytics before user count grows past ~10. You're flying blind on prod errors right now. ~30 minutes of work, saves a lot of guessing.
8. ~~**Push notifications via Web Push.**~~ ✅ SHIPPED May 13 — see "Web Push notifications (shipped May 13)" section above. Foundation + assigned/reassigned/cancelled triggers. Phase 2 follow-ups (late/EOD reminders, manager-side pushes) deferred.
9. **Email confirmation** turned back on for production self-signups. Admin-created users are already auto-confirmed.
10. **Tests.** Skeleton already in `qa/` (May 7). Run the Playwright suite against a non-prod Supabase project (needs you to create one + seed an admin/rep user) and start filling in the high-priority spec files from `qa/QA_PLAN.md`.

**Smaller cleanups that didn't make the cut today:**
- ~~9 `deriveInitials` + 3 `formatTimeRange` + 2 `timeToMin/minToTime` duplicates~~ ✅ **Deduplicated in `b2a9e30`** (engineering pass) — all now use shared exports from `lib/format.ts`.
- 5 page files >900 LOC (`customers/[id]/page.tsx`, `mobile/active/page.tsx`, `mobile/check-in/page.tsx`, `schedule/page.tsx`, `settings/managers/page.tsx`). They build fine but onboarding a new dev means reading a lot of inline code per page. Extract sub-components opportunistically when adding features. **See "Engineering review · 2026-05-11" above for the specific extraction plan per file.**
- `mock-data.ts` is now misleadingly named in both apps — only contains type definitions + (admin) `NAV_ITEMS`. Rename to `nav.ts` (admin) and merge mobile's into a shared types file.
- No `<ErrorBoundary>` at the layout level. A page that throws crashes the whole shell to Next's overlay. Adding one would give a graceful "Something went wrong" card.

See the full **Done vs Deferred** sections further down for detail.



### What's already in the cloud (no setup needed)

| What | Where |
|---|---|
| Source code | https://github.com/gazzad5565/morpheusta |
| Live admin app | https://morpheus-admin.vercel.app |
| Live mobile app | https://morpheusta-khaki-omega.vercel.app |
| Database + auth | https://supabase.com/dashboard/project/otweltzwwhrvhtvaqsci |
| Hosting dashboard | https://vercel.com/gazzad-5313s-projects |

If you just want to **use** the apps from another device, open the URLs above in any browser. Nothing to install.

The rest of this section is only for when you want to **edit code or run a local dev server** from a new machine.

### One-time tools to install

1. **Node.js 20+** — https://nodejs.org/ (download the LTS version, install with defaults)
2. **Git** — https://git-scm.com/ (preinstalled on Mac if you've ever opened Terminal)
3. **A code editor** (optional but easier than nothing) — https://code.visualstudio.com/ or https://cursor.sh/

To check it all worked, open Terminal and run:
```bash
node --version    # should print v20.x or higher
git --version     # should print git version 2.x
```

### One-time account auth on the new machine

You'll only do each of these once per machine:

**GitHub** (so you can push code changes):
- Easiest path: install GitHub CLI from https://cli.github.com/ then run `gh auth login` and follow the browser prompts.
- Alternative: generate a Personal Access Token (classic) at github.com → Settings → Developer settings → Personal access tokens, tick the `repo` scope, and paste it when git asks for a password on first push.

**Vercel** (so you can deploy from the command line):
```bash
npx vercel login
```
Opens a browser for auth. You'll need access to the email on the Vercel account.

**Supabase** — just sign in at https://supabase.com/dashboard. No CLI needed for our day-to-day work; everything's done via the SQL Editor or auto from the apps.

### Clone + first run

Copy-paste this whole block into Terminal (it sets up both apps):

```bash
# Pick a folder for the project — adjust if you want it elsewhere
cd ~                                              # your home folder
git clone https://github.com/gazzad5565/morpheusta.git
cd morpheusta

# --- Mobile app ---
cd morpheus-mobile
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://otweltzwwhrvhtvaqsci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_w5trpMP3bFT4oCkFssbfIg_3W7W6oVd
EOF
npm install

# --- Admin app ---
cd ../morpheus-admin
cat > .env.local <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://otweltzwwhrvhtvaqsci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_w5trpMP3bFT4oCkFssbfIg_3W7W6oVd
EOF
npm install

cd ..
echo "Done. To run:"
echo "  cd morpheus-mobile && npm run dev    # http://localhost:3000"
echo "  cd morpheus-admin && npm run dev     # http://localhost:3001 (likely)"
```

That's it — both apps are ready to run.

> ⚠️ The Supabase URL + anon key are designed to be public (the anon key is meant to be embedded in browser code). Security comes from the Row Level Security policies in Supabase, not from key secrecy. Don't commit the `.env.local` files regardless — they're gitignored.

### Starting a fresh AI chat for help

AI conversations (Claude, ChatGPT, etc.) don't follow you across devices or sessions. When you start a fresh chat to keep working on this project, give the AI context like this:

1. Paste the GitHub URL: `https://github.com/gazzad5565/morpheusta` and ask the AI to read the README.
2. **Or** paste this README's full content into the first message.
3. Then tell it what you want to do today, e.g. *"I want to add a check-out button to the mobile app"*.

This README is designed to be a **complete handover** — read it cold and you should know what the project is, how it's structured, what works, and what's left. If anything's unclear or out of date, fix the README and push.

### Account access checklist (for handing off to a developer)

If you onboard a dev, they'll need:

| Service | What to do |
|---|---|
| GitHub repo | Add them as a collaborator: Settings → Collaborators → Add people |
| Vercel projects | Vercel team → Settings → Members → Invite (both `morpheus-admin` and `morpheusta` projects) |
| Supabase project | Supabase → Project Settings → Team → Invite |
| Env vars | They're in Vercel already; no need to share |

### Required env vars (both apps), reference

```
NEXT_PUBLIC_SUPABASE_URL=https://otweltzwwhrvhtvaqsci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_w5trpMP3bFT4oCkFssbfIg_3W7W6oVd
```

These are also stored in Vercel (Settings → Environment Variables for each project). Local + Vercel must stay in sync — if you rotate the anon key in Supabase, update both places.

### Optional env vars

**`GOOGLE_ROUTES_API_KEY`** (mobile app, server-side only — do NOT prefix with `NEXT_PUBLIC_`)

Enables traffic-aware route planning on the mobile `/route` page via the Google Routes API (Compute Routes v2, `TRAFFIC_AWARE` preference). When set, `/api/route/plan` calls Google for ETAs, distances, and encoded polylines; when unset, the route falls back to a mock provider that estimates from haversine distance × 1.4 winding × 30 km/h urban average. The mock is fine for UX testing and demos; switch to the real key before reps rely on the ETAs in the field.

Get a key from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), enable the **Routes API**, and add it to:
- `morpheus-mobile/.env.local` for local dev
- Vercel → `morpheusta` project → Settings → Environment Variables for prod

Pricing: ~$5 per 1k requests after the $200/mo free tier. With the rep planning their day 1–3× and a 5-minute client-side cache (see `lib/route-planner.ts`), a small team stays well under the free tier. Cache invalidation: tap Refresh on `/route`, or call `clearRouteCache()` from code when shift data changes.

---

## Architecture

### Apps talk to Supabase, not each other

Neither app calls the other directly. Both read/write Supabase. When a manager creates a customer in admin, mobile sees it next time it fetches the customer list.

### Each user signs up once, works in both

Supabase Auth is shared. The same email/password works in admin and mobile.

A `profiles` row is auto-created on signup via a Postgres trigger (`handle_new_user()`) that fires on `auth.users` INSERT. The profile carries `name` (display name, optional) and `role` (`'rep'` | `'manager'`, default `'rep'`). The role field exists but **isn't yet enforced by RLS** — that's the Phase 4 tightening (see Deferred). Today, "manager-only" actions are gated by what UI they have access to, not the database.

### Routing

Both apps use Next.js App Router. Each folder under `app/` is a route. `page.tsx` is the page, `layout.tsx` is shared chrome.

Example: `app/shifts/page.tsx` renders at `/shifts`. `app/customers/[id]/page.tsx` renders at `/customers/abc123` with `id="abc123"`.

### Auth gate

Both apps wrap their layout in an `<AuthGate>` (client component). On every route except `/login`:

1. Read Supabase session from localStorage.
2. If no session → redirect to `/login`.
3. If session → render the page.

`/login` itself does the inverse: if you're already logged in, it bounces you to `/`.

### Logout

Logout calls `supabase.auth.signOut({ scope: "global" })` (invalidates the JWT server-side), then forces a full page reload via `window.location.href = "/login"`. Don't use `router.replace()` for logout — auth state propagation through Next's router is unreliable.

---

## Database (Supabase)

### Current schema

```sql
-- customers (Phase 3a + 3e, all authenticated users can read/write)
customers {
  id            text PRIMARY KEY    -- e.g. 'gw' or generated slug
  name          text                -- e.g. 'GreenWave Innovations'
  initials      text                -- 2-3 chars
  color         text                -- hex
  code          int                 -- account number
  region        text NULL
  city          text NULL
  address       text NULL           -- full street address (Nominatim-resolved)
  latitude      double precision NULL  -- decimal degrees, used by the field map
  longitude     double precision NULL
  active        boolean DEFAULT true   -- soft-delete flag; INACTIVE rows hidden from map + lists by default
  created_at    timestamptz
}

-- requested_shifts (Phase 3b, scoped per-user)
-- Rep-initiated requests for an unscheduled shift; admin approves later.
requested_shifts {
  id                 text PRIMARY KEY  -- composite '{userId}-{customerId}'
  customer_id        text
  customer_name      text
  customer_initials  text
  customer_color     text
  customer_code      int
  rep_id             uuid → auth.users  -- DEFAULT auth.uid()
  status             text DEFAULT 'pending'
  requested_at       timestamptz
}

-- shifts (Phase 3c, the real shifts table)
-- Manager-scheduled shifts. rep_id is nullable: NULL = claimable by any rep.
shifts {
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  customer_id   text → customers
  rep_id        uuid → auth.users NULL    -- NULL = claimable
  shift_date    date
  start_time    time
  end_time      time
  distance_label text NULL                -- e.g. "2.4 mi"
  state         text DEFAULT 'scheduled'  -- scheduled | in-progress | complete | late
  check_in_at   timestamptz NULL          -- stamped on rep check-in
  tasks_done    int DEFAULT 0
  tasks_total   int DEFAULT 4
  created_at    timestamptz
}

-- customer_tasks (Phase 3g, admin-managed task templates)
-- Each row is one task. customer_id NULL = universal (applies to ALL
-- customers); a specific UUID = applies only to that customer. Multi-
-- customer tasks are stored as N rows (one per selected customer) at
-- create time.
customer_tasks {
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
  customer_id  text NULL → customers   -- NULL = universal
  name         text NOT NULL
  description  text NULL
  duration_min int DEFAULT 10
  compulsory   boolean DEFAULT false
  sort_order   int DEFAULT 0
  created_at   timestamptz
}

-- library_files (Phase 3h, shared file storage metadata, multi-customer)
-- Pairs with the "library" Supabase Storage bucket — the file binary lives
-- in storage, this table holds the friendly name, size, customer associations
-- (an array — NULL/empty = "shared with all"), and a free-form category.
library_files {
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  name          text NOT NULL
  storage_path  text NOT NULL UNIQUE   -- key inside the "library" bucket
  size_bytes    bigint NULL
  mime_type     text NULL
  category      text NULL              -- 'Documents','Photos','Training', etc
  customer_ids  text[] NULL            -- NULL or [] = shared with all
  uploaded_by   uuid → auth.users
  uploaded_at   timestamptz
}

-- rep_customer_assignments (Phase 3i, many-to-many rep ↔ customer)
-- Editable from both /reps/[id] and /customers/[id] via the same join table.
rep_customer_assignments {
  rep_id      uuid → auth.users
  customer_id text → customers
  assigned_at timestamptz
  PRIMARY KEY (rep_id, customer_id)
}

-- custom_fields (Phase 3j, admin-defined fields per entity)
-- "applies_to" picks which entity the field attaches to. "field_type"
-- picks the data type. "options" only used for select fields.
custom_fields {
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
  applies_to  text CHECK (applies_to IN ('customer','rep','shift','task','library_file'))
  name        text NOT NULL
  field_type  text CHECK (field_type IN ('text','longtext','number','date','boolean','select'))
  options     text[] NULL          -- only for select
  required    boolean DEFAULT false
  sort_order  int DEFAULT 0
  created_at  timestamptz
}

-- custom_field_values (Phase 3j, the actual per-entity data)
-- Polymorphic — only one of the value_* columns populated per row,
-- chosen based on the field's type. (field_id, entity_id) is the PK.
custom_field_values {
  field_id     uuid → custom_fields ON DELETE CASCADE
  entity_id    text                      -- the customer/rep/shift/etc id, as text
  value_text   text NULL
  value_number numeric NULL
  value_date   date NULL
  value_bool   boolean NULL
  updated_at   timestamptz
  PRIMARY KEY (field_id, entity_id)
}

-- customers gained: geofence_radius_m (Phase 3k, default 100m).
-- Editable on /customers/[id] Address tab.

-- shift_events (Phase 3l, central activity log)
-- Immutable append-only feed of meaningful actions. Both apps write to
-- it via logEvent(); the admin Live Feed reads + subscribes via
-- subscribeEvents(). On the supabase_realtime publication.
shift_events {
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
  event_type  text NOT NULL          -- 'shift.scheduled', 'shift.checked_in', …
  actor_id    uuid NULL              -- the auth.users.id who did it
  actor_label text NULL              -- snapshotted display name at event time
  shift_id    uuid NULL → shifts ON DELETE SET NULL
  customer_id text NULL → customers ON DELETE SET NULL
  message     text NULL              -- pre-rendered display string
  meta        jsonb NULL             -- arbitrary extras
  created_at  timestamptz
}

-- profiles (Phase 3d, auto-populated on signup)
-- One row per auth.users row. Trigger handle_new_user() inserts on signup.
profiles {
  id          uuid PRIMARY KEY → auth.users
  email       text
  name        text NULL                   -- display name (greeting on dashboard)
  role        text DEFAULT 'rep'          -- 'rep' | 'manager'
  created_at  timestamptz
}

-- rep_locations (Phase 3f, live GPS for the field map)
-- One row per rep, upserted from morpheus-mobile's location-tracker while
-- the active-shift screen is open. Realtime publication enabled so the
-- admin map can subscribe to live position changes.
rep_locations {
  rep_id      uuid PRIMARY KEY → auth.users  -- ON DELETE CASCADE
  latitude    double precision
  longitude   double precision
  accuracy_m  int NULL
  recorded_at timestamptz DEFAULT now()
}
```

### Row Level Security (RLS)

Every table has RLS on. The current policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `customers` | any authenticated | any authenticated | any authenticated | any authenticated |
| `requested_shifts` | any authenticated (admin inbox) — was rep-only in 3b | `rep_id = auth.uid()` | any authenticated (admin marks/clears requests) | any authenticated (admin clears after handling) |
| `shifts` | any authenticated (admin needs to see all) | any authenticated | `rep_id = auth.uid()` OR `rep_id IS NULL` (rep updates own + claims unassigned) | any authenticated |
| `profiles` | any authenticated | (trigger only) | `id = auth.uid()` (own row only) | (none) |
| `rep_locations` | any authenticated (admin map reads all) | `rep_id = auth.uid()` (own row only) | `rep_id = auth.uid()` (own row only) | `rep_id = auth.uid()` (own row only — used on check-out to clear the dot) |
| `customer_tasks` | any authenticated | any authenticated | any authenticated | any authenticated |
| `library_files` | any authenticated | any authenticated | any authenticated (used by `/library/[id]/edit` to change name / category / customer) | any authenticated |
| Storage `library/*` | any authenticated | any authenticated | (n/a) | any authenticated |
| `rep_customer_assignments` | any authenticated | any authenticated | (none — composite PK is immutable; delete + insert) | any authenticated |
| `custom_fields` | any authenticated | any authenticated | any authenticated | any authenticated |
| `custom_field_values` | any authenticated | any authenticated | any authenticated | any authenticated |
| `shift_events` | any authenticated | any authenticated | (none — immutable) | any authenticated |

> ⚠️ Most policies are **temporary Phase 3** — they let any logged-in user perform most actions. In production, these would be tightened to "manager role only" for customers/shifts insert+delete once we add role-based access control. See "Deferred work" below.

### How to run new SQL

We have a **lightweight migrations folder** but no automated runner yet — files in `db/migrations/` are the canonical SQL for every schema change, and they're applied by hand against Supabase.

To change schema:

1. Add a new file under `db/migrations/`, named `YYYY_MM_DD_<short_description>.sql`. Use `IF NOT EXISTS` / `IF EXISTS` so the file is safe to re-run.
2. Open Supabase dashboard → SQL Editor → paste the file's contents → Run.
3. Mirror the schema change in this README's Database section.
4. Commit the migration file alongside the code that depends on it.

When >1 dev or staging environments arrive, promote this to the [Supabase migrations CLI](https://supabase.com/docs/guides/cli/local-development#database-migrations) so migrations are applied automatically and tracked.

---

## Auth flow

### Signup

1. User opens `/login`, taps "Create an account"
2. Types email + password (≥6 chars)
3. Submitted to Supabase Auth (`supabase.auth.signUp`)
4. Email confirmation is OFF, so user is logged in immediately
5. AuthGate sees session, redirects to `/`

### Login

Same screen, "Log in" mode by default. `supabase.auth.signInWithPassword` returns a JWT. Stored in localStorage by the Supabase client. Persists across page reloads.

### Where the JWT lives

Browser localStorage, key `sb-otweltzwwhrvhtvaqsci-auth-token`. Auto-refreshed before expiry by the Supabase client.

### Why no email confirmation

Disabled in Supabase → Authentication → Providers → Email → "Confirm email" is OFF. Lets us iterate fast. Turn back on for production.

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

## Common tasks

### Add a new page to one of the apps

Drop a folder under `app/`. Example: a "Reports v2" page in admin:

```bash
mkdir morpheus-admin/app/reports-v2
# Create morpheus-admin/app/reports-v2/page.tsx with a default export React component
```

Routes are filesystem-based. The component renders at `/reports-v2`.

### Add a database table

1. Write the SQL (table + RLS policies). See `requested_shifts` SQL for a template.
2. Run it in Supabase → SQL Editor.
3. Document it in this README's Database section.
4. Create a `lib/<name>-store.ts` with `list`, `create`, `delete` helpers (mirror existing stores).

### Add a new env var

1. Add it to `.env.local` for local dev.
2. Add it to Vercel via `npx vercel env add NAME production --value "VALUE"` from each project that needs it. Use the `--value` flag — the UI sometimes silently saves empty strings.
3. Redeploy: `npx vercel --prod` or push to `main`.

### Rotate the Supabase anon key

If the key leaks (it's public-by-design, but if you want to rotate anyway):
1. Supabase dashboard → Project Settings → API → "Reset anon key"
2. Update `.env.local` in both apps
3. `npx vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production` then re-add with new value, in both Vercel projects
4. Redeploy both

### Rotate the GitHub PAT for pushing

The current PAT is cached in macOS keychain. If you ever need to recreate it:
1. github.com → Settings → Developer settings → Personal access tokens → **Generate new token (classic)**
2. Tick `repo` scope only, generate, copy
3. Next push will prompt for password — paste the PAT.

---

## Maintenance reminders

- **Supabase free tier limits:** 500 MB database, 50 K monthly active users, 2 GB egress. Watch usage in Supabase dashboard. Upgrade to Pro ($25/mo) when you hit them.
- **Vercel free tier limits:** 100 GB bandwidth/month, no time limits. Plenty for early use.
- **GitHub PAT expires** every 90 days (or whatever you set). When pushes start failing with auth errors, rotate.
- **PWA caching:** mobile users sometimes see stale versions because the home-screen icon launches a cached web app. Telling them to "delete and re-add the icon" clears it. For production, add a service-worker-based cache strategy.

---

## Original design handoff

The design package is at `/Users/gary/Documents/design_handoff_morpheus_admin/` (only on Gary's Mac, not in this repo).

It contains:
- `README.md` — full design spec with tokens, screens, entities, build order
- `admin/` — JSX prototypes for every admin screen (the source for Phase 1 ports)
- `Shift Check-in Prototype.html` + `mobile/components/` — JSX prototypes for the mobile screens

If you're picking up this codebase, **read the design handoff README first** — it's the complete product spec. The code in this repo is an implementation of those designs, not the spec itself.

---

## Files of note (cheat sheet)

```
morpheus-{mobile,admin}/lib/supabase.ts        ← Supabase client init
morpheus-{mobile,admin}/lib/auth.ts            ← signIn / signUp / signOut
morpheus-{mobile,admin}/components/AuthGate.tsx ← redirect-if-unauth wrapper
morpheus-{mobile,admin}/lib/tokens.ts          ← design tokens (AC for admin, MC for mobile)
morpheus-{mobile,admin}/lib/mock-data.ts       ← fallback static data (shifts/profiles only — customers is DB-only)
db/migrations/                                 ← canonical SQL for every schema change (apply by hand in Supabase SQL Editor)
morpheus-mobile/lib/shift-store.ts             ← requested_shifts CRUD
morpheus-mobile/lib/shifts-store.ts            ← shifts list/claim/check-in/check-out
morpheus-mobile/lib/profiles-store.ts          ← own profile read/update
morpheus-mobile/lib/location-tracker.ts        ← startLocationTracking() (upserts every 30s) + clearRepLocation() (delete on check-out)
morpheus-mobile/components/MenuShell.tsx       ← side menu state provider
morpheus-mobile/components/SideMenu.tsx        ← the slide-in menu
morpheus-mobile/app/active/page.tsx            ← active shift screen; mounts location tracker
morpheus-mobile/app/check-in/page.tsx          ← reads ?shift=, calls checkInToShift
morpheus-admin/lib/customers-store.ts          ← customers CRUD + soft delete (active flag)
morpheus-admin/lib/shifts-store.ts             ← admin-side shifts CRUD
morpheus-admin/lib/profiles-store.ts           ← list reps for assignment dropdown
morpheus-admin/lib/rep-locations-store.ts      ← read live rep GPS + Supabase Realtime subscription helper
morpheus-admin/lib/requests-store.ts           ← list pending rep requests + delete on approve/decline
morpheus-admin/app/requests/page.tsx           ← admin Requests inbox (also surfaced as a tab on Live Ops home)
morpheus-admin/lib/tasks-store.ts              ← customer_tasks CRUD (list, get, create, update, delete) — supports universal/multi-customer at create time
morpheus-admin/app/tasks/page.tsx              ← list + filter (incl. Universal) + edit/delete inline; "New task" → /tasks/new
morpheus-admin/app/tasks/new/page.tsx          ← create-task form: All / Specific (single or multi) scope picker
morpheus-admin/app/tasks/[id]/edit/page.tsx    ← edit one row (rename, change scope to a single customer or universal, etc)
morpheus-admin/lib/library-store.ts            ← library_files + Supabase Storage CRUD (list, get, list-for-customer, upload, update, delete, signed URL); LIBRARY_CATEGORIES list
morpheus-admin/app/library/page.tsx            ← upload (CustomerScopePicker for multi-customer) + list + filter (sidebar by customer AND by category) + edit/delete inline
morpheus-admin/app/library/[id]/edit/page.tsx  ← edit name/category/multi-customer association on a single file
morpheus-admin/lib/assignments-store.ts        ← rep ↔ customer many-to-many helpers (listCustomersForRep, listRepsForCustomer, set… both directions, idempotent diff)
morpheus-admin/lib/custom-fields-store.ts      ← custom_fields + custom_field_values CRUD; polymorphic value handling
morpheus-admin/components/ui/CustomFieldForm.tsx     ← shared create/edit form
morpheus-admin/components/ui/CustomFieldsCard.tsx    ← drop into any entity detail page; renders + saves field values
morpheus-admin/components/ui/CustomerScopePicker.tsx ← reusable "All / Specific (one or many)" picker
morpheus-admin/components/CustomersMap.tsx     ← MapLibre map view for /customers (every customer pin)
morpheus-admin/components/CustomerAddressMap.tsx ← MapLibre map for the /customers/[id] Address tab (pin + live geofence circle)
morpheus-admin/lib/events-store.ts             ← shift_events log: logEvent / listRecentEvents / subscribeEvents
morpheus-mobile/lib/events-store.ts            ← write-only mobile mirror (logEvent only)
morpheus-mobile/lib/library-store.ts           ← read-only library list + signed-URL fetcher
morpheus-mobile/lib/shifts-store.ts            ← also exports getTasksForCustomer for /active
morpheus-admin/lib/settings-store.ts           ← app_settings key/value getters/setters (late grace, early grace, default geofence radius)
morpheus-mobile/lib/settings-store.ts          ← read-only mirror used by /check-in + /check-out (late + early grace)
morpheus-admin/lib/users-admin.ts              ← client helpers for /api/users (createUser/updateUser/deleteUser + randomPassword)
morpheus-admin/app/api/users/route.ts          ← server-only CRUD for auth users (POST/PATCH/DELETE) — uses SUPABASE_SERVICE_ROLE_KEY + manager-gate
morpheus-admin/app/settings/page.tsx           ← /settings hub (sticky-nav with Managers / Check-in rules / Custom fields sections)
morpheus-admin/app/settings/managers/page.tsx  ← list every user, promote/demote, "+ Add user" modal
morpheus-admin/app/settings/managers/[id]/edit/page.tsx ← per-user edit (name/email/role/reset password/delete)
morpheus-admin/app/settings/fields/new/page.tsx       ← create a custom field
morpheus-admin/app/settings/fields/[id]/edit/page.tsx ← edit / delete an existing field
morpheus-admin/app/api/geocode/route.ts        ← Nominatim geocode proxy (address → lat/lng)
morpheus-admin/app/api/geocode/suggest/route.ts ← Nominatim autocomplete suggestions
morpheus-admin/app/schedule/new/page.tsx       ← create-shift form (with rep picker)
morpheus-admin/app/customers/new/page.tsx      ← create customer (address autocomplete)
morpheus-admin/app/customers/[id]/page.tsx     ← customer detail (client component — see Decision #4)
morpheus-admin/app/customers/[id]/edit/page.tsx ← edit customer (rename + change address)
morpheus-admin/app/reps/page.tsx               ← reps list (all profiles role='rep')
morpheus-admin/app/reps/[id]/page.tsx          ← rep detail page
morpheus-admin/components/screens/live-ops/MapPanel.tsx       ← entry, picks server vs client mount
morpheus-admin/components/screens/live-ops/MapPanelClient.tsx ← MapLibre map + customer pins + live rep dots
morpheus-admin/components/screens/live-ops/    ← KpiStrip, ShiftsList (real data)
morpheus-admin/components/shell/AdminShell.tsx ← desktop chrome (sidebar + topbar)

# May 11 additions
morpheus-mobile/components/UnableToAttendSheet.tsx   ← rep-side "Can't make this shift" reasons sheet
morpheus-mobile/components/ShiftAssignmentWatcher.tsx ← realtime banner when admin assigns/reassigns a shift
morpheus-mobile/components/CheckingInOverlay.tsx     ← full-screen overlay during /check-in submit (3-phase stepper)
morpheus-mobile/lib/profiles-store.ts                ← gained compressAvatar() + updateMyAvatar() helpers
morpheus-mobile/lib/settings-store.ts                ← gained getLocationExceptionsEnabled() + getTimingExceptionsEnabled()
morpheus-admin/lib/task-completions-store.ts         ← gained getActiveTaskForShift() for the live shift card
morpheus-admin/app/settings/check-in-rules/page.tsx  ← gained the two exception-toggle pill switches + ToggleRow
morpheus-admin/app/customers/[id]/edit/page.tsx      ← gained tri-state per-customer exception overrides + ExceptionOverridePicker
morpheus-admin/app/schedule/manage/page.tsx          ← row actions rebuilt — [View] [Edit future] [⋮ overflow]
morpheus-admin/lib/rep-locations-store.ts            ← RepLocation gained avatarUrl for live-ops map markers
```

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
