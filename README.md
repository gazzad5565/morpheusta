# Morpheus Ops

**Workforce Operations. In real time.**

Admin web console + mobile rep PWA for field-operations teams.
Schedule shifts, track real-time location, capture photos + customer
signatures on tasks, message reps individually or in bulk, and prove
every customer visit with a timestamped audit trail. Built on Next.js
16 + Supabase + Vercel.

> Latest commit: **`0ecb15d`** (May 21, 2026). Admin-side photo
> viewer finally landed — mobile's been writing `shift_task_photos`
> rows since May 13 (Feature C) but admin had no UI to read them.
> New `morpheus-admin/lib/photos-store.ts`, inline 64×64 thumbnails
> per task row on `/shifts/[id]`, full-screen `PhotoLightbox` that
> flicks through every photo for the shift (backdrop / Esc / ← → /
> × all close + nav), and a `📷 N` chip on each row in /past-shifts
> + Live Ops Today's Shifts (omitted at 0 so rows stay clean).
> Same day merged the `260519-UIFixes` branch — customer detail
> page split out of its 1,293-line monolith into proper tab
> components, /past-shifts archive page, new admin UI primitives
> (EmptyState / ExpandableRow / Pill / TabHeader). See
> `docs/SESSIONS.md` for the full chronology back to May 6.

---

## Live URLs

| What | Where |
|---|---|
| Admin web app | https://morpheus-admin.vercel.app |
| Mobile rep app (PWA) | https://morpheusta-khaki-omega.vercel.app |
| Source | https://github.com/gazzad5565/morpheusta |

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
| [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md) | The May 11, 2026 senior-engineer handoff — preserved verbatim as the closest thing we have to a code-quality backlog. |
| [`MARKETING_BRIEF.md`](MARKETING_BRIEF.md) | "How do I market this?" — canonical product reference for the Marketing Muse / ChatGPT marketing agent. Full feature inventory, brand voice, taglines, audience value props. |

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
├── MARKETING_BRIEF.md      ← product reference for marketing agents
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
