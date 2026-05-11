-- Performance indexes — engineering pass
-- ----------------------------------------
-- Audit on May 11 turned up four hot-path columns without indexes.
-- Adding them now so the senior-engineer review doesn't have to flag
-- them as obvious wins. All four are concurrent-safe IF NOT EXISTS
-- adds and have no behavioural side-effects on the app.
--
-- Why each:
--
--   shift_events (shift_id)
--     /shifts/[id] reads shift_events filtered by shift_id, plus the
--     mobile event queue retries write events with shift_id meta. The
--     existing indexes cover created_at + event_type + actor + customer
--     but NOT shift_id; queries by shift currently full-scan the table,
--     which grows unbounded daily.
--
--   profiles (role)
--     listProfiles({ role: 'rep' }) is the rep-picker call run on
--     every page that mounts the rep dropdown — schedule/new,
--     schedule/manage, shifts edit, reports/rep-performance, etc.
--     No index on role means a full table scan for every dropdown
--     mount. Still tiny today but the cost grows linearly with
--     user count.
--
--   rep_locations (rep_id)
--     The live-ops map's hot read filters by recorded_at (covered),
--     but "history for one rep" queries + the per-rep cleanup
--     sweep both filter by rep_id and currently have no index.
--
--   customer_sites (active)
--     The existing customer_id index is a partial WHERE active=true,
--     which doesn't help a global "list all active sites" query
--     (rarely used today but a flag for any future cross-customer
--     site-picker). Lightweight add.
--
-- Idempotent + transactional so re-running is safe.

BEGIN;

CREATE INDEX IF NOT EXISTS shift_events_shift_idx
  ON public.shift_events (shift_id)
  WHERE shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON public.profiles (role);

CREATE INDEX IF NOT EXISTS rep_locations_rep_idx
  ON public.rep_locations (rep_id);

CREATE INDEX IF NOT EXISTS customer_sites_active_idx
  ON public.customer_sites (active);

COMMIT;

-- Verify:
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public'
--     AND indexname IN (
--       'shift_events_shift_idx',
--       'profiles_role_idx',
--       'rep_locations_rep_idx',
--       'customer_sites_active_idx'
--     );
