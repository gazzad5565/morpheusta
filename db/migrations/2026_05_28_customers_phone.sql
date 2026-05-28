-- 2026-05-28: customers.phone — a customer-level phone number.
--
-- Rayhaan R7 deferred bit. Distinct from customer_contacts.phone (a
-- specific person): this is the customer/outlet's own main line (the
-- store landline / switchboard). Surfaced on the customer header as a
-- tappable tel: link so a manager can call the customer without
-- needing a named contact on file.
--
-- Free-text (we don't validate phone formats — SA numbers come in
-- many shapes). NULL = none on file.
--
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone text NULL;

COMMENT ON COLUMN public.customers.phone IS
  'Customer/outlet main phone (free text). Distinct from customer_contacts.phone (a person). Surfaced as a tappable tel: link on the customer header. May 28, Rayhaan R7.';

COMMIT;

-- Smoke test:
--   ✅ SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'customers' AND column_name = 'phone';
--      → 1 row, type text.
--   ✅ Open a customer → Edit → Identity → Phone field → save →
--      header shows a tappable phone.
