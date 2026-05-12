-- Customer contacts
-- ------------------
-- Promotes "contact" from a single name/phone/email/notes column-set on
-- customer_sites to a dedicated multi-row table so a customer (or a
-- specific site within that customer) can have several named people on
-- file — operations lead, accounts contact, security contact, etc.
--
-- Each contact row belongs to a customer (required). Optionally a row
-- can also pin to a specific site if the contact is only relevant for
-- that branch / warehouse / outlet. site_id NULL = applies to the whole
-- customer.
--
-- Backwards compatibility:
--   - The legacy contact_name / contact_phone / contact_email / notes
--     columns on customer_sites STAY. They power the existing mobile
--     "tap to call" + access-notes UI on the active-shift screen.
--   - A one-off backfill (out of scope for this migration; admin app
--     handles it next time a manager saves the customer) can copy the
--     existing single contact into a new row in this table, then we
--     can deprecate the legacy columns at our leisure.
--
-- RLS:
--   Managers (role='manager') can CRUD any row.
--   Reps (role='rep') can READ contacts for customers they're assigned
--   to via shifts. Read-only — they don't manage contacts.
--   Same model as customer_sites.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   text NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id       uuid REFERENCES public.customer_sites(id) ON DELETE SET NULL,
  name          text NOT NULL,
  role_label    text,          -- "Ops lead", "Accounts", "Security", etc. Optional.
  phone         text,
  email         text,
  notes         text,
  sort_order    integer NOT NULL DEFAULT 0,  -- manager-controlled ordering on the customer detail page
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Lookup paths the admin + mobile apps actually use.
CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
  ON public.customer_contacts(customer_id) WHERE active;
CREATE INDEX IF NOT EXISTS customer_contacts_site_idx
  ON public.customer_contacts(site_id) WHERE active AND site_id IS NOT NULL;

-- Touch updated_at automatically.
CREATE OR REPLACE FUNCTION public.touch_customer_contacts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_contacts_touch ON public.customer_contacts;
CREATE TRIGGER customer_contacts_touch
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_customer_contacts_updated_at();

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

-- Managers: full CRUD on every customer's contacts.
DROP POLICY IF EXISTS customer_contacts_manager_all
  ON public.customer_contacts;
CREATE POLICY customer_contacts_manager_all
  ON public.customer_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

-- Reps: read-only on contacts where the rep has any shift for the
-- same customer (today, past, or future). Limits exposure to the
-- contacts of customers they actually work with.
DROP POLICY IF EXISTS customer_contacts_rep_read
  ON public.customer_contacts;
CREATE POLICY customer_contacts_rep_read
  ON public.customer_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
       WHERE s.customer_id = customer_contacts.customer_id
         AND s.rep_id = auth.uid()
    )
  );

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'customer_contacts'
--     ORDER BY ordinal_position;
