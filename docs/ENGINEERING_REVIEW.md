# Engineering review — May 11, 2026

> Verbatim record of the senior-engineer handoff pass. Captured
> here as a permanent artifact because (a) the rationale on a
> bunch of decisions is documented here and nowhere else, and
> (b) the deferred items in section "Documented findings" are
> still the closest thing we have to a code-quality backlog.

---

### Engineering review · 2026-05-11 (handoff for the senior engineer)

A focused engineering pass landed late on May 11 (`b2a9e30`) ahead of
senior-engineer review. Some items were shipped, the rest are
documented here with concrete starting points so the senior engineer
can pick them up cold.

#### What landed in the engineering pass (commit `b2a9e30`)

- **Four missing hot-path indexes** in `db/migrations/2026_05_11_perf_indexes.sql`:
  `shift_events.shift_id` (partial NOT NULL), `profiles.role`,
  `rep_locations.rep_id`, `customer_sites.active`. Idempotent +
  transactional; safe to re-run.
- **Realtime channel-name collision fixed** in
  `lib/rep-locations-store.ts` — `subscribeRepLocations` was using a
  hardcoded `"rep_locations_live"` channel name so two simultaneous
  subscribers silently shared one channel. Now uses
  `Date.now()`+counter suffix like every other subscriber in the codebase.
- **Realtime subscriptions added** for `/reps` and `/customers` list
  pages. Both were mount-only fetches; a concurrent admin's edits
  showed stale data until a manual refresh. New `subscribeProfiles()`
  and `subscribeCustomers()` helpers in their respective stores.
- **Duplicate utilities deduplicated.** 9 copies of `deriveInitials`,
  3 copies of `formatTimeRange`, and 2 copies of `timeToMin`/`minToTime`
  collapsed into shared exports in `lib/format.ts`. `schedule/page.tsx`'s
  `deriveInitials` was dead code, removed entirely.
- **Bounded query** for `getCheckoutTimesForShifts` in
  `lib/events-store.ts` — was relying on PostgREST's 1000-row default
  ceiling; now caps at `max(50, shiftIds.length × 4)` so a buggy
  shift with many checkout events can't crowd out the others.

#### Documented findings for the senior-engineer review

The audit surfaced a handful of items that need a dedicated session
each, with risk of regression too high to do under time pressure.
Listed with file paths + suggested approaches so they can be picked
up cold:

**Architecture / scaling**

1. **`listProfiles()` is called from ~5 components independently per
   page render** on the Live Ops home (KpiStrip + ShiftsList +
   LiveFeedPanel + TopBar typeahead + …). Each component fetches the
   full profile list. The fix is a page-level context (or a swr-style
   cache) that fetches once and shares — but it's a multi-file
   plumbing change with real regression risk. Worth doing the moment
   the user count climbs past ~50 reps.
2. **DB row shapes leak into UI code.** Components reference
   `shift.start_time`, `shift.shift_date`, `s.customer_id` directly,
   so any DB-side rename ripples through the entire component tree.
   The fix is a mapper layer at every `lib/*-store.ts` boundary that
   returns a domain shape with camelCase fields. Already done
   partially in `lib/shifts-store.ts` (mobile) which has
   `ShiftWithMeta`. Apply the same pattern elsewhere.
3. **`shifts.customer_id` may not have an enforced FK** to
   `customers(id)`. The base shifts table is older than the
   `db/migrations/` directory so the constraint isn't tracked here.
   Check `\d+ public.shifts` in the Supabase SQL editor; if missing,
   add a `FOREIGN KEY (customer_id) REFERENCES customers(id)` migration
   alongside Phase 4 RLS.
4. **Soft-delete inconsistency** across the schema:
   - `customers`, `customer_sites` use `active boolean`
   - `shifts` uses `state='cancelled'` (state machine)
   - everything else hard-deletes
   Pick a convention and apply it. The state-machine version on
   shifts is the right choice for that table (audit trail); for
   library_files and tasks consider adding `deleted_at timestamptz`
   so the activity log isn't broken by cascade deletes.
5. **`app_settings` table has no `created_at` column** — only
   `updated_at`. Trivial migration, useful for future "when did the
   org first configure X?" reports.

**Big files that would benefit from extraction**

The user-visible behaviour is correct, but the following modules are
large enough that onboarding a new dev means reading a lot of inline
code per page. None of these are urgent — extract sub-components
opportunistically the next time a feature touches them. Listed
biggest first:

