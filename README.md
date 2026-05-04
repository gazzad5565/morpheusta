# Morpheus

Working code for the Morpheus Field Operations Suite, scaffolded from your design handoff.

## What's here

```
/Users/gary/Claude/
├── morpheus-admin/      ← Time & Attendance admin console (desktop web)
└── morpheus-mobile/     ← Shift Check-in mobile app
```

Both are real Next.js apps your devs can take over and ship. Both install as **PWAs** on your phone (more on that below).

---

## Running locally

You'll need **two terminal windows** if you want both apps up at once.

### Admin (desktop web)

```bash
cd /Users/gary/Claude/morpheus-admin
npm run dev
```

Open http://localhost:3000 — opens to the **Live Ops** home (KPIs, map, live feed, today's shifts). Click around the sidebar.

### Mobile (rep app)

```bash
cd /Users/gary/Claude/morpheus-mobile
npm run dev
```

Open http://localhost:3000 (or 3001 if admin is also running) — opens to the **Dashboard**. Tap the bottom tabs and the "Check in" button to walk through the full flow.

> **To stop:** press `Ctrl+C` in the terminal. Don't just close the window — that can leave processes running.

---

## What works

### Admin — 13 routes

| Path | Screen |
|---|---|
| `/` | Live Ops — KPIs, faux map with rep pins, exception feed, today's shifts |
| `/reps`, `/reps/[id]` | Reps list + detail |
| `/customers`, `/customers/[id]` | Customers grid + detail (with geofence map) |
| `/schedule` | Week planner |
| `/reports` | KPI cards, bar chart, line chart, leaderboard |
| `/tasks` | Task templates list |
| `/library` | File library |
| `/notify` | Broadcast composer with phone preview |
| `/audit` | Audit log |
| `/settings` | Exception rules editor |
| `/login` | Split-screen login |

### Mobile — 9 screens, full flow

| Path | Screen |
|---|---|
| `/` | Dashboard — Up Next card, activity card (travel/break), library shortcut |
| `/shifts` | Today's shifts list (expandable) |
| `/check-in` | Check-in flow — exception accordions for off-site + late, reason chips |
| `/check-in/success` | Checked-in confirmation with summary |
| `/active` | Active shift dashboard — live timer, tasks, breaks, task sheet modal |
| `/check-out` | Check-out flow with off-site + early-out exceptions |
| `/summary` | Shift complete — stats, timeline, recorded exceptions |
| `/library` | File + image browser |
| `/profile`, `/support`, `/login` | Stubs / supporting screens |

The full check-in → active → check-out → summary loop is wired end-to-end. Try this:

1. Dashboard → tap **Check in to shift**
2. Tap each exception, pick a reason chip, **Proceed**
3. **Start activities** → tap a task in the Compulsory section → **Start task** → **Complete task**
4. **Check out** → resolve both exceptions → **Confirm**
5. See the summary, then **Back to dashboard**

---

## Putting the mobile app on your phone

Two ways. The Vercel route is recommended.

### Option A — Deploy to Vercel (5 min)

This gets you a live URL on the internet so you can install on any phone, anywhere.

```bash
cd /Users/gary/Claude/morpheus-mobile
npx vercel
```

First time it'll ask you to sign in (use your email — it sends a magic link). Then:
- Set up & deploy? **Yes**
- Which scope? (your username)
- Link to existing project? **No**
- Project name? (keep default or rename)
- Directory? (just hit enter — it's the current dir)
- Modify settings? **No**

You'll get a preview URL like `morpheus-mobile-xyz.vercel.app`. To deploy a permanent prod URL:

```bash
npx vercel --prod
```

Repeat for `morpheus-admin/`.

### Option B — Test on your phone over WiFi (now, no deploy)

Both apps log a network URL when you `npm run dev`:

```
- Local:         http://localhost:3000
- Network:       http://192.168.1.114:3000   ← this one
```

Open the **Network** URL on your phone (must be on the same WiFi as your Mac). Works for testing but the URL only lasts as long as your laptop is on.

### Installing as a PWA on your phone

Once you have a URL open in your phone's browser:

**iOS (Safari):**
1. Tap the **Share** icon (square with arrow)
2. Scroll down, tap **Add to Home Screen**
3. Confirm — you get an app icon on your home screen
4. Open it — full-screen, no browser chrome, behaves like a native app

**Android (Chrome):**
1. Tap the **⋮** menu
2. Tap **Install app** (or **Add to Home Screen**)
3. Same result

Both apps have manifests + icons set up so this works cleanly.

---

## What's NOT done yet

These are deferred — Phase 2 work.

**Admin:**
- 8 CRUD modals (Create rep / customer / shift / task, Delete confirm, Bulk actions, Empty state, Success toast). Buttons render but don't open anything yet.
- Schedule's Today / Month / Gantt sub-views (only Week is wired).
- Real interactivity: filter chips, search, sort, pagination buttons render but don't filter/search/paginate.
- Drag-reorder in Schedule grid.

**Mobile:**
- Login is cosmetic — just a button that goes to `/`. No real auth.
- Profile and Support are stubs.
- The 3 check-in variations (Stepper, Compact) — only the Accordion variant is built.
- Daily sync flow + Reset DB — not built.

**Both:**
- No backend. All data comes from `lib/mock-data.ts`. Replace this file (or its callers) with a real API in Phase 2.
- No real-time WebSockets (Live Ops board would update live in production).
- No real maps (Live Ops + Customer geofence + Check-in map are SVG fakes; swap to MapLibre or Mapbox in Phase 2).
- No auth.

---

## Stack & folder layout

- **Next.js 16** with App Router
- **React 19**
- **TypeScript**
- Plain CSS + inline styles using a tokens object — devs can refactor to Tailwind / CSS Modules / styled-components later
- Inter font from Google Fonts
- No backend yet (mock data); deploy-ready for Vercel

```
morpheus-admin/
├── app/                 ← One folder per route
├── components/
│   ├── shell/           ← AdminShell, Sidebar, TopBar
│   ├── ui/              ← Btn, Card, AGlyph, etc.
│   └── screens/live-ops/
└── lib/
    ├── tokens.ts        ← AC tokens (colors, type, layout)
    ├── mock-data.ts     ← Replace with real API in Phase 2
    └── types.ts

morpheus-mobile/
├── app/                 ← One folder per route
├── components/          ← Glyph, Chrome, BottomTabBar
├── lib/                 ← tokens + mock-data
└── public/              ← manifest + PWA icons
```

---

## What your devs would do next

Recommended order:

1. **Pick auth** — NextAuth.js + a database is the simplest. Email magic-link or SSO.
2. **Pick a database** — Postgres on Neon or Supabase, with Prisma as ORM.
3. **Replace `lib/mock-data.ts`** — write API routes in `app/api/*` or use server actions to fetch real data.
4. **Wire up the deferred modals** in admin (8 of them, mostly mechanical).
5. **Add a real map** — MapLibre is free; Mapbox is ~$5/month at light usage.
6. **Add real-time** — Pusher or Ably for the Live Ops exception feed.

The handoff README at `/Users/gary/Documents/design_handoff_morpheus_admin/README.md` has the full recommended build order under "Recommended Build Order".
