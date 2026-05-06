# Morpheus Field Operations Suite

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

**Last commit:** `ad08c62` — "Shift Complete: cinematic celebration sequence"
**Live URLs:** https://morpheus-admin.vercel.app · https://morpheusta-khaki-omega.vercel.app
**Repo:** https://github.com/gazzad5565/morpheusta

**Working end-to-end on real data — both apps build clean, all 18 admin routes return 200, no mock fallbacks left in the rep flow.**

#### Admin (manager console)

- **Live Ops home**: realtime KPI strip with **8-day sparklines on real data** (daily aggregates from shifts), MapLibre map with live rep dots + customer pins, Live Feed (Needs action + All activity tabs, both pulse + alert), today's shifts table (now also shows pending **Requested** rows alongside real shifts).
- **Reports** (`/reports` hub) with 3 working dashboards:
  - `/reports/operations` — daily Scheduled vs Completed line chart, on-time rate trend, state donut, top-customers bar chart, KPIs with period-over-period deltas (7/30/90d).
  - `/reports/rep-performance` — leaderboard with sortable columns + Δ vs prev period + coloured progress bars (Good/Warn/Danger thresholds).
  - `/reports/timesheet` — payroll-grade hours per shift, joins `shifts.check_out_at` (or events fallback), CSV export.
- **Schedule / Calendar** — toggle between **Days view** (flat day-only) and **Reps view** (per-rep grid). Sortable cells, smart default `+ Add` time per cell, cards link to `/shifts/[id]` (locked detail) or `/shifts/[id]/edit` (when scheduled).
- **Shift edit page** — `/shifts/[id]/edit`. Editable while `state='scheduled'`; redirects to read-only detail once the rep checks in. Server-enforces the lock too.
- **Customers / Reps** — both list pages share the same toolbar: filter chips, search, Grid + Table view toggle, sortable columns. `/customers` also has Map view.
- **Schedule/new** — multi-customer × multi-rep × weekly recurrence cartesian product (e.g. 3 reps × 5 customers × Mon-Fri = 75 shifts in one save).
- **User CRUD** — sidebar nav link is now **"Users"** but route stays `/settings/managers`. Add User modal, edit page, role promote/demote. Server route at `/api/users` uses the service-role key, gates by `profiles.role='manager'`.
- **Settings hub + sub-pages** — `/settings` is a tile hub; each section is its own route under `SettingsShell` (Users, Check-in rules, Custom fields, Organisation, Notifications, Billing). Notifications/Billing are "Soon" placeholders.
- **Organisation logo** — upload at `/settings/organisation` to a public Storage bucket; Sidebar reads it on mount and replaces the default Morpheus mark.
- **Topbar search** — live filter across reps, managers, customers, tasks. ⌘K focuses; ↑↓ + Enter navigates.
- **Sidebar Live Ops badge** — flashing red pill + browser tab title prefix when there are pending rep requests, visible from any page. Refreshes via realtime + visibilitychange + 60s poll + every navigation.

#### Mobile (rep PWA)

- **Today / Shifts / Active / Library** all auto-refresh in real time via Supabase Realtime + visibilitychange + 60s poll fallbacks.
- **Check-in animated success page** — `/check-in/success` is now fully data-driven (customer, time, distance, late mins, early mins, real next shift). Includes a one-shot animated celebration: pop-in icon, three pulsing rings, stroke-drawn checkmark, staggered fade-up of content. Respects `prefers-reduced-motion`.
- **Off-site / Late / Early check-in** all detected and gated. **Early check-out** symmetric. Configurable grace periods on `/settings/check-in-rules`.
- **Task / Break / Travel** all log dedicated events (`shift.task_started`, `shift.task_completed`, `shift.break_started`, `shift.break_ended`, `shift.travel_started`, `shift.travel_ended`).
- **Travel UI** lives in three places: `<UpNextCard>` Start/Stop, post-checkout `/summary` "What's next?" tiles, and auto-ended on next check-in. State persists in `localStorage` so closing the app mid-travel doesn't lose it.
- **Active task / break / travel state** persists across screen lock + app close via `localStorage`.
- **Event queue** — failed `logEvent` calls are queued in localStorage and retried on the next mount or visibility-change. Up to 200 events buffered.
- **Auto-checkout sweep** — admin home + tab-focus runs `sweepStaleShifts()` which marks any active-state shift past the configured cutoff as complete, also clears orphan `rep_locations` rows. Cutoff is configurable in `/settings/check-in-rules` (default 23:59).

#### Database

