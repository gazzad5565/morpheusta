# Morpheus Field Operations Suite

**Product deck · presentation-ready feature inventory**
*Last updated 2026-05-12*

> An end-to-end platform for agencies that put reps in the field — schedule, dispatch, verify, audit, and report. One admin console for managers, one PWA for reps, one Supabase backend, real-time everywhere.

---

## At a glance

**Two apps, one backend:**
- **Admin console** (desktop, Next.js) — for managers and ops leads
- **Mobile rep app** (PWA, installable on iOS + Android) — for the field team

**One operational loop:**
Manager schedules → Rep claims or is assigned → Geofenced check-in → Tasks completed on-site → Geofenced check-out → Wrap-up animation → End-of-day cinematic recap.

**Audit-defensible by default.** Every state change writes an event row. Live feed for managers, historical reports for clients and payroll.

---

## 📱 Mobile rep app

### Daily flow

| Feature | What it does | Why it matters |
|---|---|---|
| **Today dashboard** | Up Next card with live countdown, dashboard map of all today's stops, day progress bar, status pills | One screen tells the rep where they are in their day |
| **Up Next card** | Customer logo, site address, travel time, "leave by HH:MM" pill | Never miss the next shift; auto-hides leave-by once stale |
| **In-app route preview** | Real driving polyline drawn on the dashboard map before navigation | Confidence in the trip before committing |
| **Hand-off to Maps** | Start travelling fires the timer + opens Google/Apple Maps | iOS PWA returns cleanly with no white-screen |

### Shifts management

| Feature | What it does | Why it matters |
|---|---|---|
| **Three lists in one** | Scheduled for me · Unscheduled (claimable) · Awaiting approval | Single source of truth for "what should I do today?" |
| **Expandable shift rows** | Inline mini route map, site address, contact details, Start travelling + Check in actions | No screen-jumping mid-flow |
| **Claim a customer** | Claimable shifts show distance from current GPS ("3.2 km away") | Reps grab the nearest one; managers set an optional radius gate |
| **Request a customer** | Rep submits an ad-hoc shift request for any customer | Manager sees it real-time and approves with one tap |
| **Can't make this shift** | Reason picker + free-text note → flags shift for manager review | Captures the why, gives the manager four resolutions |
| **Anytime-today shifts** | Flex-time shifts with no strict start/end | Mobile shows "Anytime today" + skips late-check logic |

### Check-in / check-out

| Feature | What it does | Why it matters |
|---|---|---|
| **Geo-validated check-in** | Rep must be within customer geofence (configurable per customer; org default 100m) | Proof of presence; off-site captured as exception |
| **Late check-in** | Reason picker after grace period (traffic, weather, vehicle, personal, other) | Audit trail, no friction |
| **Early check-in** | Configurable: blocked or warned per org/customer | Policy enforcement |
| **Wrap-up animation** | Full-screen overlay during DB writes (Saving → Logging → Ready) | Rep never sees a frozen button |
| **Geo-validated check-out** | Same fence; mirror exception path | Closes the loop |
| **Compulsory-task gate** | Check-out blocked until every compulsory task is ticked | SLA enforcement, cannot be bypassed |

### On-shift

| Feature | What it does | Why it matters |
|---|---|---|
| **Tasks** | Customer-specific or universal; compulsory or optional; rich descriptions + duration estimates | Smart accordion: compulsory open, optional collapsed |
| **Task timer** | Start → elapsed time tracked → Complete | Audit event fires on each transition |
| **Break timer** | Start/stop break separate from active work | Logs as separate paid-time-out events |
| **Travel timer** | Start travelling → auto-ends on next check-in | Mileage and time captured automatically |
| **In-shift notes** | Free-form text per shift | Manager sees in shift detail |
| **Customer library** | Manager-published PDFs / images for this customer | Planograms, contact sheets, training docs on-demand |

### End of day

| Feature | What it does | Why it matters |
|---|---|---|
| **/day cinematic recap** | Hero number (shifts done) explodes onto a dark backdrop with starburst, shockwaves, animated-gradient headline, 80-particle confetti volley + haptic kick. Stat tiles cascade in with 3D drop. Per-stop timeline. | The payoff moment — reps see what they actually did, the agency wins loyalty |

### Plan my day

| Feature | What it does | Why it matters |
|---|---|---|
| **Route optimization** | Google Routes API with live traffic — re-orders stops for shortest drive | Concrete savings: "saves 12 min · 4.3 km less" |
| **Save preferred order** | Locks visit order; /shifts re-sorts to match | Per-rep view preference; doesn't touch manager schedules |
| **Always-visible timestamps** | "Order optimized at 2:42 PM" + "Re-checked at 3:26 PM" persistent across visits | Rep knows how fresh the picture is |
| **Same-address detection** | Two stops at one customer show "Same address as previous stop" | No phantom "0 min drive" rows |

