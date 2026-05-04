/**
 * Customers store for the mobile app — read-only.
 *
 * Reps can only LIST customers (to populate the Add Shift search). They
 * never CREATE/UPDATE/DELETE — that's the admin's job.
 *
 * Falls back to ALL_CUSTOMERS from mock-data if Supabase isn't configured.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { ALL_CUSTOMERS, type Customer } from "./mock-data";

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
    code: row.code,
    region: row.region || "—",
    city: row.city || "—",
  };
}

export async function listAllCustomers(): Promise<Customer[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return ALL_CUSTOMERS;
  }
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] list error, using fallback:", error.message);
    return ALL_CUSTOMERS;
  }
  return (data as DbRow[]).map(rowToCustomer);
}
