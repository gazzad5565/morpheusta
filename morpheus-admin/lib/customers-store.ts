/**
 * Customers store — Phase 3.
 *
 * Reads & writes the `customers` table in Supabase. Falls back to the
 * static CUSTOMERS list from mock-data when Supabase isn't configured
 * (e.g. local dev without env vars), so the UI stays usable.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { CUSTOMERS as FALLBACK_CUSTOMERS } from "./mock-data";
import type { Customer } from "./types";

interface DbRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  region: string | null;
  city: string | null;
}

function rowToCustomer(row: DbRow): Customer {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    color: row.color,
    code: `#${String(row.code).padStart(4, "0")}`,
    region: (row.region as Customer["region"]) || "North",
    sites: 1,
    geofence: 75,
    shiftsThisWeek: 0,
    tier: "Standard",
  };
}

export async function listCustomers(): Promise<Customer[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return FALLBACK_CUSTOMERS;
  }
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] list error, using fallback:", error.message);
    return FALLBACK_CUSTOMERS;
  }
  return (data as DbRow[]).map(rowToCustomer);
}

export interface NewCustomer {
  name: string;
  initials: string;
  color: string;
  code: number;
  region?: string;
  city?: string;
}

export async function createCustomer(
  c: NewCustomer
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Slug-style id from the name: "GreenWave Innovations" → "greenwave-innovations"
  // Append a short timestamp suffix so two customers with the same name still
  // get unique ids.
  const slug = c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "customer";
  const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await supabase.from("customers").insert({
    id,
    name: c.name,
    initials: c.initials,
    color: c.color,
    code: c.code,
    region: c.region || null,
    city: c.city || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}