- **Activity log** (`shift_events`) is the audit trail. **Every** in-app action writes a row: shift scheduled / claimed / checked-in (incl. offsite/late/early variants) / checked-out (incl. offsite/early/auto variants) / task-started / task-completed / break-started / break-ended / travel-started / travel-ended / shift-deleted / customer-CRUD / library-CRUD / task-CRUD / request submitted/scheduled/declined.
- **Indexes** on hot paths (added during the stabilisation pass): `shifts (shift_date)`, `shifts (rep_id, shift_date)`, partial `shifts (state)` on active states only, `shifts (customer_id)`, `requested_shifts (status, requested_at)`, `requested_shifts (rep_id)`. Plus everything in `db/migrations/*` already indexed.
- **`shifts.check_out_at`** is now a real column (was inferred from events) — backfilled from event log via migration; mobile checkout + admin sweep both stamp it.
- **`shift_task_completions`** logs which tasks the rep ticked off on a given shift (cascades on shift / task delete; unique on (shift, task)).

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

### Migrations applied today (already in cloud)

- `2026_05_06_shifts_indexes.sql`
- `2026_05_06_organisation.sql`
- `2026_05_06_rep_locations_manager_delete.sql`
- `2026_05_06_shift_task_completions.sql`
- `2026_05_06_shifts_check_out_at.sql`
- `2026_05_06_library_files_realtime.sql`

### What the next chat should do first

Top of the queue: **Phase 4 RLS** (locks down the database against malicious-rep API access — see #1 in the deferred list above). Or **Capacitor wrap** if background GPS is the priority. Or **Custom report builder** if reporting is the priority.

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

**Top of the deferred list — pick any one and run with it tomorrow:**

1. **Phase 4 RLS — security debt** ⚠️ HIGHEST PRIORITY before opening to real users. Every table is currently `TO authenticated USING (true)`. Reps and managers have the same DB write powers; the apps gate by role at the UI but the DB doesn't. A motivated rep could `curl` Supabase directly and modify customers / shifts / tasks / library files / app_settings / profiles. The path: write a single coordinated migration that uses a `is_manager()` SECURITY DEFINER helper and rewrites every table's policies. Test in a staging Supabase first. Note: `profiles` UPDATE was deliberately opened for promote/demote — narrow that too.
2. **Capacitor wrap** for proper background GPS + push notifications. Browsers don't expose persistent background geolocation, so the rep app can only track location while `/active` is foregrounded. Wrapping the existing React app in Capacitor (1-2 weeks) gives: real background location, push notifications, App Store / Play Store presence. The codebase doesn't change much — replace `navigator.geolocation` calls with `@capacitor/geolocation` (same API), plus shell config + permission requests.
3. **Custom report builder.** The 3 fixed reports (Operations / Rep performance / Timesheet) are good but the user wanted "users can build their own". Picture: a builder UI where a manager picks metrics, dimensions, filters, and a chart type, then saves. Multi-week project — needs builder UI + query AST + saved-report storage + per-user permissions on saves.
4. **Background sweep (`pg_cron`).** Today `sweepStaleShifts()` only runs when an admin opens the Live Ops home or focuses the tab. If no admin opens for several days, stale shifts and orphan rep_locations rows accumulate. Either a Vercel Cron route hitting `/api/sweep` or a Postgres `pg_cron` job (cleaner). 1-hour task.
5. **Error monitoring.** Drop in Sentry or Vercel Analytics before user count grows past ~10. You're flying blind on prod errors right now. ~30 minutes of work, saves a lot of guessing.
6. **Push notifications via Web Push.** Service worker + VAPID setup. Works on Chrome/Firefox/Safari 16+. Cleaner alternative to Capacitor if iOS install isn't a priority. ~1 day of work.
7. **Email confirmation** turned back on for production self-signups. Admin-created users are already auto-confirmed.
8. **Tests.** No tests yet — at minimum smoke tests for auth + the critical CRUD paths and the check-in / check-out flow.

**Smaller cleanups that didn't make the cut today:**
- 8 `deriveInitials` definitions still scattered across pages — dedupe to `initialsFromNameOrEmail` from `lib/format.ts` next time you touch each file. Same for 3 `formatTimeRange` copies. Functionally equivalent; just maintenance.
- 5 page files >900 LOC (`customers/[id]/page.tsx`, `mobile/active/page.tsx`, `mobile/check-in/page.tsx`, `schedule/page.tsx`, `settings/managers/page.tsx`). They build fine but onboarding a new dev means reading a lot of inline code per page. Extract sub-components opportunistically when adding features.
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
