# Cheatsheet — common tasks + file map

> Day-to-day reference: how to add a page, add a table, rotate a
> key. Plus the "files of note" map of where things live in the
> two apps.

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

