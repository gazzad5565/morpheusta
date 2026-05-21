# Setup — clone, env vars, fresh-machine first run

> Everything needed to get the project running on a new laptop.
> Account access (Supabase, Vercel, GitHub) is the only thing
> that isn't automated.

---

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


---

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

