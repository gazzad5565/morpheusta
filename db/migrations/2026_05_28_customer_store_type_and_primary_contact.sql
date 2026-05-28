-- 2026-05-28 (later): customer store_type + primary-contact flag.
--
-- Rayhaan R7 — "Customer model and hero are missing basics." After
-- region (existed) + customer_group (added earlier today), the two
-- remaining R7 hero fields are:
--   1. store_type  — a tenant-defined classification of the customer
--                    (e.g. "Supermarket", "Spaza", "Pharmacy",
--                    "Wholesale"). Same admin-managed-vocabulary shape
--                    as customer_group: a text column on customers +
--                    a string[] vocabulary in app_settings.store_types.
--   2. primary contact — R7's suggestion was "derive primary_contact
--                    from the contacts table (mark one contact as
--                    primary)". We add customer_contacts.is_primary so
--                    a manager can star ONE contact per customer; the
--                    Overview hero surfaces that contact's name + phone
--                    at a glance.
--
-- Both are CUSTOMER attributes (Gary's May 28 correction — region +
-- group + store type live on customers, not on user profiles).
--
-- Idempotent — safe to re-run.

BEGIN;

-- ── 1. customers.store_type ──────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_type text NULL;

CREATE INDEX IF NOT EXISTS customers_store_type_idx
  ON public.customers (store_type)
  WHERE store_type IS NOT NULL;

COMMENT ON COLUMN public.customers.store_type IS
  'Tenant-defined store classification (e.g. Supermarket, Spaza, Pharmacy). NULL = unassigned. Vocabulary in app_settings.store_types (May 28, Rayhaan R7).';

-- Seed an empty vocabulary. Tenants populate it at Settings →
-- Organisation → Store types. ON CONFLICT DO NOTHING so a re-run
-- never stomps manager edits.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('store_types', '[]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- ── 2. customer_contacts.is_primary ──────────────────────────────
ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Partial index: the hero query fetches WHERE customer_id = ? AND
-- is_primary = true, which this keeps fast even on big contact lists.
CREATE INDEX IF NOT EXISTS customer_contacts_primary_idx
  ON public.customer_contacts (customer_id)
  WHERE is_primary = true;

COMMENT ON COLUMN public.customer_contacts.is_primary IS
  'Exactly one contact per customer should be true — the headline contact surfaced on the customer Overview hero. Enforced application-side (setPrimaryContact clears the others). May 28, Rayhaan R7.';

COMMIT;

-- ── Smoke test ───────────────────────────────────────────────────
--   ✅ SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'customers' AND column_name = 'store_type';
--      → 1 row.
--   ✅ SELECT key, value FROM app_settings WHERE key = 'store_types';
--      → 1 row, value = [].
--   ✅ SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'customer_contacts' AND column_name = 'is_primary';
--      → 1 row, type boolean.
--   ✅ Settings → Organisation → Store types → add "Supermarket" →
--      open a customer's Edit → Location tab → Store type dropdown
--      shows Supermarket. Save → header chip row shows it.
--   ✅ Contacts tab → star a contact → Overview hero shows that
--      contact as the primary, name + phone.
