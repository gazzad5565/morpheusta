# Morpheus Ops — Marketing Brief

> Drop this entire document into your Marketing Muse (Claude) or ChatGPT
> marketing agent as the canonical product reference. Updated 2026-05-15.

---

## 1. Product name

**Morpheus Ops** *(formerly "Morpheus TA" — Time & Attendance — rebranded May 13, 2026 as the product outgrew the original T&A framing)*

- **Wordmark treatment**: "MORPHEUS" in dark/white ink + "OPS" in a brand-cyan rounded pill (`#15B4D6` at 18% opacity background, brand color text).
- **Use case for the agent**: When referring to the product write **"Morpheus Ops"** — never "Morpheus TA", "Morpheus T&A", or just "Morpheus".

---

## 2. One-line positioning

**Morpheus Ops — Workforce Operations. In real time.**

*(That second sentence IS the official tagline. "In real time" is rendered as a brand pill in the chrome to signal: live data, not stale reports.)*

---

## 3. What it does (60-second elevator)

Morpheus Ops is a **field workforce operations platform** for businesses that manage reps in the field — sales teams, merchandisers, delivery crews, service techs, auditors, inspectors. It pairs an **admin web console** (where managers schedule shifts, set tasks, and watch Live Ops in real time) with a **mobile PWA** that reps install on their phones to check in, complete tasks with photos and signatures, plan their route, and receive instant messages from HQ.

It replaces the typical patchwork of WhatsApp groups, spreadsheets, paper sign-in sheets, and "where is everyone right now?" phone calls with **one live system** that managers and reps both trust.

---

## 4. The problem we solve

Today, field-operations managers live in chaos:

- They schedule reps in spreadsheets, then WhatsApp the schedule to each rep individually.
- They have no real-time visibility into who actually checked in, who's late, who's at the wrong store, or who never showed up.
- Tasks are tracked on paper or in messy photos sent to a group chat — no audit trail, no client-facing proof, no enforcement.
- "Customer signed off" means a verbal confirmation, not a real signature attached to a real shift.
- When a rep can't make it, the manager finds out 20 minutes after the start time.
- End-of-day reconciliation is a four-hour spreadsheet job.

Morpheus Ops turns that into a **continuous live feed** plus a **proof-of-work archive**.

---

## 5. Who it's for

**Primary buyer**: the **Field Operations Manager** at a SMB or mid-market business — anyone with 5+ reps doing work at multiple customer locations. They're drowning in WhatsApp, spreadsheets, and "I'm at the customer but where do I go?" calls.

**Industries that fit cleanly:**

- **Merchandising** — reps visit retail stores, do stocktake / planogram audits, photograph shelves, get the store manager's signature.
- **Field sales** — reps call on customer accounts, log visits, capture orders.
- **Service / installation / inspections** — techs visit sites, complete a job checklist, capture before/after photos, get a customer sign-off.
- **Delivery / logistics** — drivers run a route, check in at each stop, capture proof-of-delivery.
- **Health & safety / compliance auditing** — inspectors visit locations, run a checklist, photograph findings, get a site rep's signature.
- **Cleaning / facilities** — crews check in at properties, complete a task list, photograph completed work.

**Daily users**:

- **Managers** (web): scheduling, oversight, reports, messaging, customer/rep admin.
- **Reps** (mobile): check in, work, check out, take photos, get signatures, see route, receive messages.

---

## 6. Feature inventory (with manager-side vs rep-side framing)

### Live Ops dashboard (admin)

