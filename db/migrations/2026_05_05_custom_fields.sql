-- 2026-05-05: custom_fields + custom_field_values.
-- Admin can define custom fields that attach to any entity type
-- (customers, reps, shifts, tasks, library files). Each field has a
-- type (text / longtext / number / date / boolean / select) and a
-- "required" flag.
--
-- Values live in a separate table keyed by (field_id, entity_id) so a
-- field's value type is naturally polymorphic — only one of the
-- value_* columns is populated per row.
--
-- Run once in Supabase → SQL Editor. Safe to re-run.

-- ─── Field definitions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applies_to  text NOT NULL CHECK (
    applies_to IN ('customer','rep','shift','task','library_file')
  ),
  name        text NOT NULL,
  field_type  text NOT NULL CHECK (
    field_type IN ('text','longtext','number','date','boolean','select')
  ),
  options     text[] NULL,                  -- only used when field_type = 'select'
  required    boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_fields_applies_idx
  ON public.custom_fields (applies_to, sort_order);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_fields_select" ON public.custom_fields;
CREATE POLICY "custom_fields_select"
  ON public.custom_fields FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "custom_fields_insert" ON public.custom_fields;
CREATE POLICY "custom_fields_insert"
  ON public.custom_fields FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "custom_fields_update" ON public.custom_fields;
CREATE POLICY "custom_fields_update"
  ON public.custom_fields FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "custom_fields_delete" ON public.custom_fields;
CREATE POLICY "custom_fields_delete"
  ON public.custom_fields FOR DELETE TO authenticated USING (true);

-- ─── Field values ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_field_values (
  field_id      uuid NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  entity_id     text NOT NULL,              -- the customer/rep/shift/etc id, stored as text to fit both text + uuid PKs
  value_text    text NULL,
  value_number  numeric NULL,
  value_date    date NULL,
  value_bool    boolean NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (field_id, entity_id)
);

CREATE INDEX IF NOT EXISTS custom_field_values_entity_idx
  ON public.custom_field_values (entity_id);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfv_select" ON public.custom_field_values;
CREATE POLICY "cfv_select"
  ON public.custom_field_values FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cfv_insert" ON public.custom_field_values;
CREATE POLICY "cfv_insert"
  ON public.custom_field_values FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "cfv_update" ON public.custom_field_values;
CREATE POLICY "cfv_update"
  ON public.custom_field_values FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cfv_delete" ON public.custom_field_values;
CREATE POLICY "cfv_delete"
  ON public.custom_field_values FOR DELETE TO authenticated USING (true);