### Profile

- Rep avatar / photo upload (compressed JPEG, propagates everywhere)
- Name + email edit
- Password change
- Sign out

---

## 🖥 Admin console (manager)

### Live ops dashboard

| Feature | What it does |
|---|---|
| **KPI tiles** | Today's scheduled / in-progress / completed / exceptions / total reps live |
| **Live rep map** | Real-time positions of every checked-in rep, pin colour per rep |
| **Live feed** | Chronological stream of every event, filterable |
| **Real-time updates** | Supabase Realtime: sub-second latency, no refresh needed |

### Customer management

| Feature | What it does |
|---|---|
| **Customer list** | Grid · Table · Map views with search + region filter |
| **Multi-site customers** | One customer with N physical sites (chains, multi-warehouse) |
| **Per-customer logo** | Uploads once, shows on every shift card and rep screen |
| **Per-customer geofence override** | Tighten or loosen the radius per customer |
| **Per-customer exception toggles** | Override org defaults for off-site/timing capture |
| **Per-customer contacts** | Multiple named contacts (phone, email, role) per customer |
| **Customer-scoped tasks** | Compulsory + optional tasks defined per customer |
| **Customer-scoped library files** | PDFs / docs the rep can open on-shift |
| **Rep assignments** | Pre-assign specific reps to specific customers |
| **Custom fields** | Define your own customer fields (e.g. "Contract type") |
| **Soft delete** | Inactive customers stay in history but disappear from pickers |

### Scheduling

| Feature | What it does |
|---|---|
| **Weekly calendar** | Days view + Reps view, drag-and-drop shifts |
| **Quick popover** | Click any shift → Add another here · Edit here · Full edit · Delete |
| **Inline quick-edit** | Change time + date from the popover without leaving the calendar |
| **Bulk shift creation** | Multi-rep × multi-customer × recurring shifts as a cartesian product |
| **Recurrence** | Daily / weekly / biweekly / monthly with end date or count |
| **Specific rep or claimable** | Assign to one rep, multiple reps, or leave open for claim |
| **Claim radius** | For unassigned shifts, max distance a rep can be to claim it |
| **Series management** | Edit one occurrence, edit future, cancel entire series |
| **Typed-RESET wipe** | Type "RESET" to nuke all future shifts; defensive double-confirm |

### Reps & permissions

- **Rep + manager list** — search, sort, filter; grid or table view
- **Rep detail** — assignments, shift history, current geolocation, photo
- **Manager CRUD** — invite, edit, delete via service-role-gated admin API
- **Avatar upload** — rep + manager photos compressed and stored

### Requests inbox

- **Real-time queue** of rep-submitted shift requests
- **One-tap approve** opens /schedule/new pre-filled
- **Decline with reason** captured for rep to see

### Reports

| Report | Purpose |
|---|---|
| **Operations dashboard** | 30-day KPIs: shifts scheduled, completed, exception rate, on-time rate |
| **Rep performance** | Leaderboard by completed shifts, on-time rate, task completion — CSV export |
| **Timesheet** | Hours per rep per shift across any date range — CSV export for payroll |

### Settings

- **Organisation** — org name, logo (shows on rep app), region defaults
- **Check-in rules** — geofence radius, late grace, plan-day optimization permission
- **Custom field definitions** — schema for customer custom fields
- **Manager invitations** — invite new managers
- **Library** — org-wide file manager

---

## ⚡ Real-time, exceptions & audit

### Exception capture (every path)

| Event | Trigger | Captured | Surfaced |
|---|---|---|---|
| **Off-site check-in** | Rep outside customer geofence | Reason + free-text + GPS distance | Live feed + shift_events row |
| **Late check-in** | After grace period | Reason picker + note | Live feed + shift_events row |
| **Early check-in** | Before scheduled start | Captured if policy allows, otherwise blocked | Live feed + shift_events row |
| **Off-site check-out** | Rep left geofence early | Reason + note | Live feed + shift_events row |
| **Early check-out** | Before scheduled end | Reason picker + note | Live feed + shift_events row |
| **Unable to attend** | Rep raises flag | Reason + note + acknowledgement state | Live feed + Needs-action queue |
| **No-show** | Rep never checked in | Auto-flagged after end-time + grace | Live feed |
| **Auto check-out** | Rep forgot to check out | Sweep job logs the event | Live feed |

### Audit trail

- **Every action logs** to `shift_events` — who, what, when, shift_id, customer_id, meta JSON
- **35+ event types** in a typed enum
- **Tamper-evident** — events are insert-only (no client UPDATE/DELETE)
- **Live AND historical** — feeds Live Feed in real time AND powers reports retroactively
- **Defensible** — when a client questions a billed hour, "manager reviewed and signed off, here's the event log" is the answer