- **Real-time map** showing every rep currently on shift, where they checked in, and the geofence around each customer site.
- **Today's Shifts** list with filters: All / Needs Action / In Progress / Travelling / On Break / Requested.
- **Live Feed** showing every event as it happens (check-ins, check-outs, requests submitted, tasks completed, photos captured, signatures captured, attention raised).
- **KPI strip**: shifts today, completion percentage, attention items, tasks done.
- **Needs Action queue** — single number that tells the manager exactly how many things demand their attention right now (pending rep requests + open unable-to-attend flags). Same number shown consistently in three places (sidebar badge, Live Feed pill, Today's Shifts tab) — managers never see drift between surfaces.

### Scheduling

- Single-shift and **multi-shift series** creation (set up a rep on a customer for 12 weeks in one form).
- **Calendar view** with drag-and-drop, 30-min slots, overlap warnings.
- **Series management** — edit or cancel an entire series with one action.
- **Claim radius** — managers can post unassigned shifts only to reps within X km of the customer.
- **Anytime today** (flexible time) shifts for "just visit them today, doesn't matter when."

### Customer / Site management

- **Multi-site customers** — every customer can have multiple physical sites (head office + branches).
- **Multi-contact per site** — name, phone, email, access notes for each contact.
- **Per-customer task lists** — managers configure which tasks reps must complete at each customer.
- **Per-customer exception toggles** — turn off geofence enforcement or timing rules for specific customers.
- **Customer signatures** on tasks — admin marks a task "require signature" and the rep app opens a signature pad on tap; the captured PNG is stored with the shift.
- **Photos on tasks** — admin sets photo count (e.g. "3 photos required"); rep app forces the rep to capture them before the task can be completed.
- **Reps can add customers** from the mobile app (new customer flow with address typeahead, geocoding, optional GPS-pin).
- **Reps can geocode** an existing customer's location when they're on-site and the system doesn't have coords yet.
- **Recently added customers pinned to the top** of the customer list in admin with a **"NEW" badge** until a manager opens the customer's detail page.

### Time & Attendance (rep mobile + admin)

- **Geofenced check-in** with off-site exception handling (rep can still check in if off-site, but tags the reason).
- **Late / Early check-in/out** with reason chips and configurable grace minutes.
- **Pause and resume** — rep can pause a shift (max 2 paused at once), check into another shift, then come back. The paused shift's timer freezes.
- **Auto-checkout** — server cron sweeps stale shifts overnight so a rep who forgot to check out doesn't leave a phantom open shift.
- **Travel state** — rep taps "Start travelling" before driving to the next stop; admin sees travelling vs in-progress vs on-break in real time.

### Tasks (admin sets up, rep completes)

- Per-task: name, description, duration estimate, **compulsory** flag, **photo count + photos compulsory**, **require signature**.
- Universal tasks (apply to every customer) and customer-specific tasks.
- Compulsory linking — when a task is required, its photos AND signature are required too, automatically.
- Rep sees clear pills on each task card: "Camera · 3 photos" / "Signed" / "Required" — what's expected at a glance.

### Photos (Feature C)

- Admin sets a photo count per task; the rep app forces those captures before complete.
- **Direct-camera-on-tap** flow — tapping a photo task opens the device camera immediately (no intermediate modal). Each capture chains to the next slot until done. Auto-completes the task on the last upload.
- Client-side compression (canvas-based) with three quality tiers (standard / high / maximum) configurable by the admin.
- Hard 2 MB cap per photo; auto-retries at lower quality until it fits.
- Stored in Supabase Storage, embedded by URL in future customer-facing reports.
- Works in **iOS standalone PWA** — most of the engineering investment is here, because iOS Safari's user-activation rules are brutal on the wrong patterns.

### Signatures (Feature D)

- Admin marks any task "require signature".
- Rep app opens a **full-screen signature pad** with smooth-line drawing (touch / Apple Pencil / mouse all supported).
- Customer signs, optional "signer name" field, save → captured PNG attached to the shift.
- Used for proof-of-delivery, end-of-visit sign-offs, compliance audits.

### Route planning ("Route")

- Mobile-side "Plan my day" — drag-to-reorder your stops, see total driving distance and time.
- Hourly background watcher that re-runs the optimiser; if a better order is found, a clear "Apply this new route" CTA appears.
- Calm-state and action-state icons (`route-done` green check / `route-alert` amber) so the rep always knows whether there's something to act on.
- Mock provider today (haversine × winding factor); ready to wire to Google Routes API for real ETAs + traffic.

### Messaging (Feature E)

- Manager → rep messaging with **audience picker**: All Reps / All Managers / Everyone / Specific Users.
- **Two delivery channels** per message: **Push** (OS notification, fires even when app closed) and **In-app banner + inbox** (quiet, only shown while rep is in the app). Either / or / both.
- **Send now** or **Schedule for later** (picked via datetime input; Vercel Cron sweeps due rows every minute).
- **Mobile inbox** with read/unread state, mark-all-read, real-time updates.
- **In-app banner** pops top-of-screen when a new message arrives (suppressed if rep is already on the inbox page).
- **Push tap deep-link** — tapping the OS notification opens the inbox with that specific message expanded.

### Web Push notifications

- Triggered automatically for: shift assigned / reassigned / cancelled, manager-broadcast messages, attention-raised events (rep flags "I can't make this shift"), running-late reminders, end-of-day check-out reminders.
- Org-wide **kill switch** — managers can flip all pushes off from `/settings/notifications`. Auto-checkout still runs independently.
- Configurable **EOD reminder buffer** — how long past a shift's scheduled end to wait before pinging the rep to check out.
- Multi-device support — one rep + N devices = N subscription rows; all get pinged.

### Library

- Managers upload reference files (PDFs, images, training materials) by category and customer.
- Reps see the files relevant to their assignments, tap to open.
- Real-time updates — a manager's upload appears on the rep's phone immediately.

### Reports

- Operations report — shift completion, exceptions, photo/signature coverage.
- Rep performance — shifts done, tasks completed, photos captured, signatures.
- Timesheet — hours worked, late/early/offsite events.

### Custom fields

- Managers can add custom fields to any entity (customer, rep, shift, task, library file).
- Field types: text, number, date, dropdown, multi-select.
- Surfaced on detail pages, optionally on the rep app.

### Settings

- Organisation: name, logo, **accent colour for the wordmark**, address, phone, email, tax number, website, registration number.
- Check-in rules: late grace minutes, early grace minutes, geofence radius default, location/timing exception toggles, photo quality tier, auto-approve shift requests.
- Messaging: push on/off, EOD reminder buffer, full reference list of every notification grouped by category.
- Custom Fields: builder UI for adding fields per entity.
- Managers / Users: invite + manage admin accounts, promote/demote roles.

---

## 7. Key technical differentiators (for technical-credibility copy)

- **Truly real-time** — Supabase Realtime websocket subscriptions, not polling. The Live Feed updates within ~100ms of an event landing in Postgres.
- **iOS PWA-first** — every interaction tested in iOS standalone PWA mode (the most restrictive environment). Photo capture, signature pad, location prompts, push notifications all work natively.
- **Geofence-aware** — every check-in is validated against the customer's GPS coords and a configurable radius.
- **Offline-tolerant** — event queue + retry logic so a rep losing signal mid-task doesn't lose work.
- **Phase 4 RLS hardened** — database-layer role enforcement. A motivated rep cannot `curl` Supabase and modify customers / shifts / tasks / app settings. Managers and reps have genuinely different DB powers, not just UI gates.
- **Push delivery with auto-prune** — dead subscriptions get cleaned up automatically. Multi-device support out of the box.
- **Scheduled tasks via Vercel Cron** — running-late reminders, EOD check-out nudges, auto-checkout sweeps, scheduled message dispatch.

---

## 8. Pricing & packaging (forward-looking)

**Today's commercial position**: single product, one tier.

**Coming Pro tier (visible as locked items in admin):**

- **Advanced Auditing** — compliance / regulatory audit workflows, deeper task logic, audit-trail exports.
- **Sales Orders** — order capture on the rep app, customer-line-item picking, integration with downstream invoicing.

(Both are tagged with a 🔒 PRO lock icon in the admin Tasks sub-nav as upgrade prompts — the foundation is ready, billing isn't wired yet.)

---

## 9. Brand voice & tone

**Personality**: confident, calm, designed. We sound like we know what we're doing without being smug.

**Lead with the verb**: "Pin the location." / "Take three photos to complete." / "Switch shifts in one tap." — not "You can pin a location" or "Our software allows users to…".

**Don't**:

- Don't oversell with superlatives ("the world's best", "revolutionary", "game-changing").
- Don't use enterprise SaaS clichés ("synergy", "leverage", "robust", "best-in-class", "seamless").
- Don't be bro-y or hustle-culture ("crush it", "ship it", "let's gooo").
- Don't over-promise on technical claims we can't substantiate.

**Do**:

- Use specific numbers when we have them ("auto-checks every hour", "2 MB photo cap", "geofence at 100m").
- Show the human stakes ("the rep finds out you reassigned them within a second", "no more end-of-day spreadsheet reconciliation").
- Lean into the calm-but-alive aesthetic: real-time without panic, designed without being cold.
- Use "your team" or "your reps" — never "users" in user-facing copy.

**Sample voice references**:

- Linear (the issue tracker) — minimalist, confident, technically-credible.
- Stripe — clean, well-documented, respect for the reader's intelligence.
- Superhuman — fast, deliberate, every detail considered.

---

## 10. Sample taglines & messaging angles

**Master tagline:**
> **Workforce Operations. In real time.**

**Variants for different surfaces:**

- *Hero (Home page):* "Your reps in the field. Your operations in real time."
- *Hero (alt):* "Run your field team like you can see them. Because now you can."
- *Subhead under hero:* "Schedule, message, audit, and prove every customer visit — without the WhatsApp groups and the spreadsheets."

**Sub-themes (good for blog / paid):**

1. **Proof of work** — "Every photo, every signature, every check-in: attached to the right shift, the right customer, the right rep. End of day, the receipts already exist."
2. **No more WhatsApp groups** — "Schedule changes, route updates, urgent messages — Morpheus Ops replaces the 11pm 'who's where tomorrow?' WhatsApp scramble."
3. **One source of truth** — "Live Ops, Schedule, Reports, and the rep app all read from the same numbers in the same instant. No drift. No 'but my spreadsheet says…'."
4. **Built for the phone the rep already has** — "Installs as a PWA on iPhone or Android. No app store. No IT department. No company-issued device."
5. **Auto-everything** — "Late check-in reminder, auto check-out at midnight, route re-optimisation every hour, push notification when something needs you. Your team's day runs itself."

**Pain-point hooks** (good for paid social):

- "Stop chasing the rep who forgot to check out."
- "Stop reconciling a paper sheet against your scheduling spreadsheet."
- "Stop screen-shotting the WhatsApp roster to send to a new starter."
- "Stop wondering if the photo your rep sent is actually from the right store."

---

## 11. Audience-specific value props

### For the manager
- **You'll know.** Whether your reps are on-site, on time, on task — without phoning to ask.
- **You'll prove it.** Every photo and signature is timestamped, geo-tagged, and attached to the right shift. Court-defensible if you ever need it; client-receipt-quality always.
- **You'll get your evenings back.** End-of-day reconciliation that used to take three hours is now zero.
- **You'll scale.** From 5 reps to 50 reps with the same admin overhead.

### For the rep
- **It's their phone, their tap.** Check in, complete tasks, take photos, get a signature, check out. Done.
- **No paperwork.** No "remember to email me the photos at the end of the day." It's already in the system.
- **They get told.** Schedule changes, route updates, urgent notes from the manager — push notification on their phone, not buried in a group chat.
- **It's calm.** No "you have 14 unread items" red badge ocean. Clear states. One thing at a time.

### For the business owner / CFO
- **Audit-ready records.** Every shift, every task, every customer visit, every signature — searchable, exportable.
- **Hour-honest payroll.** Real check-in/check-out timestamps replace honour-system timesheets.
- **One subscription, one platform.** No more paying for WhatsApp Business, a scheduling SaaS, a forms tool, and a separate file share.

---

## 12. Competitive landscape (rough framing)

**Adjacent but not direct:**

- **Generic field-service tools** (ServiceTitan, Jobber): built for trades — invoicing-heavy, complex pricing, expensive. We're lighter, faster, mobile-first.
- **Time clock apps** (Hubstaff, Clockify): check-in only. We're the check-in plus everything around it.
- **Workforce-management enterprise** (Quinyx, Deputy): roster-heavy, complex to roll out. We're rep-first and live in a day.

**Our wedge:**

- **Live Ops dashboard** specifically (real-time map + feed + needs-action queue in one view).
- **Proof-of-work archive** (photos + signatures attached to shifts, not floating in a chat).
- **PWA-first deployment** (no app store, no IT, no device fleet).

---

## 13. Glossary (so the marketing agent uses our language)

| Term | What it means |
|---|---|
| **Live Ops** | The admin home page — map + feed + Today's Shifts. The manager's command centre. |
| **Needs action** | Anything that requires a manager decision: pending shift request OR open unable-to-attend flag. One number across all surfaces. |
| **Shift** | A scheduled visit by a rep to a customer site, with a window and a task list. |
| **Site** | A physical location belonging to a customer. Every customer has at least one (the head office); multi-site customers have more. |
| **Geofence** | The radius around a site's GPS coords inside which a rep can check in "on-site". |
| **Attention** | A rep-raised flag that they can't make a scheduled shift. Surfaces in the Needs Action queue until the manager resolves. |
| **Claimable shift** | An unassigned shift any qualifying rep can pick up themselves. |
| **Route** | The rep's planned order of stops for the day. Optimised. Live re-checked hourly. |
| **Task** | A discrete unit of work at a customer (e.g. "Audit cooler section"). Can require photos and/or a signature. |
| **PWA** | Progressive Web App — installable from a browser, no app store. |
| **Realtime** | Supabase Realtime — postgres_changes events streamed over websocket. Sub-second propagation from one device to another. |

---

## 14. Tech stack (one-liner per layer, for credibility)

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind.
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage + RLS).
- **Hosting**: Vercel (admin + mobile both as separate Vercel projects; Vercel Cron on Pro).
- **Push**: Web Push with VAPID keys (rep PWA + admin server-side fan-out).
- **Maps**: MapLibre GL with OpenFreeMap tiles (free for low-volume; Google Routes API ready to wire for real ETAs).
- **Geocoding**: Nominatim proxy (server-side).

---

## 15. Where it lives

- **Admin web app**: https://morpheus-admin.vercel.app
- **Mobile rep app (PWA)**: https://morpheusta-khaki-omega.vercel.app
- **Source**: https://github.com/gazzad5565/morpheusta

---

## 16. What's intentionally NOT in scope (yet)

- **Native iOS / Android apps** — PWA is deliberate (no app store friction). Capacitor wrap is on the roadmap if background GPS becomes a priority.
- **Payments / invoicing** — out of scope; integrates with whatever billing system the customer already uses.
- **HR functions** (PTO, payroll integration) — not the wedge; we're operations, not HR.
- **Inventory / stock counts** — adjacent, lives in the Pro tier (Sales Orders) when it ships.

---

## 17. Founder / origin story (for "About" page / press)

Morpheus Ops was built by Gary Durbach in 2026 to solve his own multi-brand field-operations problem. After years of watching merchandising teams, sales reps, and service crews live in WhatsApp groups and broken spreadsheets, he built the tool he wanted: one live dashboard, one mobile app for the rep, every action proven and stored. The first 60 days of development saw 5 major features (rep-added customers, on-site geocoding, photos on tasks, customer signatures, in-app messaging) ship end-to-end alongside Phase 4 RLS hardening and Web Push. It's been used in production from day one.

---

## 18. Marketing pillars (organise campaigns around these)

1. **Real-time operations** — the live dashboard, the realtime feed, the "you'll know" promise.
2. **Proof of work** — photos, signatures, audit trail, court-defensible records.
3. **Designed for the rep's phone** — PWA, calm UX, native camera/signature/maps.
4. **Replaces the WhatsApp + spreadsheet stack** — consolidation story for the budget holder.
5. **Audit-ready from day one** — for regulated industries (health, safety, compliance audits).

---

## 19. Naming conventions for the marketing agent

- **Product name**: Morpheus Ops (full) or MORPHEUS Ops (logotype). Never abbreviate to "Morpheus" or "MOps".
- **User roles**: "Manager" and "Rep". Never "user" / "admin user" / "end user" in copy.
- **The admin app**: refer to it as "the admin" or "the admin console". Never "the dashboard" alone (the dashboard is the Live Ops page specifically).
- **The mobile app**: refer to it as "the rep app" or "the mobile app". Never "the user app".
- **Tagline**: always "Workforce Operations. In real time." — the period after "Operations" is intentional.

---

## 20. Quick reference — what to ask the marketing agent for

- **Hero copy + subhead** for the homepage.
- **5-page sequence**: Home / How it works / For your team / Pricing / About.
- **Paid social hooks** — 10 variants for LinkedIn, 10 for Meta.
- **Cold email sequence** to merchandising / field-sales agency owners.
- **Blog cluster (5 posts)** around the "WhatsApp + spreadsheets" pain.
- **One-pager PDF** for sales conversations.
- **Demo script** for a 15-min sales call.
- **Onboarding email sequence** for newly-signed customers.
- **Case study template** for the first three users.

---

*Brief written 2026-05-15. If the agent needs more specifics on any
feature, point it at the README.md in the same repo — that has the
complete commit-by-commit shipment log including every iteration on
the design + the technical reasoning behind every decision.*
