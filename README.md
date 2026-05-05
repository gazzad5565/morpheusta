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

### Where things stand right now (last session, 2026-05-05)

**Working end-to-end on real data:**
- Auth (signup/login/logout) — both apps
- Admin: customers (create/edit/soft-delete), reps roster + per-rep page, schedule shifts (with optional rep assignment), Live Ops home (real-data KPIs + shifts table + field map with live customer/rep dots), Requests inbox (rep-requested shifts → admin approve/decline → schedule), Tasks library (universal or per-customer, edit + delete), Library file storage (categories + edit + delete), clickable breadcrumbs.
- Mobile: dashboard (real shifts/date/library count + MapLibre route preview with today's customer pins + GPS dot), shifts list (state badges: scheduled / in-progress / complete; complete sinks to bottom dimmed; "Resume shift" CTA), check-in (writes `state='in-progress'` + `check_in_at`), active shift (real customer info + real per-customer + universal tasks + timer anchored to real check-in time), check-out (writes `state='complete'` + `tasks_done`, clears the rep's GPS dot).

**You do NOT need to run any migration when you arrive on a new machine** — schema is on Supabase, code is on GitHub. Just clone + install + run.

**The migrations Gary already ran (do NOT re-run on the new machine — they're already applied to the shared Supabase project):**
- All files in `db/migrations/` dated `2026_05_05_*.sql`. They're kept in the repo for posterity / fresh-environment setup. The shared cloud DB already has them.

**Top of the deferred list when you sit down tomorrow:**
1. Phase 4 RLS by role (manager-only writes)
2. Background location tracking (needs Capacitor)
3. `shift_events` log table → real "Needs action" / "All activity" Live Feed tabs + KPI sparklines
4. Per-shift task completion log (which tasks were done on which shift, not just a count)

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

1. **Phase 4: Tighten RLS by role.** Right now any authenticated user can write to `customers`/`shifts`/`customer_tasks`/`library_files`. Use the `profiles.role` column to restrict INSERT/UPDATE/DELETE on those tables to `role = 'manager'`. SELECT can stay open. Mobile reps would only see DB-level errors if they try to misbehave through the API.
2. **Background location tracking on mobile.** Today GPS only updates while the active-shift screen is in the foreground (browser limitation). For background tracking we'd need a Capacitor wrap or a service worker with `periodicSync` (limited support).
3. **Live feed event log.** Build a `shift_events` table that logs check-ins, claims, completions, off-site exceptions, etc; render it in the "Needs action" + "All activity" tabs in real-time order. Currently those tabs show empty states.
4. **Sparklines on KPI strip use real time-series.** Today they're placeholder shapes. Needs the event log above + a daily aggregation query.
5. **Per-shift task completion log.** Customer tasks now flow rep ↔ admin, but *which tasks were done on which shift* is only counted (`shifts.tasks_done`), not stored row-by-row. A `shift_task_completions` join table would let the admin see exactly which tasks the rep ticked off on a given shift.
6. **Edit existing tasks/library files.** v1 supports create + delete only. Add edit pages so admins can rename tasks, change duration, swap a customer association on a library file, etc.
7. **Email confirmation** turned back on for production.
8. **Promote `db/migrations/` to the Supabase CLI** so migrations apply automatically per environment instead of being pasted into the SQL Editor by hand.
9. **Tests.** No tests yet — for production, add at minimum smoke tests for auth + critical CRUD.
10. **Native apps** (Capacitor wrap of the PWA, or React Native rewrite) for App Store / Play Store presence — also unlocks proper background location.

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
morpheus-admin/app/settings/page.tsx           ← list all custom fields grouped by entity + delete inline
morpheus-admin/app/settings/fields/new/page.tsx ← create a custom field
morpheus-admin/app/settings/fields/[id]/edit/page.tsx ← edit / delete an existing field
morpheus-admin/components/ui/CustomFieldForm.tsx     ← shared create/edit form
morpheus-admin/components/ui/CustomFieldsCard.tsx    ← drop into any entity detail page; renders + saves field values
morpheus-admin/components/ui/CustomerScopePicker.tsx ← reusable "All / Specific (one or many)" picker
morpheus-admin/components/CustomersMap.tsx     ← MapLibre map view for /customers (every customer pin)
morpheus-admin/components/CustomerAddressMap.tsx ← MapLibre map for the /customers/[id] Address tab (pin + live geofence circle)
morpheus-mobile/lib/library-store.ts           ← read-only library list + signed-URL fetcher
morpheus-mobile/lib/shifts-store.ts            ← also exports getTasksForCustomer for /active
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
