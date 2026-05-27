# Session log — every day's commits, what + why

> Reverse-chronological log of every coding session, with the
> rationale for each significant commit. **Fresh chats should
> read the latest entry first** to understand the current state
> of the codebase, then scroll deeper only if a specific feature
> or bug area needs context.
>
> Older entries are kept verbatim as the canonical record of
> what shipped and why — never delete entries, only append new
> ones above.

---

## Quick TOC

- [May 27, 2026 (very-very late) — /settings/rep-types page + Users page UX parity](#todays-session--what-shipped-may-27-2026-very-very-late)
- [May 27, 2026 (very late) — rep_type propagation: chips everywhere reps appear + claimable_rep_types shift restriction](#todays-session--what-shipped-may-27-2026-very-late)
- [May 27, 2026 (late) — rep types + capability flags (canCreateCustomers)](#todays-session--what-shipped-may-27-2026-late)
- [May 27, 2026 (later) — resizable columns + customer overview contacts + shifts tab expanded](#todays-session--what-shipped-may-27-2026-evening)
- [May 27, 2026 — pagination on every long list page (5 surfaces)](#todays-session--what-shipped-may-27-2026)
- [May 25, 2026 — Import hub Phases A → E shipped end-to-end + uniqueness/link clarity pass](#todays-session--what-shipped-may-25-2026)
- [May 21, 2026 — photo viewer + customer detail refactor + past shifts archive](#todays-session--what-shipped-may-21-2026)
- [May 15, 2026 — overnight sidebar polish](#todays-session--what-shipped-may-15-2026--overnight)
- [May 14, 2026 — Phase 4 RLS + photo capture root cause + polish day](#todays-session--what-shipped-may-14-2026)
- [May 13, 2026 — five features end-to-end (A–E) + messaging](#todays-session--what-shipped-may-13-2026)
- [May 12, 2026 — Plan-my-day overhaul + /day end-of-day recap](#todays-session--what-shipped-may-12-2026)
- [May 11, 2026 — cancellation, photos, exception toggles, engineering pass](#todays-session--what-shipped-may-11-2026)
- [May 8, 2026 — multi-site customers schema + admin Sites tab](#todays-session--what-shipped-may-8-2026)
- [May 7, 2026 — calendar, schedule rewrites, broad UX pass](#todays-session--what-shipped-may-7-2026)
- [May 6, 2026 — auto-checkout, organisation settings, indexes](#todays-session--what-shipped-may-6-2026)

---

### Today's session — what shipped (May 27, 2026, very-very late)

Gary's feedback right after the rep-types ship: vocabulary management
isn't discoverable enough (the modal-on-/settings/managers is buried),
and the Users page itself is inconsistent with every other list page
in the admin (no row click, no search, no type filter).

#### 1. Vocabulary management gets a first-class Settings page

- **New page `/settings/rep-types`** — dedicated CRUD surface for the
  rep-type vocabulary + per-type capability flags. Same shape as
  the modal it replaces (name input, "Can add customers?" checkbox,
  trash button to remove, add-from-bottom row, single Save button)
  but as a regular page so it shows in the Settings rail and gets
  the natural URL `/settings/rep-types`.
- **`SettingsShell.SETTINGS_SECTIONS`** gains a "Rep types" entry
  between Users and Check-in rules. Glyph: `tasks`. Description
  spells out what types control (filtering + claim restrictions +
  mobile capability flags).
- **`/settings/managers`** loses the "Manage rep types" button
  from its actions row — that action is now in the Settings rail
  where it belongs.
- **`components/users/ManageRepTypesSheet.tsx`** deleted (was the
  modal that opened on the old button). The page replaces it
  entirely; no callers reference the modal anymore.
- The new page warns inline that renaming a type doesn't cascade
  to existing profiles.rep_type or shifts.claimable_rep_types
  arrays — same disclosure that was in the modal, kept verbatim.

#### 2. Users page (`/settings/managers`) — UX parity with other list pages

Three changes to bring it in line with `/reps`, `/customers`, `/tasks`,
`/library`:

- **Clickable rows** — every row now navigates to
  `/settings/managers/<id>/edit` on click (and on Enter / Space for
  keyboard users). `role="button"`, `tabIndex={0}`, `cursor: pointer`.
- **Edit pencil button removed** — was redundant with the new
  row-click behaviour. The Promote/Demote button remains as an
  in-place action, wrapped in a `<div onClick={stopPropagation}>`
  so clicking it doesn't bubble up to the row-level navigate
  handler.
- **Search box** added to the filter row — free-text matches name,
  email, role, and rep_type. Same shape (left search glyph, right
  ✕ clear button, 220px width) as the search box on `/reps` /
  `/tasks` / `/library`.
- **Rep-type filter `<select>`** added between the role filter
  chips and the search box. Brand-tinted accent when active.
  Hidden when the vocabulary is empty. Mirrors the same control
  on `/reps`.
- **`filtered` useMemo** extended to apply both the type filter
  and the search (alongside the existing role filter). All three
  inputs reset pagination to page 0 via the existing
  `useEffect([filter, typeFilter, search]) → setPage(0)` hook.

#### Acceptance

- ✅ `next build` clean — 40 routes (added one for the new page).
- Reps + managers no longer need an Edit pencil to enter the edit
  form; clicking anywhere on the row (or pressing Enter when
  focused) does it. The Promote/Demote button still works in
  place without triggering navigation.
- Filtering / searching the Users page works the same way as
  filtering / searching the Reps page.

#### Notes — small

- **No mobile change** in this batch. Pure admin UX.
- **No DB change.** All work is in lib + page TSX files.
- **The settings-managers route URL stays `/settings/managers`**
  for historical link compatibility even though the sidebar label
  is "Users". The Settings rail's `id` for highlighting is also
  unchanged (`managers`). When that ever feels off we'd add a 301
  from `/settings/managers` → `/settings/users` and rename.

---

### Today's session — what shipped (May 27, 2026, very late)

Gary's follow-up after the rep-types ship: surface the rep_type
**everywhere** reps appear in the admin, plus add a per-shift
restriction so "unassigned" can mean "claimable by Sales Reps only"
rather than "claimable by any rep". Three pieces:

#### 1. Sample reps.csv carries a rep_type column

- `public/import-templates/reps.csv` updated — the three example
  rows now include `rep_type` values (Sales Rep / Merchandiser /
  Driver) matching the seeded vocabulary. The import adapter's
  column was already in place from the previous commit; the sample
  just demonstrates it.

#### 2. Rep type displayed everywhere reps appear

- **`/reps` Grid view** — small chip on each card under the email
  (only renders for role=rep with a non-null rep_type).
- **`/reps` Table view** — chip stacked under the RolePill in the
  Role column.
- **`/reps/[id]` rep detail page** — new "Type" row in the header
  card alongside Email / Joined / Role.
- **Rep pickers (Combobox sublabels)** — three sites updated:
  `/shifts/[id]/edit` rep dropdown, `/schedule/manage` rep filter,
  `/schedule` rep filter. Sublabel format: `"<email> · <rep_type>"`
  when set; falls back to plain email when not. Helps the manager
  know who they're assigning to at a glance.
- **`RepScopePicker`** (used by `/schedule/new`) — second-line text
  appends `· <rep_type>` when the rep has one. Same affordance as
  the comboboxes elsewhere.
- One small helper component: `RepTypeChip` inside
  `app/reps/page.tsx` (kept local because it's only used twice in
  the same file — extracting to `components/ui/` is overkill).

#### 3. `shifts.claimable_rep_types` — per-shift type restriction

The big one. Until now an "unassigned" shift was claimable by **any**
rep. Now a manager can narrow the audience to specific rep types.

- **Migration `2026_05_27_shifts_claimable_rep_types.sql`** (PENDING):
  one column `shifts.claimable_rep_types text[] NULL`. NULL or empty
  = any rep (backwards compatible — existing claimable shifts behave
  unchanged on next deploy). Non-empty = only reps whose
  `profiles.rep_type` is in this array. Values are type NAMES from
  `app_settings.rep_types`. Safe to re-run.

- **Admin `lib/shifts-store.ts`** — `ShiftRow`, `NewShift`, and
  `ShiftPatch` all gain `claimable_rep_types: string[] | null`.
  `createShift` writes `null` for empty arrays so the "any rep"
  path has a single representation on read. `updateShift` normalises
  the same way in its `cleaned` step.

- **Mobile `lib/shifts-store.ts`** — `ShiftRow` gains the field. JSDoc
  notes the strict-by-default semantics (uncategorised reps don't
  match restricted shifts — opposite of the lenient
  canCreateCustomers default; explained below).

- **Admin `/schedule/new`** — when "Unassigned (claimable)" is the
  selected rep scope, a new "Restrict claim by rep type" Field
  appears with pill-style multi-select checkboxes (one per vocabulary
  entry). Empty selection = any rep (default). Inline help line
  spells out the effect when at least one is ticked. Field hides
  when no types exist in the vocabulary. Stored in
  `claimable_rep_types` on insert regardless of repScope (same
  "preserve through release" pattern as `claim_radius_m`).

- **Admin `/shifts/[id]/edit`** — same multi-select Field, visible
  only when the shift is currently unassigned (editing a restriction
  on an assigned shift would confuse the UX; the manager can edit
  it when they next release). Hydrated from `shift.claimable_rep_types`
  on mount. Passed through `updateShift`.

- **Mobile `listUnassignedShiftsToday`** — fast path preserved
  (skip the profile fetch when NO shift carries a restriction).
  When at least one shift is restricted, we fetch the current rep's
  profile once and filter the row set. **STRICT** behaviour:
  uncategorised reps don't match anything, so they don't see
  restricted shifts. Different from the lenient
  `canCreateCustomers` capability check — the rationale is in the
  in-file comment: capability defaults protect new reps, explicit
  restrictions deliberately narrow.

- **Mobile `claimShift`** — belt-and-braces server-side check. Even
  if a rep gets a stale shift id (list was loaded before a manager
  tightened the restriction), the claim call refetches the shift,
  re-verifies the rep type matches, and returns a clear error if
  not. Still client-side trust — a curl-savvy rep with a JWT could
  bypass — but closes the "stale list" hole.

#### Acceptance

- ✅ `next build` clean on BOTH admin (39 routes) and mobile (21
  routes). Zero warnings, zero TS errors.
- ⏳ Operator: apply
  `db/migrations/2026_05_27_shifts_claimable_rep_types.sql` (safe
  to re-run).
- ⏳ Smoke test: on `/schedule/new`, leave the shift unassigned,
  tick "Sales Rep" on the restriction multi-select, save. As a
  rep with `rep_type='Merchandiser'`, the claim list shouldn't
  include this shift. As a Sales Rep, it should. Try to deep-link
  the merchandiser's mobile app to `claimShift(<id>)` directly →
  rejected with a clear error.

#### SECURITY note — same posture as before

Client-side enforcement only. The mobile UI hides restricted shifts
from the claim list + the claim function rejects mismatched types,
but a motivated rep with curl + JWT could still INSERT
`rep_id = auth.uid()` on a restricted shift directly. Phase 4 RLS's
`shifts_rep_self_update` allows `rep_id = auth.uid() OR rep_id IS
NULL` without checking `claimable_rep_types`. Hard block would need
that policy to look up `profiles.rep_type` + the array. Same
deferred-upgrade story as `canCreateCustomers`. Sufficient for
accidental-misuse + clean-UX; not security-grade.

#### Notes — deliberately small

- **No mobile UI to display the type on the rep's own /profile**.
  Same scope decision as before — could add a read-only line later
  if Gary wants reps to see their own type.
- **No retroactive rename handling on the vocabulary.** Renaming
  "Sales Rep" → "Account Manager" in the modal does NOT update
  `claimable_rep_types` arrays on existing shifts. They keep the
  old name and become effectively unclaimable (no rep matches).
  Future polish: warn before destructive renames + offer a cascade.
- **No filter chip on /reps for claimable_rep_types** — that's a
  per-shift attribute, not a rep attribute. The rep type filter
  on /reps is for filtering REPS by their type. (Worth mentioning
  because the two feel related; they're not the same surface.)

---

### Today's session — what shipped (May 27, 2026, late)

Rep types (Option C from the design discussion) — admin-managed
vocabulary in app_settings, single-type-per-rep on profiles.rep_type,
per-type capability flags. First flag: `canCreateCustomers` — drives
whether the mobile Add Customer affordance shows. Lays the pattern
for future capability flags (canRequestShifts, canViewOtherReps,
etc) — add one key to RepTypeConfig + one check at the call site.

**Cross-platform considered:** mobile change covers iOS Safari PWA +
Android Chrome identically. The capability check runs on mount via
useEffect (no user-activation sensitivity); the "Back to home" CTA on
the blocked state is a synchronous `router.push` — both stay inside
the OS's tap-event chain.

**SECURITY NOTE flagged explicitly:** client-side enforcement only.
The mobile UI hides the Add Customer entry point and the page itself
renders a friendly block message on direct nav, but a motivated rep
with curl + their JWT could still INSERT a customer (Phase 4 RLS's
`customers_rep_insert` policy allows any authenticated user with
`created_by_rep_id = auth.uid()` to insert). A hard block would
require tightening that policy to look up `profiles.rep_type` +
`app_settings.rep_types` capabilities — doable but deferred until
Gary explicitly needs it. Today's level is sufficient for accidental-
misuse + clean-UX, same posture as most other "manager-only" UI
affordances pre-Phase-4 hardening.

#### What shipped

- **Migration `2026_05_27_profiles_rep_type.sql`** (PENDING — apply
  in Supabase SQL Editor). One nullable text column
  `profiles.rep_type` + a partial index `WHERE rep_type IS NOT NULL`
  + an `app_settings.rep_types` seed with three starter types:
  - Sales Rep — canCreateCustomers: true
  - Merchandiser — canCreateCustomers: false
  - Driver — canCreateCustomers: false
  Safe to re-run. ON CONFLICT DO NOTHING on the seed so re-running
  after a manager has edited the vocabulary doesn't stomp them.

- **`lib/settings-store.ts`** (admin + mobile, near-identical
  shapes):
  - `RepTypeConfig` interface — `{ name, canCreateCustomers }`.
  - `getRepTypes()` — defensive parser. Trims, dedupes names,
    coerces missing `canCreateCustomers` to `true` (allow-all)
    so a legacy or hand-edited row doesn't silently block.
  - `setRepTypes(list)` (admin only) — same defensive
    sanitisation on write.
  - `repTypeCan(types, typeName, "canCreateCustomers")` — pure
    capability check. Unknown / null typeName defaults to `true`
    (allow-all) so uncategorised reps aren't silently blocked
    from existing flows.

- **`components/users/ManageRepTypesSheet.tsx`** (admin, new) —
  centred modal CRUD for the rep-type vocabulary. Mirrors
  `ManageCategoriesSheet` from `/library` but with two columns per
  row (name + "Can add customers?" checkbox) and a 540px width to
  fit. Add new types from a bottom row with the same shape. Rename
  + toggle + remove all live until Save commits via `setRepTypes`.

- **`/settings/managers`** gets a new "Manage rep types" button in
  the actions slot alongside Import + Add user. Modal mounts at
  page root. On-save updates the local state so the dropdown on
  the edit page (below) sees fresh values without a refresh.

- **`/settings/managers/[id]/edit`** gains a "Rep type" field
  rendered only when `role === "rep"` (managers don't have one).
  Native `<select>` driven by the live vocabulary; "— Uncategorised
  (allow all) —" is the leading option. Inline help points the
  manager at the new modal for editing the vocabulary itself.
  `updateUser({rep_type})` plumbed through `/api/users` PATCH +
  the client `users-admin.ts` shape. Empty string clears the
  category server-side.

- **`/reps` list page** gets a "By type" `<select>` in the filter
  row between the existing role chips and the search box. Renders
  only when types exist. Sets the same brand-tinted accent when a
  filter is active. Pagination resets to page 0 on type-filter
  change (same pattern as other filters on the page).

- **Phase D import adapter (`lib/import-adapters/user.ts`)** gets
  an optional `rep_type` column on the REP adapter (manager adapter
  omits it — there's no manager-type concept). Auto-mapped from
  common header synonyms ("rep type", "type", "category", "rep
  category", "role type"). Validation happens server-side in
  `/api/import/users` against the live vocabulary — unknown values
  are rejected with the list of valid options included in the
  error so the import wizard's failures CSV is actionable. Server
  uses the canonical-cased name from the vocabulary so
  "sales rep" / "Sales Rep" don't drift on profiles.

- **`/api/users` PATCH** — extended to accept `rep_type` (trims,
  empty string clears the category). Update path on
  `/api/import/users` only touches `rep_type` when the import row
  specified one, so an update-mode import that omits the column
  doesn't wipe an existing categorisation.

- **Mobile `lib/profiles-store.ts`** — Profile gains `rep_type`,
  `getMyProfile()` SELECT pulls it.

- **Mobile `components/SideMenu.tsx`** — fetches the live vocab +
  the rep's profile on mount, computes `canAddCustomers` via
  `repTypeCan`, hides the Add Customer menu item when the type's
  capability is `false`. Pattern is one `if (it.id === ... && !cap)
  return null;` guard inside the `ITEMS.map` loop — extensible to
  future capability-gated items by adding the same line per id.

- **Mobile `/add-customer` page** — belt-and-braces guard renders a
  friendly "Not enabled for your rep type" block screen instead of
  the form when the capability check fails. Covers the deep-link /
  browser-history scenario where the SideMenu's hide doesn't
  intervene. "Back to home" CTA inside.

#### Acceptance

- ✅ `next build` clean on BOTH admin (39 routes) and mobile
  (21 routes). Zero warnings, zero TS errors.
- ⏳ Operator: apply `db/migrations/2026_05_27_profiles_rep_type.sql`
  in Supabase SQL Editor (safe to re-run).
- ⏳ Smoke test: open `/settings/managers` → click Manage rep types
  → edit / add a type → save. Edit a rep → set their type →
  save. Open `/reps` → filter by type. Log in as that rep on
  mobile → Add Customer hidden if type's `canCreateCustomers` is
  false.

#### Notes — what's deliberately small

- **One capability flag for now.** `canCreateCustomers` is the only
  flag. Adding more (canRequestShifts, canViewOtherReps, etc) is
  one key on `RepTypeConfig` + one row in the modal + one call-site
  check each.
- **No RLS upgrade.** Client-side enforcement is the trade-off
  surfaced clearly in commit messages and this entry. Future hard
  block: tighten `customers_rep_insert` to read
  `profiles.rep_type` + look up the capability via a SECURITY
  DEFINER helper.
- **Rename consequences.** Renaming a type in the modal does NOT
  rename existing `profiles.rep_type` rows. Those keep the old
  name and become effectively uncategorised (unknown type =
  allow-all). A future "Rename + cascade" affordance would migrate
  rows; not in today's scope.
- **No mobile UI to display the type** beyond hiding affordances.
  Reps don't currently see their assigned type — could add a
  read-only line on `/profile` later if requested.

---

### Today's session — what shipped (May 27, 2026, evening)

Three Gary asks stacked on top of the morning's pagination work — none
need a deploy of their own; all sit safely local until GitHub's "Git
Operations degraded" incident clears (commits stack on the same
unpushed `main`; one push when GitHub recovers).

#### 1. Resizable columns on every paginated list page

- **`lib/use-column-widths.ts`** (new) — localStorage-backed hook.
  One key per page (`morpheus.cols.<page>.v1`). Materialises any non-
  px default (like `2.4fr`) into a sensible px fallback on first
  resize; from then on all widths are pure px so the drag math is
  trivial (delta-x → new px). MIN_COLUMN_PX = 60 enforced. Returns
  `{widths, gridTemplateColumns, setWidth, resetColumn, resetAll}`.
  Hydration deferred to a `useEffect` (not state init) because
  localStorage isn't available during Next.js's SSR/prerender pass.
- **`components/ui/ColumnResizer.tsx`** (new) — small absolute-
  positioned drag handle. 6px-wide hit area, brand-tinted line on
  hover/drag. Mouse-down → window-level mousemove tracks delta;
  mouse-up releases. Body cursor + user-select locked during drag
  so the OS cursor doesn't flip back and the header text doesn't
  get accidentally selected. Double-click resets that column to
  its default.
- **5 pages wired**:
  - `/tasks` — defaults `[360, 240, 100, 100, 80, 90]`. Resizers on
    Task / Customer / Duration / Type / Order headers.
  - `/settings/managers` — defaults `[280, 200, 110, 130, 110]`.
    Added a new column-header row (didn't exist before — needed it
    as the natural place for resize handles; matches the style on
    the other 4 pages).
  - `/library` (Table view only) — defaults `[320, 220, 110, 90, 90, 90]`.
    Grid view doesn't have columns.
  - `/reps` (Table view only) — defaults `[260, 260, 110, 140, 130]`.
    Resizers wrap each `<SortableHeader>` in a positioned div. Hook
    lives inside the `TableView` function so Grid view (which doesn't
    use these) doesn't even instantiate the state.
  - `/customers` (Table view only) — defaults `[360, 140, 260, 90, 90]`.
    Same `<SortableHeader>` wrapping pattern as `/reps`. Map view
    bypasses (pins, not columns); Grid view bypasses (auto-flow).
- Every paginated list page's Card got `overflowX: "auto"` so
  widening a column past container width opens a horizontal scroll
  instead of breaking the layout.
- **Design choice — client-side persistence only.** localStorage
  is per-browser. Different machine = defaults again. Server-side
  sync (writing widths to `app_settings` or a `user_prefs` table)
  is deferred until it's actually painful — most managers stay on
  one workstation.

#### 2. Customer detail Overview — contacts + clickable address by default

Gary's screenshot: opens a customer, sees stat cards + LOCATION map
+ address — but to read an email or phone he had to click into the
Contacts tab. Surface that on Overview.

- **`OverviewTab.tsx`** gains a new CONTACTS card above LOCATION.
  Fetches via `listCustomerContacts(customer.id)` on mount (same
  pattern as `ContactsTab` — inline fetch, no new parent prop). Up
  to 3 active contacts shown; each row is name + role label + `mailto:`
  email + `tel:` phone, all clickable. "+N more · open the Contacts
  tab" line when there are more than 3. Empty state ("None yet —
  open the Contacts tab to add the first one") replaces nothing —
  small, polite.
- **Address now clickable** — wraps the address line in an anchor
  pointing at `https://www.google.com/maps/search/?api=1&query=<address>`
  with target=_blank. Tooltip "Open in Google Maps". Visual: same
  ink colour, dotted underline so it reads as actionable without
  fighting the layout.
- **Constant `OVERVIEW_CONTACT_LIMIT = 3`** at the top of the file
  so the cap is a one-line change if Gary later wants 5 or 10.

#### 3. Customer detail — "Today's shifts" → "Shifts" (past + today + upcoming)

- **Tab label** in `/customers/[id]/page.tsx` renamed `Today's shifts`
  → `Shifts` (one line).
- **Data fetch widened** — replaced `listShifts({ limit: 200 })`
  (which is today-only) with `listShiftsInRange(isoDaysAgo(90),
  isoDaysAgo(-365))`. Window covers last 90 days back + one year
  forward — wide enough for Past + Today + Upcoming filters without
  an unbounded scan.
- **`ShiftsTab.tsx` rewritten** to handle the new data shape:
  - Filter chips: `All · N` (default) / `Today · N` / `Past · N` /
    `Upcoming · N`. Counts compute from `shifts` against
    `todayLocalISO()`.
  - New **Date** column added to the row layout (`110px 130px 1fr
    110px` = Date | Time | Rep | State). Date renders as "Today"
    (brand-deep) for today's shifts, otherwise `formatDate(...)`.
  - **Sort newest-first** by date then start_time so a manager
    scanning a customer's recent history lands on the most relevant
    rows first.
  - **Paginated** with the same `<Pagination>` component as the
    list pages (50 per page; resets to page 0 on filter change).
- **Overview's `shiftsToday` stat** fix — `shifts.length` no longer
  equals "today only" since the fetch was widened. Parent page now
  computes it inline as `shifts.filter((s) => s.shift_date ===
  todayLocalISO()).length`. One-line fix in the props block.
- **Empty states** split into two cases: zero shifts in the whole
  90-day window → `<EmptyState>` with a "Schedule a shift" CTA;
  zero matches under the current filter → terse "No shifts match
  this filter." line.

#### Acceptance

- ✅ `next build` clean after each of the 3 changes — 39 routes,
  zero warnings, zero TS errors. Final build re-verified after all
  three landed together.
- ✅ Resizable: dragging the divider between two header cells widens
  / narrows that column without shifting neighbours; double-click
  resets; reload preserves the user's widths via localStorage.
- ✅ Customer Overview: shows up to 3 contacts with mailto: / tel:
  links + a Google Maps link on the address.
- ✅ Customer Shifts: tab renamed; All / Today / Past / Upcoming
  filter chips work; Date column shows; pagination kicks in at >50
  shifts.

#### Notes — deferred deliberately

- **`/past-shifts`** (the dedicated archive page) still uses the
  `PAST_SHIFTS_DEFAULT_LIMIT = 2000` cap pattern; not folded into
  the new Pagination component yet. Same approach would work but
  outside today's "5 paginated list pages" scope.
- **Customer Overview `+N more` link** doesn't auto-switch to the
  Contacts tab — that would require threading an `onJumpToTab`
  callback down from the parent page. Kept as a plain hint instead
  ("open the Contacts tab") since it costs the user one click and
  saves a prop sprawl. Trivially upgradeable later if Gary cares.
- **Per-org server-side column widths** could be a future "design
  system" upgrade if managers complain about different widths on
  different machines. Not painful today.

---

### Today's session — what shipped (May 27, 2026)

Gary's feedback: every list page renders the full result set in one
scroll, no pagination anywhere. Fixed across all 5 surfaces in one
sweep. Audit pass at the end confirmed identical behaviour across
all five.

**Cross-platform considered:** admin-only work; no mobile changes.
Mobile rep app has no equivalent list-paging surface yet (its lists
are bounded by "today's shifts" or other natural caps).

#### What shipped

- **`components/ui/Pagination.tsx`** (new) — shared component.
  Renders `[«] [‹] 1 … 4 [5] 6 … 12 [›] [»]` + "Showing 201–250 of 587"
  indicator. First / Previous / Next / Last buttons with disabled
  states at the edges, clickable page numbers, ellipsis when there
  are >7 pages. Hidden entirely when total items fit on one page
  (no point showing "Page 1 of 1" + disabled buttons). Page numbers
  are 0-indexed internally (matches array.slice math) but displayed
  1-indexed (matches user mental model). `DEFAULT_PAGE_SIZE = 50`
  exported as a constant — single point of change if Gary later
  wants 150 per page.

- **Design call: client-side pagination, not server-side.** Every
  list page in this codebase already does filter/search/sort
  client-side on a single full fetch (e.g. `listAllTasks()` →
  `useMemo(filtered)`). Server-side pagination would mean refactoring
  every store to take `{page, pageSize}` params, return
  `{rows, total}`, and translating filters to Supabase queries.
  That's a bigger refactor with current row counts not warranting
  it (admin scale is dozens-to-low-hundreds per entity). Client-side
  slicing of the already-filtered array preserves all existing
  search/filter/sort behaviour exactly per Gary's "everything else
  remains the same" requirement. Deferred to a future task if any
  entity grows past ~10k rows.

- **5 pages paginated**, all with the same shape (one commit per page
  in the audit log):
  - `/tasks` — filters: All / Compulsory / Optional + customer
    dropdown + search. Resets to page 0 on any filter change.
  - `/library` — filter chips + category filter + search +
    Grid/Table view toggle. Both views share the same `pageItems`
    slice. Resets on filter change.
  - `/reps` — Status filter + search + sortable columns +
    Grid/Table view toggle. Resets on any of the above. Both views
    render their own slice (view-switching preserves the current
    page).
  - `/settings/managers` (Users) — Role filter only. Border
    styling between rows now keys off `pageItems.length - 1` (so
    the last row of a partial last page doesn't get a bogus
    bottom border).
  - `/customers` — Status filter + with-address-only toggle +
    search + sortable columns + Grid/Table/Map views. **Map view
    intentionally BYPASSES pagination** — showing every pin is
    the whole point of the map; paginating it would defeat the
    "see everywhere" affordance. Grid + Table apply pagination
    as expected. View switching preserves the current page.

- **Filter/sort change → page resets to 0** on every paginated page
  via a `useEffect` with the filter state as deps. Without this the
  user could land on an empty page 5 of a now-2-page result set.

#### Acceptance

- ✅ `next build` clean — 39 routes, zero warnings, zero TS errors.
- ✅ Audit pass: cross-checked all 5 pages have:
  - `Pagination, DEFAULT_PAGE_SIZE` import
  - `page` state + `setPage(0)` filter-reset hook
  - `slice(page * SIZE, (page+1) * SIZE)` over the FILTERED array
  - `<Pagination totalItems={filtered.length} currentPage={page}
     onPageChange={setPage} />` render

#### Notes

- Page size is 50 per Gary's tacit acceptance of the recommendation
  (his message said "150 at a time" but 150 dense admin rows is a
  big scroll — flagged in the response, defaulted to 50, single
  constant to change if 150 turns out to be what he wanted).
- The `/past-shifts` page was deliberately NOT paginated in this
  sweep. It already has a `PAST_SHIFTS_DEFAULT_LIMIT = 2000` cap
  with a hint when reached — a different pattern. Folding it into
  the same pagination shape is a small follow-up; deferred until
  Gary explicitly asks (per the "5 pages" scope he set).
- The Live Ops dashboard `/`, `/schedule`, and the various
  detail pages (`/customers/[id]`, `/reps/[id]`, etc) don't need
  pagination — they're either naturally bounded ("today" /
  "this week") or single-record views.

---

### Today's session — what shipped (May 25, 2026)

Phase A of the new Import Hub + Email Welcome workstream — the
foundation everything else hangs off. Code only, no UI flows
behind it yet (those land in Phases C / D). One new migration
+ Resend wiring + a new /settings/import section.

**Cross-platform considered:** admin-only feature. Mobile reps see
no UI change; once Phase D ships, bulk-imported customers / sites /
shifts will surface via the existing Realtime postgres_changes
subscriptions a mobile app already has on those tables. No mobile
work this phase.

#### What shipped

- **Migration `2026_05_25_import_runs_and_geocode_status.sql`** (PENDING — Gary to run in Supabase SQL Editor).
  - New `import_runs` table — manager-only via `is_manager()`, on `supabase_realtime` so the import hub can show live progress. Columns: `id`, `started_by → auth.users`, `started_at`, `finished_at`, `entity_type` (customer|site|rep|manager|shift), `status` (pending|running|complete|failed), four count columns (`total_rows` / `created_count` / `updated_count` / `failed_count`), `settings_json jsonb` (per-run options), `errors_json jsonb` (array of per-row failures: `{row_index, original_row, error_code, error_message}`), `source_filename`. Two indexes: by `started_at DESC` and by `(entity_type, started_at DESC)` for the Recent Imports panel.
  - **`geocode_status` + `geocode_attempted_at` columns** added to `customers` and `customer_sites`. Backfilled in three buckets so the Phase E cron doesn't blow up on its first tick: rows with coords → `'done'`, rows with no address → `'skipped'`, everything else stays on the column default `'pending'`. Partial indexes `WHERE geocode_status = 'pending'` (sorted by `geocode_attempted_at NULLS FIRST`) on both tables — keeps the cron's work-queue scan cheap as most rows quickly settle into `done` / `skipped` and drop out of the index.
  - **`app_settings` seed** for `import.default_duplicate_mode = 'skip'` and `import.send_welcome_email_default = true`. `ON CONFLICT DO NOTHING` so a re-run after a manager has tuned the values doesn't reset their choice.
  - Smoke-test checklist at the bottom of the file.

- **`/settings/import`** — new settings section (added to `SETTINGS_SECTIONS` in `components/shell/SettingsShell.tsx` with the `upload` glyph between Messaging and Billing). Two controls:
  - Segmented "Default duplicate behaviour" picker (Skip / Update existing) — matches the photo-quality tier picker on `/settings/check-in-rules`.
  - "Send a welcome email by default" toggle — same `<ToggleRow>` shape used on Check-in rules. Hints explain dedup keys per entity + flag Resend's 100/day free-tier rate.
  - Backed by new accessors in `lib/settings-store.ts`: `getImportDefaultDuplicateMode` / `setImportDefaultDuplicateMode`, `getImportSendWelcomeEmailDefault` / `setImportSendWelcomeEmailDefault`, plus a one-shot `getImportSettings()` (matches the `getOrganisationDetails()` pattern).
  - Optimistic UI on both controls — flip first, revert on save failure.

- **Resend wiring**:
  - `npm install resend @react-email/components` in `morpheus-admin/` (Resend `^6.12.3`, React Email components `^1.0.12`).
  - **`lib/email.ts`** — single `sendEmail({to, subject, react})` wrapper. Loud no-op when `RESEND_API_KEY` is absent (logs `[email] RESEND_API_KEY not set, skipping send` + returns `{ok: false, skipped: true}`), so local dev and missing-env-var prod deploys never crash on email-bearing code paths. Centralised from-address (`Morpheus Ops <onboarding@resend.dev>` default, overridable via `RESEND_FROM` once a sending domain is verified in Resend). Exports `isEmailConfigured()` for routes that want a clean 503 instead of the silent skip.
  - **`emails/WelcomeEmail.tsx`** — React Email template using `@react-email/components`. Props: `{name, email, password, appUrl, role}`. Branded "Morpheus Ops" header + tagline, role-specific intro copy (manager → admin console; rep → mobile app), monospace credentials block, primary CTA button with the right URL per role, footer. All styles inline literals (no `AC` token import — keeps the email module free of client-only deps).
  - **`POST /api/email/test`** — manager-gated transport smoke test. Body `{to: string}`. Returns 503 with a clear "configure email" message when `RESEND_API_KEY` is missing, 400 on a malformed email, 502 on a Resend send failure, 200 otherwise with the Resend message id + a note about onboarding@resend.dev only delivering to verified Resend account emails. Mirrors the `requireManager` pattern from `/api/users/route.ts`. Uses `React.createElement` (file is `.ts`, not `.tsx`) to construct the WelcomeEmail element with placeholder credentials so the smoke test exercises both the transport + the React Email render in one shot. Forced to Node runtime via `export const runtime = "nodejs"` to keep `react-dom/server` available for the email render.

- **Docs**:
  - `docs/OPS.md` — added `2026_05_25_import_runs_and_geocode_status.sql` to the pending list, added a new "Optional env vars" subsection covering `RESEND_API_KEY` + `RESEND_FROM` + `NEXT_PUBLIC_ADMIN_URL` + `NEXT_PUBLIC_MOBILE_URL` + `GOOGLE_ROUTES_API_KEY` (the last two already used elsewhere; consolidated for discoverability).
  - `docs/ROADMAP.md` — added an "Import Hub + Email Welcome (in progress)" entry to the top with Phase A marked ✅ and Phases B–E listed as the next chunks.
  - `docs/SESSIONS.md` — this entry.

#### Acceptance for Phase A

- ✅ `next build` in `morpheus-admin/` is clean (0 warnings, 0 errors, 38 routes including the new `/settings/import` static page + the new `/api/email/test` dynamic route).
- ⏳ Gary to apply the migration in Supabase SQL Editor (then the page actually saves to the seeded `app_settings` rows + the `import_runs` table is ready for Phase C).
- ⏳ Gary to add `RESEND_API_KEY` to the morpheus-admin Vercel project (Production + Preview + Development) and verify `gazzad@mac.com` as a recipient in Resend (free-tier `onboarding@resend.dev` only delivers to verified addresses until a sending domain is added).
- ⏳ Smoke test: `curl -X POST https://morpheus-admin.vercel.app/api/email/test -H "authorization: Bearer <manager-token>" -H "content-type: application/json" -d '{"to":"gazzad@mac.com"}'` → email lands in Gary's inbox.

#### Notes

- Phase A is intentionally NOT a user-visible feature on its own — it's the foundation Phases B (email-this-user button), C (hub UI shell), D (entity adapters), and E (background geocoder cron) hang off. The first user-visible deliverable is Phase B's "Email this user" button on the manager + rep edit pages, which can be shipped independently of the import hub.
- The customer-facing branding choice ("Morpheus Ops" wordmark + cyan brand button) is intentionally minimal-style for the welcome email so future template changes don't have to redesign every screen.

### Phase B (same day) — Email-this-user button on edit pages

First user-visible feature on top of Phase A. Gives Gary a one-click way
to re-send a user their login from the existing manager + rep detail
surfaces, without having to manually generate a password and copy it out.

**Cross-platform considered:** admin-only feature, no mobile changes.
The recovery-link path (`regenerate=false`) sends the user a link that
lands them in the right app — admin for managers (`NEXT_PUBLIC_ADMIN_URL`),
mobile PWA for reps (`NEXT_PUBLIC_MOBILE_URL`). The link itself is a
Supabase auth verify URL; the user's session is established server-side
when they tap it, regardless of which browser they're in (iOS Safari
PWA, Android Chrome, desktop all work the same way — same auth flow as
existing login).

#### What shipped

- **Migration `2026_05_25_profiles_last_credentials_sent_at.sql`** (PENDING — Gary to run). Single nullable `timestamptz` column on `profiles`. No RLS change.

- **POST `/api/users/[id]/send-credentials`** — new dynamic route. Uses Next.js 16's `ctx: { params: Promise<{ id: string }> }` shape. Manager-gated via the same `requireManager` pattern as `/api/users/route.ts`. Body `{regenerate: boolean}`.
  - `regenerate=true` path: generates a fresh 12-char password server-side (same charset as `randomPassword()` in `lib/users-admin.ts`, duplicated server-side so the route doesn't import client-only code), calls `sb.auth.admin.updateUserById(id, {password})`, then sends `WelcomeEmail` with the fresh password as the credentials. If the email fails AFTER the password change, returns a partial-success response (`{ok: false, passwordReset: true, newPassword}`) so the manager can copy the password manually.
  - `regenerate=false` path: calls `sb.auth.admin.generateLink({type: 'recovery', email, options: {redirectTo: appUrl}})`, sends `InviteEmail` with the action link as the CTA. Clicking the link signs the user in (no password entry required); they can then set a permanent password from Profile → Change password.
  - Both paths bump `profiles.last_credentials_sent_at = now()` on successful email delivery.
  - Returns include `messageId` (Resend id) for diagnostics + `note`-style copy where useful.

- **`emails/InviteEmail.tsx`** — second React Email template. Mirrors WelcomeEmail's brand chrome but doesn't show a password — just an "Account: <email>" line + a primary "Sign in to Morpheus Ops" CTA pointing at the Supabase recovery link. Copy explicitly says "single-use; ask your manager to resend if expired" so a user who lets the link expire knows what to do.

- **`components/users/EmailUserModal.tsx`** — shared portal-based modal. Used by both the manager edit page (`/settings/managers/[id]/edit`) and the rep detail page (`/reps/[id]`). Two action rows:
  - **Send invite link** (primary, non-destructive — keeps current password). Default-first because it's safer; covers the "user lost the password we generated three weeks ago" case.
  - **Regenerate password and email** (warn-tinted destructive — invalidates the user's prior password). Covers the "user is fully locked out and we need to nuke their password" case.
  - "Last sent: X ago" line via `formatRelative` from `lib/format.ts`.
  - Result panel renders three states: full success, partial (password reset but email failed — surfaces a copy-fallback for the new password), hard failure (with an actionable hint if `RESEND_API_KEY` is missing).
  - Escape + backdrop click both close; body scroll locked while open; `createPortal` to `document.body` so the modal escapes any stacking context.

- **`/settings/managers/[id]/edit`** — adds a small new "Email this user" card in the right column above the existing "Account" card. One button + a "Last sent" / "No credentials email sent yet" line. Right column wrapped in `flex column` to stack the two cards cleanly. Modal renders at page root via the new shared component.

- **`/reps/[id]`** — adds an "Email" button (`mail` glyph, neutral kind) to the actions slot beside the existing "Edit" primary button. Same modal as the manager edit page.

- **`lib/profiles-store.ts`** — adds `last_credentials_sent_at?: string | null` to `Profile` and includes it in every `SELECT` (uses `replace_all` so listProfiles + getProfileById both pick it up). Modal reads from the parent's profile state.

- **`lib/users-admin.ts`** — adds `sendCredentials(id, regenerate): Promise<SendCredentialsResponse>`. Returns the full server JSON so the modal can render the partial-success state with the new password.

- **Docs**: OPS.md migrations list updated; this entry; ROADMAP.md item 0 updated to mark Phase B ✅; README.md "Latest" bumped.

#### Acceptance for Phase B

- ✅ `next build` in `morpheus-admin/` clean — 39 routes including the new `/api/users/[id]/send-credentials` dynamic route. Zero warnings, zero TS errors.
- ⏳ Gary to apply the migration in Supabase SQL Editor (Phase A's migration too if not already done).
- ⏳ Gary to verify `NEXT_PUBLIC_ADMIN_URL` + `NEXT_PUBLIC_MOBILE_URL` are in the Supabase Auth Redirect URLs allowlist (Authentication → URL Configuration). If not, the recovery link will sign the user in but bounce them to the Supabase default redirect. Both URLs are likely already there from existing login flows; verify before the smoke test.
- ⏳ Smoke test: open `/settings/managers/<gary's-uid>/edit` → click "Send credentials" → modal opens with the rep card → click "Send invite link" → check inbox. Click the link → confirm it lands you in the admin (or in the mobile PWA if you used a rep account). `last_credentials_sent_at` updates and the modal's "Last sent: 5s ago" line picks it up after re-open.

#### Notes — Phase B

- Phase B is **independently shippable** as the brief calls out. The two manager-facing surfaces (edit page + rep detail page) are now self-service for "I need to give this user their login" without ever opening Resend's dashboard or running a manual password reset.
- The `regenerate=true` path is destructive (invalidates the prior password) but the modal copy makes this explicit. Partial-success state is handled — if the email fails after the password is already changed, the manager sees the new password in the result panel and can copy it.
- Recovery links expire in 1 hour by Supabase default. Anyone who clicks too late gets Supabase's standard "link expired" page; the modal copy hints at this ("This link is good for a single sign-in").

### Phase C (same day) — Import hub UI shell + consolidation

The user-visible "place to do bulk imports". Hub at `/import`, 5-step
wizard at `/import/[entity]`, Import nav entry in the sidebar, plus
Import CTAs added to every list page so the consolidation rule
("one hub, all imports") is enforced from every surface a manager
might think "I want to bulk add these" from.

**Gary's directive (May 25):** every import affordance MUST funnel
through `/import` — no per-page upload widgets. Phase C honours that
across customers / sites / reps / managers / shifts.

**Cross-platform considered:** admin-only feature. Mobile reps see
no UI change. Once Phase D's adapters ship, bulk-inserted customers /
sites / shifts will surface on a mobile app already open via the
existing Realtime postgres_changes subscriptions on those tables
(verified: `customer_sites` and `customers` are both on the
`supabase_realtime` publication; `shifts` was already there from
Phase 3).

#### What shipped

- **`lib/import-types.ts`** — shared types: `EntityType`,
  `ImportAdapter`, `RawRow`, `ColumnMapping`, `PreviewRow`, `StepId`,
  + entity label / description maps. One source of truth so the hub,
  the stepper, and the adapter registry all agree on the shape.

- **`lib/import-synonyms.ts`** — header-synonym registry per entity.
  Drives the column auto-mapper in the Map step. `normalizeHeader()`
  collapses whitespace, punctuation, and case so "Customer Code" /
  "customer_code" / "Customer#" all hit the same key. Adding a
  synonym for a new client's quirky header is a one-line append.

- **`lib/import-parsers.ts`** — Papa Parse + SheetJS-backed file
  parser. Handles the real-world quirks the brief calls out: UTF-8
  BOM strip (Excel-saved CSVs prepend one and otherwise corrupt
  the first column name), junk header row auto-detection (Excel
  users sometimes put a sheet title in row 0 — we scan for the
  first row with ≥2 non-empty cells), duplicate / blank header
  disambiguation (so "code" appearing twice doesn't collapse two
  columns into one). XLSX path uses `XLSX.read` + `sheet_to_json
  ({header: 1})` so both formats run through the same
  `tableToParsed()` pipeline. Pasted text is treated as CSV.

- **`lib/import-adapter-registry.ts`** — `getAdapter(entity)` returns
  an `ImportAdapter` with real `requiredFields` + `optionalFields` +
  `fieldLabels` + `dedupKey` + `validate` for all five entities, so
  the column-mapping + preview UI works end-to-end. Each adapter's
  `upsert` is a Phase-D stub that throws "Import for X isn't wired
  up yet (Phase D)." — the wizard surfaces that on the Result step.
  Adapter shapes ready for Phase D:
    - **customer** — dedup by `code`. Required: code, name. Validates
      hex colour format if provided.
    - **site** — dedup by `customer_code::site_name`. Required:
      customer_code, site_name. Customer-must-exist check is the
      Phase D adapter's job.
    - **rep / manager** — dedup by email (lowercased). Required:
      email, name. Validates email format.
    - **shift** — dedup by `customer_code::rep_email::start_date::start_time`.
      Required: customer_code, rep_email, start_date, start_time,
      end_time, recurrence. Validates ISO date, HH:MM time, end >
      start, and (for `recurrence=weekly`) requires end_date +
      days_of_week. Phase D will expand weekly patterns into N rows.
  `normalizeRow(raw, mapping)` lives here too — applies the user's
  Map-step choices to convert a raw {header → value} row into a
  {fieldKey → value} normalized row the adapter operates on.

- **`lib/import-runs-store.ts`** — `listRecentImports()` +
  `subscribeImportRuns()`. Powers the Recent Imports panel on the
  hub. Realtime subscription so Phase D commits update the panel
  in-place without a refresh.

- **Sample CSV templates** under `public/import-templates/`:
  `customers.csv`, `sites.csv`, `reps.csv`, `managers.csv`,
  `shifts.csv`. Each has 2–3 realistic example rows with the exact
  column headers we expect. The Source step's hint links each
  entity's stepper to its own template via `/import-templates/<entity>s.csv`
  with `download` attribute so right-click-save isn't needed.

- **`/import`** (new hub page) — entity picker grid (5 cards) + the
  Recent Imports panel. Empty state explains "Once Phase D adapters
  land, every commit will surface here with live counts." Subscribes
  to `import_runs` realtime so it ticks live as commits happen.

- **`/import/[entity]`** (new stepper page) — five horizontal steps:
    - **Source** — drag-drop dropzone + click-to-browse fallback +
      "Or paste rows below" textarea. Sample template download link
      below. Dropzone changes border + bg on dragover for visual
      feedback. Parser errors surface inline. Successful parse shows
      a "✓ Parsed filename — N rows, M columns" panel with a "Pick a
      different file" reset.
    - **Map columns** — every adapter field gets a row with a
      dropdown picker of file headers + "(ignore)". Required-field
      rows that are still unmapped show with a red border + danger
      tint. Required-fields-missing banner at the bottom prevents
      Next.
    - **Settings** — duplicate-behaviour segmented picker (pre-filled
      from `/settings/import`'s defaults, overridable per-run). For
      `rep` / `manager` imports, an extra "Send welcome email"
      checkbox (also pre-filled from the org default).
    - **Preview** — four CountPills (Create / Update / Skip / Fail)
      computed from running the adapter's `validate` on every row +
      tracking in-file duplicates. Table shows first 10 rows with a
      per-row state pill, inline error messages for failed rows
      (red-tinted background), and the normalized field values
      across columns. Commit button disabled when 100% of rows would
      fail.
    - **Result** — counts summary + "Download failures CSV" button
      (CSV builder lives inline; produces `row_index,<fields>,_errors`
      shape). When `commitError` is set (i.e. Phase C's stub adapter
      threw), shows the error message cleanly with a "Back to import
      hub" affordance — so the wizard fails gracefully without
      pretending Phase D is done.
  Stepper bar at top shows progress (number → checkmark on done
  steps, brand pill on active step, joining lines coloured by
  completion state).

- **Consolidation (Gary's directive — `/import` is the ONE place):**
  - **Sidebar**: new "Import" entry in `NAV_ITEMS` (`lib/mock-data.ts`)
    between Reports and Settings. Glyph: `upload`. Findable from
    every page of the admin.
  - **`/customers`**: new "Import" button in the actions slot next
    to "Add customer". Links to `/import/customer`.
  - **`/reps`**: new "Import" button next to "Manage shifts". Links
    to `/import/rep`.
  - **`/settings/managers`** (Users page — handles both reps and
    managers): new "Import" button next to "Add user". Links to
    `/import` (hub root, not a specific entity, because the page
    covers both rep and manager imports).
  - **`/schedule`**: new "Import" button next to "Manage shifts" and
    "New shift". Links to `/import/shift`.
  - **`SitesTab` on `/customers/[id]`**: new "Import" button next to
    "Add site". Links to `/import/site` — the only entry point for
    sites since there's no dedicated `/sites` list page.

- **npm**: `npm install papaparse@^5.5.3 xlsx@^0.18.5 @types/papaparse@^5.5.2`
  in `morpheus-admin/`.

- **Docs**:
  - This entry (Phase C subsection under May 25).
  - `docs/ROADMAP.md` — item 0 updated to mark Phase A + B + C
    landed, leaving D and E as the remaining workstream.
  - `README.md` — "Latest" pointer bumped to Phases A + B + C.

#### Acceptance for Phase C

- ✅ `next build` in `morpheus-admin/` clean — 39 routes (no static-page
  delta because `/import` is static, `/import/[entity]` is dynamic; net
  +2 routes). Zero warnings, zero TS errors.
- ✅ Pick an entity → drop a CSV → reach Preview screen with mock
  validation (no real writes — Commit fails clearly via the stub
  adapter's "Phase D not wired up" message).
- ✅ Every list page has an "Import" button next to its existing
  "Add" CTA.
- ✅ Sidebar has an "Import" nav entry.

#### Notes — Phase C

- No new migration in Phase C — Phase A's `import_runs` table is
  already there to receive Phase D commits.
- The stepper is intentionally one big file (~700 LOC) — every step
  shares state, splitting them out would either drag state up
  through props or require a context. Kept colocated so reading the
  flow top-to-bottom matches the user's path through the wizard.
  Phase D won't need to edit this file; it just replaces the stub
  adapters.
- The Sites import doesn't have a dedicated `/sites` list page (sites
  are managed inside `/customers/[id]`'s Sites tab) so the "Import
  sites" CTA lives there. Hub picker still shows the Sites card so
  bulk-importing dozens of sites at once doesn't require visiting a
  specific customer first.

### Same-day reorg — Import lives under Settings only

Gary's call right after Phase C shipped: the import hub should be
under `/settings/import`, not a top-level route + sidebar nav entry.
The `/settings/import` page already existed for the defaults; the
reorg merges the hub UI + the defaults onto that single page,
behind two tabs.

#### What changed

- **Tabbed page at `/settings/import`** — "Run an import" tab (entity
  picker grid + Recent Imports panel — content lifted from the
  deleted `/app/import/page.tsx`) and "Defaults" tab (existing
  duplicate-mode picker + welcome-email toggle). Tab state is local
  React state, no URL param — both tabs are cheap and the user
  typically picks once per session. Wrapped in `SettingsShell` so
  the standard 240px settings rail is visible.
- **Stepper moved**: `/app/import/[entity]/page.tsx` →
  `/app/settings/import/[entity]/page.tsx`. Internal `/import` href
  references (4 of them: the "← All entities" back button, the
  "Back to import hub" affordance on the parse-failed state, etc)
  swapped to `/settings/import` via `sed`. Breadcrumbs updated to
  `["Home", "Settings", "Import", <entity>]`. Still wraps in
  `AdminShell` (not `SettingsShell`) because the wizard's Preview
  step needs full horizontal width for the row table — the rail
  would compete with the stepper bar. Matches the pattern of
  `/settings/managers/[id]/edit` which is also a settings-area
  drill-down using `AdminShell`.
- **`/app/import/` directory deleted entirely** — no top-level
  routes. `next build` now lists `/settings/import` (static) and
  `/settings/import/[entity]` (dynamic) — total 38 routes (down
  from 39; the dupe is gone).
- **Sidebar nav entry removed**: the "Import" entry between Reports
  and Settings in `lib/mock-data.ts` NAV_ITEMS is gone. Settings is
  the single nav surface for import.
- **List-page Import buttons repointed**: the 5 surfaces added in
  Phase C (`/customers`, `/reps`, `/settings/managers`, `/schedule`,
  and the customer-detail `SitesTab`) now link to
  `/settings/import/<entity>` (or `/settings/import` for the Users
  page since it covers both rep + manager imports). Buttons stay —
  they're shortcuts to the hub, not duplicate locations.

#### Acceptance for the reorg

- ✅ `next build` clean — 38 routes (zero `/import/*` top-level).
- ✅ Sidebar no longer has an Import entry between Reports and Settings.
- ✅ `/settings/import` renders the tabbed hub (Run an import default).
- ✅ Every list-page Import button lands in the right entity wizard.

#### Notes — reorg

- The "consolidation rule" from Phase C still holds (one hub, all
  imports). Only the hub's URL + sidebar discoverability changed —
  it's findable from Sidebar → Settings → Import, plus from every
  list-page shortcut.
- The wizard's behaviour didn't change. Phase D's adapter wiring
  drops into the same `lib/import-adapter-registry.ts` regardless
  of where the wizard's URL lives.

### Phase D (same day) — real entity adapters + per-row error handling + audit log

The wizard's Commit button does something useful now. Each adapter
in `lib/import-adapters/<entity>.ts` exports a real `upsert(row,
mode) → 'created' | 'updated' | 'skipped' | 'failed'`; the stub
`upsert: notImplemented()` from Phase C is gone.

**Cross-platform considered:** admin-only feature. Mobile reps see
no UI change at import time. Imported customers / sites / shifts
propagate to mobile via the existing Realtime subscriptions on
those tables (all on `supabase_realtime` since earlier phases).

#### What shipped

- **D1 — customer adapter** (`lib/import-adapters/customer.ts`).
  Dedup by integer `code`. Slug-style `id` from name (matches the
  pattern in `createCustomer`). Auto-creates the "Head office" site
  on every new customer so single-site customers never need the
  Sites tab. Validates hex colour format. Initials auto-derive from
  name if blank; colour defaults to brand cyan if blank.

- **D2 — site adapter** (`lib/import-adapters/site.ts`). Dedup by
  `(customer_code, site_name)`. Customer lookup by `code → id`;
  throws a clear "customer with code=X not found" error if missing.
  Skip / update modes as expected. Lat/lng left NULL — Phase E cron
  resolves.

- **D3/D4 — user adapter** (`lib/import-adapters/user.ts`). One
  file, two exports (`REP_ADAPTER` + `MANAGER_ADAPTER`) via a
  `userAdapter(role)` factory. Dedup by lowercased email. Per-row
  `send_welcome_email` column overrides the run default; default-
  on if blank. Calls the new POST `/api/import/users` per row.

- **POST `/api/import/users`** (new manager-gated route). Looks up
  existing user by email via `auth.admin.listUsers` (paged to 1000
  — sufficient for bulk-onboarding scenarios). On miss: generates
  12-char password, calls `auth.admin.createUser`, upserts profile,
  optionally sends `WelcomeEmail` via `lib/email.ts`. Welcome-email
  failures don't fail the user creation — they return as warnings
  so the run's `errors_json` gets the context.

- **D5 — shift adapter** (`lib/import-adapters/shift.ts`). Per-row
  dedup by `(customer_code, rep_email, start_date, start_time)`.
  Lookup customer by code + rep by email. Recurrence expansion:
  `once` → 1 shift; `weekly` → expands `[start_date, end_date]` ∩
  `days_of_week` into N shifts. Each expanded instance dedup-checks
  against `shifts` on `(customer_id, rep_id, shift_date, start_time)`.
  Per-instance failures tracked: all-fail → throws row failure;
  partial → throws a summary so failures land in `errors_json`.
  Day-of-week parser tolerates pipes / commas / slashes / spaces
  as separators and full / short / 3-letter day names.

- **Wizard onCommit rewritten** (`app/settings/import/[entity]/page.tsx`).
  Creates an `import_runs` row at start (status=running, total_rows,
  settings_json carrying duplicateMode + sendWelcomeEmail for user
  imports). Iterates with per-row try/catch — no more bail-on-first.
  Tracks failures in an `ImportRunFailure[]` array (row_index,
  original_row, error_code, error_message). Finalises via
  `finishImportRun(id, {counts, failures, finalStatus})`. Writes
  ONE `shift_events` row of type `'import.run'` so the Live Feed
  surfaces it as "Gary imported 234 customers (12 updated, 3 failed)".

- **`lib/import-runs-store.ts`** gains `createImportRun` +
  `finishImportRun` + the `ImportRunFailure` interface for the
  wizard.

- **`lib/events-store.ts`** EventType + EVENT_LABEL get the new
  `"import.run"` entry. `Record<EventType, string>` forced the
  label addition — "ran a bulk import" is the feed copy.

- **Sample CSV templates** updated: `customers.csv`, `sites.csv`,
  `shifts.csv` now use integer customer codes (DB column is `int`
  per the multi-site schema). `reps.csv` + `managers.csv` unchanged.

### Phase E (same day) — background geocoder cron + retry-on-edit + badge

Closes the import loop: customers + sites imported without coords
land in the map within ~1 minute via a Vercel cron draining the
`geocode_status='pending'` queue from the Phase A migration.

**Cross-platform considered:** admin-only feature. The map (mobile
+ admin) reads lat/lng from `customers`/`customer_sites` directly;
once the cron resolves a row, both surfaces pick it up via the
existing Realtime subscriptions on those tables. No mobile work.

#### What shipped

- **`lib/geocode-server.ts`** (new). Shared `geocodeAddress(query) →
  GeocodeHit | null` extracted from `/api/geocode/route.ts`. Same
  Nominatim User-Agent + Accept-Language headers. Both the manual
  search route and the cron worker now hit the same Nominatim
  contract.

- **`app/api/geocode/route.ts`** slimmed to a thin wrapper around
  the shared helper. Same response shape; no behaviour change for
  the existing manual-edit flow.

- **`/api/cron/geocode-queue` route** (new). Drains up to 50 rows
  per tick (25 customers + 25 sites — split keeps neither table
  starving the other on a backlog). Pulls rows ordered by
  `geocode_attempted_at NULLS FIRST` so fresh rows beat retry
  rows. Sleeps 1.1s between Nominatim calls (1 req/sec ToS + a
  100ms safety buffer). Outcomes:
    - hit       → lat/lng + status='done' + attempted_at=now
    - no hit    → status='failed' + attempted_at=now
    - exception → attempted_at=now (status stays 'pending' for
                  retry; updated attempted_at pushes the row
                  behind newer pending rows in the queue order)
  Auth: `CRON_SECRET` bearer pattern matching `/api/cron/messages`.
  Runtime: nodejs; `dynamic: force-dynamic` so caching never
  serves a stale 200.

- **`morpheus-admin/vercel.json`** — new cron entry
  `{"path": "/api/cron/geocode-queue", "schedule": "* * * * *"}`.

- **Type extensions** — `Customer` (lib/types.ts) gains
  `geocodeStatus?` and `CustomerSite` (lib/sites-store.ts) gains
  `geocode_status?`. The `customers` DbRow mapper +
  `rowToCustomer` pull the new column.

- **Retry-on-edit** — `updateCustomer` (lib/customers-store.ts) and
  `updateSite` (lib/sites-store.ts) both flip
  `geocode_status='pending'` + `geocode_attempted_at=null` when
  `patch.address` changes WITHOUT also supplying `lat/lng`. The
  "with lat/lng" path is the manual map-pin flow where the user
  already supplied coords — left alone there. Without this, a
  row that landed as 'failed' would stay failed forever even
  after the manager fixed the address.

- **`components/ui/GeocodeBadge.tsx`** (new). Small pill renders
  nothing for `done` / `skipped` (boring states). Shows brand-
  tinted "📍 Geocoding…" for `pending` and warn-tinted
  "📍 Couldn't find — edit to retry" for `failed`. Tooltip explains
  the retry mechanism.

- **`components/customers/SiteRow.tsx`** drops the badge next to
  each site's address line in the SitesTab. Address container
  becomes a flex row so the badge sits inline without breaking
  the address truncation.

#### Acceptance — Phases D + E

- ✅ `next build` clean — 39 routes including
  `/api/cron/geocode-queue`, `/api/import/users`, `/settings/import`,
  `/settings/import/[entity]`. Zero warnings, zero TS errors.
- ⏳ Real test (operator): apply Phase A's + B's migrations, set
  `RESEND_API_KEY` + `CRON_SECRET` env vars on the morpheus-admin
  Vercel project, then:
    - Drop `customers.csv` (the 3-row template) in the wizard.
      Commit → 3 customers should land in `/customers` list,
      `shift_events` should show an `import.run` row.
    - Wait ~60s. Customers without coords should show "📍 Geocoding…"
      and within another tick should have lat/lng + appear on the
      Live Ops map.
    - Drop a `reps.csv` with one row pointing at your verified
      Resend recipient. Commit with welcome-email=on. Email
      should land within seconds; password should work in the
      mobile PWA.

#### Late-evening tweak — uniqueness/link clarity pass

Gary's feedback after Phases D + E shipped: *"make sure it's clear
wherever you are which is the linking code… what needs to be unique
when you're putting in your customer or updating."* The wizard
buried the uniqueness + dependency story in the field labels;
this pass surfaces it visually + in plain English.

- **`ImportAdapter` extended** with three optional fields:
  - `fieldKinds?: Record<string, "id" | "link" | "data">` — per-
    field semantic role.
  - `linksTo?: Record<string, EntityType>` — for link fields, the
    entity they reference.
  - `matchRule?: string` — one-sentence plain-English description
    of how dedup works for this entity.

- **Every adapter declares the metadata**:
  - customer: `code` = `id`; matchRule = "Each row is one customer.
    Two rows with the same code = duplicate."
  - site: `customer_code` = `link → customer`; `site_name` = `id`;
    matchRule = "Each row is one site. customer_code links to an
    existing customer (import customers first if needed). Two rows
    with the same customer_code + site_name = duplicate."
  - rep / manager: `email` = `id`; matchRule = "Each row is one
    rep/manager. Two rows with the same email (case-insensitive)
    = duplicate."
  - shift: `customer_code` = `link → customer`; `rep_email` =
    `link → rep`; `start_date` + `start_time` = `id`; matchRule
    spells out the four-part composite key and the
    customer-must-exist + rep-must-exist requirement.

- **Wizard Map step gains** a brand-tinted "How matching works"
  callout at the top displaying `adapter.matchRule`, a small
  legend strip explaining the ID / LINK badges, and per-field
  badges:
  - **Purple "ID"** pill next to identifier fields.
  - **Cyan "LINK → Customer"** (or "LINK → Rep") pill next to
    fields that reference another entity. Tooltip explains that
    the linked entity must already exist.

- **Wizard Source step gains** an `ENTITY_DESCRIPTION` callout at
  the top — same one shown on the hub entity cards — so the user
  sees "Unique key: code (integer). Matching code = duplicate. No
  dependencies" BEFORE they upload, not after.

- **`ENTITY_DESCRIPTION` rewritten** for all 5 entities to lead
  with the unique-key story + dependencies (e.g. "Unique key:
  customer_code + rep_email + date + start_time. Depends on
  customer AND rep (both must already exist)").

The render order on the Map step is now: SectionLabel → "How
matching works" callout → legend strip → field rows (with badges).
A user looking at the shifts import sees at a glance: customer_code
LINK → Customer, rep_email LINK → Rep, start_date + start_time
both ID, everything else data.

No DB changes, no migrations, no behaviour changes — pure clarity
pass. `next build` clean.

#### Notes — Phases D + E

- Phase D's adapter shape stays exactly the same as the Phase C
  stubs (same `upsert(row, mode)` signature). Future entity adds
  drop a new file in `lib/import-adapters/` + a registry entry —
  no wizard changes needed.
- Recovery-link CTA URLs in `WelcomeEmail.tsx` already respect the
  per-role split (admin URL for managers, mobile URL for reps) so
  bulk-imported reps land in the right app.
- Resend free tier (100 / day) is the bottleneck for bulk rep
  imports >100. Once `morpheusops.app` is verified as a sending
  domain in Resend, the tier ceiling becomes 3000/month (Resend's
  free domain-verified ceiling); the wizard's settings step still
  warns about the daily cap so a 200-rep import is expected to
  spread across two days.
- The geocoder cron honours Nominatim's 1 req/sec. At 50 rows per
  tick × 60 ticks per hour = up to 3000 geocodes/hour, which is
  well within Nominatim's usage cap for hobby/small-org loads.
  Bigger orgs should move to a paid geocoding provider — wrap
  `geocodeAddress` in `lib/geocode-server.ts` is the single swap
  point.

---

### Today's session — what shipped (May 14, 2026)

A polish + bug-fix day on top of the huge May 13 feature drop. ~30 commits, grouped by intent below. **No new migrations** — every commit ships through Vercel auto-deploy.

Vercel was upgraded to Pro mid-day, so the three cron schedules in `morpheus-admin/vercel.json` are now actually firing (`/api/cron/shift-reminders` every 5 min, `/api/cron/auto-checkout` every 15 min, `/api/cron/messages` every minute).

#### Live bug fixes

- **Mariska's timesheet showed check_in_at > check_out_at + her shift didn't auto-close overnight** (`2778e3f`). Two root causes: (a) the Vercel cron for `/api/cron/auto-checkout` was parked in vercel.json because Hobby plan rejects sub-daily schedules — restored now that we're on Pro; (b) `checkInToShift` in `morpheus-mobile/lib/shifts-store.ts` overwrote `check_in_at` unconditionally with no error check, so a stale-cache "Resume" tap could write a fresh check_in_at AFTER the sweep had already stamped check_out_at. Fixed by refusing to re-open complete/cancelled shifts AND nulling check_out_at on every check-in.
- **Push notifications shipping to the wrong Vercel hostname** (`4a649f7`). `/api/messages/send` was building `${MOBILE_BASE_URL}/messages?id=...` where MOBILE_BASE_URL fell back to `https://morpheusta.vercel.app` (no deployment, 404 DEPLOYMENT_NOT_FOUND on tap). Real prod host is `morpheusta-khaki-omega.vercel.app`. Fixed by making push URLs RELATIVE — the service worker resolves against its registered origin — and bumping the absolute-URL fallback to the right host.
- **/active threw React error #310** ("Rendered more hooks than during the previous render") on cold load (`57e419b`). The `if (!shift) return ...` early-return sat ABOVE 8 hooks (4 useCallback + 2 useEffect + helpers), so the hook count differed between renders. Fixed by moving the guard below every hook. Diagnosed via a temporary verbose `error.tsx` (`35f38e2`) which Gary screenshotted; that error.tsx was then trimmed back to a clean rep-facing card with a hidden 5-tap-to-reveal debug pane (`0ed3096`) — `localStorage.morpheus.debug=1` enables full stack details persistently.
- **"Running late" push fired every 5 min** instead of once per shift (`ff1fcf6`). Cron's dedup marker was written AFTER the push with no error check; transient marker-insert failures left no marker → next tick re-fired. Flipped to marker-first; if the marker fails we log loudly and skip the push for that tick. Same fix applied to the EOD-checkout sweep.
- **/active emptied out when rep tapped Pause** (`1fdedae`). `getMyActiveShift` filtered strictly on `state='in-progress'`, so the moment Pause flipped DB state to `on-break` the realtime subscriber refetched, got null back, and dumped the rep onto the "No active shift" empty state. Fixed by including `on-break` in the active-states filter.
- **Sidebar org logo flickered on first paint** (`a9f31ff`). The fallback "brand cube" rendered for the half-second the org logo fetch was in flight. Fixed with a localStorage cache (`morpheus.org.cache.v1`) so the brand block paints the last-known logo instantly on every page load after the first. Subscribe-on-change wired so a save on `/settings/organisation` propagates without a reload.

#### Mobile + admin chrome polish

- **Module switcher dropped from the admin sidebar** (`bfb041a`). The legacy "Time & Attendance / Sales Orders / Auditing" three-module switcher (with Q3/Q4 hints) doesn't match the unified Morpheus Ops direction. Replaced with a simple "MORPHEUS OPS · Workforce Operations. In real time." brand strip. Sidebar tagline later refined (`9283ec6`) to a 12.5px line with a subtle hourly CSS-gradient shimmer to signal "platform is alive"; then trimmed to tagline-only (`9896db4`) since "Morpheus Ops" already lives in the footer pill below.
- **Tasks gets a Pro-upgrade sub-nav** (`9896db4`). Clicking Tasks expands three sub-items in the sidebar: Tasks (active) + Advanced Auditing 🔒 PRO + Sales Orders 🔒 PRO. The two locked items are placeholders for future Pro tiers; tapping pops an alert until real billing exists.
- **"Plan my day" → "Route" everywhere user-facing** (`9896db4`, `bfb041a`). Page title, pill labels, admin settings toggle. Code comments referencing the old name left intact as design-history context.
- **Sidebar nav reordered** (`bfb041a`). NAV_ITEMS now: Live Ops → Workforce/Reps → Customers → Schedule/Calendar → Tasks → Library → Messaging → Reports → Settings. Operations tools group before analytics.
- **Layout title + login hero rebrand** (`6b22fe3`). Browser tab title was "Morpheus Admin · Time & Attendance" → "Morpheus Ops · Admin". Login hero replaced three competing module pills with six capability chips (Live Ops / Workforce / Tasks / Schedule / Messaging / Reports).
- **Mobile side menu reshaped** (`f03dd10`). Profile row removed from the nav list — the header avatar/name/email block at the top is now the tappable Link to /profile with a chev-r affordance + a "View profile" caption. Logout demoted to a destructive button above the brand footer, new `power` glyph added to the mobile icon set.
- **Mobile footer slimmed** (`723f829`). Visible padding 14/18 → 8/8 around the safe-area inset. The `env(safe-area-inset-bottom)` term is preserved so the iPhone home-indicator zone still clears.
- **Mobile viewport-fit=cover** (`ed4c588`). Without this iOS clamped every `env(safe-area-inset-*)` to 0, leaving "POWERED BY MORPHEUS OPS" hidden behind the home indicator. The CSS was already correct — flipping viewport-fit unlocked it.
- **Home top bar logo + menu swap** (`51296be`). Hamburger now at the leading edge, org logo at the trailing edge. Same 38×38 tile chrome; purely positional.
- **/active hero slim + Pause button overhaul** (`51296be`, `bac96bb`, `4a23742`). The address tile was too big (eyebrow label, 26px icon, 13px text); slimmed to 20×20 icon + 11.5px nowrap-ellipsis text, no label. Pause button got a first-class spot next to Check-out (was previously only reachable via pause-and-switch into another shift). After Gary's feedback the Pause button was restyled to match Check-out's shape but with a translucent white bg (secondary tone), then folded into a single toggle — same button reads "Pause" off-break, "Resume" on-break, with the glyph + tone flipping accordingly. The top "Shift paused" banner kept the info copy but lost its duplicate Resume button.

#### Feature polish

- **Route pill — two-state icon + hourly auto-recheck** (`5693bf7`, `1cfeea3`, `1aa0205`, `6076a7b`). Both home and `/shifts` route pills are icon-only with just two states: calm okTint + green check-circle (default), or brand-deep + target glyph + pulse (when an improvement is available). The new `lib/route-improvement-watcher.ts` runs from `MenuShell` every 60 min while the app is open + on `visibilitychange→visible` if last check was >15 min ago. It calls `planMyDay({optimize: false})` and `planMyDay({optimize: true})` in parallel, compares total drive-time. If the optimized order saves ≥5 min vs the rep's current saved order (or chronological), the action state fires. Calm-state taps open the new `RouteOptimizedSheet` (animated rings + drawn check) with an "Open route anyway" escape hatch and a reassurance line: "Auto-checked every hour. If a better route opens up, we'll let you know right here." Action-state taps go to `/route` as before. Hash anchor + button-reset polish iterations rolled through to land the final pixel-perfect calm-state pill.
- **Geocode card removes "flag your manager" dead-end** (`33910b1`). When a shift's site has no coords, the geocode-task card now renders even if `shifts.site_id` is null. `setCustomerSiteCoords` (mobile) accepts a null `siteId` and resolves it at submit time: looks up the customer's primary site or creates a "Head office" row on the fly, then back-fills every unlinked shift the rep has for that customer. Combined with the earlier "one button + required site name" rework (`392a1de`), reps can ALWAYS self-pin a location — there is no flow that asks them to "flag your manager".
- **/active address tile shows an inline MapPreview** (`33910b1`). The customer hero card's address row got a 110px MapPreview (existing component from `/add-customer`) showing the site pin at street-level zoom. Tile is tappable to open Google Maps. When coords exist but no street address, the row reads "Pinned location" instead of any flag-manager copy.
- **Live Ops ShiftsList: needs-action rows redirect per-row** (`2e55737`). Shifts whose attention flag is open now route clicks to `#live-feed-needs-action` regardless of which tab is showing, so managers action them inline without leaving the dashboard. Pending request rows always route there too. Normal shifts continue to navigate to `/shifts/[id]`.
- **Admin /customers gains a "New" filter + recently-added pinned to top** (`9d6b923`). New StatusFilter value + a "New · N" chip beside Inactive. Recently-added (last 7 days, source-agnostic) customers always lead the list regardless of sort, so a manager who just added one finds it at the top. `Customer.createdAt` field added to the type + store mapper.
- **Calendar drag-drop overlaps now warn-but-allow** (`bac96bb`). Reps can be scheduled into multiple stores during the same window ("8 stops 8am-5pm, pick your order"). The previous strict block made this impossible. Banner now reads e.g. *"Overlaps Aria Cosmetics 09:00–12:00 (+2 more) — moved anyway."* on success.
- **/schedule/manage column widths tuned** (`380ee77`). The SHIFTS column at 78px was wrapping "6 upcoming · 1 past" into three ugly lines. Bumped to 150px + subtitle is now nowrap with ellipsis fallback. Time column also bumped 80→105px. "Workforce Operations" capitalized in sidebar tagline + login.
- **KpiStrip clickable revert** (`aadc5c1`). KPI cards on Live Ops were briefly Links that scrolled+filtered the ShiftsList. Gary preferred them static — reverted.
- **Composer cleanup + admin customer overview fix** (`392a1de`). `/notify` composer: Subject the only required field (Message body now optional), two explicit `[Send now]` + `[Schedule for later]` buttons. Admin `/customers/[id]` overview head-office card now has a three-way fallback: real address → site name + "no street address" → "Pinned location" → "No address yet" — so a rep-geocoded site stops showing "No address yet" when it actually has coords + a name.

#### Commits in order

```
ed4c588 mobile viewport: add viewport-fit=cover
09e5515 README: refresh stale headers to current state
bfb041a admin nav: drop module switcher, add Pro tiles on Tasks
6b22fe3 Morpheus Ops rebrand: layout title + login hero
9896db4 sidebar: tagline-only top, expandable Tasks sub-nav
9283ec6 sidebar tagline: bump size + add subtle "alive" shimmer
a9f31ff sidebar logo: kill first-paint flicker via localStorage cache
35f38e2 mobile: surface real error details instead of generic Next.js page
57e419b /active: fix React error #310 (conditional hooks past early return)
0ed3096 mobile error boundary: hidden 5-tap debug reveal
723f829 mobile footer: slim the black band ~16px without hiding the logo
9d6b923 admin /customers: surface recently-added at top + "New" filter chip
5693bf7 route pill: hourly auto-recheck + two-state icon (calm / action)
1cfeea3 route pill: calm-state tap opens celebratory sheet, not /route
1aa0205 route pill: full <button> reset so calm-state icon fits perfectly
392a1de geocode card rework + composer cleanup + admin overview fix
2778e3f fix Mariska bug: data-integrity guard + restore Vercel crons
2e55737 Live Ops ShiftsList: needs-action rows redirect to Live Feed per-row
f03dd10 mobile side menu: profile up, log out down, native-app shape
4a649f7 push: stop shipping links to the wrong Vercel hostname
ff1fcf6 cron/shift-reminders: stop spamming reps every 5 min
bac96bb schedule: warn-but-allow overlapping shifts + /active pause button
380ee77 admin polish: clickable KPIs + Manage spacing + tagline cap
6076a7b RouteOptimizedSheet: mention the hourly auto-check
1fdedae fix: /active dumps to empty state when rep taps Pause
51296be home swap + /active polish
aadc5c1 revert: KPI cards back to static (Gary preferred the look)
33910b1 /active: inline map + never "flag manager" on geocode-task card
4a23742 /active Pause: one button toggles to Resume (no duplicate up top)
f9c7a93 README: full May 14 handover so a fresh chat picks up cleanly
839b6b6 fix: requested_shifts SELECT was leaking other reps' requests
b2deb97 pause: timer freezes when paused + Paused badge on /shifts row
a981b2d /route: clear "Apply this new route" CTA when watcher finds improvement
6c518ea route icons rebrand + atomic request claim for double-approve race
```

#### Late-afternoon additions (after the first README handover at f9c7a93)

- **`839b6b6` — requested_shifts RLS leak fixed.** Critical: the old `requested_shifts_admin_select` policy used `USING (true)` to give admin inbox visibility but accidentally let every rep SELECT every OTHER rep's pending requests. Realtime respects RLS, so Rep B's INSERT also lit up Rep A's PendingRequestPill and "Awaiting approval" card. Migration `db/migrations/2026_05_14_requested_shifts_role_scoped.sql` re-scopes SELECT/UPDATE/DELETE to `rep_id = auth.uid() OR profiles.role = 'manager'`. **Gary ran this in the Supabase SQL Editor mid-afternoon.**
- **`b2deb97` — paused timer freeze + /shifts "Paused" badge.** Hero timer on /active used to keep ticking through a pause; now an effective-now value freezes at the pause-start epoch and a pauseOffsetMs accumulator tracks total paused duration across multiple pauses in one shift, both localStorage-backed per shiftId. `/shifts` row gets a warn-tint "Paused" chip beside the customer name (mirrors the /active banner tone) AND the sort buckets on-break + travelling alongside in-progress so a paused shift sits at the top of the list, not buried with scheduled.
- **`a981b2d` — /route "Apply this new route" CTA.** Once an order was saved the formerly-hidden Save button stayed hidden forever, so when the watcher found a better route there was no way to ADOPT it. Reps saw the green "New route — 17 min faster" banner with no action target. Fix: when a saved order exists AND the displayed optimised order differs from it, the button reappears as "Apply this new route" (same save handler; same downstream behaviour, clearer label + bigger CTA styling). Banner subtitle now points at the button.
- **`6c518ea` — Route icons + double-approve race.** Two unrelated fixes shipped together.
  - **Icons.** Action-state pill was blue (MC.brandDeep) with a `target` glyph — Gary read it as "a generic alert" not "act on the route." New `route-alert` (start dot → S-curve → end dot, amber MC.warn fill) + `route-done` (same route shape with a ringed check at the end, MC.ok green) glyphs added to mobile Glyph.tsx. Action no longer competes with the brand blue used everywhere else; calm clearly says "route, ticked". Pulse keyframe on /shifts recoloured to amber-tinted ring to match.
  - **Mariska double-shift race.** `approveRequest` did SELECT → INSERT → DELETE with no row lock; double-tapping Approve (or two managers in parallel) raced two `createShift` calls. Replaced the opening SELECT with an atomic UPDATE that flips status=`'pending'` → `'approving'` AND returns rep/customer fields in one round-trip — if the filter clause misses, 0 rows affected and the second call bails with "Already being processed". UI guards (`disabled={busyId === r.id}`) were already in place but only covered same-tab clicks; the DB lock now covers cross-tab + cross-manager races too. Any failure between the claim and the final delete reverts status back to pending so the request stays approvable on retry.

#### Evening additions (after the 6c518ea handover — `531d7f8` through `447fc82`)

The "tying-up-loose-ends" session before go-live. Commits in order:

- **`531d7f8` — /profile LocationCard.** New tile above Notifications that detects + explains iOS's "Allow Once → re-prompts every visit" trap. Stamps `localStorage.morpheus.gps_granted_at` on every successful GPS fetch (added to `requestGeolocationOnce`) so a follow-up visit can tell "iOS forgot the choice" from "first time we've asked". Three observable states: Allowed (green), iOS keeps forgetting (warn with explicit "pick Allow on Every Visit" instructions), Blocked (red with iOS Settings → Apps → Safari → Location path). New `getGeolocationStatus()` helper in `lib/route-planner.ts` returns a `GeolocationStatus` shape the card reads on mount + visibilitychange. Test button verifies the current permission without us silently triggering yet another prompt elsewhere in the app.

- **`cf04b9d` — library opens on iOS PWA + Live Ops realtime tightened.** Two unrelated:
  - **Library tap-to-open was dead on iOS standalone.** Root cause: `onOpen` did `await getLibraryDownloadUrl()` before `window.open(url)`. The `await` broke iOS's user-gesture chain and the popup was silently blocked. Fix: pre-generate signed URLs in `listLibraryFiles()` via `storage.createSignedUrls(paths, TTL)` (single batched call). Each FileRow is now a real `<a href={downloadUrl} target=_blank>` anchor — native anchor clicks are always user-initiated and iOS lets them through. Storage RLS, table SELECT, signedUrl creation all checked out; the bug was purely client-side popup-blocker timing.
  - **Live Ops "Needs action" counts felt slow.** Tightened LiveFeedPanel poll 60s → 15s, added window `focus` refetch alongside `visibilitychange`, and added a `<LivePulse>` heartbeat dot in the panel header that briefly brightens for ~1.2s on every realtime event (NOT on plain polling ticks). Title hover shows "Last realtime event: HH:MM:SS" or "Connected (no events yet)".

- **`37efa95` — Phase 4 RLS hardening migration written.** The long-deferred production blocker. Single coordinated migration via `is_manager()` SECURITY DEFINER helper, applied to 19 tables + 3 storage buckets. Three reusable shapes: manager-only writes (customer_tasks, library_files, app_settings, custom_fields, customer_seen_by_manager, messages), rep-self writes (shifts, message_recipients.read_at, rep_locations), and rep-INSERT-with-shift-match (photos, signatures, completions, customers via `created_by_rep_id`). Service-role callers (cron, /api/messages/send, /api/push/notify, /api/users) bypass RLS by design. **Migration applied to prod evening May 14** (`826ea1c`) after two small fixes:
  - **`0f89517`** — shift_events uses `actor_id` not `rep_id` (my SELECT policy referenced the wrong column → 42703 on first run).
  - **`4d99f55`** — dropped the bogus `public.organisation` block; org settings actually live as rows inside `app_settings` (2026-05-06 "organisation" migration is misnamed).
  - **`826ea1c`** — README marked applied after Gary ran the final version cleanly.

- **`9e18116` — Live Ops Needs Action: single shared NeedsActionContext.** Gary's report: "Live Ops says 2, Today's Shifts says 1, Live Feed says 0" on the same screen. Three independent subscriptions + three independent fetches + different poll cadences meant each surface drifted out of sync after realtime DELETEs (especially with Supabase replica lag). New `lib/needs-action-context.tsx` provider mounted in AdminShell — one subscriber, one 15s poll, one state, plus a 1s+3s short-retry after each realtime event to handle replica lag. Sidebar / LiveFeedPanel / ShiftsList all read from the same context → identical numbers update in the same React frame. The sidebar's pendingCount/attentionCount state + dedicated subscribers are gone; LiveFeedPanel's requests/attentionShifts state + dedicated 15s polls are gone; ShiftsList's listPendingRequests fetch is gone. The "Needs action" filter in ShiftsList now includes all open attention shifts (not just today-filtered) so its count matches the other two surfaces exactly.

- **`27f3a72` — Live Ops Today's Shifts: dropped "Unassigned" filter tab.** Per Gary: managers pair reps with shifts at creation time, so a top-level "Unassigned" filter was dead UI weight. STATE_MAP entry + the rep_id=null → "Unassigned" row label inside the "All" tab stay so a legacy null-rep row still renders sensibly; just removed the dedicated filter tab + its count.

- **`447fc82` — photo capture: the REAL fix for iOS PWA.** Bug summary: every previous attempt to fix "nothing happens when I tap a photo task" was correct in spirit but missed the actual root cause. The killer was the `await refreshPhotoCount(task.id)` inside `startPhotoFlow` — that `await` between the user tap and `photoInputRef.current?.click()` dropped iOS standalone PWA's transient user-activation flag, and the OS silently blocked the camera popup. Made worse by `requestAnimationFrame(() => click())` which also breaks the activation chain. Fix: removed `async` from startPhotoFlow entirely, read the cached photo count from the page-level `taskPhotoCounts` Map (already hydrated by a sibling useEffect) and fire `input.click()` in the SAME synchronous call stack as the tap handler. Also dropped the rAF-based auto-chain between photos — replaced with a per-photo "Take photo N of M" button in the bottom overlay. Each button-tap is a fresh user gesture iOS respects; works identically on Android Chrome + desktop browsers. PhotoSlotGrid's in-sheet retake path was already correct (synchronous openPicker in a button onClick) — only the first-tap-from-task-list path needed the fix.

### Today's session — what shipped (May 15, 2026 — overnight)

Pure sidebar design pass that rolled past midnight from the May 14
late-evening session. Three commits, no schema changes, no
behaviour changes outside of one new Tasks-sub-nav toggle.

- **`189a90a` — sidebar polish: bigger nav, "In real time" brand pill, bottom gradient.** Three small visual tweaks Gary called out from a screenshot. Nav link font 13 → 14 + glyph 17 → 18 + vertical pad 8 → 10 — reads less like a phone tab, more like a workstation console. The "Workforce Operations. In real time." tagline split: "Workforce Operations." keeps the muted text + existing 7s shimmer animation; "In real time" now wears a brand-cyan rounded chip (matches the OPS pill in the footer wordmark + the admin's MORPHEUS Ops sidebar pill, so the two-tone brand reads consistently across surfaces). Outer container's background became `linear-gradient(180deg, #0E1116 0%, #0E1116 40%, #11151B 100%)` — top stays unchanged so nav contrast is preserved, bottom warms ~3 lightness points so the dead space between nav and user card stops reading as a flat black hole on tall displays.
- **`f3f55b5` — Tasks sub-nav toggle + animate + org name accent colour.** Two unrelated things one commit:
  - **Tasks sub-nav.** Before: clicking Tasks while already on `/tasks*` was a no-op nav (Next.js sees same href, doesn't re-render) so the sub-nav stuck open with no way to close. After: parent click intercepts when pathname matches and toggles a local `tasksExpanded` state. Auto-opens when the user lands on `/tasks` from elsewhere via a pathname useEffect. Animation: outer wrapper `max-height 0↔160` + opacity 0↔1 on a 320 ms `cubic-bezier(.22, 1, .36, 1)` curve (soft overshoot — feels like a click landing, not a generic ease), plus inner `translateY(-6px → 0)` slide. Caret on the parent row rotates 90° to track the open state. Plumbed via two new optional `<NavItem>` props (`onClick` for parent intercept, `trailingCaret` + `caretOpen` for the rotating chevron).
  - **Org name accent colour.** New `getOrganisationNameColor` / `setOrganisationNameColor` in `lib/settings-store.ts`, writing to `app_settings.organisation_name_color`. Both setters fire the existing `morpheus.org.changed` event so the sidebar repaints instantly with no reload. `/settings/organisation` gets a new "Accent colour" sub-card below the name input — native `<input type="color">`, hex text input, a live preview pill showing the wordmark on a dark sidebar background, and a Clear button. Saved together with the name via the existing Save button (one toast, one round-trip). Sidebar applies `color: orgNameColor || undefined` to the wordmark + a subtle `text-shadow: 0 1px 0 rgba(0,0,0,0.35)` when a custom colour is set (some brand reds / yellows look washed out on dark without a tiny ink-tone glow). Local org-cache bumped to v2 (added `nameColor`); v1 entries are silently ignored on read, no migration. **Verified explicitly that Live Ops needs-action wiring is unchanged** — the badge, the deep-link to `#live-feed-needs-action`, the `useNeedsAction()` shared context, the LIVE pulse, and the browser-tab-title alert all still work exactly as before.
- **`b1a739b` — sidebar tagline: force single-line at 240px.** Gary's screenshot showed the tagline wrapping ("Workforce Operations." on line 1, "In real time" pill on line 2). Three nudges to land it on one line: font 12.5px → 11px, `flexWrap: wrap` → `nowrap`, and the muted prefix truncates first via `overflow: hidden` + `text-overflow: ellipsis` + `minWidth: 0` while the brand pill stays whole via `flexShrink: 0`. Pill padding tightened `1px 7px` → `1px 6px` to claw back a few extra pixels.

**No new migrations.** All three commits are pure mobile / admin client work.

### Today's session — what shipped (May 21, 2026)

Short, focused session. Merged in the `260519-UIFixes` branch (a
big customer-detail refactor + new `/past-shifts` archive + new UI
primitives) and shipped the admin-side photo viewer that had been
missing since the May 13 photo feature. Five commits, no schema
changes — the data path was already complete; this just builds the
admin window into it.

- **`e690495` — `MARKETING_BRIEF.md`.** Canonical product reference for the Marketing Muse agent stack. Lives at repo root so any fresh chat or agent has a single document describing what the product is, who it's for, where it lives, what's shipped, and what's deferred. No code change.
- **`2351d1d` — customer detail refactor + past-shifts archive + combobox uplift.** `/customers/[id]` was a 1,293-line monolith; split into proper tab components (`OverviewTab`, `ContactsTab`, `RepsTab`, `LibraryTab`, `TasksTab`, `ShiftsTab`) + a shared `tabStyles.ts`. SiteEditor + SiteRow extracted from the old SitesTab. New admin UI primitives that everything else can drop into: `EmptyState`, `ExpandableRow`, `Pill`, `TabHeader`. Combobox + Avatars + CustomFieldsCard got an uplift pass. New `/past-shifts` page with `GridView` + `TableView` + `TasksDonePill` for the dedicated completed-shift archive. Playwright coverage added for the new flows (`customers-contacts-reps`, `past-shifts`, `site-editor-geocode`). 4.6k insertions / 3k deletions across 41 files — net win because so much of it was extracting from the 1,293-line page.
- **`9e32ab1` — customers: consolidate Contacts to detail page, drop Overview head-office card.** Follow-up trim — the Overview tab's head-office card was duplicating what now lives in the Contacts tab; removed the duplication, contacts read from one source of truth.
- **`cdfde3d` — merge `260519-UIFixes` into main.** Brings the two refactor commits above onto main as a true merge commit (no fast-forward) so the branch is still discoverable in `git log --graph`. Zero file overlap with main → conflict-free.
- **`ed14a0a` — admin: view shift photos (inline thumbnails + lightbox + list badges).** The mobile app has been writing `shift_task_photos` rows + uploading JPEGs to the public `shift_photos` bucket since May 13 (Feature C), but admin had no UI to read them — a stale TODO comment in `/past-shifts/page.tsx` claimed the table didn't exist. New `morpheus-admin/lib/photos-store.ts` with `listPhotosForShift(id)` (single ordered query) + `listPhotoCountsForShifts(ids)` (one batched query, grouped in JS for list-page badges). `/shifts/[id]` Tasks card now renders an inline 64×64 thumbnail strip per task; clicking any thumbnail opens a full-screen `PhotoLightbox` that flicks through every photo for the shift in upload order — backdrop click + Escape + ArrowLeft/Right + × button all close + nav, wrap-around prev/next, bottom caption "Photo N of M · {task name} · {time}", autoFocus on close button. Tasks where `customer_tasks.photo_count > 0` and zero photos came through render a muted "No photos uploaded (expected N)" line so the gap is visible; tasks where photos weren't expected stay clean. `/past-shifts` (Table + Grid) and Live Ops "Today's Shifts" each got a small `📷 N` chip next to the state pill — omitted at 0 so rows stay clean. New `camera` glyph added to `AGlyph` (outline style, same 24×24 viewBox as siblings). Read-only; mobile still owns the write path.

**No new migrations.** All five commits are admin client work + one root-level doc. The `shift_task_photos` table + `shift_photos` storage bucket from `db/migrations/2026_05_13_task_photos.sql` were already on prod and feeding through fine — this just builds the viewer admin had been missing.

### Today's session — what shipped (May 7, 2026)

Long, varied day. Roughly in narrative order:

#### Mobile UX

- **Pending request UX** — `<RequestResolutionWatcher>` toast banners for approval/decline; pending cards now have a clear "Awaiting approval" warn-tone state with a "Waiting for manager · X ago" line (`196bc67`).
- **Approval flow polish** — duplicate-row lag killed (cross-check pending against today's shifts so the pill clears the moment the new shift INSERTs); post-tap toast confirmation; resolution banner now fires app-wide via layout-mounted watcher (`ebb9310`, `2f9c7f3`).
- **Resolution banner grace gate dropped** — used to require admin to act within 5 min, otherwise the banner silently never fired. Now it just checks "did the rep ever request this customer in this session" (`2f9c7f3`).
- **Floating PendingRequestPill** — bottom-right reminder mounted at layout level, follows the rep across every page until resolved. Cross-checks against today's shifts so it clears instantly when the approved shift INSERTs (`07080de`, `2f9c7f3`).
- **`/shifts` redesign** — pending requests pinned to top above "Scheduled for me"; today's-date header line; search box (4+ shifts); compact "Request a customer" pill in the corner; loading spinner on Resume / Check-in buttons; **contextual countdown pill** per row (`in 50 min` / `10 min late` / `ends in 20m` / `ran 10m over`) ticking on a 30s page-level timer (`d97e56b`, `5ee80c6`, `7a63ac2`).
- **Dashboard tightened** — AppHeader uses `env(safe-area-inset-top)` so non-notched devices get a slimmer band; `compact` mode hides the redundant "Dashboard" title; "View all" promoted from a tiny text link to a brand-tinted pill button (`07080de`, `2f9c7f3`).
- **Break duration chooser** — homepage "Take a break" no longer auto-starts; opens a slide-up sheet with 15/30/60/open-ended; negative-timer bug fixed by clamping elapsed at zero (`6d3b46a`).
- **Live state flips** — mobile now flips `shifts.state` on `on-break` / `travelling` transitions so admin Live Ops "On break" / "Travelling" tabs actually surface the rep mid-shift. `setShiftBreakState` is permissive (in-progress / travelling / on-break all OK as source) so taking a break right after travelling works (`c3d15dd`, `2f9c7f3`, `7a63ac2`).
- **`/add-shift` cleanup** — chunky black "View N pending" sticky bar removed (the global pill does the job); chunky CTA card replaced with compact pill (`07080de`, `2f9c7f3`).

#### Calendar (admin)

- **Time-axis Days view** with 30-min slot grid (06:00–20:00, 28 slots × 24px = 672px tall) + drag-and-drop with snap, conflict detection, optimistic update + rollback (`deb1ad3`).
- **Lane allocator** — overlapping shifts split into side-by-side lanes via sweep-line per overlap cluster. Past `MAX_VISIBLE_LANES = 3` the rightmost slot becomes a brand-tinted "+N more" pill that opens a popover listing the rest (`07080de`, `c3d15dd`).
- **Drag-on-busy-day fix** — overflow pill at `zIndex:3` was swallowing dragOver/drop. Now `pointerEvents:none` while a drag is active so the column underneath catches the drop (`e16a08f`).
- **Weekend dimming dropped** — Sat/Sun look like normal workdays; today still highlights (`e16a08f`).
- **Click-to-add** — click any empty spot in a column → `/schedule/new` with date + clicked time pre-filled (snapped to 30 min). Uses `router.push`, not `window.location.assign`, so calendar state survives the round-trip (`2f9c7f3`, `6282384`).
- **Quick-info popover** on click — centred modal via `createPortal` to escape stacking contexts. Shows customer + initials, rep, date/time, tasks, state pill. Buttons: View / Edit + Delete (scheduled only, inline confirm) (`e16a08f`, `c028b0a`).
- **Days/Reps toggle retired** — rep dropdown filter took over the use case. Reps view + ~520 LOC of unreachable components deleted (`07080de`).
- **Time picker** — native `<input type="time">` replaced with a 30-min select (06:00–22:00 in AM/PM labels). Existing odd-minute values still round-trip (`e16a08f`).

#### Schedule / shifts management

- **Numbered-step `/schedule/new`** flow + live "About to create" preview (`96e9684`).
- **Customer scope default = empty** so a misclick can't bulk-create one shift per customer (`96e9684`).
- **Distance + total-tasks fields removed** from create AND edit forms — distance derives from customer coords + rep location; tasks_total auto-counts from `customer_tasks` (specific + universal). Live count chip on the edit page; Live Ops bar uses `liveTaskTotal` per row from a single batched `countTasksForCustomers` call (`96e9684`, `2f9c7f3`, `e16a08f`).
- **Auto-derived `series_id`** on every multi-shift creation (one UUID per /schedule/new submission). One-off shifts leave it null (`7a63ac2`).
- **`/schedule/manage` page** — series-based shift management. One row per series with customer(s), rep(s), date range, time, count + upcoming/past split. Actions: View / Edit future / Cancel future / All. Top-of-calendar "Manage shifts" link next to "New shift" (`d97e56b`).
- **Edit-future modal** — change customer / rep / start / end across every still-scheduled shift in a series from today onward. Smart prefill (single-customer/rep series prefill exact; multi-* start blank with "(unchanged)" placeholder) (`c028b0a`).

#### Admin UX pass

- **Honest "Saved" indicator** in the TopBar — the global pill only surfaces during/after actual mutations (was previously rendering "Auto-saved" always, which was misleading because most pages still need explicit Save buttons). Wired into shifts / customers / tasks / requests / settings stores (`6d3b46a`, `53dc28a`).
- **Disabled `<Btn>`** actually looks disabled — primary/danger go gray with not-allowed cursor (`6d3b46a`).
- **`<RepAvatar>`** now derives a stable color from rep id (or initials) using a 12-color palette. Same rep, same color everywhere — Reps list, reports, pickers, Live Ops table, map dots (`a4afc62`).
- **`<CustomerScopePicker>`** got a search box matching the rep picker (`a4afc62`).
- **Schedule rep-filter dropdown** in the calendar toolbar (`6d3b46a`).
- **Live Ops Today's Shifts** — count badges per tab (subtle pill next to label, brand-tinted when >0); "On break" + "Travelling" tabs now reflect real state; "Issues" dead tab removed (`90bcfb3`, `c3d15dd`).
- **Live Ops Live Feed** — caught-up empty state surfaces 5 most-recent activity events below "All caught up"; All activity gets a Today / 7d / 30d / All time dropdown (defaults to Today) (`5ee80c6`).
- **Live Ops Map popover** — rep marker shows rep + current customer + state pill + click-through to shift detail (`a4afc62`).
- **Reps detail Edit button** wired (was a dead button) — routes to existing `/settings/managers/[id]/edit` (`e662f17`).

#### Settings

- **Organisation page expanded** — Address with `<AddressAutocomplete>` + map preview (reuses `<CustomerAddressMap>` with new `showGeofence` prop), Phone, Email, Tax number, Website, Registration number. Plus mounted `<CustomFieldsCard entity="organisation">` so org-level custom fields are now first-class. (`6d3b46a`, `cbf6966`).
- **`organisation` added to `FIELD_ENTITIES`** + DB migration `2026_05_07_custom_fields_organisation.sql` to relax the CHECK constraint (`cbf6966`).
- **"Approval not needed" toggle** — when on, rep "Request a customer" bypasses the requested_shifts queue and a shift is scheduled directly. Mobile branches the toast text accordingly (`5ee80c6`).
- **Sidebar "Powered by Morpheus TA" footer** + dropped the duplicate subtitle (`6d3b46a`, `53dc28a`).

#### Library

- **Search box** above the file table (matches Customers / Reps / Tasks affordance).
- **Free-text categories** — upload form's category dropdown is now an input + datalist of existing categories. Sidebar shows the union of seed + free-text categories.
- **"Close upload" → "Cancel upload"** with x glyph (`53dc28a`).

#### Tasks page

- **Search box** added to the toolbar matching the Customers/Reps/Library pattern. Filters across name, description, and joined customer name. (Tasks / Library list pages now share the toolbar shape with Reps + Customers.)

#### Drag, popover, polish

- Calendar popover migrated from card-child to `createPortal(document.body)` so it escapes the card's stacking context (was rendering visually behind sibling overflow pills) (`c028b0a`).

#### Migrations applied today

- `2026_05_07_custom_fields_organisation.sql` — extends `custom_fields.applies_to` CHECK to include `'organisation'`
- `2026_05_07_shifts_series_id.sql` — adds nullable `shifts.series_id uuid` + partial index

Both must be run once in the Supabase SQL Editor before the relevant features hit prod.

#### Late-session push (May 7 evening — `ac939c1`..`HEAD`)

Done as one push, in narrative order:

- **Calendar count-chip consistency** — `DAY_SHIFT_LIMIT` now mirrors `MAX_VISIBLE_LANES` (2). Any day that would need a `+N more` overflow pill collapses to the count chip instead. Same UX whether a day has 3 shifts or 7 (`a30b89e`).
- **RESET wipes every future state, not just `scheduled`** — `deleteAllUpcomingShifts()` lost its `.eq("state", "scheduled")` filter. Earlier reset appeared to work but stranded `in_progress` / `complete` / `late` / `cancelled` rows that reappeared on next refetch. Per-row `bulkDeleteShifts` keeps the scheduled-only guard (mid-shift safety). Manage-page prompt copy updated to match new behavior (`a30b89e`, this push).
- **QA suite groundwork** — full master plan at `qa/QA_PLAN.md` (37 admin routes + 12 mobile routes mapped; coverage map / e2e checklist / Supabase integration checklist / data-integrity checklist / prioritized bug list). Playwright scaffold with config, fixtures (`adminPage` / `repPage` with real login), seed helpers, helpers (service / anon / user Supabase clients with QA tagging), and 5 exemplar specs. Vitest API tests for RLS + uniqueness constraints. Reusable skill at `~/.claude/skills/qa-audit/SKILL.md` so future audits stay consistent (`5295f0c`).
- **Dead-button purge round 1** — `/reps` lost `Import CSV` and `Invite rep` (no onClick, no Link wrap). `/reps/[id]` lost the `Message` button for the same reason. Edit on `/reps/[id]` still routes to the unified user editor (`3c81462`).
- **`Combobox` rollout** — new `components/ui/Combobox.tsx`: reusable single + multi-select dropdown with auto search (>8 options), optional left icon glyph, color swatches, sublabels, keyboard nav, click-outside, and portal rendering so overflow:hidden parents don't clip it. Migrated every customer / rep / category / region / type filter across `/tasks`, `/schedule`, `/schedule/manage`, `/shifts/[id]/edit`, `/tasks/[id]/edit`, `/library/[id]/edit`, `/customers/new`, `/customers/[id]/edit`, `/reports/timesheet`, Live Feed range, Custom Fields builder + value entry. Native `<select>` retained only for the 30-min time picker (OS picker on mobile is better) and the disabled preview select inside the custom-fields form (`8729d42`).
- **`/reps` got a Manage shifts header link** — parallels the calendar's button so managers can jump from the rep list to `/schedule/manage` in one click.
- **Mobile welcome strip rebuilt** — thin Morpheus-cyan gradient card with a glassy logo tile (uses the org logo from `/settings/organisation` if uploaded, else a sparkle glyph), org name + date row, time-aware greeting (`Good morning` / `Good afternoon` / `Good evening` / `Working late`), first-name only (`755e4a3`).
- **Honest empty/all-done state on the dashboard** — when every shift is complete the card flips to a green "All shifts done — nice work" celebration. The old "No shift assigned today" message was always a lie post-checkout (`755e4a3`).
- **Break or travel** — homepage `BreakCard` is now `BreakOrTravelCard`. Chooser sheet leads with a prominent cyan "Travel now" button alongside the four break-length options. Active travel timer renders inline on the dashboard with an "Arrived" stop button (`755e4a3`).
- **Footer sticks to the bottom** — `.phone-content > *` is a flex column, AppFooter uses `margin-top: auto`. Profile / Library / Support no longer leave the black bar floating mid-screen on short content. Mobile `lib/settings-store.ts` gained `getOrganisationName` / `getOrganisationLogoUrl` reads.
- **Customer edit form rewrite** — `/customers/[id]/edit` was a one-field form (only address). Now exposes name, code, initials, avatar colour swatch, region, address (re-geocoded if changed), and the geofence slider — same shape as `/customers/new` but pre-filled, with a live preview card on the right. `CustomerPatch` extended so `updateCustomer` actually accepts those fields. Customer detail header: name is now a clickable button with an edit glyph; standalone Edit button removed (one canonical entry point) (`755e4a3`, this push).
- **Loading awareness** — new `LoadingBar` (thin animated cyan bar pinned to top of content) + `Spinner` + `Skeleton` primitives in both apps. Plumbed into the worst offenders: admin `/schedule`, `/schedule/manage`, `/customers/[id]`, `/reports/operations`, `/reports/rep-performance`, `/reports/timesheet`; mobile `/`, `/active`, `/check-in`, `/check-out`. Mobile dashboard hero metric is a real skeleton block while shifts load instead of showing `—`.
- **Dead-button purge round 2** — `/notify` was a static design preview with a dozen non-functional buttons (Save draft, Send now, channel toggles, etc.). Stubbed to a "Coming soon" card until a real notifications backend exists. The route still resolves so existing links aren't broken.
- **Stale comment in `/schedule/manage` reset prompt** corrected to match the new "every state" wipe behavior.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`).

### Today's session — what shipped (May 13, 2026)

The big features day before go-live. Five new end-to-end features
(A–E), plus a substantial pass of polish + bug fixes + the Morpheus
Ops rebrand. ~30 commits between `d11675b` and `0c9bcb0`.

**TL;DR for the next chat:**
- Feature A — rep adds customer from mobile + admin NEW badge
- Feature B — rep geocodes existing customer's site
- Feature C — photos on tasks (camera-first tap flow, auto-complete)
- Feature D — customer signature on tasks (signature pad, auto-complete)
- Feature E — Messaging (admin composer, push + in-app, scheduled)
- Pause-and-switch for check-in collisions (max 2 paused)
- Live Ops Needs-Action deep-link from sidebar badge + row click
- Mobile pending-pill expand-on-tap
- Add-customer flow polished + map preview
- Shift dashboard surfaces site address
- Morpheus Ops rebrand (brand-tinted "Ops" pill everywhere)
- iOS photo capture fix (button + useRef + programmatic .click pattern)
- AddressAutocomplete error visibility

**Migrations to run (in any order — all idempotent):**
```
db/migrations/2026_05_13_customers_created_by_rep.sql
db/migrations/2026_05_13_task_photos.sql
db/migrations/2026_05_13_task_signatures.sql
db/migrations/2026_05_13_messages.sql
db/migrations/2026_05_13_push_subscriptions.sql   (already shipped — see Web Push section below)
```

#### Feature A — Rep adds customer from mobile (`d11675b`, `0d17da1`)

`/add-customer` (mobile) — side-menu-only entry. Minimum fields: name,
address, optional contact + phone. Admin sees the new customer
immediately in `/customers` with a brand-cyan **NEW** badge until a
manager opens its detail page (per-manager dismissal — each manager
clears their own badge).

- New column `customers.created_by_rep_id` references `profiles(id)`.
  NULL = admin-created (the default for everything existing).
- New table `customer_seen_by_manager (customer_id, manager_id,
  seen_at)` for the per-manager badge dismissal.
- Mobile `createCustomer` auto-generates: slug-style id (with random
  4-char suffix), initials from first two words, brand colour from an
  8-colour palette, code = max(code)+1, active=true. Also writes a
  paired `customer_sites` "Head office" row with the address — every
  customer always has ≥1 site.
- Bug fix mid-day: the initial implementation passed
  `is_head_office: true` to the `customer_sites` insert, but that
  column doesn't exist (the 2026-05-08 migration uses the literal
  name "Head office" as the primary-site signal, not a boolean).
  Postgres rejected the row and the swallow-the-error code path made
  it silent. Fix in `b7f129c`: drop the bad column, capture the
  error, and ROLL BACK the parent customer row on failure so the rep
  can retry instead of leaving an orphan customer.

**Bonus feature added same day** — pin at creation time. Rep can
either type an address (with Nominatim typeahead suggestions that
auto-pin lat/lng), tap "Use my GPS", or tap "Geocode what I typed"
as a manual fallback. The whole address+location block was reworked
into a single bordered card with a clear two-step flow + map preview
(see Map Preview / Add-customer polish below).

#### Feature B — Rep geocodes existing customer's site (`8465ff5`)

A synthetic "Add location pin" task appears on `/active` when the
customer's `customer_sites` row has null lat/lng. Tapping it opens
a card with the same two-option layout (GPS + address geocode);
saving writes coords to BOTH the site AND the parent customer row
(if also missing), and logs a `customer.geocoded` event in the
admin Live Feed.

- Uses `requestGeolocationOnce()` (existing shared GPS cache) so
  multiple pin flows in one shift don't re-prompt the OS.
- Geocode uses the local `/api/geocode` Nominatim proxy. Mobile
  has a parallel `/api/geocode/suggest` route for typeahead, which
  is line-for-line functionally identical to admin's same route.

#### Feature C — Photos on tasks (`3ae6d6f`, refactored in `cda34ac`)

Admin marks a task with `photo_count > 0`. The rep app then forces
that many photo captures before the task can be marked complete.
Combined with the existing "Required" toggle: when both, the rep
genuinely cannot end the day with the task open and zero photos.

**Schema:**
- `customer_tasks` gains `photo_count int DEFAULT 0` and
  `photos_compulsory boolean DEFAULT true`.
- New table `shift_task_photos (id, shift_id, task_id, rep_id,
  slot_index, storage_path, public_url, width, height,
  file_size_bytes, quality_tier)`.
- Supabase Storage bucket `shift_photos` (public-read, auth-write,
  5 MB cap). Storage RLS on `storage.objects` scoped to that bucket.
- Both tables added to `supabase_realtime` so the slot grid updates
  live across devices.

**Mobile flow (final, May 13 PM):**
- Photo tasks wear an unmistakable **"Camera · N photos"** pill in
  the task list. Yellow when 0 taken, brand-cyan when in-progress,
  green when complete.
- Tap a photo task with empty slots → camera opens DIRECTLY (no
  intermediate sheet). Page-level `<input type="file"
  capture="environment">` referenced via `useRef` and clicked
  programmatically from a `<button onClick>` — bullet-proof iOS
  pattern that works in standalone PWA mode (the label-wrap-input
  pattern silently no-ops in standalone iOS Safari, which was the
  May 13 PM bug report).
- After each capture: upload runs, photo count refreshes, camera
  reopens automatically for the next slot until N are taken. The
  LAST upload auto-marks the task complete (no manual "Complete"
  tap) and logs `shift.task_completed` with
  `meta.auto_completed='photos_filled'`.
- Inline upload overlay shows "Uploading photo 2 of 3…" between
  shots. On error, surfaces a Retry button.
- Tapping a completed photo task opens the TaskSheet's PhotoSlotGrid
  for view/retake/delete.
- Compression: org-level admin setting at
  `/settings/check-in-rules` → "Photo quality" (standard / high /
  maximum) — `1600px / 1920px / 2400px` max edge, 0.8 / 0.88 / 0.92
  JPEG quality. Hard cap of 2 MB per photo; retries at lower
  quality until under cap.

#### Feature D — Customer signature on tasks (`a44a579`)

Admin marks a task `requires_signature=true`. On mobile, tapping
that task opens a full-screen signature pad — customer signs on
screen, rep saves, the data URL gets stored in
`shift_task_signatures` and the task auto-completes (or, if it ALSO
requires photos, the chain runs photos → signature → complete).

**Schema:**
- `customer_tasks.requires_signature boolean DEFAULT false`.
- `shift_task_signatures (id, shift_id, task_id, rep_id,
  signature_data_url, signer_name, signed_at)` with
  `UNIQUE(shift_id, task_id)` — re-signs replace via delete + insert.
- Storage as base64 PNG data URL in a `text` column (not Supabase
  Storage). Typical signature: 5–20 KB. Justification in the
  migration comments.

**Files:**
- `morpheus-mobile/components/SignaturePad.tsx` — canvas with
  Pointer Events (covers pen / touch / mouse uniformly), DPR-aware
  drawing, downscale-to-export at 600×240, optional signer-name
  field, full safe-area-respecting overlay.
- `morpheus-mobile/lib/signature-store.ts` — insert/list/delete/
  subscribe helpers.
- Combined photo + signature gating wired in
  `morpheus-mobile/app/active/page.tsx` — `onPhotoCaptureFile`
  detects "all slots filled" and chains into `setSignaturePad(...)`
  rather than auto-completing, when the task also needs a signature.

#### Feature E — Messaging (`54b70ab`)

Manager → rep messaging with two delivery channels (push and/or
in-app banner), audience picker (all reps / all managers / everyone
/ specific users multi-select), and optional scheduling for a
future time. Replaces the `/notify` "Coming soon" placeholder.

**Schema:**
- `messages` — id, subject, body, created_by, audience_kind
  (all / all_reps / all_managers / specific), audience_user_ids[],
  deliver_push, deliver_in_app, scheduled_at, status (pending /
  sending / sent / failed / cancelled), sent_at, meta jsonb.
  CHECK: at least one channel true.
- `message_recipients` — id, message_id, recipient_id, read_at,
  push_sent_at, push_error. UNIQUE(message_id, recipient_id).
- Both added to `supabase_realtime`.

**Why materialise recipients at compose-time:** audience changes
between compose and send (e.g. rep gets hired after a scheduled
broadcast is queued) don't retroactively shift who got it.

**Flow:**
- Admin `/notify`: pill picker → typeahead user picker (when
  "specific") → subject/body → channel toggles → schedule input
  → Send Now / Schedule button. Recent + scheduled list on right
  with status pills + Cancel for pending scheduled.
- `composeMessage()` validates → resolves recipients → INSERTs the
  message → bulk-INSERTs message_recipients → if send-now, POSTs
  `/api/messages/send`.
- `/api/messages/send` advisory-locks via atomic
  `UPDATE WHERE status='pending'` (prevents double-send under
  cron + admin race), fans out push via existing `sendPushToRep`,
  marks `status='sent'` with delivery counts in meta.
- `/api/cron/messages` (parked in vercel.json until Pro lands)
  sweeps `status='pending' AND scheduled_at <= now()` every
  minute and hits `/api/messages/send` for each.
- Mobile `/messages`: full inbox with realtime updates, expand-to-
  read, mark-all-read, `?id=<message_id>` deep-link from push taps.
- `MessageBanner` at layout level: top-of-screen banner on new
  in-app message arrival, auto-dismisses 6.5s. Suppressed when
  already on `/messages`.
- Side-menu "Messages" entry with brand-tinted unread badge.

**Cron entry to restore when Vercel Pro is active:**
```json
{ "path": "/api/cron/messages", "schedule": "* * * * *" }
```

#### Polish + bug fixes (same day)

**Live Ops needs-action wiring (`37860b0`, `f9f73e9`):**
- Today's Shifts → "Needs action" filter → clicking a row no longer
  navigates to /shifts/[id]/edit. Instead routes to
  `/#live-feed-needs-action` which scrolls up to the Live Feed
  panel above (where the inline approve/decline/reassign UI lives).
- Sidebar Live Ops nav item also deep-links to the Needs Action
  anchor WHEN the badge is hot. Cold badge = plain `/` link.
- Implementation uses a URL hash (`LIVE_FEED_NEEDS_ACTION_HASH =
  "live-feed-needs-action"`) so the panels stay decoupled. Browser
  native fragment-scrolling handles the scroll-into-view.

**Mobile pending-request pill expand-on-tap (`f9f73e9`):**
- The floating "1 pending · Awaiting approval" pill used to silently
  navigate to /shifts on tap, which reps reported as "I tap it and
  nothing happens". Now expands in place into a small info card
  showing each pending customer + a clear "View your shifts →" CTA.
  Chevron rotates 90° on expand so the affordance reads as
  disclosure, not navigation.

**Check-in pause-and-switch (`cda34ac`, `038ba80`):**
- When a rep taps Check-in on shift B while still in shift A, the
  warning banner now offers TWO modes:
  - **"Check out of A & switch"** (default, primary) — closes A
    entirely (state='complete' + check_out_at), logs
    `shift.checked_out` with meta.reason='switched_to_other_shift'.
    For the common case (rep finished at A and moving on).
  - **"Pause & come back later"** (secondary) — pauses A
    (state='on-break'), logs `shift.paused_for_other_shift` with
    meta.next_shift_id. For the "swing by next door" case.
- New helpers in `shifts-store`: `pauseAndCheckIn`,
  `checkOutAndCheckIn`, `resumePausedShift`, `countMyPausedShifts`.
- Hard cap **MAX_PAUSED_SHIFTS = 2** — third Pause attempt is
  disabled with explainer copy. The Check-out path is always
  available (doesn't increase the paused count).
- Same-shift collision (rep taps Check-in on the shift they're
  already in) silently routes to `/active`.
- New event types added to `events-store` (both apps):
  `shift.paused_for_other_shift`, `shift.resumed`. With matching
  EVENT_LABEL entries in admin.

**Add-customer flow polish + map preview (`038ba80`):**
- Address + pin section regrouped into a single bordered card with
  clear status header ("Location needed" → "Location pinned") that
  turns green when pinned.
- Two-step flow: (1) typeahead [primary, auto-pins on suggestion
  pick], (2) stacked manual fallbacks [GPS / Geocode] visible
  BEFORE pinning, hidden after.
- `components/MapPreview.tsx` — read-only MapLibre map renders
  inside the card once pinned, with a brand-cyan marker and the
  address as a caption. flyTo + marker reposition on coord change.
  Reuses `maplibre-gl` (already a dep). Free OpenFreeMap tiles.

**Shift dashboard address surface (`a44a579`):**
- `/active`'s customer card now surfaces the site address on a
  dedicated row with a pin icon. Tap → opens Google Maps. When
  no address on file, an explicit warn-toned "No address — flag
  with your manager" empty state replaces the silent omission.

**Morpheus Ops rebrand (`038ba80`, `0c9bcb0`):**
- "Morpheus TA" / "Morpheus t&a²" → **MORPHEUS Ops** everywhere.
- Brand-tinted rounded chip on "Ops" (rgba(21,180,214,0.18)
  background, radius 4) matching admin sidebar pill across:
  AppFooter wordmark, SideMenu footer, admin sidebar.

**iOS photo capture fix (`ab9a4db`):**
- The original PhotoSlotGrid used a `<label>` wrapping an
  absolute-positioned `<input type="file">` with opacity:0.
  Silently no-ops in iOS standalone PWA mode. Rewrote with the
  bullet-proof pattern every battle-tested upload library uses:
  real `<button onClick>` that calls `inputRef.current?.click()`
  synchronously inside the user-gesture handler. `display: none`
  on the hidden input is fine for programmatic `.click()`.

**AddressAutocomplete error visibility (`4b54dc6`):**
- Distinguishes network/HTTP errors from a genuine "no matches"
  empty result. Network/502 surfaces a red inline message
  ("Address service is busy" / "Couldn't reach the address
  service"). Real empty result echoes the query and points at
  the manual "Geocode what I typed" fallback.

**Side-menu Messaging badge (`54b70ab`):**
- Brand-cyan unread badge alongside the Messages label (caps at
  99+). Realtime-fed via `subscribeMyInbox`.

#### Cleanup pass (`0c9bcb0`)

- `lib/geo.ts` (new) — consolidated three near-identical
  `haversineMeters` implementations from `/check-in`, `/check-out`,
  and `lib/shifts-store` (filterClaimableByRadius). Overload-based
  function handles both call shapes (scalar quadruple + LatLng
  pair). `formatDistanceMeters` moved into the same module.
- Deleted orphan `MapPlaceholder` (152 lines) in `/check-in` —
  static SVG/gradient illustration from an earlier design
  iteration, never imported or rendered.
- `lib/mock-data.ts` — flipped `comingSoon: true` off the Messaging
  nav entry now that the route is real (was greying out the link
  in the sidebar).

#### Files touched today

**Migrations (in `db/migrations/`):**
- `2026_05_13_customers_created_by_rep.sql`
- `2026_05_13_task_photos.sql`
- `2026_05_13_task_signatures.sql`
- `2026_05_13_messages.sql`
- `2026_05_13_push_subscriptions.sql` (Web Push — covered separately below)

**New mobile files:**
- `lib/customers-store.ts` extensions (`createCustomer`,
  `setCustomerSiteCoords`, `geocodeAddress`)
- `lib/photo-store.ts`
- `lib/signature-store.ts`
- `lib/messaging-store.ts`
- `lib/geo.ts`
- `components/AddressAutocomplete.tsx`
- `components/MapPreview.tsx`
- `components/SignaturePad.tsx`
- `components/MessageBanner.tsx`
- `app/add-customer/page.tsx`
- `app/messages/page.tsx`
- `app/api/geocode/route.ts`
- `app/api/geocode/suggest/route.ts`

**New admin files:**
- `lib/messaging-store.ts`
- `app/api/messages/send/route.ts`
- `app/api/cron/messages/route.ts`
- (`/notify/page.tsx` rewritten end-to-end)

**Modified mobile files (highlights):**
- `app/active/page.tsx` — direct-camera photo flow, signature flow,
  GeocodeTaskCard, PhotoSlotGrid, page-level photo input ref,
  address row on customer card
- `app/check-in/page.tsx` — pause-and-switch banner + two-mode
  picker, MAX_PAUSED_SHIFTS cap
- `components/PendingRequestPill.tsx` — expand-on-tap info card
- `components/Glyph.tsx` — added "send" + "edit" icons, brand-pill
  styling on MorpheusMark
- `components/SideMenu.tsx` — Messages entry + unread badge
- `app/layout.tsx` — MessageBanner mounted at root
- `lib/shifts-store.ts` — `pauseAndCheckIn`, `checkOutAndCheckIn`,
  `resumePausedShift`, `countMyPausedShifts`,
  `MAX_PAUSED_SHIFTS`, `switchToShift` aliasing

**Modified admin files (highlights):**
- `app/notify/page.tsx` — full rewrite from placeholder to composer
- `app/tasks/new/page.tsx`, `app/tasks/[id]/edit/page.tsx` —
  photo + signature requirement controls, linked-compulsory rule
- `app/customers/page.tsx`, `app/customers/[id]/page.tsx` —
  NEW-by-rep badge + per-manager dismissal
- `app/page.tsx`, `components/screens/live-ops/*` — Needs Action
  row routing + sidebar deep-link
- `components/shell/Sidebar.tsx` — Live Ops badge hash-link,
  Morpheus Ops pill
- `components/shell/SettingsShell.tsx` — "Notifications" →
  "Messaging" rename
- `lib/messaging-store.ts`, `lib/tasks-store.ts`,
  `lib/customers-store.ts`, `lib/events-store.ts` extensions
- `app/settings/check-in-rules/page.tsx` — shift-request
  auto-approve toggle moved here, photo quality picker added

Both apps build clean (`npm run build`). TypeScript clean
(`npx tsc --noEmit`) on both.

#### Late-evening messaging fixes + post-ship polish

After the initial Feature E ship Gary went straight into live testing
and surfaced a handful of issues that got patched the same evening.
Listed here in commit order so the next chat can read the trail:

- **`27a120e` — README full May 13 session entry + ungrey the
  Messaging nav link.** The `Messaging` nav entry in
  `lib/mock-data.ts` was still flagged `comingSoon: true` from the
  placeholder era. Sidebar's NavItem renders coming-soon entries
  as a non-clickable greyed row with a SOON pill — exactly the
  symptom Gary reported ("i cant access messaging on backend...
  greyed out"). Flag removed. The Sidebar TS now narrows via a
  `(item as { comingSoon?: boolean })` cast since the NAV_ITEMS
  literal union no longer has the property on any member; the
  plumbing is preserved for future "Coming soon" entries.

- **`e2a250a` — make the messages publication ADD TABLE
  idempotent.** Re-running `2026_05_13_messages.sql` errored with
  `42710: relation "messages" is already member of publication
  "supabase_realtime"`. `ALTER PUBLICATION ... ADD TABLE` isn't
  idempotent — the retry aborts the surrounding transaction.
  Wrapped both ADDs in `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM
  pg_publication_tables WHERE ...) THEN ... END IF; END $$;`
  guards. Safe to re-run any number of times now.

- **`8874347` — stop auto-excluding the composer from their own
  audience.** Field bug: Gary composed a test message, watched
  his own mobile inbox, got "All caught up" (zero messages). The
  message DID land in the DB with `status='sent'` but no
  recipient row existed for his user. Root cause:
  `resolveRecipients()` was filtering the composer out of the
  resolved id list "to avoid the awkward I-sent-this-and-got-my-
  own-copy experience". In practice this made single-account
  testing impossible AND misbehaved on Everyone / All managers /
  Specific[self] where the composer genuinely belonged in the
  audience. Slack / Teams / Discord all give the sender a copy
  of broadcasts they're part of — matched that behaviour.
  Removed `excludeUserId` parameter entirely.

- **`a1cbf2f` — rep avatars + selected-summary strip in the
  user picker.** Two UX bumps to the "Pick specific…" affordance
  on `/notify`:
  - Each row shows the user's `RepAvatar` (uploaded profile
    photo from mobile /profile, falling back to a colour-hashed
    initials circle). Same component admin uses on `/reps` and
    the Live Ops map markers, so it stays visually consistent.
  - Selected-summary strip appears above the list as soon as
    ≥1 user is ticked: brand-tinted "N picked · Clear" bar.
    Solves the case where a long search query scrolls the
    picked rows out of view and the manager loses track of
    who's actually in the audience.
  Also bumped list maxHeight 200 → 320 px and added ellipsis
  truncation on name + meta so long emails don't push the
  avatar off the row. The picker is a static inline list (not
  a popover), so no outside-click dismissal to worry about.

#### Pending-status messaging — diagnosis for the next chat

Gary reported a Send Now landing the row at `status='pending'`
(not `sent`) with `sent_at=NULL` and `push_sent_at=NULL`. The
recipient row WAS materialised correctly (his rep account, role
matching). So the schema is fine — but the `/api/messages/send`
route either didn't run or returned 2xx without doing the work.

**Most likely cause:** `SUPABASE_SERVICE_ROLE_KEY` env var
missing on Vercel `morpheus-admin`. The send route bails with
500 if the key isn't set:

```ts
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  return Response.json(
    { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
    { status: 500 }
  );
}
```

`composeMessage` SHOULD then flip the row to `status='failed'`
in its catch block — but Gary's data showed `pending`, which
means either (a) the env var was set but the route hadn't been
redeployed since adding it (Vercel binds env at build), or (b)
the fetch errored before getting a response and the catch
behaved differently than expected.

**Two-minute fix tomorrow:**
1. Vercel dashboard → morpheus-admin → Settings → Environment
   Variables → confirm `SUPABASE_SERVICE_ROLE_KEY` exists on
   **Production**.
2. Deployments → latest → **Redeploy** (forces rebuild that
   picks up env changes).

**Unblock-tonight workaround** (run in Supabase SQL editor):

```sql
-- Flips every stuck-pending non-future-scheduled message to sent
-- so the mobile inbox picks them up via realtime.
UPDATE public.messages
SET status = 'sent', sent_at = now()
WHERE status = 'pending'
  AND (scheduled_at IS NULL OR scheduled_at <= now());
```

The mobile inbox query filters to `status='sent'`, so this
single UPDATE makes the message visible. The
`message_recipients` rows are already in place (composer
materialised them at compose time), so the realtime sub on
mobile picks up the change instantly.

### Today's session — what shipped (May 12, 2026)

A long iteration day on Plan-my-day, the /shifts list, and the
end-of-shift flow — mostly driven by live testing rounds from Gary.
Net effect: one less screen (/summary deleted), a much calmer /route
page, consistent timestamps everywhere a saved order is referenced,
and a Plan-route pill that's always reachable.

#### Plan-my-day overhaul (mobile `/route`)

`/route` is now a pure ordering view. Stripped out:
- Per-leg "Leave now / X min late / X min early" schedule banners
- Per-leg "Open in Maps" buttons
- "Open whole day in Maps" CTA at the bottom
- "Update saved order" button (Gary asked for this multiple times)
- The 60s `nowTick` + `dayMapsUrl` memo + `computeScheduleStatus` +
  `buildArrivalISOLocal` + `formatClock` helpers that fed those views

Added:
- Prominent **"Order optimized at HH:MM"** banner under the totals
  (was a 10.5px hint line tucked inside the toggle subtitle —
  Gary's flagged this 10+ times).
- Always-visible **"Re-checked at HH:MM"** caption, hydrated from
  localStorage on mount and refreshed whenever the planner returns
  a route. Independent of saved-order state — visible every visit.
- Same-address legs (two stops at one site → driveSeconds≈0) now
  show "Same address as previous stop" instead of broken
  "— drive · —".
- Header restructured into clean rows so nothing wraps on iPhone
  widths: Row 1 LIVE chip + Re-check button, Row 2 "Total drive
  time: 16 min · 8.3 km", Row 3 "Re-checked at 3:26 PM".
- "Total drive" → "Total drive time" (lead number, own row, 15px/700).

All timing affordances (Leave-now / ETA / Maps handoff / Start
travelling) now live on /shifts only — two screens can no longer
disagree about the same number.

#### /shifts Plan-route pill

The pill is now the ONLY link to /route (the Plan-my-day side-menu
entry was removed earlier). Old rule hid it when remaining stops
< 2 — that stranded reps with "1 of 2 done · 1 left" on a page
with zero entry to /route. New rule: render whenever the rep has
any shifts today. Three states:

| State | Label | Look |
|---|---|---|
| All shifts done/cancelled | `Day complete` | okTint + green check |
| Saved order + work remaining | `Optimized · 2:42 PM` | okTint + green check |
| No saved order + work remaining | `Plan route` | brand-deep CTA + target |

Icon pair (`check-circle` / `target`) and size (15px) match the
home segmented pill exactly so the affordance reads as one feature
from either screen.

#### /shifts claimable card layout

The "Unscheduled · available" card was being squeezed — time
wrapping, AVAILABLE pill + distance on different lines, full
address sprawling across 4 lines — because the Claim button sat
in-line on the right and took half the card. Restructured: for
claimable rows the outer flex is now COLUMN. Tile + content take
a top row at full width; Claim button drops to a footer row
right-aligned. Non-claimable rows use `display:contents` on the
wrapper so their layout is unchanged.

Also added: **"3.2 km away"** distance pill on claimable rows
(crow-flies haversine from rep GPS, computed client-side — fast,
zero API calls, hidden when GPS denied), and the full street/
suburb wraps to two lines instead of single-line truncating.

#### /summary deleted, check-out routes home

The post-shift `/summary` page (stat tiles, activity timeline,
recorded exceptions recap) was redundant: the rep filed every
exception on `/check-out`, the wrap-up overlay already says
"Checked out · Highmark Retail", and the dashboard is where they
want to land to pick up the next shift.

New flow: tap Check out → exception form → wrap-up overlay plays
Saving → Logging → Done → **"You're checked out!"** frame visible
~1.2s (bumped from 0.55s) → `router.push("/")`.

Deleted:
- `app/summary/` directory (718 lines)
- `/summary` path from `SideMenu`'s `TODAY_PATHS`
- URL-param construction in `/check-out` that fed the deleted page

The wrap-up overlay animation (the one Gary loves — pulsing brand
circle, SAVING/LOGGING/READY stepper, "Logging the details… ·
Closing out your shift at Highmark Retail") is untouched. That's
the entire end-of-shift celebration now.

#### /active task accordion defaults

When `/active` mounts, the Tasks section now auto-opens **only**
if the customer has compulsory tasks. No compulsory (or no tasks
at all) → stays collapsed. Optional + Breaks accordions stay
collapsed in both cases. Guarded by a `useRef` so once the rep
manually toggles, the rule never overrides them again.

#### Home Up Next + segmented pill

- Auto-fire of the directions preview on the home Up Next card
  was reverted. Explicit Directions button back next to Start
  travelling. Per Gary: the home map should default to a clean
  day-overview pin view, not a route line. /shifts kept the
  auto-fire on expanded rows because expanding is itself a
  deliberate "show me this stop" gesture — different surfaces,
  different defaults.
- Home segmented pill (View all + plan icon) now renders the
  plan slot whenever there are any shifts today (was hidden
  under remaining < 2). When unplanned, the target glyph sits
  on a solid brand-deep fill (was transparent — Gary said it
  wasn't loud enough as a CTA). When planned, okTint + check.

#### Migrations to run for May 12

Three new migrations — all idempotent, all wrapped in
`BEGIN; … COMMIT;`:

- `2026_05_12_customer_contacts.sql` — `customer_contacts` table
  for multi-contact support per customer (Identity tab on admin
  customer edit). RLS matches the rest of the schema.
- `2026_05_12_shifts_claim_radius.sql` — `shifts.claim_radius_m
  integer` for the "rep must be within N metres to claim"
  filter on unscheduled shifts.
- `2026_05_12_shifts_flexible_time.sql` — `shifts.is_flexible_time
  boolean` for the "Anytime today" toggle on /schedule/new.
  When true, mobile renders "Anytime today" instead of a
  start–end range, and the countdown pill is suppressed.

#### /day · End-of-day recap (late-evening addition — `b5cc77e`)

After EOD QA, added the **wow feature**: a cinematic end-of-day
recap page reached from the home dashboard's "All shifts done —
nice work" card once every shift today is in a terminal state.

The recap (`app/day/page.tsx` — 766 lines):
- Cinematic hero — 3 pulsing rings, bouncy stage, stroke-drawn
  check, 36-particle CSS confetti burst, shimmer sweep. Same
  animation grammar recovered from the deleted /summary page so
  the visual language stays consistent.
- 2×2 stat tile grid with count-up animations:
  · **Shifts done** (sum of complete shifts)
  · **Hours worked** (sum of check_in_at → check_out_at)
  · **Tasks completed** (count of shift_task_completions joined by shift_id)
  · **Travel time** (paired shift.travel_started / shift.travel_ended events)
- "Your day" timeline — each completed shift shows customer logo,
  check-in → check-out clock window, green tick.
- Exception count banner (only if there were any: off-site, late,
  early check-out, unable-to-attend).
- Single "Back to dashboard" CTA.

Wiring:
- Home "All shifts done — nice work" card is now a `<Link>` to
  `/day`. Subtitle gains "· tap to see your recap" cue, right-side
  chevron makes the affordance discoverable.
- New ShiftWithMeta field: `checkOutAt: string | null`. Column
  already in the DB since May 6 (`2026_05_06_shifts_check_out_at`),
  just exposed it on the TS type + rowToShift mapper.

No new DB migrations. Pure aggregation over existing tables.
Cross-platform: pure React + Supabase + CSS — identical on iOS
Safari/PWA, Android Chrome/PWA, desktop. Respects
`prefers-reduced-motion`: every animation short-circuits and
the end-state renders instantly.

This replaces the per-shift `/summary` we deleted earlier today.
Per-shift `/summary` fired after EVERY check-out — too much.
`/day` fires at most once a day, when the work's done. One
celebration, real payoff.

##### `/day` cinematic iterations (`e3e00e2` → `c8bff98` → `1206990` → `0d354bc`)

Four follow-up commits to make the entry actually feel like a
moment, not a transition. Gary's testing rounds drove each fix:

- **`e3e00e2`** — reduced-motion override scoped to only the
  `.dm-gradient` class. Playwright at iPhone 14 reduced-motion
  viewport caught that the universal `.dm-*` rule was killing
  tile backgrounds and label colours alongside the gradient
  text. Fix: keep `animation: none` global, restrict the
  `-webkit-text-fill-color` + `background: none` overrides to
  the gradient headline only.
- **`c8bff98`** — Gary feedback: "almost fell asleep." Wrapped
  the hero number in a `CountUp` so the digit visibly ticks from
  0 → N over 1.5s instead of just appearing; bumped tile label
  opacity from 0.7 → 1.0 (real iOS Safari was rendering the
  compounded opacity near-invisible); extended hero entry from
  0.9s → 1.8s with bigger overshoot; added a second
  `<SecondaryConfetti>` (48 particles) that fires from the tile
  area as the tiles drop to give the cinematic a "phase 2" hit;
  re-timed the whole arc with discrete beats.
- **`1206990`** — Gary feedback: "no movement, no nothing
  besides the start." Added SIX continuous ambient animations
  that loop forever after the entry settles, so the screen
  never goes static:
    · `dm-flash` — bright radial white-out at t=0 (one-shot)
    · `dm-glow-breathe` — hero number text-shadow pulses (3.4s loop)
    · `dm-bob` — hero number micro-bobs (4.5s loop)
    · 18 ambient floating particles drifting up forever
    · `dm-shimmer-loop` — diagonal light wash (5.5s loop)
    · `dm-tile-glow` — each tile's box-shadow breathes (3.2s loop)
- **`0d354bc`** — Gary feedback: "still no animation when it
  starts." Root cause: three CSS animations (entry, bob,
  glow-breathe) stacked on the same DOM element were competing
  for the `transform` property — iOS Safari's composite resolver
  was letting the looping `bob` bleed into the entry window and
  suppressing the entry arc entirely. Fix: split into THREE
  nested wrappers so each transform owns its own element:
    · outer `.dm-impact-shake` — one-shot screen-shake at 0.55s
    · middle `.dm-hero-bob` — infinite bob (transform)
    · inner `.dm-hero-num` — entry drop + count-up (transform +
      filter + opacity) and glow-breathe (text-shadow, doesn't
      conflict)
  Also made the entry MUCH more dramatic: number now drops from
  `translateY(-280px)` at scale 0.3 with -22° rotation and 50px
  motion blur, crashes down through a 3-stage bounce. Tiles now
  slide in from the SIDES (left from -80px, right from +80px)
  instead of straight-drop. Added `will-change: transform,
  opacity, filter` + `backface-visibility: hidden` for iOS GPU
  acceleration.

##### Verified by Playwright

A live-fire test (`/Users/gary/Claude/qa/day-record-test.mjs`,
since deleted after success) stubs Supabase auth + REST queries
and drives `/day` at iPhone 14 + Pixel 7 viewports with frame
snapshots every 150ms. The recording confirms:
  - 0ms: "TALLYING YOUR DAY…" pulse on dark backdrop
  - 150ms: "0" appears with bright radial flash behind, confetti
    firing outward
  - 300ms: count-up has ticked to "2", number scaled in fully
  - 600ms: settled on final number, "Day done." headline rises
  - 2400-3000ms: 4 tiles slide in from sides with their own
    count-ups
  - 3100ms+: per-stop timeline cascades, exception banner,
    CTA fades in
  - Continuous: ambient particles drift, hero glow breathes,
    shimmer sweeps, tile shadows pulse — forever.

##### iOS PWA cache-busting note (for the next debugger)

Recurring symptom Gary hit: "I just pushed and I'm still seeing
the old animation." iOS PWAs cache the JS bundle aggressively
through the service worker — Vercel deploying does NOT
immediately update what the installed PWA serves.

To force-bust on iPhone:
  1. Swipe up + swipe up on the Morpheus tile to fully kill the
     PWA from the app switcher (not just minimise).
  2. Wait ~10s so the service worker can check for updates on
     next launch.
  3. Reopen from the home screen — fresh bundle should load.
  4. Nuclear option if the above fails: delete the PWA from the
     home screen, reopen the URL in Safari, Share → Add to Home
     Screen. Forces a completely fresh install.

This is iOS-specific. Android Chrome PWAs honour the
Service-Worker-Allowed cache headers more aggressively and
usually pick up the new bundle within a minute.

#### Files changed today

`app/page.tsx`, `app/shifts/page.tsx`, `app/route/page.tsx`,
`app/active/page.tsx`, `app/check-out/page.tsx`,
`app/summary/page.tsx` (**deleted**), `app/day/page.tsx` (**new**),
`lib/shifts-store.ts`, `components/SideMenu.tsx`.

Mobile build green (`npm run build`), admin build still green
(no admin files changed today), working tree clean. All commits
on `origin/main`, both Vercel projects auto-deployed.

#### Web push notifications — answered for the next chat

User asked: "can you only do push notifications with native apps?"
Answer: **no**, Web Push works from the PWA on both iOS and
Android.
- Android Chrome / PWA: full Web Push (banner + action buttons).
- iOS Safari **as a home-screen PWA** since iOS 16.4 (March 2023):
  banner + sound. **Not** available in iOS Safari without
  installing to home screen.
- Implementation outline when this becomes a build:
  1. Generate VAPID keys (one pair, server-side secret).
  2. Service worker that handles `push` events.
  3. On first launch after install, `Notification.requestPermission()`
     + `PushManager.subscribe({ userVisibleOnly: true,
     applicationServerKey: VAPID_PUBLIC })`.
  4. Persist the subscription endpoint per-rep in Supabase
     (new `push_subscriptions` table: `rep_id`, `endpoint`,
     `p256dh`, `auth`, `created_at`).
  5. Send pushes from a Supabase Edge Function (or a tiny Vercel
     route) using the `web-push` npm package.
- iOS gotcha: build a "Install to home screen for notifications"
  nudge on first launch when the user-agent is iOS Safari and
  `window.matchMedia('(display-mode: standalone)').matches` is
  false. One-screen onboarding, not a Capacitor wrap.
- Capacitor wrap stays on the deferred list — it's about
  **background GPS** when the app is closed (PWAs sleep), not
  push. Don't conflate the two when scoping.

#### QA audit summary

Full regression review at end of day (via `/qa-audit`). No
blockers, no high-severity issues. Two medium nits:

1. `saveShiftOrder` writes order + meta in two sequential
   `setItem` calls — not strictly atomic if localStorage quota
   is hit between them. UI handles gracefully (shows
   "Optimized" without time when meta missing). Worth tightening
   someday: combine into one `{ order, savedAt }` payload.
2. Home segmented pill has no "Day complete" calm state — when
   all shifts are done AND no saved order, the plan slot still
   shows the brand-deep CTA with target glyph. Cosmetic
   inconsistency with /shifts. 5-line fix: mirror the
   `dayComplete` logic.

Verified end-to-end: shift-order-store consistency, localStorage
namespace, subscribeShiftOrder propagation across home / /shifts
/ /route, applySavedOrder edge cases (deleted customer mid-day,
quota miss), /shifts column-vs-row layout via `display:contents`,
/active accordion useRef guard, /summary fully removed from
code, /check-out submit flow + DB writes, openMapsLink
iOS/Android branching, _gpsCache module-level sharing. No new
DB migrations needed for any May 12 *code* change beyond the
three already listed above.

### Today's session — what shipped (May 11, 2026)

The longest session to date — eighteen commits across two themes that
both ended up touching most of the app. First half of the day was the
**cancellation / "I can't make this shift" feature** end-to-end (rep
flag → manager Needs-action queue → four resolutions → audit trail).
Second half was a sweeping **polish + identity + exception-toggle
pass** — rep photos, house/face icons on maps, mobile chrome
cleanup, exception toggles, notes per shift, banner notifications,
nicer loading states, /schedule/manage row-actions rebuild.

Then a third late push for the two biggest deferred items:
**traffic-aware Plan-my-day routing** and **per-customer logo upload**.

#### Plan my day · /route (mobile)

The "perfect routing" feature we'd been deferring. End-to-end:

- **Server-side API route `/api/route/plan`** (`morpheus-mobile/app/api/route/plan/route.ts`). POST origin + ordered stops, get back per-leg ETA + distance + polyline. Provider-agnostic: when `GOOGLE_ROUTES_API_KEY` is set, calls Google Routes v2 (`computeRoutes`) with `TRAFFIC_AWARE` preference and an explicit field mask; when unset, falls back to a mock that estimates from haversine × 1.4 winding × 30 km/h urban average. The mock keeps the feature usable for UX testing without burning Google quota and is the default in local dev.
- **Greedy nearest-neighbour optimizer** (`optimizeOrder`) kicks in when the client passes `optimize: true`. O(n²) which is trivial at the 3–8 stops a rep visits per day; gets within ~5–10% of optimal in practice. Hard cap at 25 stops on the server.
- **Fail-open**: any Google API failure (non-200, bad shape, network) silently falls back to mock + a `warning` field the client surfaces as a non-blocking pill. Reps never see a broken Plan-my-day.
- **Client wrapper `lib/route-planner.ts`** with two flavours: `planRoute(origin, stops)` for direct calls, `planMyDay({ optimize })` as the convenience that grabs the rep's today shifts (excluding complete / cancelled / "unable to attend" / no-coord rows), gets GPS, calls the API, returns shifts in visit order. 5-minute in-memory cache keyed by (coords, stop ids, optimize flag) so mashing Refresh doesn't blow through Google quota. Cache cleared explicitly on user-initiated refresh.
- **GPS fallback**: when the rep denies location, we ground the route at the first stop's coordinates and set `originFromFirstStop: true` so the UI can warn that ETAs are measured from there, not from the rep's current position.
- **Mobile `/route` page** (`morpheus-mobile/app/route/page.tsx`). Sticky summary band: provider chip ("Live traffic" green when Google + traffic-aware, "Estimated" grey for mock), total duration + distance, Refresh button, Optimize-order pill switch. Vertical leg list with numbered step badges (1, 2, 3…), customer name + drive time + drive distance, ETA pill ("Arrive 9:42 AM"), Leave-by pill with three tones — green ("Leave by 9:18"), warn ("less than 10 min slack"), danger ("Late · sched 9:30"). Per-leg "Open in Maps" deep link. Bottom "Open whole day in Maps" button that emits a multi-waypoint Google Maps URL (iOS routes maps.google.com to Apple Maps, Android opens Google Maps).
- **Dashboard entry point** — when the rep has ≥ 2 stops today, a "Plan my day" card appears below the dashboard map ("N stops · live traffic ETAs + Leave-by reminders"). Single stop = card hidden; Up Next already covers that case in one tap.
- **Side-menu link** — "Plan my day" sits between "Today" and "Request shift".

No new DB migration — the planner reads existing shifts/sites only. `GOOGLE_ROUTES_API_KEY` is documented under "Optional env vars" further down.

#### Per-customer logo upload (admin → mobile)

Mirror of the rep-avatar pattern, applied to customers. Replaces the coloured-initials tile with the customer's actual branding everywhere on the rep's device — without sending huge image files.

- **DB migration `2026_05_11_customers_logo.sql`** — adds a single `customers.logo_url text` column. Same storage choice as profile avatars: base64 data URL in a text column, no Supabase Storage bucket needed. Tiny on the wire because of step 3.
- **Compression on upload** — admin uses `compressCustomerLogo()` (in `lib/customers-store.ts`) which decodes the file, paints onto a 96×96 white canvas (letterbox, not square-crop, because logos are usually wordmarks not faces), and exports JPEG quality 0.82. Result is typically 5–15 KB per logo. White background means transparent PNGs still read on dark UI tints. 12 MB hard limit on source files before decode so a 50MP camera shot doesn't blow up.
- **Customer edit form** — `/customers/[id]/edit` gains a "Customer logo" field below "Avatar colour" with a 64×64 preview tile, "Upload logo" / "Replace logo" / "Remove" buttons. Saves immediately on file pick (separate commit-step from the main form Save — managers want to see the logo land before fiddling with the rest).
- **Auto-flows everywhere** — `CustomerSwatch` (admin) and `CustomerTile` (mobile) both branch on `logoUrl`: when set, render the logo on a white tile; when null, fall back to the original coloured-initials swatch. No call-site changes needed beyond passing the prop. Mobile call sites updated for: home up-next card, /shifts row, /active hero, /check-in hero, /check-in/success preview, /check-out hero, /add-shift customer picker, and /route leg badges.
- **Shifts join carries the logo** — `lib/shifts-store.ts` (mobile) joins `customers(logo_url)` in every query so the logo travels with the shift row in one round-trip. `ShiftWithMeta.logoUrl` is the flat property the UI reads.
- **Audit** — saves write a `customer.updated` event to `shift_events` (new event type added to the EventType union).

Eighteen commits in order:

#### Cancellation feature (8 commits, `7229cc4`..`e723c68`)

- **Stage 2A — schema + rep flow (`7229cc4`)** — `db/migrations/2026_05_11_shifts_attention.sql` adds the attention overlay columns to `shifts`. New `UnableToAttendSheet` with 6 reasons + free-text note. `/shifts` rows expose "I can't make this shift" + Withdraw when applicable. `lib/shifts-store.ts` (mobile) gains `raiseUnableToAttend` / `withdrawUnableToAttend` and the attention fields on `ShiftWithMeta`.
- **Stage 2A.1 — same affordance on the home up-next card (`e64362e`)** so the rep doesn't have to drill into `/shifts` to use it. Same sheet, same store fn.
- **Stage 2B — manager Needs action + 4 resolutions (`2629f06`)** — Live Ops "Needs action" tab shows attention-raised shifts at the top; `/shifts/[id]` shows an attention banner with `[Reassign] [Reopen as unassigned] [Acknowledge] [Cancel · don't refill]`. Each resolution writes a dedicated `shift.attention_*` event for audit.
- **Sidebar badge + calendar pill + shift-detail banner (`6279bc4`)** — flashing red sidebar pill propagates "N pending" across every admin page; calendar cards carry an inline pill; shift detail surfaces the rep's reason + note.
- **Stage 2B.1 — resolution feedback, conflict check, edit escape hatch (`64c7c3d`)** — Reassign now does a conflict check on the picked rep + shows clean error inline; resolution writes (`attention_resolution` column from `_resolution.sql` migration) drive a brief rep-side feedback pill; "Edit…" link on the banner lets the manager amend without resolving.
- **Stage 2B.2 — softer label, relaxed states, silent-fail guard (`ca487eb`)** — "Acknowledge" renamed to **"Keep · rep stays on"** after testing showed managers mis-read it as "rep is off the hook". Read-back verification on the UPDATE catches silent no-ops (the RLS rule was too tight; now the `.select()` after `.update()` flags it). Mobile flow accepts a wider set of source states so cancelling after a state flip still works.
- **Stage 2B.3 + 2B.4 — diagnostic logging on the raise path (`0f77859`, `72b4ba0`)** — added `[unable]` `console.warn` traces at each step so the user could pinpoint where their home-page raise died silently. Closed the bug; logs left in (cheap, quiet).
- **Stage 2B.5 — re-raise must clear stale resolution fields (`e723c68`)** — re-raising "Can't make it" on a previously-actioned row was sticking in a half-resolved state. Fix: `raiseUnableToAttend` now clears `attention_resolved_at / _resolved_by / _resolution` alongside setting the new `attention` flag.

#### /schedule/new polish (`54ba1c7`)

- Customer and Rep section headings bumped from 11.5px caps to 13px+700 (the eye should land on the picker, not the label above it).
- Smart time defaults — start = next 30-min slot from now (so opening the form at 14:07 prefills 14:30), end = start + 30 min. Old hard-coded `09:00 / 17:00` defaults were a constant micro-friction.

#### Always-on dashboard map + admin live shift card (`592bdde`)

- Mobile `DashboardMap`: removed the `placed.length === 0` gate. Map mounts on first render regardless of shifts; pins layer in. No more cold-start reflow.
- Admin `/shifts/[id]`: new `LiveActivityCard` appears for in-progress/on-break shifts. Shows checked-in time + live clock + elapsed + the rep's currently-running task with a "started X ago" line, pulsing dot, 30s refresh.
- New helper `getActiveTaskForShift(shiftId)` queries `shift_events` for the latest `task_started` whose task hasn't been completed.

#### Notes feature end-to-end (`f96bfcb`)

- `db/migrations/2026_05_11_shifts_notes.sql` adds `shifts.rep_notes text`.
- Mobile: `lib/shifts-store.ts` gains `saveShiftNotes(shiftId, notes)` with auth-gated filter (`rep_id = userId`). `/active` renders `ShiftNotesCard` between Breaks and AppFooter — textarea, auto-save on blur, "Saving… / Saved ✓" inline feedback.
- Admin: `/shifts/[id]` shows the rep's notes in a read-only "Notes from rep" card in the right column when present.

#### Notification watcher for shift assignments (`1baaf9d`)

- New `ShiftAssignmentWatcher` mounted in `app/layout.tsx` alongside `RequestResolutionWatcher`. Subscribes to `shifts` INSERT + UPDATE on realtime; banners when `rep_id = me` AND `shift.id` isn't in the localStorage seen-set.
- Two copy variants: "New shift assigned" (INSERT) / "Shift reassigned to you" (UPDATE). Seen-set is seeded on mount with `listMyShiftsToday()` so existing shifts don't toast on cold start. Auto-dismiss 9s; stale shifts (`shift_date < today`) silently marked seen so back-dated edits don't toast.

#### Awesome loading states (`27e7b90`)

- New `CheckingInOverlay` component for the mobile check-in flow. Full-screen brand-tinted overlay with pulsing rings, animated progress bar, 3-step stepper ("Saving · Logging · Ready"). Parent-owned `CheckInPhase` ("submitting" | "logging" | "done") drives the visual; lands on "done" for ~550ms before routing to `/check-in/success` so the celebration registers.
- `/shifts` skeletons rebuilt: previously a single flat grey box, now a stack of 3 (mine) / 2 (unassigned) shimmering rows matching the real `ShiftRow` silhouette (customer tile + 2 stub lines + chevron), staggered 100ms each.
- Bug fix: `mc-skel` keyframe referenced by the `Skeleton` primitive was never defined in `globals.css` — the old skeleton was just a static stripe. Keyframe is now in place along with new `mc-ring-pulse` and `mc-rise` for the overlay.

#### /schedule/manage row actions cleanup (`8b18df0`)

- Previous 4-button layout (`[View] [Edit future] [Cancel future] [All]`) was wrapping to two lines + the bare "All" button left managers guessing.
- Now: `[View] [Edit future] [⋮]` on one line. The `⋮` opens a small dropdown menu with the two cancel actions fully spelled out:
  - "Cancel upcoming N shifts" — "From today onward · running and complete shifts kept"
  - "Cancel entire series · N shifts" — "Only state='scheduled' rows are deleted · audit trail kept"
- Menu closes on outside click, escape, or after an item fires. Column template moved to a shared `SERIES_GRID` constant; header gained an "Actions" label.

#### Polish: chrome, address line, quieter maps (`b514454`)

- **Tasks chip removed** from `/schedule/new` customer-context strip. Address chip stays for single-customer scope.
- **Site address on shift cards** — small grey pin line under the time row, both on `/shifts` rows and the home next-up card. Truncates on overflow; tooltip carries the full string.
- **Mobile home menu icon moved inline.** Black `AppHeader` band removed entirely from the dashboard. The welcome strip now owns the hamburger button on its right edge (same glassy style as the org-logo tile on the left), folded "Last sync" line under the card, safe-area inset moved onto the welcome card itself.
- **Map attribution collapsed by default** across all four MapLibre maps (mobile DashboardMap, admin CustomerAddressMap / CustomersMap / live-ops MapPanelClient). The (i) toggle stays for anyone who wants to expand it.

#### Identity pass — house vs face + rep photos (`42054a8`)

- New `house` and `face` glyphs added to both `Glyph` (mobile) and `AGlyph` (admin) so they're available for non-map UI too.
- All four map customer markers rebuilt: small white house glyph on the customer's brand colour, rounded-square shape. Reads instantly as "a building / site". Rep markers stay circular pills for visual contrast — same colour-coding as before, but with the rep's photo (when uploaded) or a generic face glyph instead of initials text.
- Mobile `/profile` got an avatar uploader: tappable tile with a small camera badge, hidden `<input type="file">`, `capture="user"` so phones offer the selfie cam. `compressAvatar(file)` does square crop + downscale to 96×96 + JPEG quality 0.82 → typically ~10–15 KB encoded. `updateMyAvatar(dataUrl)` writes to `profiles.avatar_url`. Inline "Saving photo… / error / Remove" status row under the email.
- The photo plumbs everywhere: mobile DashboardMap user marker, admin `/reps` grid + table (`RepAvatar` chooses photo over initials when present), `/reps/[id]` detail card, admin live-ops map rep markers + popup header.
- `lib/rep-locations-store.ts` extended to read `profiles.avatar_url` alongside the existing name/initials; `RepLocation` interface gains `avatarUrl: string | null`.
- Schema: `db/migrations/2026_05_11_profile_avatars.sql` adds a single `avatar_url text` column to `profiles`. NULL falls back to the face glyph everywhere.

#### Exception toggles — org-wide + per-customer (`86dc436`)

- `db/migrations/2026_05_11_exception_toggles.sql` adds `location_exceptions_enabled` and `timing_exceptions_enabled` nullable boolean columns to `customers`. NULL = inherit org default. Both columns have `COMMENT ON` describing the inherit semantics.
- Org-wide pair lives in `app_settings` under keys `location_exceptions_enabled` and `timing_exceptions_enabled`. Both default ON so existing installs behave exactly the same as before.
- Admin UI on `/settings/check-in-rules`: new card at the top of the page with two pill-style toggle switches + explainer subtitles. `ToggleRow` component is reusable; pressed-state visuals + optimistic updates with rollback on error.
- Per-customer override on `/customers/[id]/edit`: tri-state pill group (Inherit org default / Always show / Never show) for each exception type. Stored as `null | true | false` on the customer row.
- Mobile check-in page (`/check-in`): two new `useMemo`s compute `locationExceptionsOn` and `timingExceptionsOn` from the customer override (when set) falling back to the org default; the existing `offsiteInfo` / `timingInfo` blocks short-circuit to `null` when off, propagating to `triggered=false` everywhere downstream. Cards never render and dedicated event-log entries never fire when disabled.

#### Migrations to run for May 11

Six new files in `db/migrations/` — run in order in the Supabase SQL editor before the May 11 features hit prod:

1. `2026_05_11_shifts_attention.sql` — cancellation overlay columns (`attention`, `attention_reason`, `attention_note`, `attention_raised_at`, `attention_resolved_at`, `attention_resolved_by`) + indexes
2. `2026_05_11_shifts_attention_resolution.sql` — adds `attention_resolution` column for the rep-side feedback pill
3. `2026_05_11_shifts_notes.sql` — adds `rep_notes text` to shifts (note feature)
4. `2026_05_11_profile_avatars.sql` — adds `avatar_url text` to profiles (rep photo upload)
5. `2026_05_11_exception_toggles.sql` — adds `location_exceptions_enabled` + `timing_exceptions_enabled` boolean overrides to customers
6. `2026_05_11_perf_indexes.sql` — engineering pass; adds four hot-path indexes (`shift_events.shift_id` partial, `profiles.role`, `rep_locations.rep_id`, `customer_sites.active`)
7. `2026_05_11_customers_logo.sql` — adds `logo_url text` to customers (per-customer logo upload)

All seven are idempotent and wrapped in `BEGIN; … COMMIT;` so failures roll back cleanly. The org-wide pair for the exception toggles is written into `app_settings` lazily on first admin UI save — no migration needed for them.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`). Smoke-tested key routes return 200 on a local prod-mode boot.

#### Late-session push (May 11 afternoon — `8283df0`..`6deb0d3`)

Seventeen more commits between the morning batch and end-of-day,
driven by the manager testing the morning's drops and flagging
friction. Roughly grouped:

Mobile chrome + flows
  • `8283df0` Hide Directions / Start travelling on the up-next card
    once the shift is in-progress (and auto-end travelling on
    check-in so the timer doesn't run forever in localStorage).
  • `380cbd4` Side-menu name no longer ellipsis-clips ("Garydurbach"
    issue) — the wrapping flex container was missing `flex: 1`. Same
    commit drops the redundant "IN PROGRESS" pill that was stacking
    next to "ENDS 1H 25M" on shifts rows.
  • `901e624` Shift notes: debounced auto-save (don't rely on
    onBlur, which doesn't fire reliably on iOS PWA back-buttons) +
    read-back verification via `.select().single()` so saving says
    "Saved ✓" only when a row actually updated. Friendlier error
    when the migration hasn't run.
  • `d300fa3` Loading overlay covers every check-in / check-out
    tap end-to-end. `CheckingInOverlay` now supports three modes
    (in / out / opening) — Check-out gets the full 3-phase
    stepper, all the "Open from CTA" jumps get the lighter Opening
    variant so there's no silent gap between tap and destination.
  • `cfdeca8` Greeting wraps for long names; up-next card dropped
    the wordy yellow info banner; /shifts "Request" nav has the
    Opening overlay.
  • `4f1cbf2` Welcome card folded "Last sync" into the small-caps
    top line + tightened padding.
  • `fc43f16` Then dropped Last-sync off the welcome card entirely
    and moved it to the side-menu footer — managers wanted the
    hero clean. Heartbeat indicator is still one tap away.
  • `c7c4d89` Mobile /profile gained an Account-settings sheet —
    full name + email + password edit from the app. New helpers
    `updateMyEmail` (Supabase Auth confirmation flow) +
    `updateMyPassword` (instant via active session). Three dead
    menu rows (Notifications / Sync status / About) removed.

Calendar (admin)
  • `55da568` Per-rep view never collapses to a count chip + full
    status pills (Cancelled, Scheduled, Done, etc) on every card.
  • `fb29b6e` Density tiers for short cards (initial fix —
    superseded by the next one).
  • `40aeb2f` Single-rep view never builds an overflow "+N MORE"
    cluster — `assignLanes` got a `{ singleRep }` shortcut so a
    long cancelled shift can't drag the rest of the day into a
    popover.
  • `ac35ef0` All cards now render the same content shape
    regardless of duration. Min card height = 46 px in single-rep
    mode, 60 px in multi-rep mode, so a 30-min card and a 1-hour
    card both show customer + time + state pill identically.
  • `a57d6cf` /schedule/manage gained a Cadence column derived
    from each series's actual shift_date set ("Weekly · Mondays",
    "Weekdays", "Daily", etc). The View button now passes
    customer + rep + date params; /schedule reads them at mount.
    `updateShiftSeries` surfaces zero-row updates as a clear error
    instead of fake success.
  • `8283df0`-era density work plus `55da568`'s status pills now
    use one consistent `STATE_DOT` table covering every state
    (scheduled / in-progress / travelling / on-break / late /
    complete / cancelled).

Admin housekeeping pass
  • `27e7b90` "Awesome" loading states (initial check-in overlay +
    shimmering /shifts skeletons; superseded structurally by the
    overlay generalization).
  • `8b18df0` /schedule/manage row actions rebuilt — `[View]`
    `[Edit future]` `[⋮]` overflow with full-sentence cancel
    actions, replacing the cramped 4-button layout with a bare
    "All" red button.
  • `2e81c54` **Dropdown audit** — every native `<select>` and
    `<input type="time">` in the admin replaced by the shared
    `Combobox` / new `TimeCombobox`. Icons, search-as-you-type,
    multi-select where applicable. One consistent dropdown chrome
    across every entity form.
  • `fb921e4` Closing-batch — break-or-travel sheet handle now
    actually closes the sheet (iOS pattern); rep map markers
    shrunk from 32 px to 28 px to match house markers; Today's
    Shifts gained a red "Needs action" tab surfacing
    `attention='unable_to_attend'`; /customers defaults to Table
    view + persists across nav via localStorage.
  • `0e16dac` /schedule/manage: redundant "Reset upcoming
    schedule" section removed (the per-series Cancel + standalone
    Delete-all already cover it). Live Feed "All activity" pill
    now reads a real `countRecentEvents()` total instead of being
    capped at 50 by the display limit.
  • `6deb0d3` Form button audit — every entity create/edit page
    follows the same layout. "Add customer"/"Add site" renamed to
    "Create customer"/"Create site"; customer edit gained a
    Delete button (was the only entity edit without one);
    consistent `[Delete <entity>] ··· [Cancel] [Save changes]`
    split on every edit page.

Working tree clean. All commits on origin/main; both apps
auto-deployed via Vercel.

#### Evening UX fixes + Plan-my-day pill (May 11 evening — `73e29f9`..`e529b6f`)

Four commits after the engineering pass, driven by another round of
manager testing.

- **`73e29f9`** — the big late push. Plan-my-day routing end-to-end
  (mobile `/route` page, server `/api/route/plan` with Google Routes
  v2 TRAFFIC_AWARE + mock fallback, client wrapper with 5-min cache,
  GPS fallback to first stop, per-leg + whole-day Open in Maps).
  Per-customer logo upload (migration `2026_05_11_customers_logo.sql`,
  admin /customers/[id]/edit field with client-side letterboxed JPEG
  compression to ~5-15KB base64, CustomerSwatch + CustomerTile both
  auto-branch on `logoUrl` so the logo shows everywhere — shift rows,
  /active hero, /check-in / -out, /add-shift picker, /route badges).
  UX fixes: `/check-in/success` page deleted (routes straight to
  `/active` — the success-page "Start activities" tap was friction
  on top of an overlay that already confirms the check-in); new
  `"leaving"` CheckMode on `CheckingInOverlay` for the /active →
  /check-out tap (was confusingly saying "Opening…" while the rep
  was leaving the store — now "Wrapping up…"); Up Next picker on
  dashboard fixed (was only matching `in-progress` / `scheduled`, so
  reps with their remaining shift in `travelling`, `on-break`, or
  `late` saw "No shift assigned today" even though work was clearly
  left — now matches any non-terminal state with sensible priority
  order); dead Directions buttons removed from /shifts row
  expansions (had no onClick, did literally nothing — the dashboard
  Up Next card carries the real Directions preview, /route page has
  per-leg deep-links).
- **`a2bdf20`** — customer edit page reorganised. Was one giant Card
  with twelve fields jammed together including the per-customer
  exception override pickers, which made the exceptions look like
  standalone settings rather than overrides on top of the org
  defaults at `/settings/check-in-rules`. Now four clearly-labelled
  sections in the left column: **Identity** (name, code, initials,
  colour, logo) · **Location** (region, address, geofence) ·
  **Check-in exceptions** (override pickers with an inline explainer
  paragraph making the hierarchy explicit) · **Action row** outside
  the cards (Delete left, Cancel + Save right).
- **`e529b6f`** — Plan-my-day card collapsed to slim pills. The
  initial drop had added a chunky full-width "Plan my day" card
  between the dashboard map and the Up Next card; that pushed Up
  Next down and competed visually with the "No shift assigned
  today" / "All shifts done" block the user actually liked. Now it
  lives as two small right-aligned okTint pills — one directly under
  Up Next on home, one in the header row next to Request on
  /shifts — only when the rep has 2+ stops today (single-stop days
  are already covered by Up Next's own Directions / Resume CTAs).

Plus one fix from earlier in this same session that's worth calling
out separately: **`73e29f9` also fixes the dashboard's `allDone`
check** to treat both `complete` and `cancelled` as terminal, so the
"All shifts done — nice work" celebration fires even if a manager
cancelled one of the day's shifts.

Migration added today: `2026_05_11_customers_logo.sql` (single
`ADD COLUMN IF NOT EXISTS logo_url text` on `customers`, idempotent).
Optional env: `GOOGLE_ROUTES_API_KEY` (server-side, mobile project,
NOT NEXT_PUBLIC_) — without it Plan my day uses the mock provider.
See "Optional env vars" further down for full setup.

Both apps build clean (`npm run build`). Mobile + admin TypeScript
clean (`npx tsc --noEmit`). Working tree clean, all commits on
origin/main, both Vercel projects auto-deployed.

### Today's session — what shipped (May 8, 2026)

The whole day was one feature shipped end-to-end: **multi-site customers**.
Earlier the system modelled every customer as a single location (one
address, one geofence). Real customers — chains, multi-warehouse
retailers, anything with more than one physical site — couldn't be
modelled, so managers had been creating "Aria Cosmetics — Cape Town"
and "Aria Cosmetics — Sea Point" as two separate customer records.
Now the customer is the company; each customer has one or more
**sites**; every shift pins to a specific site.

Seven commits, in order:

#### Stage 1A — schema + admin Sites tab (`6f98c48`)

- New `customer_sites` table: `id uuid pk`, `customer_id text fk→customers`, `name`, `address`, `latitude`, `longitude`, `geofence_radius_m`, `active`, timestamps. Trigger keeps `updated_at` fresh. Realtime publication on. RLS matches the rest of the schema (permissive Phase-pre-4: any authenticated user, separate select/insert/update/delete policies).
- `shifts.site_id` nullable FK with `ON DELETE SET NULL` + partial index.
- Backfill: every existing customer becomes a "Main" site (renamed to "Head office" later in this session). Every existing shift's `site_id` is filled in to that backfilled site. Both backfills are NOT-EXISTS-guarded so re-runs are safe.
- New `lib/sites-store.ts`: list / get / create / update / deactivate / reactivate / hard-delete. Hard-delete refuses if any shift references the site (suggests deactivate). Every action emits a `customer.site_*` audit event.
- New `components/customers/SitesTab.tsx`: per-customer Sites tab on the customer detail page. SiteCard with map + geofence + per-site actions; SiteEditor with AddressAutocomplete + slider (extended later this session into a two-column layout with a live map preview).
- `createCustomer` auto-creates a Head-office site so single-site customers never see a "now add a site" step.
- Customer detail's old `Address & geofence` tab and the dead `AddressTab` component (~180 LOC) deleted.
- Four new event types — `customer.site_added` / `_updated` / `_deactivated` / `_reactivated` / `_deleted` — with labels in `EVENT_LABEL` and tones in `eventTone()`.

#### Stage 1B + 1C — shifts know their site, geofence uses site coords (`4a155f1`)

- Admin `ShiftRow` + mobile `ShiftWithMeta` types both gain a joined `site` block. Every `select(...)` for shifts pulls the site row.
- `/schedule/new`: site picker only renders for customers with >1 active site (single-site auto-resolves invisibly). Customers with 0 active sites surface a hard-error banner blocking Submit. The cartesian (dates × customers × reps) writes `site_id` per row.
- `/shifts/[id]/edit`: same picker pattern; ShiftPatch + sibling-create both pass `site_id`.
- `/schedule` calendar popover + `/shifts/[id]` detail header: show site name + address when it's not the default ("Head office" after this session's rename).
- Mobile dashboard up-next card, `/shifts` list rows, `/active` header all show the site name as a sublabel when not default.
- `/check-in` + `/check-out` `offsiteInfo` memo prefers `shift.siteLat` / `siteLng` / `siteGeofenceM`; falls back to legacy customer fields for pre-2026-05-08 rows. The haversine target is the **site**, so multi-site customers get the right geofence per shift.

#### Audit fixes round 1 (`6b6224d`)

Self-review found four issues:

- `updateSite` / `deactivateSite` / `deleteSite` weren't firing audit events. Each now reads name + customer_id before mutating, fires the right `event_type`, activity feed gets a row per change.
- `reactivateSite` was firing the generic `site_updated` instead of a dedicated event. Added `customer.site_reactivated` (label + warn tone).
- Mobile `DashboardMap` was pinning shifts at the **customer's** lat/lng — two shifts at different sites of the same customer would have collapsed onto one pin. Now prefers `shift.siteLat`/`Lng`; falls back to customer coords for legacy rows. Two shifts at the same customer but different sites correctly drop two separate pins.
- Mobile `shifts-store` had triple-union type artifacts (`Array<ShiftWithMeta|ShiftWithMeta|ShiftWithMeta>`) left over from a perl bulk-replace during the rollout. Collapsed.
- `customer.site_deleted` added to the **danger** tone group in `eventTone()` so deletes show red in the activity feed.

#### Migration FK type fix (`8e13ce5`)

- The first version of the customer_sites migration declared `customer_id uuid`. `customers.id` is actually a slug-style **text** key (e.g. `aria-cosmetics-x9f2`). Supabase rejected the FK with `42804: incompatible types: uuid and text`.
- Changed to `customer_id text` (matches `customer_tasks`, `library_files`, `shifts`, every other FK to customers).
- Whole migration wrapped in `BEGIN; … COMMIT;` so a partial apply can never leave the schema half-broken.
- Realtime `ALTER PUBLICATION supabase_realtime ADD TABLE` guarded by a `pg_publication_tables` check so re-running doesn't error with "relation already member".

#### Migration RLS posture aligned (`54ba85f`)

- The first version had stricter manager-only writes via `profiles.role = 'manager'`. That diverged from the rest of the schema (`customer_tasks`, `custom_fields`, `library_files` are all permissive `TO authenticated USING (true) WITH CHECK (true)` until Phase 4 tightens everything in one pass).
- Aligned: split into `customer_sites_select` / `_insert` / `_update` / `_delete` policies, all permissive for authenticated users. Phase 4 will tighten them along with every other table.

#### Head office Overview + live map preview + rename "Main" → "Head office" (`48d20a9`)

Three product feedback items in one push:

- **Overview tab is rich again.** Head office (the customer's primary site) renders prominently in its own card: map with live geofence circle, address, coords, geofence radius, plus a one-click "Edit" button that jumps to the Sites tab. Below, an "Additional sites" list appears only when the customer has more than one site — each row links to Sites for full CRUD. Single-site customers see only the head-office card and no noise.
- **SiteEditor is now a two-column layout.** Form on the left (name, address, geofence slider, contact section), live map preview on the right. Map updates as the manager picks an address from the autocomplete OR slides the geofence radius — geofence circle shown by default. The AddressAutocomplete is the same component `/customers/new` uses, so the type-to-search-then-pick flow is identical and the geocode-on-save fallback still kicks in if the manager skips the suggestions.
- **Auto-seeded site name renamed** from "Main" to "Head office" (the term Gary actually uses). Schema migration `2026_05_08_customer_sites_head_office.sql` renames any row still named "Main". The "show site only when not <default>" heuristic in 5 places (admin `/schedule` popover + `/shifts/[id]` header + mobile dashboard up-next + `/shifts` list rows + `/active` header) updated to compare against "Head office".

#### Per-site contact details (`9b501d1`)

- Migration `2026_05_08_customer_sites_contact.sql`: 4 nullable text columns added to `customer_sites` — `contact_name`, `contact_phone`, `contact_email`, `notes`. Idempotent.
- `lib/sites-store.ts` types extended (CustomerSite + NewSite + SitePatch).
- Mobile `ShiftSiteFields` gained `siteContactName` / `siteContactPhone` / `siteContactEmail` / `siteNotes`. Every shift `select()` (admin + mobile) pulls the contact columns.
- Admin SiteEditor adds a "Contact (optional)" section: name + phone (`type=tel`) + email (`type=email`) + access notes textarea.
- Admin SiteCard renders a contact block (tap-to-call/mailto in admin too) + an amber "Access notes" call-out.
- Admin Overview head-office card mirrors the same contact + notes block.
- Mobile `/active` shift screen: cyan "Call · phone" pill (tap-to-call) + Email button + amber Access notes block under the customer header.
- Mobile `/shifts` list expanded row: "Call site · contact name" tap-to-call pill + access notes block.
- Mobile `/check-in`: Call pill + access notes shown right under the customer header so a rep who's off-site or running late can call the contact in one tap to explain.

#### Migrations to run for May 8

Three new files in `db/migrations/` — run in order in the Supabase SQL editor before the May 8 features hit prod:

1. `2026_05_08_customer_sites.sql` — creates the table, FK on shifts, backfill, trigger, RLS, realtime
2. `2026_05_08_customer_sites_head_office.sql` — renames the auto-seeded `Main` rows to `Head office`
3. `2026_05_08_customer_sites_contact.sql` — adds the 4 contact columns

All three are idempotent and wrapped in `BEGIN; … COMMIT;` so failures roll back cleanly.

Both apps build clean (`npm run build`). Mobile + admin TypeScript clean (`npx tsc --noEmit`).

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

