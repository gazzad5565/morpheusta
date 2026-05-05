/**
 * Custom fields store (admin) — define + read/write polymorphic fields
 * that can attach to any entity type.
 *
 * Field definitions live in `custom_fields`; per-entity values live in
 * `custom_field_values` keyed by (field_id, entity_id). Only one of the
 * value_* columns is populated per row, depending on the field's type.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export const FIELD_ENTITIES = [
  "customer",
  "rep",
  "shift",
  "task",
  "library_file",
] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export const FIELD_ENTITY_LABEL: Record<FieldEntity, string> = {
  customer: "Customers",
  rep: "Reps",
  shift: "Shifts",
  task: "Tasks",
  library_file: "Library files",
};

export const FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "boolean",
  "select",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  longtext: "Long text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  select: "Dropdown",
};

export interface CustomField {
  id: string;
  applies_to: FieldEntity;
  name: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
  created_at?: string;
}

export interface NewCustomField {
  applies_to: FieldEntity;
  name: string;
  field_type: FieldType;
  options?: string[] | null;
  required?: boolean;
  sort_order?: number;
}

/** A single field's value for a single entity, in JS-friendly shape. */
export type CustomFieldValue = string | number | boolean | null;

interface ValueRow {
  field_id: string;
  entity_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_bool: boolean | null;
}

// ─── Definitions CRUD ──────────────────────────────────────────────────

export async function listCustomFields(opts?: {
  appliesTo?: FieldEntity;
}): Promise<CustomField[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let q = supabase
    .from("custom_fields")
    .select("*")
    .order("applies_to", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (opts?.appliesTo) q = q.eq("applies_to", opts.appliesTo);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[custom-fields] list:", error.message);
    return [];
  }
  return (data as CustomField[]) || [];
}

export async function getCustomField(id: string): Promise<CustomField | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("custom_fields")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[custom-fields] get:", error.message);
    return null;
  }
  return data as CustomField;
}

export async function createCustomField(
  f: NewCustomField
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const cleanOptions =
    f.field_type === "select"
      ? (f.options || []).map((s) => s.trim()).filter(Boolean)
      : null;

  if (f.field_type === "select" && (!cleanOptions || cleanOptions.length === 0)) {
    return { ok: false, error: "Add at least one option for a dropdown field." };
  }

  const { data, error } = await supabase
    .from("custom_fields")
    .insert({
      applies_to: f.applies_to,
      name: f.name.trim(),
      field_type: f.field_type,
      options: cleanOptions,
      required: f.required ?? false,
      sort_order: f.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

export async function updateCustomField(
  id: string,
  patch: Partial<NewCustomField>
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const dbPatch: Record<string, unknown> = {};
  if (patch.applies_to !== undefined) dbPatch.applies_to = patch.applies_to;
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.field_type !== undefined) dbPatch.field_type = patch.field_type;
  if (patch.options !== undefined) {
    dbPatch.options = patch.field_type === "select" || patch.options
      ? (patch.options || []).map((s) => s.trim()).filter(Boolean)
      : null;
  }
  if (patch.required !== undefined) dbPatch.required = patch.required;
  if (patch.sort_order !== undefined) dbPatch.sort_order = patch.sort_order;

  const { error } = await supabase
    .from("custom_fields")
    .update(dbPatch)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteCustomField(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Values are deleted via ON DELETE CASCADE.
  const { error } = await supabase.from("custom_fields").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Values for a single entity ────────────────────────────────────────

/** Pull all field values for one entity. Returns a map `fieldId → value`. */
export async function getValuesForEntity(
  entityId: string
): Promise<Record<string, CustomFieldValue>> {
  if (!isSupabaseConfigured() || !supabase) return {};
  const { data, error } = await supabase
    .from("custom_field_values")
    .select("field_id, entity_id, value_text, value_number, value_date, value_bool")
    .eq("entity_id", entityId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[custom-fields] getValues:", error.message);
    return {};
  }
  const out: Record<string, CustomFieldValue> = {};
  for (const r of (data as ValueRow[]) || []) {
    out[r.field_id] = pickValue(r);
  }
  return out;
}

function pickValue(r: ValueRow): CustomFieldValue {
  if (r.value_text !== null) return r.value_text;
  if (r.value_number !== null) return r.value_number;
  if (r.value_date !== null) return r.value_date;
  if (r.value_bool !== null) return r.value_bool;
  return null;
}

/**
 * Replace the entity's values to match `values` (fieldId → value).
 *   - Setting a value to null OR empty string deletes that field's value.
 *   - Other values are upserted into the right value_* column based on
 *     the field's type.
 */
export async function setValuesForEntity(
  entityId: string,
  fields: CustomField[],
  values: Record<string, CustomFieldValue>
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const upserts: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  for (const f of fields) {
    const v = values[f.id];
    if (v === null || v === undefined || v === "") {
      deletes.push(f.id);
      continue;
    }
    const row: Record<string, unknown> = {
      field_id: f.id,
      entity_id: entityId,
      value_text: null,
      value_number: null,
      value_date: null,
      value_bool: null,
    };
    switch (f.field_type) {
      case "text":
      case "longtext":
      case "select":
        row.value_text = String(v);
        break;
      case "number":
        row.value_number = Number(v);
        break;
      case "date":
        row.value_date = String(v);
        break;
      case "boolean":
        row.value_bool = Boolean(v);
        break;
    }
    upserts.push(row);
  }

  if (deletes.length > 0) {
    const { error } = await supabase
      .from("custom_field_values")
      .delete()
      .eq("entity_id", entityId)
      .in("field_id", deletes);
    if (error) return { ok: false, error: error.message };
  }
  if (upserts.length > 0) {
    const { error } = await supabase
      .from("custom_field_values")
      .upsert(upserts, { onConflict: "field_id,entity_id" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
