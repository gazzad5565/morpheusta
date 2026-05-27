# Morpheus Ops

**Workforce Operations. In real time.**

Admin web console + mobile rep PWA for field-operations teams.
Schedule shifts, track real-time location, capture photos + customer
signatures on tasks, message reps individually or in bulk, and prove
every customer visit with a timestamped audit trail. Built on Next.js
16 + Supabase + Vercel.

> Latest: **May 27, 2026 (evening) — resizable columns + customer overview improvements + shifts tab expanded.** Drag header dividers to resize columns on `/tasks`, `/library`, `/reps`, `/settings/managers`, `/customers` — widths persisted per-browser via localStorage (key `morpheus.cols.<page>.v1`); double-click a divider to reset. Customer detail Overview now surfaces up to 3 contacts inline with `mailto:` / `tel:` links + a Google Maps link on the address. "Today's shifts" tab renamed to "Shifts" with All / Today / Past / Upcoming filter chips, Date column, sort-newest-first, paginated (90-day window + 1 year forward). Sitting on the same local `main` waiting for GitHub Git Operations to come back from "degraded performance".
>
> **Earlier today: May 27, 2026 — pagination on every long list page.** New shared `components/ui/Pagination.tsx` (First / Previous / page numbers / Next / Last + "Showing X-Y of Z"). Wired into `/tasks`, `/library`, `/reps`, `/settings/managers`, and `/customers`. Page size 50; client-side slicing of already-filtered arrays so all existing search/filter/sort behaviour is unchanged. Customers Map view bypasses pagination intentionally (pin overview shouldn't be paginated). See [docs/SESSIONS.md](docs/SESSIONS.md) top entry.
>
> **Previous: May 25, 2026 — Import Hub + Email Welcome, Phases A → E all landed same day.** Foundation (Phase A) → "Email this user" button (Phase B) → tabbed `/settings/import` hub + 5-step entity wizard with consolidated CTAs (Phase C) → real entity adapters with per-row error handling + `import_runs` + audit log (Phase D) → background geocoder cron + retry-on-edit + status badge (Phase E). End-to-end pipeline: import a CSV → customers/sites/reps/managers/shifts land in their tables → Phase E cron resolves addresses within 60s → everything propagates to mobile via existing Realtime subscriptions. Operator setup still owed: apply the two `2026_05_25_*.sql` migrations + add `RESEND_API_KEY` to Vercel.
> Phase A — foundation (`import_runs` table, `geocode_status` on
> customers + sites, Resend wiring, `/settings/import` page). Phase B —
> "Email this user" button on `/settings/managers/[id]/edit` and
> `/reps/[id]` opens a shared `EmailUserModal` (invite link via
> Supabase recovery flow, or fresh password via `auth.admin.updateUserById`).
> Phase C — new `/import` hub (entity picker for customers / sites /
> reps / managers / shifts + Recent Imports panel from `import_runs`)
> and `/import/[entity]` 5-step stepper (Source → Map → Settings →
> Preview → Result). Drag-drop CSV/XLSX via Papa Parse + SheetJS,
> synonyms-driven column auto-map, per-row validation. Phase-C stub
> adapters mean Commit fails clearly with "Phase D will wire this up"
> — the wizard works end-to-end up to that point. Consolidation
> (per Gary's directive): new "Import" sidebar nav + Import CTAs on
> `/customers`, `/reps`, `/settings/managers`, `/schedule`, and the
> customer-detail `SitesTab` — `/import` is the single entry point
> for every bulk operation. Two new migrations still PENDING
> (`2026_05_25_*.sql`). See `docs/SESSIONS.md` for the full Phase
> A + B + C entries and `docs/ROADMAP.md` item 0 for next steps
> (Phase D — replace stub adapters with real upsert paths).

---

## Live URLs

| What | Where |
|---|---|
| Admin web app | https://morpheus-admin.vercel.app |
| Mobile rep app (PWA) | https://morpheusta-khaki-omega.vercel.app |
| Source | https://github.com/gazzad5565/morpheus-opps |

---

## Where to find what

This repo's documentation lives in `docs/` so fresh chats don't have
to scan a 3000-line README to answer a single question. Pick the
file that matches your question:

| File | When to read it |
|---|---|
| [`docs/SESSIONS.md`](docs/SESSIONS.md) | "What just shipped?" — reverse-chronological commit log with rationale, May 6 → today. Read the latest entry first. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | "What should I work on next?" — priority list at top, done vs deferred below, recent design decisions at the bottom. |
| [`docs/SETUP.md`](docs/SETUP.md) | "How do I run this on a fresh machine?" — clone + first run, env vars, account auth checklist, cloud-status snapshot. |
| [`docs/OPS.md`](docs/OPS.md) | "How do I deploy / which migrations to run / what's broken in Vercel / how does push work?" — migrations log, deployment ops, ⚠ Vercel traps, full Web Push deep dive, auto-checkout vs reminders timing. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | "How does X work?" — stack, repo layout, schema, RLS, auth flow, routing model. |
| [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md) | "How do I add a new page / table / env var?" — day-to-day reference + files-of-note map. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | "What should this new page look like?" — design system: tokens, primitives, page patterns, voice, iOS PWA landmines, plus a per-page checklist. |
| [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md) | The May 11, 2026 senior-engineer handoff — preserved verbatim as the closest thing we have to a code-quality backlog. |

If you're a fresh chat and the user just dropped you into the repo
with no other context, **read `docs/SESSIONS.md` top-to-first-heading
+ `docs/ROADMAP.md` first** — those two cover ~90% of "what is this
codebase and where is it going?".

---

## Quick stack summary

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind. Two
  apps: `morpheus-admin` (manager web console) and `morpheus-mobile`
  (rep PWA, installable on iOS + Android).
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage). RLS
  hardened May 14 via the `is_manager()` SECURITY DEFINER pattern.
- **Push**: Web Push with VAPID. Multi-device per rep, auto-prune
  on 410/404, kill switch at `/settings/notifications`.
- **Hosting**: Vercel (admin + mobile as separate projects). Vercel
  Cron on Pro, three schedules live (shift-reminders 5min,
  auto-checkout 15min, messages 1min).
- **Maps**: MapLibre GL + OpenFreeMap tiles. Nominatim for geocoding.

Full stack details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Repo layout

```
/
├── README.md               ← you are here (lean index)
├── docs/                   ← deep-dive docs (see table above)
├── morpheus-admin/         ← admin web app (Next.js)
├── morpheus-mobile/        ← rep mobile PWA (Next.js)
├── db/
│   └── migrations/         ← Supabase SQL migrations (one per change, dated)
└── qa/
    └── playwright/         ← end-to-end test suites
```

Full layout details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#repo-layout-monorepo).

---

## Updating this README

This file should stay lean — under 100 lines. New content goes
into the right `docs/` file:

- A new day's commits → append at the top of `docs/SESSIONS.md`
- A new pending migration → update `docs/OPS.md`
- A new architectural decision → `docs/ARCHITECTURE.md`
- A bug pattern worth remembering → `docs/CHEATSHEET.md`
- Top-of-file "Latest commit" line above → bump on every push,
  one sentence describing what shipped

Anything that takes more than two sentences to explain belongs in
a `docs/` file, not here.
