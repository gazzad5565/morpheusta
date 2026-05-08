-- 2026-05-08: multi-site customers.
--
-- Until today every customer was conceptually a single location: one
-- address, one set of coordinates, one geofence. Real customers
-- (chains, multi-warehouse retailers, anything with more than one
-- physical site) couldn't be modelled — managers were creating
-- one customer per location and reps couldn't tell them apart.
--
-- Model: address-on-customer is retired. Sites own all location
-- data. Every customer has ≥1 site; the customer's *display* fields
-- (name, code, colour, region) stay on customers. Shifts gain a
-- site_id pointing at the specific location for that shift.
--
-- Migration is idempotent. Run once in the Supabase SQL Editor.
-- Safe to re-run.
--
-- Backwards compat: customers.address / latitude / longitude /
-- geofence_radius_m columns are *kept* for now, populated by the
-- backfill below, but treated as legacy. Code reads from
-- customer_sites going forward. Once every read path is migrated
-- a follow-up migration drops those columns.

-- Wrap the whole migration in a transaction so a partial apply can't
-- leave the schema in a half-broken state — if any step fails, the
-- table, index, FK, backfill, trigger, RLS, and realtime add are all
-- rolled back atomically and the next run starts clean.
BEGIN;

-- 1. Sites table.
--
-- customer_id is TEXT — customers.id is a slug-style text key
-- (e.g. "aria-cosmetics-x9f2"), not a uuid, so the FK column type
-- has to match. Site's own id stays uuid because nothing references
-- it as a slug elsewhere.
CREATE TABLE IF NOT EXISTS public.customer_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  latitude double precision,
  longitude double precision,
  geofence_radius_m integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_sites_customer_id_idx
  ON public.customer_sites (customer_id)
  WHERE active = true;

-- 2. Backfill: every existing customer becomes a "Main" site so no
--    customer is ever site-less. We use the customer's existing
--    address even if it's null — keeps shape consistent. Skip
--    customers that already have ≥1 site (re-run safety).
INSERT INTO public.customer_sites
  (customer_id, name, address, latitude, longitude, geofence_radius_m)
SELECT
  c.id,
  'Main',
  c.address,
  c.latitude,
  c.longitude,
  c.geofence_radius_m
FROM public.customers c
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_sites s WHERE s.customer_id = c.id
);

-- 3. Shifts → site_id. Nullable because pre-existing shifts need
--    backfilling and we don't want to fail the migration on a stray
--    orphan. Code paths must tolerate NULL until backfill is
--    complete and then we'll add a NOT NULL constraint in a
--    follow-up.
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS site_id uuid NULL REFERENCES public.customer_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shifts_site_id_idx
  ON public.shifts (site_id)
  WHERE site_id IS NOT NULL;

-- 4. Backfill shifts: any shift whose customer has exactly one site
--    points at that site. Multi-site customers don't exist yet
--    (this migration just created them), so the "exactly one"
--    condition holds for every row that could be backfilled.
UPDATE public.shifts s
SET site_id = (
  SELECT cs.id
  FROM public.customer_sites cs
  WHERE cs.customer_id = s.customer_id
  ORDER BY cs.created_at ASC
  LIMIT 1
)
WHERE s.site_id IS NULL;

-- 5. Trigger: keep updated_at fresh on customer_sites.
CREATE OR REPLACE FUNCTION public.touch_customer_sites_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_sites_touch_updated_at ON public.customer_sites;
CREATE TRIGGER customer_sites_touch_updated_at
  BEFORE UPDATE ON public.customer_sites
  FOR EACH ROW EXECUTE FUNCTION public.touch_customer_sites_updated_at();

-- 6. RLS — matches the permissive Phase-pre-4 envelope every other
--    customer-adjacent table uses (customer_tasks, custom_fields,
--    library_files): RLS is enabled so the table is "secure", but any
--    authenticated user can read + write. Phase 4 will tighten every
--    write policy to managers-only in one coordinated pass — going
--    stricter just on this table now would diverge from the schema
--    and break CRUD for managers whose profiles.role isn't set.
ALTER TABLE public.customer_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_sites_select" ON public.customer_sites;
CREATE POLICY "customer_sites_select"
  ON public.customer_sites FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customer_sites_insert" ON public.customer_sites;
CREATE POLICY "customer_sites_insert"
  ON public.customer_sites FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sites_update" ON public.customer_sites;
CREATE POLICY "customer_sites_update"
  ON public.customer_sites FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sites_delete" ON public.customer_sites;
CREATE POLICY "customer_sites_delete"
  ON public.customer_sites FOR DELETE TO authenticated USING (true);

-- 7. Realtime — surface site changes the same way customers do, so
--    the admin Live Ops view + mobile dashboards refresh when a
--    site's coords or geofence change.
--    Guarded so re-running the migration doesn't error with "relation
--    already member of publication" — ALTER PUBLICATION ... ADD TABLE
--    has no IF NOT EXISTS form, so we check pg_publication_tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customer_sites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_sites';
  END IF;
END $$;

COMMIT;
