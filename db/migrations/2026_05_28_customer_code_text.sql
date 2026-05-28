-- 2026-05-28: customer codes become opaque strings (Mariska's B5).
--
-- Before: customers.code is `integer NOT NULL UNIQUE`. The import adapter
-- enforces /^\d+$/ on every row and parseInts the value into Postgres.
-- This blocks every real-world tenant: customers come with their own
-- SKU-style codes (SP-001, ACME-JHB, etc) that aren't pure integers.
--
-- After: customers.code is `text NOT NULL UNIQUE`. Existing integer values
-- cast cleanly via ::text (12 → '12', preserved unchanged). The display
-- layer (rowToCustomer + formatCustomerCode helper) zero-pads + prepends
-- `#` only when the value is purely numeric, so existing customers keep
-- their `#0012` look while new SP-001 / ACME-JHB codes render as-is.
--
-- Two columns change:
--   1. customers.code           — primary column
--   2. requested_shifts.customer_code — denormalised join cache on the
--      rep-requested-shifts queue (carries the customer's code at the
--      time the rep tapped "request this customer")
--
-- ALTER COLUMN TYPE preserves NOT NULL + UNIQUE constraints + rebuilds
-- the b-tree index automatically — no manual reindex needed.
--
-- Idempotent guard: the cast is a no-op on a second run because the
-- target type is already text. Safe to re-run.

BEGIN;

-- ─── 1. customers.code: integer → text ───────────────────────────
ALTER TABLE public.customers
  ALTER COLUMN code TYPE text USING code::text;

-- ─── 2. requested_shifts.customer_code: integer → text ───────────
ALTER TABLE public.requested_shifts
  ALTER COLUMN customer_code TYPE text USING customer_code::text;

COMMIT;

-- Smoke-test after applying:
--   1. SELECT code, pg_typeof(code) FROM public.customers LIMIT 5;
--      → pg_typeof should report `text` for every row.
--   2. SELECT customer_code, pg_typeof(customer_code)
--      FROM public.requested_shifts LIMIT 5;
--      → same: text.
--   3. Try inserting a non-numeric code from the admin import wizard
--      (e.g. "SP-001"). It should land without the
--      "code must be an integer" validation error.
--   4. Open /customers in the admin. Numeric codes (existing) still
--      render as "#0012"; new alphanumeric codes render as "SP-001".