### Real-time delivery

- **Supabase Realtime** — Postgres logical replication → websocket → admin dashboard
- **In-app notification banners** — manager sees exceptions, requests, and unable-to-attend flags without leaving the page
- **Mobile event queue** — events queue in localStorage when offline, retry on reconnect

### Web Push notifications *(queued for next build, 2-3 days)*

- Shift assigned · shift cancelled · you're running late · manager approved your request · end-of-day reminder
- **Works on both iOS PWA** (16.4+, installed to home screen) **and Android Chrome**
- **App does not have to be open** — OS handles delivery
- No native wrap required

---

## 🎯 Representative use cases

### "Sarah needs a shift covered last minute"

1. Manager opens calendar, clicks the shift, taps **Edit here**, reassigns the rep — 4 taps without leaving the calendar
2. Or: cancels the assignment, leaving it claimable. Reps within 5km get a real-time notification
3. Mike claims it from his phone. Sarah's shift is gone from her list; Mike's appears in his
4. All three actions log to the audit trail with timestamps

### "Reps keep checking in off-site at Aria Cosmetics"

1. Manager opens Aria's customer page → Sites tab → tightens geofence from 100m to 50m for the smaller store
2. Or: opens Check-in rules in settings → bumps org default if the issue is systemic
3. Looks at Live Feed: filters by `event_type=shift.checked_in_offsite`, sees the pattern, decides the policy

### "Friday morning, 8 stops to do"

1. Rep opens the app, sees Up Next card with the first stop's leave-by time
2. Taps **Plan my day** → routes optimized for traffic → saves order → /shifts re-sorts to match
3. Taps **Start travelling** on the first shift → Maps opens with directions
4. Checks in within geofence → tasks open → completes them → checks out
5. Wrap-up animation plays → home dashboard → next shift's Up Next card already showing
6. Repeats. At the end of the day, **All shifts done — nice work** card appears
7. Taps it → **/day** cinematic recap: 8 stops · 6h 42m worked · 47 tasks done · 1h 18m travel · 0 exceptions

### "Client wants proof we visited their stores"

- **Today:** Manager runs the Timesheet report, exports CSV
- **Next build (the wow feature):** Photos taken on-shift → auto-generated branded client report with photos, GPS, completed tasks, weekly digest. Manager hits Send — client gets a beautiful weekly digest from the agency

### "Manager wants to spot-check what's happening right now"

1. Opens Live Ops dashboard
2. Map shows every checked-in rep's current position
3. Live feed shows the last 50 events streaming in real-time
4. Clicks a rep pin → shift details + check-in time + tasks done so far

---

## 🛠 Technical foundation

| Layer | Choice |
|---|---|
| **Frontend** | Next.js 16 App Router · TypeScript · Tailwind |
| **Backend** | Supabase: Postgres + Auth + Realtime + Storage + RLS |
| **Maps** | MapLibre GL + OpenFreeMap tiles (no API key) |
| **Routing** | Google Routes API for traffic-aware ETAs |
| **Hosting** | Vercel for both apps; auto-deploy on push to main |
| **Distribution** | PWA installable on iOS (16.4+) and Android |
| **Offline** | Event queue in localStorage, retries on reconnect |
| **Audit** | Every state change writes a `shift_events` row |

**Schema:** 14 core tables, idempotent date-versioned migrations, RLS in place (Phase 4 hardening queued).

**Cross-platform:** Single React codebase. Identical behavior on iOS Safari, iOS PWA, Android Chrome, Android PWA, desktop browsers. Per-platform helpers handle Maps hand-off + geolocation differences silently.

---

## 🗺 Roadmap (priority order)

1. **Phase 4 RLS hardening** — production blocker before paying clients
2. **Web Push notifications** — PWA-native, no Capacitor (2-3 day build)
3. **Photo evidence + auto-generated client reports** — the wow feature for agency clients (~3 weeks)
4. **Background GPS via Capacitor wrap** — when continuous tracking becomes a requirement
5. **Custom report builder** — clients build their own dashboards
6. **Payroll export integrations** — Xero / Sage / SA payroll systems

---

## Summary

Morpheus is a **complete operational loop** for field-ops agencies: schedule, dispatch, verify, audit, recap. Two apps, one backend, real-time everywhere, audit-defensible by default. Eight days of work has produced more functionality than most field-ops products ship in six months.

The path from "good internal tool" to "platform clients refuse to give up" is short:
**RLS hardening → photo evidence + client reports**. ~4 weeks of focused build.

---

*Engineering questions: see [README.md](./README.md) for full architecture, setup, database schema, and deployment notes.*
*Test plan: see [qa/QA_PLAN.md](./qa/QA_PLAN.md) for the coverage map and E2E checklist.*
