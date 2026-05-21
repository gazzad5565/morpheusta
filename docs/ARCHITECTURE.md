# Architecture — stack, repo, database, auth

> The "how does this thing work?" reference. Read when adding a
> new feature that needs to slot into the existing model OR when
> onboarding a developer who's never seen the codebase.

---

## Sections

- [Repo layout](#repo-layout-monorepo)
- [Stack](#stack)
- [Apps + Supabase + routing](#architecture)
- [Database schema + RLS](#database-supabase)
- [Auth flow](#auth-flow)

---

## Repo layout (monorepo)

```
/                                  ← this repo (gazzad5565/morpheus-opps)
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

