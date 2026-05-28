/**
 * customer-contacts-store — CRUD for customer_contacts.
 *
 * Sits alongside customers-store.ts. The customers store still owns
 * the customer row itself (name / colour / address / geofence); this
 * store owns the multi-row contact list per customer. They're
 * separate tables, separate concerns, separate writes — the customer
 * edit page sends two save calls when both have changed.
 *
 * Migration: 2026_05_12_customer_contacts.sql.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import { notifySaved, notifySaveError } from "./save-status";

export interface CustomerContact {
  id: string;
  customer_id: string;
  /** Optional pin to a specific site. NULL = applies to the whole
   *  customer (head-office / org-level contact). */
  site_id: string | null;
  name: string;
  /** Free-text role label — "Ops lead", "Accounts", "Security". Optional. */
  role_label: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sort_order: number;
  active: boolean;
  /** Exactly one contact per customer should be the primary — the
   *  headline contact surfaced on the customer Overview hero.
   *  Rayhaan R7, May 28. setPrimaryContact() keeps it singular. */
  is_primary: boolean;
}

interface DbRow {
  id: string;
  customer_id: string;
  site_id: string | null;
  name: string;
  role_label: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sort_order: number;
  active: boolean;
  is_primary?: boolean | null;
}

function rowToContact(r: DbRow): CustomerContact {
  return {
    id: r.id,
    customer_id: r.customer_id,
    site_id: r.site_id,
    name: r.name,
    role_label: r.role_label,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    sort_order: r.sort_order,
    active: r.active,
    is_primary: r.is_primary ?? false,
  };
}

/** All active contacts for a single customer, ordered as the manager
 *  arranged them. */
export async function listCustomerContacts(
  customerId: string
): Promise<CustomerContact[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("*")
    .eq("customer_id", customerId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customer-contacts] list error:", error.message);
    return [];
  }
  // Float the primary contact to the top CLIENT-SIDE rather than via
  // an .order("is_primary") clause — the column is added by the May 28
  // R7 migration and ordering by a not-yet-existing column would error
  // the whole query (the "rep vanish" failure mode). SELECT * simply
  // omits the column pre-migration and rowToContact maps it to false,
  // so this is a no-op until the migration runs, then sorts correctly.
  const rows = (data as DbRow[]).map(rowToContact);
  rows.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return rows;
}

export interface NewContact {
  customer_id: string;
  site_id?: string | null;
  name: string;
  role_label?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export async function createContact(
  c: NewContact
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  if (!c.name.trim()) {
    return { ok: false, error: "Name is required." };
  }
  const { data, error } = await supabase
    .from("customer_contacts")
    .insert({
      customer_id: c.customer_id,
      site_id: c.site_id ?? null,
      name: c.name.trim(),
      role_label: c.role_label?.trim() || null,
      phone: c.phone?.trim() || null,
      email: c.email?.trim() || null,
      notes: c.notes?.trim() || null,
      sort_order: c.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "customer.updated",
    customer_id: c.customer_id,
    message: `Added contact ${c.name.trim()}`,
  });
  notifySaved("customer");
  return { ok: true, id: data?.id };
}

export interface ContactPatch {
  site_id?: string | null;
  name?: string;
  role_label?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export async function updateContact(
  id: string,
  patch: ContactPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Trim string fields; empty after trim → null. Keeps the DB clean
  // and the UI predictable (no "    " phone strings).
  const cleanPatch: Record<string, unknown> = { ...patch };
  for (const k of ["name", "role_label", "phone", "email", "notes"] as const) {
    if (k in cleanPatch) {
      const v = cleanPatch[k];
      if (typeof v === "string") {
        const t = v.trim();
        cleanPatch[k] = t === "" ? (k === "name" ? undefined : null) : t;
      }
    }
  }
  // If name was passed as an empty string we drop the field entirely
  // (treating it as "no change") rather than try to null out a NOT
  // NULL column — that would PG-error and confuse the manager.
  if (cleanPatch.name === undefined) delete cleanPatch.name;

  const { data, error } = await supabase
    .from("customer_contacts")
    .update(cleanPatch)
    .eq("id", id)
    .select("id, customer_id")
    .single();
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  if (data?.customer_id) {
    await logEvent({
      event_type: "customer.updated",
      customer_id: data.customer_id,
      message: "Updated a contact",
    });
  }
  notifySaved("customer");
  return { ok: true };
}

/**
 * Mark one contact as the customer's primary (the headline contact
 * on the Overview hero). Clears is_primary on every OTHER contact for
 * the same customer first, then sets it on the target — so exactly
 * one is ever primary. Pass the same id that's already primary to
 * toggle it OFF (clears all). Rayhaan R7, May 28.
 */
export async function setPrimaryContact(
  customerId: string,
  contactId: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Clear all primaries for this customer first. Scoping by
  // customer_id keeps the write cheap + RLS-safe.
  const { error: clearErr } = await supabase
    .from("customer_contacts")
    .update({ is_primary: false })
    .eq("customer_id", customerId)
    .eq("is_primary", true);
  if (clearErr) {
    notifySaveError(clearErr.message, "customer");
    return { ok: false, error: clearErr.message };
  }
  // Null contactId = "no primary" (toggle-off) — we're done.
  if (contactId) {
    const { error: setErr } = await supabase
      .from("customer_contacts")
      .update({ is_primary: true })
      .eq("id", contactId);
    if (setErr) {
      notifySaveError(setErr.message, "customer");
      return { ok: false, error: setErr.message };
    }
  }
  await logEvent({
    event_type: "customer.updated",
    customer_id: customerId,
    message: contactId ? "Set a primary contact" : "Cleared the primary contact",
  });
  notifySaved("customer");
  return { ok: true };
}

/** Soft-delete (active = false). Keeps the row for audit / history.
 *  The list helpers above filter on `active = true` so removed
 *  contacts disappear from every UI without surfacing again. */
export async function removeContact(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase
    .from("customer_contacts")
    .update({ active: false })
    .eq("id", id)
    .select("id, customer_id, name")
    .single();
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  if (data?.customer_id) {
    await logEvent({
      event_type: "customer.updated",
      customer_id: data.customer_id,
      message: `Removed contact ${data.name || ""}`.trim(),
    });
  }
  notifySaved("customer");
  return { ok: true };
}