- `morpheus-admin/app/schedule/page.tsx` — **2,621 lines.** Calendar +
  drag-drop + lane allocator + day-summary chip + day-detail panel +
  edit popover. Suggested extraction:
    `components/schedule/DaysCalendar.tsx` (the grid)
    `components/schedule/DayColumn.tsx` (per-column logic)
    `components/schedule/DraggableShiftCard.tsx` (the card)
    `components/schedule/DaySummaryChip.tsx` + `DayDetailPanel.tsx`
    `lib/schedule/lanes.ts` (assignLanes + cluster logic)
- `morpheus-mobile/app/page.tsx` — **2,052 lines.** Dashboard +
  UpNextCard + BreakOrTravelCard + WelcomeStrip + map embed. Suggested:
    `components/dashboard/WelcomeStrip.tsx`
    `components/dashboard/UpNextCard.tsx`
    `components/dashboard/BreakOrTravelCard.tsx`
- `morpheus-admin/app/schedule/new/page.tsx` — **1,643 lines.** The
  cartesian-product form. The CustomerContextChips + TimeSelect
  helpers can move out cleanly.
- `morpheus-mobile/app/active/page.tsx` — **1,539 lines.** Task sheet +
  shift notes + break/travel state — TaskSheet is already its own
  component; `ShiftNotesCard` would extract cleanly.
- `morpheus-admin/components/screens/live-ops/LiveFeedPanel.tsx` — **1,410 lines.**
  Live feed + needs-action panel + reassign modal. Split the
  reassign modal into its own file.

**Security**

- **Phase 4 RLS is still the top open item** (see item 3 below). All
  tables currently `USING (true)` for authenticated users; the apps
  enforce role at the UI but not at the DB. A motivated rep with
  Supabase credentials could write any table.

**Lower-priority quality items (left alone deliberately)**

- 82 `console.log` / `console.warn` calls across stores. Most are
  intentional error reports (`// eslint-disable-next-line no-console`)
  but worth swapping for a `logger.warn(...)` abstraction that strips
  in prod.
- 11 empty `catch {}` blocks in the admin app. Most are graceful
  degradations on optional storage / geocoding paths. Add inline
  comments to each so the senior engineer can verify intent.
- 15 files write `window.localStorage` directly — worth a
  `lib/storage.ts` typed wrapper.
- No `<ErrorBoundary>` at the layout level on either app.

**What was NOT touched (with reasons)**

- **Big file refactors above.** They're listed not because they're
  broken but because they're large. Refactoring 2.6k lines of
  drag-drop calendar code under time pressure is the fastest way to
  introduce regressions; deferred to the senior engineer or to a
  feature-driven extraction.
- **`listProfiles` page-level cache.** Would touch 5+ files and
  every existing test/QA hook to thread context. Senior engineer
  pick.
- **Phase 4 RLS.** Already #1 on the deferred list. Needs a single
  coordinated migration + staging-Supabase test pass, not a quick fix.
- **Resizable table columns** on `/reps`, `/customers`, `/tasks`,
  `/library`. Currently the four list tables use a fixed
  `gridTemplateColumns` string per page. Making them drag-resizable
  cleanly needs:
  • per-column width state with a stable key per table (e.g.
    `morpheus.reps_table_widths.v1`)
  • a `<ResizableHeader>` primitive in `components/ui/` exposing a
    drag handle on the right edge of every non-last column
  • pointer-down/move/up handlers honouring touch vs mouse, min/max
    widths per column, and the sort-button shouldn't trigger drag
  • a small `useColumnWidths(tableKey, defaults)` hook that returns
    a memoised `gridTemplateColumns` string + a renderHandle helper
  Roughly a half-day of focused work + per-page replacement. I
  considered shipping a pilot on `/reps` only but the inconsistency
  (one table resizable, three not) would feel worse than uniformly
  fixed-width while waiting for the proper feature.

  My recommendation: use `@tanstack/react-table` for this. It
  handles resize, sort, filter, virtualization in one consistent
  API, and four list pages × four concerns means the table library
  pays for itself on the first table.

---

**Top of the deferred list — pick any one and run with it next session:**

