# Design system — Morpheus Ops

> The rules every new page should follow. Read this BEFORE building a new
> page; reference it WHEN reviewing a page that looks "a bit off".
>
> Two apps, one product: this doc covers both `morpheus-admin` (manager
> console, desktop browsers) and `morpheus-mobile` (rep PWA, phones).
> Where rules differ, the admin column is on the left and mobile on
> the right. Where they agree (which is most places), it's stated once.

---

## Sections

1. [The two-app philosophy](#1-the-two-app-philosophy)
2. [Brand identity](#2-brand-identity)
3. [Colour tokens](#3-colour-tokens)
4. [Typography](#4-typography)
5. [Shape & spacing](#5-shape--spacing)
6. [Component primitives — admin](#6-component-primitives--admin)
7. [Component primitives — mobile](#7-component-primitives--mobile)
8. [Page-level patterns](#8-page-level-patterns)
9. [Status pills grammar](#9-status-pills-grammar)
10. [Customer + rep visual identity](#10-customer--rep-visual-identity)
11. [Microcopy & voice](#11-microcopy--voice)
12. [Interaction patterns](#12-interaction-patterns)
13. [iOS PWA landmines](#13-ios-pwa-landmines)
14. [Accessibility baseline](#14-accessibility-baseline)
15. [Checklist — adding a new page](#15-checklist--adding-a-new-page)

---

## 1. The two-app philosophy

The admin is a **workstation console**. It assumes a 1280px+ screen, a
mouse / trackpad, multiple shifts visible at once, and a manager who's
looking up something specific in a table or grid. Dense by design.

The mobile is a **single-task field tool**. It assumes a phone in a
moving van, gloves off but cold fingers, intermittent reception, and
one job at a time on screen. Big tap targets, short copy, generous
breathing room.

Same brand, same data, same Supabase backend — but the two apps look
different on purpose. **Do not port admin patterns into mobile or vice
versa without thinking.** A table view that's fine in admin will be
unusable on mobile; a celebratory animation that delights in mobile
will feel toy-like in admin.

When in doubt, look at the existing surface: admin pages live in
`morpheus-admin/app/`, mobile pages in `morpheus-mobile/app/`.

---

## 2. Brand identity

**Name:** Morpheus Ops. (NOT "Morpheus", NOT "Morpheus Ta", NOT "Morpheus
Operations" in a body label — only the wordmark capitalises "OPS".)

**Tagline:** "Workforce Operations. In real time."
- The full sentence appears in the admin sidebar.
- "Workforce Operations." is muted ink + 7s shimmer animation.
- "In real time" is a brand-cyan rounded pill — same chip the wordmark
  uses for "Ops".

**Wordmark:** `MorpheusMark` (mobile, in `components/Glyph.tsx`) and the
admin sidebar header render the wordmark as:
- "Morpheus" — bold dark text (uppercase, letter-spacing ~2)
- "Ops" — same weight, but in a **brand-cyan rounded chip** with 18% alpha
  background (`rgba(21, 180, 214, 0.18)`)
- Small brand-cyan square dot to the left of "Morpheus"

The chip is the brand's visual hook. It repeats: in the wordmark, in the
"In real time" tagline, in sidebar nav badges. **If you're tempted to
build a custom badge for something, use a Pill with the brand chip
palette first.**

**Org accent override:** managers can set a per-org accent colour at
`/settings/organisation` that repaints the sidebar wordmark. Don't
hardcode `AC.brand` into anything that should be brandable —
read `getOrganisationNameColor()` instead.

---

## 3. Colour tokens

Every colour goes through tokens. **Never hardcode a hex** in a new
component — if a colour isn't in `AC` (admin) or `MC` (mobile),
add it to the token file with a name that says what it's for.

### Admin — `AC` from `morpheus-admin/lib/tokens.ts`

```ts
brand: "#15B4D6"        // Primary cyan. Buttons, links, focus rings.
brandDeep: "#0E8FAD"    // Hover / pressed primary. Map markers.
brandInk: "#073B47"     // Brand text on tint backgrounds.
brandTint: "#E3F6FB"    // Brand chip background, info-tinted cards.
brandSoft: "#F0FAFD"    // Subtler tint, e.g. selected-row stripe.

ink: "#0F1216"          // Body text on white.
ink2: "#22272E"         // Secondary text.
ink3: "#3D4651"         // Tertiary text, helper copy.
mute: "#5C6571"         // Muted labels, table column headers.
hint: "#8B939E"         // Placeholders, very-low-emphasis text.
faint: "#B6BCC5"        // Disabled-control ink.

line: "#E4E7EB"         // Card borders, table row dividers.
lineDim: "#EEF0F3"      // Even subtler dividers within a card.
card: "#FFFFFF"         // Card background.
bg: "#F7F8FA"           // Page background.
bgDeep: "#EEF1F4"       // Section background inside a busy page.

side: "#0E1116"         // Sidebar background (dark).
sideInk: "#E6E9EE"      // Sidebar text.
sideMute: "#8C95A2"     // Sidebar muted labels.
sideHover: "#1B2027"    // Sidebar hover state.

ok: "#1FA971"           // Success state ink.
okTint: "#DEF6EB"       // Success-tinted backgrounds.
warn: "#E5A017"         // Warn state ink (amber).
warnTint: "#FDF1D5"     // Warn-tinted backgrounds.
danger: "#D9365F"       // Danger state ink (pink-red).
dangerTint: "#FDE4EC"   // Danger-tinted backgrounds.
info: "#15B4D6"         // Alias of brand — info-tinted cards.
infoTint: "#E3F6FB"     // Alias of brandTint.
```

Plus `AC.status[…]` (status pill palettes, see §9) and `AC.swatch[…]`
(customer-brand swatches, see §10).

**Shape:** `radiusCard: 14` · `radiusInput: 10` · `radiusChip: 999`
**Layout:** `sideW: 240` · `sideWMini: 64` · `topH: 56`
**Font:** Inter (system fallback)

### Mobile — `MC` from `morpheus-mobile/lib/tokens.ts`

Mostly the same palette, with a few deliberate differences:
- Bigger card radius: `radiusCard: 18` (vs admin's 14) — phones are touch
  surfaces, rounder reads softer.
- Bigger input radius: `radiusInput: 12` (vs admin's 10).
- Dark header bar (`header: "#171A1F"`, `headerInk: "#FFFFFF"`) for the
  top of the mobile screen — admin uses a light topbar.
- Smaller customer swatch palette: 5 codes (GW/NG/OS/SB/PR) vs admin's 7.
  Mobile doesn't currently render the AC + HM swatches anywhere.

**Don't import `AC` into mobile code or `MC` into admin code.** Each
app has its own token file; they happen to share most values but are
free to diverge.

---

## 4. Typography

- **Font:** Inter, with system fallback. One typeface across both apps.
- **Letter-spacing:** ~-0.1 on titles (Card SectionTitle uses this);
  letter-spacing 2 on the wordmark.
- **Weights:** 400 body, 600 emphasis, 700 titles, 800 wordmark.
- **Sizes — admin:**
  - Card section title: 13px / 700
  - Body: 13-14px
  - Sidebar nav link: 14px
  - Sidebar glyph: 18px
  - Sidebar tagline: 11-12.5px (force single-line via flexWrap nowrap)
  - Pill solid: 11px · Pill outline: 10.5px
- **Sizes — mobile:**
  - Header: 16-18px
  - Body: 15-16px (bigger than admin — touch readability)
  - Glyph: 22px (Glyph component default)
  - Wordmark: 14px

If a new component needs a non-standard size, write a one-line code
comment explaining why ("matches the screenshot Gary attached").

---

## 5. Shape & spacing

**Card radius:** 14 admin / 18 mobile. Cards are the workhorse — most
content sits in one.

**Chip radius:** 999 (full pill) — Pills, FilterChips, status badges,
brand chip.

**Input radius:** 10 admin / 12 mobile. Combobox, text inputs, the
duplicate-mode segmented picker.

**Card padding:** `Card` defaults to 16. Override only when the card is
hosting a table (use 0, then the table fills edge-to-edge) or when the
card is a hero on a list-page header (use 18-20 for breathing room).

**Section spacing inside a card:** 10-12px between `SectionTitle` and the
first row. 12-14px between row groups.

**Page gutter:**
- Admin: `AdminShell` provides the gutter. Pages just stack cards inside
  it; don't add page-level padding.
- Mobile: `MenuShell` / `Chrome` provides the gutter. Pages render their
  hero strip + cards inside.

**Stack rhythm (mobile):** 12-16px gap between vertically stacked cards.
Use `gap` on a flex column container; don't hand-tune margins.

---

## 6. Component primitives — admin

All admin primitives live in `morpheus-admin/components/ui/`. **Use these
before reaching for a raw div.** If you need something new, add it here
so the next page can reuse it.

### Layout & containers

- **`Card`** — white background, 1px line border, radiusCard 14, padding
  16. The default container. Almost every section on every page is in
  one.
- **`SectionTitle`** — 13px / 700, optional `action` slot on the right
  (for "Add" buttons or filter chips).
- **`AdminShell`** — top-level page wrapper. Includes the sidebar, the
  topbar, page gutter. Every admin page renders inside this.
- **`SettingsShell`** — secondary shell for `/settings/*` pages with the
  settings-sidebar. Each settings sub-page also wraps in `AdminShell`.

### Inputs

- **`Btn`** — kinds: `"primary" | "secondary" | "ghost" | "danger"`.
  Default `secondary`. Primary = brand-cyan fill. Danger = red fill.
  Ghost = transparent. Use `primary` sparingly (one per screen — the
  primary action).
- **`Combobox`** — typeahead picker for entities (customer, rep, site).
  Got an uplift on May 19 (`2351d1d`); use the new shape, not whatever
  ad-hoc dropdown logic an older page might still have.
- **`TimeCombobox`** — same shape, time-of-day picker (08:00, 08:30…).
- **`AddressAutocomplete`** — Nominatim-backed address picker. Both
  admin and mobile have one of these; use the app-local copy.
- **`SegTabs`** — segmented control for 2-4 mutually-exclusive view
  modes. Used for "Grid | Table" view toggles, "Skip | Update existing"
  duplicate-mode picker.
- **`FilterChip`** (from `Filters.tsx`) — the round pill that says "All"
  / "With shifts today" / "Managers" on list pages. Click to toggle.
- **`FilterSelect`** (from `Filters.tsx`) — the canonical filter-row
  **dropdown**. Supports flat `options` OR grouped `groups`
  (`<optgroup>`s, e.g. Manager types / Rep types) — both wear the
  same pill look, so **every** filter/selection dropdown matches
  (no raw `<select>` anywhere; Gary, May 28: "the drop-downs
  everywhere should look the same"). **Vocabulary rule:** region /
  group / store-type / rep-type options ALWAYS come from the Site
  settings vocab (`getRegions` / `getGroups` / `getStoreTypes` /
  `getRepTypes`) — NEVER derived from distinct values on data rows.
  Deriving from data surfaces stale legacy values; the manager must
  see exactly what they defined in Settings. A `<select>` styled as
  a pill in the same family as `FilterChip` (radius 99, same height/font, brand-tinted when a value
  is chosen, native arrow suppressed + replaced with a brand chevron).
  **Every categorical filter dropdown on a list page must use this, not
  a bare `<select>`** — Gary's May 28 note: raw selects "don't look like
  the [chip] buttons." Props: `value`, `onChange`, `options` (`{value,
  label}[]`), `allLabel` (the clear-filter option), `title`. Exception:
  grouped selects that need `<optgroup>` (e.g. /notify's manager-types-
  vs-rep-types picker) stay as styled `<select>`s for now — FilterSelect
  doesn't do groups yet.
- **`SortableHeader`** — clickable table header cell that toggles
  asc / desc / unsorted via `SortState<T>`. Comes with `compareBy`.

### Display

- **`Pill`** — `solid` (filled, status chips, KPI counts) or `outline`
  (hairline border, role labels, "Inactive" markers). Pass `bg` + `fg`
  explicitly. Don't build a bespoke pill — use this.
- **`StatusPill`** — Pill pre-wired to the `AC.status[…]` palettes.
  Use this for the rep-state pills (offline / travelling / onsite /
  onbreak / late / offsite). Don't construct status colours by hand.
- **`AGlyph`** — admin icon registry. Named cases: see the file for the
  full list. Adding a new icon = add a `case` line. **Don't import an
  icon library** — every glyph in this app is an inline SVG in AGlyph
  (or Glyph on mobile).
- **`Avatars`** — `RepAvatar`, `RepConflictAvatar`, etc. Round avatar
  with either a photo or initials fallback. Customer avatars use
  `CustomerSwatch` (square with the brand swatch + house glyph or
  uploaded logo).
- **`GeocodeBadge`** — shows the geocode_status of a customer/site
  (pending / done / failed) inline. Added with Phase E (May 25); use
  it anywhere a list row shows a site address that might not be
  resolved yet.
- **`Pagination`** — `[« ‹ 1 … 4 [5] 6 … 12 › »]` + "Showing X-Y of
  Z". Hidden when results fit on one page. `DEFAULT_PAGE_SIZE = 50`
  exported as a constant. Client-side slicing — caller slices its
  already-filtered array down to `page * SIZE → (page+1) * SIZE`
  and passes `totalItems={filtered.length}` for the count. Added
  May 27.
- **`ListCount`** — small "Showing X of Y noun" line shown between
  the filter row and the body on every list page. Pairs with
  Pagination at the bottom — same total, surfaced at the top so a
  manager doesn't have to scroll. Returns `null` when total is 0.
  Added May 27 (late) per Gary's directive that every list page
  show its count up front.
- **`ColumnResizer`** + **`useColumnWidths(pageKey, defaults)` hook**
  — drag handle on a header cell that resizes its column. Hook
  owns the widths array + localStorage persistence (`morpheus.cols.
  <page>.v1`). Min column width 60px. Double-click handle to reset
  that column. Computed `gridTemplateColumns` string returned by
  the hook is used on BOTH the header row AND every data row in
  the table. Added May 27. **Affordance (May 28):** the handle is
  NOT invisible-until-hover — it shows a faint two-bar grip at rest
  (≈45% opacity, `AC.line`) so users discover columns are resizable,
  then brightens to brand + grows taller on hover/drag. Gary's rule:
  "show it subtly, smartly — not too in your face." Don't revert to a
  fully-hidden handle; the resting grip is the discoverability cue.
- **`EmailUserModal`** — portal-based "Email this user" dialog
  shared by `/settings/managers/[id]/edit` and `/reps/[id]`. Two
  send paths: invite link (Supabase recovery flow, doesn't touch
  password) or regenerate-and-email (server mints a fresh password
  via `auth.admin.updateUserById`). Partial-success state surfaces
  the new password as a copy-fallback when post-reset email send
  fails. Reference for the "modal with two action-row options"
  pattern.
- **`LibraryFilePreview`** (`components/library/`) — in-place file
  preview modal. Pass `file={libraryFile | null}` to open/close;
  it signs its own short-lived Storage URL and previews images
  (`<img>`) / PDFs (`<iframe>`) inline, with a Download +
  open-in-a-new-tab fallback for other types. **Open library files
  with this, not `window.open(signedUrl)`** (Gary, May 29: a file
  should pop up in place, not punt to a new browser tab). Used by the
  customer Library tab + the library file detail page's "View file"
  button.
- **`LoadingBar`** — top-of-page progress bar for slow loads.
- **`SaveIndicator`** — bottom-right toast that fires from
  `notifySaved()` / `notifySaveError()`. Don't show your own toast.
- **`formatDate(iso)` / `formatDateAs(iso, fmt)`** (`lib/format.ts`) —
  the canonical date renderer. `formatDate` honours the tenant's
  org-wide **Date format** preference (Site settings → Date format;
  G15): Automatic (browser-locale textual), `DMY`, `MDY`, or `ISO`.
  The preference is a synchronous module cache seeded from localStorage
  on import (no flash) + revalidated from `app_settings.date_format` on
  boot (Sidebar). **Don't call `toLocaleDateString` directly** for a
  display date — use `formatDate` so the tenant setting applies
  everywhere. `formatDateAs` forces a specific format (used by the
  settings preview); `setDateFormatPref` / `getDateFormatPref` manage
  the cache (called by `settings-store.get/setDateFormat`).
- **`Modal` + `ModalHeader`** (`components/ui/Modal.tsx`, May 29 review)
  — the canonical backdrop + centered-card + Escape + click-outside
  chrome. Props: `maxWidth`, `maxHeight` (→ scroll-capped flex card),
  `zIndex`, `padding`, `backdrop`, `closeOnBackdrop`. **Build new
  modals with this**, not a hand-rolled `position:fixed inset:0`.
  (`EmailUserModal` + the managers Add-user modal are pre-existing
  bespoke exceptions carrying `TODO(review #3)` migration pointers.)
- **`ScopePickerPrimitives`** (`components/ui/`) — `ScopeButton`,
  `ScopeEmpty`, `scopeLinkBtn`, shared by `CustomerScopePicker` +
  `RepScopePicker` (were duplicated byte-for-byte). Any new "pick a
  scope" surface imports these.
- **`lib/db/selects.ts`** — shared PostgREST select strings
  (`CUSTOMER_EMBED`, `SITE_EMBED`, `SHIFT_SELECT`, `TASK_SELECT`).
  **Reference these in stores; don't paste embed strings inline** — a
  column added to an embed should be one edit, not a hunt across call
  sites. **And map nullable DB columns to nullable app types — never a
  fake default** (the May 29 `region: || "North"` bug is the cautionary
  tale: it minted a phantom region that polluted the filter dropdowns).
- **`lib/db/validate.ts` + `lib/db/schemas.ts`** (May 29 review #11) —
  validate Supabase reads with `parseRows(schema, data, tag)` /
  `parseRow(...)` instead of a blind `data as T[]` cast. On schema drift
  (a known column retyped/dropped) they **log loudly + degrade to the
  raw rows** — never a new crash path on valid data; unknown columns are
  stripped, not rejected. `customerRowSchema` is the first adopter; new
  / edited stores should add a row schema here and parse rather than
  cast.

### Content composers

- **`EmptyState`** — the "no data" panel with an icon, a one-line
  title, a sentence of helper copy, and an optional CTA. **Every list
  page that can be empty must use this** — never raw "No results"
  text.
- **`ExpandableRow`** — accordion-style row that toggles open to reveal
  detail. Used in the customers list and elsewhere.
- **`TabHeader`** — strip of tabs sitting above a Card. Shared by the
  tabbed customer detail page (Overview / Contacts / Reps / etc).
- **`CustomFieldsCard`** + **`CustomFieldForm`** — render the
  per-entity custom-field block. If a new entity needs custom fields,
  thread it through `entity` prop.
- **`CustomerScopePicker`** + **`RepScopePicker`** — multi-select
  pickers for "which customers" / "which reps" this thing applies to.
  **Use `CustomerScopePicker` for ANY "select customers" surface**
  (Library scope, Tasks audience, schedule) — don't hand-roll a
  customer checkbox list. It includes the **"Quick add: by region /
  by group"** dropdowns (May 28) that bulk-select matching customers,
  so "select customers by group or region" works everywhere it's
  used. Value is a customer-ID list (static bulk-select). For
  user-targeting surfaces that need "customers' reps" (e.g.
  Messaging), resolve customer region/group → assigned reps via
  `listAllAssignments` rather than picking customers directly.

---

## 7. Component primitives — mobile

Mobile components live in `morpheus-mobile/components/`. Smaller set
than admin (mobile is fewer surfaces, more focused).

### Layout & chrome

- **`MenuShell`** — top-level mobile page wrapper. Includes the dark
  header, the side menu trigger, footer chrome via `Chrome`.
- **`Chrome`** — bottom footer with the wordmark. Stays out of the way
  of the iOS home indicator (May 14 fix: `viewport-fit: cover` on
  `layout.tsx`).
- **`SideMenu`** — slide-in menu from the right. Profile avatar at the
  top, nav items, power glyph + logout above the footer.

### Inputs & affordances

- **`Glyph`** — mobile icon registry (similar shape to admin's
  `AGlyph` but a different glyph set). Includes `route-alert` /
  `route-done` (designed May 14 to read as a route shape), `pause` /
  `play`, `power`, `camera`, etc.
- **`SignaturePad`** — full-bleed signature capture with brand-tinted
  border. Used in the customer-signature flow on `/active`.
- **`AddressAutocomplete`** — mobile-tuned variant of the admin one.

### Pills & state badges

- **`PendingRequestPill`** — inline pill on `/shifts` rows that shows a
  rep their request status (pending / approved / declined).
- **State-aware route pill** (action vs calm) — pattern, not a single
  component. Look at `app/page.tsx` (home) and `app/shifts/page.tsx`
  for the canonical implementation. Calm = `route-done` glyph, no
  background pulse. Action = `route-alert` glyph, amber fill, pulse
  keyframe.

### Overlays

- **`CheckingInOverlay`** — full-screen "Wrapping up…" overlay on the
  check-in / check-out transition. Branded skeleton; intentionally
  slow so the rep sees something happened.
- **`MessageBanner`** — top-of-page banner for transient feedback
  (e.g. "Manager confirmed — you're still on this shift").
- **`UnableToAttendSheet`** — bottom sheet for "Can't make this shift"
  flow. 6 reasons + free-text note.
- **`RouteOptimizedSheet`** — celebratory sheet when the user taps the
  calm route pill. Reassurance copy ("Auto-checked every hour…").
- **`LocationCard`** — `/profile`-only card explaining the iOS
  "Allow Once" trap + how to fix.

### Map components

- **`DashboardMap`** — full home-page map. House glyph for sites,
  face/photo for the rep.
- **`MapPreview`** — small inline map for `/active` and elsewhere.
- **`MiniRouteMap`** — even smaller map preview for `/route` route
  cards.

---

## 8. Page-level patterns

### Gold-standard list page — `/reps`

When in doubt, copy `/reps`. It's the canonical list-page shape.
**Every list page in the admin should match this structure exactly**
— after the May 27 sweep that paginated, made-resizable, and
clickable-rowed every long list, divergence is a bug now.

1. **Hero card** (optional, for KPI rollups). Live Ops uses one for
   the KPI strip; `/reps` skips it.
2. **Filter card row** — a `Card` containing, left to right:
   - `FilterChip`s for mutually-exclusive segments ("All / With
     shifts today / No shifts today / Managers")
   - Optional `<select>` for additional categorical filters (rep
     type on `/reps` + `/settings/managers`, status on customers,
     etc). Brand-tinted accent (border + background) when active.
   - A search `<input>` — same shape across pages: 220px wide,
     left-edge search glyph, right-edge ✕ clear button. Free-text
     matching on name + email + any other "human readable" column.
   - A `SegTabs` view toggle ("Grid | Table") on the far right
     when the page supports multiple views.
3. **Body card** — another `Card` containing either:
   - **Table view** — header row using `useColumnWidths` for
     resizable columns (drag handles via `ColumnResizer` on each
     header except the last). `SortableHeader` cells when applicable.
     Data rows use the same `gridTemplateColumns` so widths stay
     aligned. **Clickable rows** — see the sub-pattern below.
   - **Grid view** — responsive grid of cards, one per item.
4. **Empty state** — when the filter matched nothing, the body card
   renders an `EmptyState` (not raw "No results" text). When the
   page itself has no rows yet (no filter applied), the empty state
   is the "you haven't set this up" variant with a primary CTA.
5. **Pagination** — `<Pagination totalItems={filtered.length}
   currentPage={page} onPageChange={setPage} />` after the body
   card. Hidden when results fit on one page. Slice the FILTERED
   array (not raw rows) into the page window before passing to
   the table/grid renderer.

**Count subtitle between filter row and body** (May 27, late). Every
list page renders a `<ListCount>` line **between the filter Card and
the body Card** showing the total + filtered count. Format:
- Unfiltered: `247 customers`
- Filtered:   `Showing 32 of 247 customers`

```tsx
import { ListCount } from "@/components/ui/ListCount";
…
{filtered !== null && (
  <ListCount visible={filtered.length} total={counts.total} noun="customer" />
)}
```

Pagination already shows "Showing 201–250 of 587" at the bottom, but
Gary's directive (May 27) is that the **total reachable count** must
be visible at the top too — without scrolling past a long table. Use
the shared `ListCount` component (don't reinvent the inline span) so
the wording stays consistent. The component returns `null` when total
is 0 (the empty-state Card below already says "No customers yet").

The same pattern is followed on `/customers`, `/past-shifts`, `/tasks`,
`/library`, `/settings/managers`, `/reps`, `/schedule/manage`.

### List-page state machinery

Every list page that follows the gold-standard shape needs the same
state-management scaffolding. The pattern (May 27):

```ts
const [filter, setFilter]       = useState("all");
const [typeFilter, setTypeFilter] = useState("");        // if applicable
const [search, setSearch]       = useState("");
const [sort, setSort]           = useState<SortState>({...}); // if applicable
const [page, setPage]           = useState(0);
const cols = useColumnWidths("<page-id>", DEFAULT_COLS);   // if Table view

// Reset to page 0 whenever ANY filter / search / sort changes.
// Without this, the user can land on an empty page 5 of a now-2-page
// result. Include EVERY input that narrows the visible set.
useEffect(() => {
  setPage(0);
}, [filter, typeFilter, search, sort]);

const filtered = useMemo(() => {
  // Apply role/category filters, then type filter, then search,
  // then sort. Plain JS — client-side. See "Client-side pagination"
  // call-out for the rationale.
  ...
}, [rows, filter, typeFilter, search, sort]);

const pageItems = filtered.slice(
  page * DEFAULT_PAGE_SIZE,
  (page + 1) * DEFAULT_PAGE_SIZE
);
```

**Client-side pagination, not server-side.** Every list store in this
codebase fetches the full filtered set once and the UI slices it.
Server-side range queries (`.range(from, to)` + `count: 'exact'`) are
the future upgrade if any entity grows past ~10k rows — but at current
admin scale (dozens-to-low-hundreds per entity), the simpler
client-side slice preserves all existing search/filter/sort behaviour
exactly. Don't refactor stores to server-paginate without checking
row counts first.

### Clickable rows + inline actions

Every Table-view list page (customers / reps / tasks / library /
settings-managers / past-shifts) makes the entire row a navigation
target. Click anywhere on the row → navigate to that item's detail
or edit page. Patterns:

- The row container has `role="button"`, `tabIndex={0}`, and
  `cursor: pointer`. Keyboard users get Enter / Space via an
  `onKeyDown` handler that mirrors the `onClick`.
- The navigation target is the same one a redundant "Edit" pencil
  would have pointed at. **Don't ship both** — clickable row OR
  edit pencil, not both. (Pre-May 27 the Users page had both; May
  27 removed the pencil because it was duplicative.)
- **Inline action buttons inside the row** (Promote/Demote, inline
  toggles, delete confirmations) must be wrapped so their click
  doesn't bubble up to the row navigate:
  ```tsx
  <div
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => e.stopPropagation()}
  >
    <Btn onClick={...}>Promote</Btn>
  </div>
  ```
- Inline `<Link>` elements inside the row (e.g. a rep name linking
  to that rep's detail) should also `e.stopPropagation()` if their
  destination differs from the row's primary destination.

### Detail page — header card + sectioned content

1. **Header card** — entity title (customer name, rep name, shift
   summary), a couple of `Pill`s for status/state, an actions slot on
   the right with `Btn`s ("Edit" primary, "Email" secondary, etc.).
2. **Sectioned content** below — one `Card` per logical section, each
   with a `SectionTitle`.
3. **Custom fields** — if the entity has custom fields, the last
   section is a `CustomFieldsCard` with `entity="<entityType>"`.

### Tabbed page — customer detail

`/customers/[id]` uses `TabHeader` + an in-page tab router:

- Overview / Contacts / Reps / Library / Tasks / Shifts (May 19 refactor;
  see SESSIONS entry for `2351d1d`).
- Each tab is its own component under
  `morpheus-admin/components/customers/<Tab>Tab.tsx`.
- Tabs share `tabStyles.ts` so they all read identically.
- **Don't build a tabbed page without using `TabHeader`** — it owns
  the visual grammar (active-tab underline, hover states).

### Tabbed page — rep detail (persistent rail + SegTabs)

`/reps/[id]` (May 29, R4/R6) is the other tabbed-detail shape: a
**persistent left rail** (320px — profile card + `CustomFieldsCard`)
beside a right column whose content switches via **`SegTabs`** (with
per-tab counts), not `TabHeader`. Tabs: Today / History / Tasks /
Customers. Use this shape when the entity has stable "vitals" worth
keeping on screen across every tab (identity, custom fields); use the
`TabHeader` shape (customer detail) when the whole page is the tab set.
History + Today reuse one local `ShiftLine` row renderer so the two
shift lists are visually identical.

### Settings page — settings-shell pattern

`/settings/*` uses `SettingsShell` which renders a left-rail of
settings sections. To add a new settings section:

1. Add an entry to `SETTINGS_SECTIONS` in
   `components/shell/SettingsShell.tsx`. Pick a glyph from the
   `AGlyph` registry that's already in use (e.g. `tasks`, `reps`,
   `upload`, `building`) — don't invent a new one unless none fit.
2. Create `app/settings/<your-section>/page.tsx`. Wrap the page in
   `<SettingsShell section="<your-id>" description="...">`. The
   shell handles `AdminShell` + the rail + the title.
3. Use one `Card` per group of related controls, each with a
   `SectionTitle`.
4. For each toggle, use the shared `<ToggleRow>` shape — see
   `/settings/check-in-rules` for the canonical example.

**Where does vocabulary CRUD live?** Two acceptable shapes, judged
case-by-case (May 27 revision):

1. **Dedicated rail entry under `/settings/*`** — best for
   vocabularies that stand alone or are referenced from many places
   (e.g. `custom-fields`, `check-in-rules`). They benefit from a
   discoverable URL + their own breadcrumb.
2. **Modal button on the entity's primary management page** —
   acceptable when the vocabulary is *intrinsic to one entity* and
   the manager is most likely to want to edit it while already
   looking at that entity. Rep types live here (Manage rep types
   button → modal on `/settings/managers`) because the vocabulary
   belongs to users and rep-type churn happens while editing users.

Gary's directive (May 27, late): rep types do **not** need their
own Settings rail entry — the modal on the Users page is "kind of
fine". When in doubt, prefer the modal pattern for entity-intrinsic
vocabularies; only promote to a rail entry when the vocabulary is
referenced from genuinely independent places.

**Anti-pattern (still):** burying a vocabulary modal on a page
unrelated to the entity it governs. Library categories belong with
library files, not under /settings/random-page.

### Empty state

Always `EmptyState`. Three slots: icon (`AGlyph`), title (short — 3-5
words), helper text (one sentence explaining why it's empty + how to
fix). Optional CTA `Btn` at the bottom.

If the empty state is also "you haven't set this up yet", the CTA
should be primary. If it's a transient empty state (filter matched
nothing), the CTA should be secondary or absent.

### Loading state

- **Page-level slow load:** `LoadingBar` at the top of the page.
- **Card-level pending:** show the card structure with skeleton text
  blocks (grey bars). Don't blank the whole card.
- **Inline pending:** an `AGlyph name="loading"` or a 1-line "Working…"
  string. Not a spinner — we don't use raw spinners.

### Forms

- One `Card` per logical field group ("Identity", "Location",
  "Check-in exceptions" — see `/customers/[id]/edit` for the
  canonical example).
- `<label>` above each input, 13px / 600, `AC.ink2`.
- Validation errors render below the input in `AC.danger`.
- Save button at the bottom, primary, plus an outline secondary
  "Cancel" or "Discard changes".
- **Optimistic UI by default** — flip the UI first, revert on save
  failure. See May 25 Phase A for the canonical pattern (the import
  defaults page does this).

### Modals & sheets

- **Modal** (admin) — `createPortal` to `document.body` to escape
  stacking context. Backdrop click closes. Escape closes. Focus traps
  to the primary action via `autoFocus`. `EmailUserModal` is the
  canonical reference (May 25, `d164b29`).
- **Sheet** (mobile, bottom-anchored) — slides up from below, dismisses
  by tapping outside or swiping down. `UnableToAttendSheet` /
  `RouteOptimizedSheet` are the references.
- **Lightbox** (admin photo viewer) — full-screen dark backdrop
  (`rgba(0,0,0,0.85)`), centred content max 90vw × 90vh,
  prev/next/close all wired to keyboard + click. `PhotoLightbox` in
  `/shifts/[id]/page.tsx` is the reference (May 21, `ed14a0a`).

---

## 9. Status pills grammar

Rep state pills use `AC.status[…]` — pre-baked bg/dot/ink palettes
keyed by state name. Use `StatusPill` not a hand-rolled `Pill`:

| State | Used on | Visual |
|---|---|---|
| `offline` | Rep is off-shift | Grey |
| `travelling` | Rep is en-route to a site | Amber |
| `onsite` | Rep is checked in | Green |
| `onbreak` | Rep tapped Pause | Indigo |
| `late` | Rep is past their start time, not checked in | Red |
| `offsite` | Rep is outside the geofence during a shift | Amber |

Adding a new state means adding a new entry to `AC.status` AND adding
the same colour-grammar in `MC` (mobile) so the rep sees the same
colour for the same state across surfaces.

**Tone of state colours is fixed:**
- Green / `ok` = "this is the desired state, things are working"
- Amber / `warn` = "this needs attention but isn't broken"
- Red / `danger` = "this needs immediate action or has failed"
- Indigo / on-break = "this is a deliberate paused state"
- Grey / offline = "this is the off state, nothing to do"

Don't repurpose a colour. Don't make "this customer has a lot of
shifts" green — green means "operational" in this app.

### Non-state chips — categorical, not rep-state

Some chips don't represent rep state but still appear chip-shaped
on rows + cards. These share the chip GRAMMAR (rounded pill, small
uppercase letter-spacing, padding ~2px 7px) but use neutral tones
instead of the rep-state palette:

- **Rep type chip** — small badge showing a rep's category (Sales
  Rep / Merchandiser / Driver / …). Used on `/reps` Grid + Table,
  on `/reps/[id]` header card, as a sublabel in every rep picker
  (Comboboxes across the admin). Inline component
  `RepTypeChip` in `app/reps/page.tsx` (kept local because it's
  only used twice — promote to `components/ui/` when a third
  consumer arrives). Renders nothing for uncategorised reps so
  empty chips never appear.
- **ID / LINK badges** (import wizard Map step) — purple "ID"
  pill on identifier fields, cyan "LINK → Customer" / "LINK →
  Rep" pill on fields that reference another entity. Defined as
  metadata on each adapter (`fieldKinds` + `linksTo`); rendered
  inline by the wizard's Map step. Tooltips explain that linked
  entities must already exist.
- **`GeocodeBadge`** — see Section 6. Brand-tinted "Geocoding…"
  for pending; warn-tinted "Couldn't find — edit to retry" for
  failed; nothing for done/skipped.

**Use neutral or contextual tones for non-state chips** — never the
rep-state palette (green/amber/red/indigo). Those colours mean "rep
operational state" everywhere else in the app; reusing them for
"this row is a Sales Rep" would confuse the grammar.

---

## 10. Customer + rep visual identity

The May 11 identity pass codified two glyphs:

- **Customer = house glyph** (rounded-square avatar with the customer
  swatch + a tiny house SVG, OR an uploaded customer logo if
  `customers.logo_url` is set).
  - Admin: `CustomerSwatch` component (in `Avatars.tsx`).
  - Mobile: `CustomerTile` (in the mobile components folder).
  - Both auto-branch on `logoUrl`.
- **Rep = face glyph or photo** (round avatar with the rep's
  uploaded photo OR a face SVG fallback, OR initials if neither).
  - `RepAvatar` (admin), profile-photo flows on mobile.

**Use these everywhere a customer or rep appears.** Don't render a
raw initials block for a customer (it'll look like a rep).

### Customer swatches

7 swatches in admin (`AC.swatch.GW / NG / OS / SB / PR / AC / HM`),
5 in mobile. Each customer gets one assigned at creation time. The
swatch shows behind the house glyph + the logo (if uploaded, the
swatch becomes a thin border).

### Per-customer logos

`customers.logo_url` stores a client-side compressed ~96×96 letterboxed
JPEG (5-15KB base64, see May 11 SESSIONS entry). When uploaded, every
surface that renders the customer auto-branches:
- Shift rows, `/active` hero, `/check-in` / `/check-out`,
  `/add-shift` picker, `/route` badges, map markers — all without
  per-call-site changes.

---

## 11. Microcopy & voice

**Voice:** friendly + crisp. Sound like a competent colleague briefing
you in a hallway, not a tooltip and not a manual.

**Examples (good):**
- "Wrapping up…" (check-out transition overlay)
- "Awesome!" (check-in success overlay)
- "Pick your order" (calendar conflict warn-but-allow)
- "Manager confirmed — you're still on this shift" (rep-feedback pill)
- "No photos uploaded (expected 3)" (photo viewer per-task)

**Anti-patterns (don't):**
- "Saving" / "Loading…" / "Please wait" — too generic, no personality.
- "Operation completed successfully" — never.
- All-caps shouting unless it's the wordmark.
- "404" / "Error" / "Forbidden" raw HTTP status text — translate to
  human ("Couldn't find that shift", "You don't have access to
  this").

**Empty state copy formula:** one short title (3-5 words) + one
sentence explaining why + one optional CTA.

> "No shifts today" / "No reps are working today. New schedules will
> appear here." / [Schedule a shift] (primary button)

**Confirmation copy formula:** name the noun, name the action, name
the consequence in one line.

> "Cancel shift?" / "This will remove it from the rep's calendar and
> the customer won't be visited today." / [Keep shift] [Cancel shift]

**Error copy formula:** what failed + what they can do.

> "Couldn't send the welcome email. Check `RESEND_API_KEY` in Vercel
> settings, or copy the password from below."

---

## 12. Interaction patterns

### Optimistic UI

Flip the UI first, revert on failure. Used on settings toggles,
filter chips, the Pause/Resume button, drag-drop calendar moves.
Pattern: set local state immediately, kick the network call, on
failure restore the previous state + show `notifySaveError`.

### Toggle buttons (single button, state-aware)

When an action and its inverse occupy the same conceptual slot,
use ONE button that toggles between the two states. Don't show
"Pause" and "Resume" as two buttons that swap visibility — show
one button whose icon, label, and tone change.

Canonical example: `/active` Pause↔Resume button (May 14, `4a23742`).
Amber translucent when paused (Resume label, play glyph), white when
running (Pause label, pause glyph).

### Save notifier (`notifySaved` / `notifySaveError`)

Don't build your own toast. Import from `lib/save-status.ts`:
- `notifySaved("request approved")` — green tick toast bottom-right
- `notifySaveError("couldn't send email", "user")` — red toast with
  the resource name

The `SaveIndicator` component (mounted in `AdminShell`) listens for
these and renders the toast.

### Realtime updates

Subscribe via the shared store function (`subscribeRequests`,
`subscribeProfiles`, `subscribeImportRuns`, etc) — not by writing
your own `supabase.channel(…).on(…)` block on the page. The store
function handles channel naming, cleanup, and event filtering.

For cross-surface counts (e.g. "Needs action" appearing in three
places at once), use a shared React context provider mounted in
`AdminShell` — `NeedsActionContext` is the reference (May 14,
`9e18116`). One subscription, all surfaces derive from it.

### Forms — save status

- "Saved" / "Saving" / "Couldn't save" state visible on the Save
  button itself, not as a separate banner.
- Disable the button during the request (avoid double-submits).
- On success, the optimistic UI is already correct — just fire
  `notifySaved` and re-enable.

### Client-side capability gates

Some affordances are gated by user category — e.g. "Sales Reps can
add customers; Merchandisers can't"; "this claimable shift is for
Sales Reps only". The pattern (May 27):

1. **Vocabulary stored in `app_settings`** as an array of objects
   shaped like `{ name, <capability-flag>: boolean }`. CRUD via a
   dedicated Settings rail page. Both admin + mobile read with a
   defensive parser.
2. **Pure capability check** — `repTypeCan(types, typeName,
   capability)`. Caller fetches the vocab once and calls this per
   check. Returned by both admin and mobile `lib/settings-store`.
3. **Two opposing default semantics** — pick deliberately:
   - **Lenient (default-allow)** — used for capability FLAGS like
     `canCreateCustomers`. Unknown / null type → returns `true`.
     Rationale: brand-new reps haven't been categorised yet;
     hiding affordances from them would feel broken. Manager
     EXPLICITLY restricts by ticking the box off.
   - **Strict (default-deny)** — used for explicit RESTRICTIONS
     like `shifts.claimable_rep_types`. Manager EXPLICITLY narrowed
     the audience; unknown / null type doesn't match, so the
     restricted shift hides from them.
   Both behaviours surface in the in-file comment where the check
   runs. Don't flip one to match the other "for consistency" —
   they're different semantic categories.
4. **UI gates** — hide buttons / menu items / list rows that the
   user doesn't have access to. Belt-and-braces guard at the
   destination page (a "Not enabled for your rep type" block
   screen) for the deep-link / browser-history scenario.

**SECURITY caveat — surface it every time.** These gates are
client-side UX, not RLS. A motivated user with curl + JWT can
bypass. Hard blocks require tightening the Phase 4 RLS policy to
read the vocabulary and check the user's category — possible but
deferred until needed. Document the deferred state in the
SESSIONS.md entry for the feature.

### Admin-managed vocabularies (app_settings)

When a vocabulary of values needs to be manager-editable — rep
types, library categories, custom-field definitions, future
similar lists — store it as a JSON value in `app_settings`. Pattern
(May 27 rep_types, earlier May library_categories):

1. **Schema** — single row in `app_settings` with `key='<vocab>'`
   and `value` = the JSON array.
2. **Migration** seeds the row with a sane default vocabulary
   using `ON CONFLICT (key) DO NOTHING` so re-runs don't stomp
   manager edits.
3. **Settings-store helpers** — `get<Vocab>()` returns the parsed
   array with a DEFENSIVE reader (trims, dedupes, coerces missing
   keys, falls back to a hardcoded default on malformed JSON).
   `set<Vocab>(list)` writes back with the same defensive
   sanitisation. Mobile gets a read-only mirror if mobile reads
   the value.
4. **CRUD UI** — two acceptable shapes (see §8 "Where does
   vocabulary CRUD live?"):
   - **Dedicated rail page** — for vocabularies referenced across
     many surfaces (e.g. `/settings/custom-fields`, and as of May
     28 `/settings/roles` which hosts BOTH rep types AND manager
     types in two tabs).
   - **Modal on the entity's primary page** — for entity-intrinsic
     vocabularies where the manager is most likely already on that
     entity's page (e.g. the original "Manage rep types" lived on
     `/settings/managers` before being consolidated into
     `/settings/roles`).
   Either shape, inline help text warns when renames don't cascade
   (existing `profiles.rep_type` rows keep the old name and orphan
   if you rename the type). The anti-pattern is burying the vocab
   modal on a page **unrelated** to the entity it governs.
5. **Refs in user-facing data** — store the NAME, not an id
   (matches the in-place approach of `library_files.category`,
   `profiles.rep_type`, `shifts.claimable_rep_types`). Trade-off:
   rename fragility, but no FK migration needed when vocabulary
   changes.

### Manager capabilities (light-touch RBAC v1 — May 28)

A second admin-managed vocabulary parallel to rep types, this one
gating ADMIN affordances rather than mobile-rep ones. Stored in
`app_settings.manager_types`; per-row assignment via
`profiles.manager_type` (NULL = unrestricted).

Two capability flags ship in v1:
- `canManageSettings` — gates `/settings/*` (incl. the
  `/settings/roles` editor itself, organisation, check-in rules,
  custom fields, bulk imports, and the `/settings/managers` user
  CRUD page).
- `canScheduleShifts` — gates `/schedule/new`, `/schedule/manage`,
  `/shifts/[id]/edit`.

Three seeded types: **Owner** (both true) / **Operations**
(canScheduleShifts true, canManageSettings false) / **View only**
(both false).

Same lenient default-allow rules as `repTypeCan`: NULL type, deleted
type, missing key → returns `true`. Existing managers stay fully
functional after the migration — no lockouts on the first deploy.

**Plumbing:**
- `ManagerCapabilitiesProvider` mounts in `AdminShell`. Loads the
  current user's profile + the manager_types vocab once. Exposes a
  React Context with `has(cap)`, `profile`, `managerTypes`,
  `refresh()`. Pattern mirrors `NeedsActionContext`.
- `<RequireCapability cap="..." action="...">` wraps a page body and
  renders a polite "you don't have permission" block-screen card
  when the current manager lacks the capability. Rendering nothing
  while the context is loading so a real Owner doesn't see a flash
  of block screen.

**Lockout protection (v1):**
- The manager-type dropdown on `/settings/managers/[id]/edit` is
  **disabled when the user is editing their own row** — forces
  "ask another Owner" for self-demote. Hard guard.
- The vocabulary editor on `/settings/roles` lets you edit any
  type's flags including the one currently assigned to you, but
  the row gets a warn-tinted "this is your current type" hint.
  Soft guard — accidental own-cap toggles are recoverable by
  hitting "Save" again with the flag flipped back.
- Last-resort recovery: `UPDATE profiles SET manager_type = NULL
  WHERE id = '<owner-uid>';` in Supabase SQL Editor.

**Out of scope for v1 (deferred):**
- RLS hardening — gates are client-side UX only, same posture as
  `canCreateCustomers`. A motivated manager could call the
  underlying API routes directly.
- More capabilities (canManageWorkforce, canEditCustomers, etc) —
  add when real demand surfaces. Each new cap is a one-line
  extension of `ManagerCapability` + the seed.
- Schedule drag-drop on `/schedule/page.tsx` is NOT gated —
  viewing the calendar stays open to everyone, but a View-only
  manager who drags a shift will still persist the move. The
  `/schedule/new` and `/shifts/[id]/edit` route gates are the
  primary protection. Tighten the drag handler if this becomes
  a real complaint.
- Request approval queue (Live Ops needs-action panel) isn't
  capability-gated yet — approve/decline still works for any
  manager. Same v1 limitation as the drag-drop.

---

## 13. iOS PWA landmines

The mobile app is installed as an iOS standalone PWA (and Android
Chrome). iOS has bitten us repeatedly. **Read this before adding any
tap → camera, tap → file picker, tap → window.open, or tap → push
permission flow.**

### User-activation rule

iOS only treats a tap as a "user gesture" for the same synchronous
call stack. Any `await` between the tap handler and the destination
call (`.click()`, `window.open()`, `Notification.requestPermission()`)
**drops the activation flag** and the OS silently blocks the popup /
camera / permission prompt.

**Wrong:**
```ts
async function startPhotoFlow(taskId) {
  await refreshPhotoCount(taskId);  // ← drops activation
  photoInputRef.current?.click();   // ← iOS silently blocks
}
```

**Right:**
```ts
function startPhotoFlow(taskId) {
  // Read cached count synchronously from a useEffect-hydrated Map
  const count = taskPhotoCounts.get(taskId) ?? 0;
  photoInputRef.current?.click();   // ← same call stack as the tap
}
```

`requestAnimationFrame(() => click())` ALSO breaks activation —
schedule into the next frame and iOS treats it as no-longer-user-
gestured. Don't use rAF between tap and click.

See May 14 SESSIONS entry for `447fc82` — the actual root-cause fix
for photo capture, after several "almost right" attempts.

### Safe-area insets

iOS standalone PWA renders content under the bottom home-indicator
band. Set `viewport-fit: cover` in `viewport` export (already done
in `morpheus-mobile/app/layout.tsx`) and use `env(safe-area-inset-*)`
in any element that touches the screen edge.

### Library / file open

Same activation rule as camera. Pre-sign storage URLs in advance
(batched `createSignedUrls`) and render each row as a real
`<a href={url} target="_blank">` anchor — don't generate the URL on
tap. See `cf04b9d` (May 14 library fix).

### Cross-platform statement

**Every mobile change must state which platforms were considered.**
Per the CLAUDE_BEHAVIOR baseline, end your response with the
platforms you tested or thought about:

> "Cross-platform considered: iOS standalone PWA (synchronous tap
> chain preserved), Android Chrome (no user-activation quirks, works
> the same), desktop browsers (mouse click is also a user gesture)."

---

## 14. Accessibility baseline

We don't have a formal a11y audit yet, but the floor is:

- **Focus visible** — never `outline: none` without a replacement focus
  ring. Brand-cyan ring is the default.
- **Escape closes overlays** — modals, sheets, lightboxes all wire an
  Escape handler.
- **Backdrop click closes modals** (not sheets — those should require
  a deliberate dismiss).
- **Tab order is reading order** — don't `tabIndex` a fix in unless
  there's a real reason.
- **Touch target ≥ 44×44px on mobile** — iOS HIG floor. Pills, chips,
  and inline buttons can be smaller VISUALLY but their tap target
  (achieved with padding) must hit 44.
- **Colour contrast** — ink on white is fine. Ink2 / Ink3 on white is
  fine. Mute / Hint / Faint on white DROP below AA at small sizes —
  use them only for ≥13px text or for non-text affordances.
- **Glyph-only buttons need an `aria-label`** — the icon-only Pause
  button, the menu hamburger, the close × on modals.

---

## 15. Checklist — adding a new page

When you add a new page, walk this list. If a checkbox can't be
ticked, leave a one-line code comment explaining why.

- [ ] Wrapped in `AdminShell` (admin) or `MenuShell` (mobile).
- [ ] No hardcoded hex colours — everything via `AC` / `MC`.
- [ ] Cards use the `Card` component, not a raw div with a border.
- [ ] Section headings use `SectionTitle` (admin) or the mobile
      equivalent.
- [ ] Buttons use `Btn` with `kind` set explicitly.
- [ ] Pills use `Pill` / `StatusPill` — not a hand-rolled span.
- [ ] Icons via `AGlyph` (admin) or `Glyph` (mobile). Added a new
      one? `case "<name>":` added to the registry.
- [ ] Empty state uses `EmptyState`.
- [ ] Loading state shows something visible — skeleton card,
      `LoadingBar`, or a "Working…" line. Never a blank card.
- [ ] Save status uses `notifySaved` / `notifySaveError`.
- [ ] Optimistic UI on toggles + flips.
- [ ] Realtime subscription via the shared store, not a raw
      `supabase.channel`.
- [ ] If the page touches a Card with photos / signatures / docs,
      thumbnails use the same shape (square 64×64 admin / round
      72×72 mobile).
- [ ] If the page renders a customer, customer = house glyph or
      uploaded logo. If a rep, rep = photo or face/initials.
- [ ] If list page: `<Pagination>` at the bottom, page state
      resets to 0 on every filter / search / sort change.
- [ ] If list page: `<ListCount visible={filtered.length}
      total={rows.length} noun="…" />` between the filter Card and
      the body Card. Pagination shows the same total at the bottom,
      but the count must also be visible at the top.
- [ ] If list page with a Table view: `useColumnWidths` + a
      `<ColumnResizer>` overlay on every header except the last.
      Same `gridTemplateColumns` on header row + every data row.
- [ ] If list page: rows are clickable to navigate (whole row →
      detail / edit page). Inline action buttons inside the row
      wrap in `onClick={e => e.stopPropagation()}` so their click
      doesn't bubble up to the row-level navigate.
- [ ] If list page: filter row order is `FilterChip`s → optional
      `<select>` for categorical filters → search box → optional
      `SegTabs` view toggle. Brand-tinted accent on the `<select>`
      when active.
- [ ] If the page renders a rep, surface their `rep_type` as a
      `RepTypeChip` next to their name + as a sublabel in any
      Combobox option.
- [ ] If the page or affordance is gated by a rep-type capability,
      use `repTypeCan(types, profile.rep_type, capability)`.
      Belt-and-braces guard at the destination page (block screen
      on deep-link nav). SECURITY caveat noted in the PR
      description / SESSIONS entry — client-side only.
- [ ] Mobile: tap → camera / file / window.open is synchronous
      (no `await` between tap and call).
- [ ] Mobile: every page passes the cross-platform statement
      (iOS PWA + Android Chrome behaviour) in the PR description /
      session log entry.
- [ ] Microcopy formula: short title, one-sentence helper, optional
      CTA. Friendly + crisp.
- [ ] `npx --no-install next build` is clean before you commit.
- [ ] Added to the relevant nav (`mock-data.ts` NAV_ITEMS,
      `SETTINGS_SECTIONS`, mobile `SideMenu`).
- [ ] SESSIONS.md entry written when you push.

---

## Glossary — when in doubt, "the X-est example is…"

Reference points for "what good looks like":

| Surface | Reference page | Why |
|---|---|---|
| List page | `/reps` | Full gold-standard shape — filter chips + type select + search + Grid/Table toggle + sortable resizable headers + clickable rows + Pagination + empty state |
| Detail page (read-only) | `/shifts/[id]` | Header card + section cards + inline photo strip + lightbox |
| Detail page (editable) | `/customers/[id]/edit` | Identity / Location / Check-in exceptions section structure |
| Tabbed detail | `/customers/[id]` | TabHeader + per-tab components + shared tabStyles + inline contacts on Overview |
| Settings page | `/settings/check-in-rules` | ToggleRow pattern, segmented picker, optimistic UI |
| Settings vocabulary CRUD (rail) | `/settings/custom-fields` | Standalone vocabulary with its own rail entry + URL |
| Settings vocabulary CRUD (modal) | "Manage rep types" button on `/settings/managers` | Entity-intrinsic vocabulary — modal where the manager is already working |
| Wizard | `/settings/import/[entity]` | 5-step stepper, dropzone, mapping (with ID / LINK badges), preview, result |
| Pagination | `/reps`, `/past-shifts` | `<Pagination>` + client-side slice + page-resets-on-filter pattern |
| Resizable columns | `/reps` Table view | `useColumnWidths` + `<ColumnResizer>` overlay; localStorage per page |
| Clickable rows | `/settings/managers` | Whole row navigates; inline buttons use `stopPropagation` |
| Capability gate (UI) | Mobile `/add-customer` block screen | `repTypeCan` check + belt-and-braces block on deep-link nav |
| Empty state | `/past-shifts` (when filter matches none) | EmptyState used correctly |
| Confirmation modal | `EmailUserModal` | createPortal, backdrop, Escape, autoFocus |
| Lightbox | PhotoLightbox in `/shifts/[id]` | Full-screen, prev/next, caption, keyboard |
| Sheet (mobile) | `UnableToAttendSheet` | Bottom-anchored, dismissible, structured options |
| Optimistic UI | `/settings/import` defaults | Toggle, segmented, revert on failure |
| Realtime | `NeedsActionContext` | Shared provider, multi-surface count agreement |

When you're not sure how to build a thing, find its row in this table
and crack open the reference page first.