1. ~~**Cancellation / unable-to-attend flow**~~ ✅ SHIPPED May 11 — see "Today's session — what shipped (May 11)" above. Eight commits across Stage 2A + 2B; attention overlay model rather than state-machine expansion. Migrations `2026_05_11_shifts_attention.sql` + `_resolution.sql`.
2. **Real routing + traffic** ⚠️ THE BIG ONE (now top of the actually-deferred list). Server-proxied Google Routes API for ETAs + optimization. Mobile `/route` page with deep links to Google Maps for actual nav. Risk pills per leg ("Leave by 13:50"). Site-aware (already works post-May-8 since shifts have site coords). Cap spending with per-rep daily quotas. ~$10/month at full scale. 3 commits to ship the foundation; Google API key wired later as a flip-on.
3. ~~**Phase 4 RLS — security debt**~~ ✅ **Migration written May 14 evening — `db/migrations/2026_05_14_phase4_rls_hardening.sql`.** Single coordinated rewrite via an `is_manager()` SECURITY DEFINER helper, applied to every table that was previously `TO authenticated USING (true)`. **Run the migration in Supabase SQL editor — idempotent, BEGIN/COMMIT wrapped, safe to re-run.** Smoke-test checklist at the bottom of the file. Tightens: `profiles` (self-update OR manager), `app_settings` (manager-only writes), `customers` (manager-all + rep-INSERT-own via `created_by_rep_id`), `customer_sites` (manager-all + rep-INSERT-for-own-customer + rep-UPDATE-coords-for-shift-site), `customer_tasks` / `library_files` / `custom_fields` / `custom_field_values` / `organisation` / `customer_seen_by_manager` (manager-only writes), `shifts` (manager-all + rep-self for own/claimable), `shift_events` (manager-all + rep-self-SELECT), `shift_task_completions` / `shift_task_photos` / `shift_task_signatures` (manager-all + rep-INSERT/DELETE-own-shift), `messages` (manager-all + recipient-SELECT), `message_recipients` (self-read + self-update-read_at + manager-all), `rep_locations` (rep-self-SELECT + manager-SELECT), `rep_customer_assignments` (manager-all + rep-self-SELECT), plus storage object policies on `library`, `org_assets`, `shift_photos` buckets. Service-role cron + API callers bypass RLS as before, so messaging / push / auto-checkout flows are unaffected.
4. **Capacitor wrap** for proper background GPS + push notifications. Browsers don't expose persistent background geolocation, so the rep app can only track location while `/active` is foregrounded. Wrapping the existing React app in Capacitor (1-2 weeks) gives: real background location, push notifications, App Store / Play Store presence. The codebase doesn't change much — replace `navigator.geolocation` calls with `@capacitor/geolocation` (same API), plus shell config + permission requests.
5. **Custom report builder.** The 3 fixed reports (Operations / Rep performance / Timesheet) are good but the user wanted "users can build their own". Picture: a builder UI where a manager picks metrics, dimensions, filters, and a chart type, then saves. Multi-week project — needs builder UI + query AST + saved-report storage + per-user permissions on saves.
6. ~~**Background sweep.**~~ ✅ SHIPPED May 13. `/api/cron/auto-checkout` runs every 15 min via Vercel Cron, replicates the `sweepStaleShifts()` logic with the service-role client, force-completes any active-state shift past `auto_checkout_time` and clears orphan `rep_locations` rows. Belt-and-braces with the client-side sweep — whichever runs first wins; audit events tag the source.
7. **Error monitoring.** Drop in Sentry or Vercel Analytics before user count grows past ~10. You're flying blind on prod errors right now. ~30 minutes of work, saves a lot of guessing.
8. ~~**Push notifications via Web Push.**~~ ✅ SHIPPED May 13 — see "Web Push notifications (shipped May 13)" section above. Foundation + assigned/reassigned/cancelled triggers. Phase 2 follow-ups (late/EOD reminders, manager-side pushes) deferred.
9. **Email confirmation** turned back on for production self-signups. Admin-created users are already auto-confirmed.
10. **Tests.** Skeleton already in `qa/` (May 7). Run the Playwright suite against a non-prod Supabase project (needs you to create one + seed an admin/rep user) and start filling in the high-priority spec files from `qa/QA_PLAN.md`.

**Smaller cleanups that didn't make the cut today:**
- ~~9 `deriveInitials` + 3 `formatTimeRange` + 2 `timeToMin/minToTime` duplicates~~ ✅ **Deduplicated in `b2a9e30`** (engineering pass) — all now use shared exports from `lib/format.ts`.
- 5 page files >900 LOC (`customers/[id]/page.tsx`, `mobile/active/page.tsx`, `mobile/check-in/page.tsx`, `schedule/page.tsx`, `settings/managers/page.tsx`). They build fine but onboarding a new dev means reading a lot of inline code per page. Extract sub-components opportunistically when adding features. **See "Engineering review · 2026-05-11" above for the specific extraction plan per file.**
- `mock-data.ts` is now misleadingly named in both apps — only contains type definitions + (admin) `NAV_ITEMS`. Rename to `nav.ts` (admin) and merge mobile's into a shared types file.
- No `<ErrorBoundary>` at the layout level. A page that throws crashes the whole shell to Next's overlay. Adding one would give a graceful "Something went wrong" card.

See the full **Done vs Deferred** sections further down for detail.



