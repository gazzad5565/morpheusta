/**
 * Customers store for the mobile app.
 *
 * Reps can LIST customers (to populate the Request Shift search) AND
 * CREATE a new customer from the /add-customer flow (May 13). They
 * still can't UPDATE or DELETE existing rows — that's the admin's
 * job; updates flow through Live Ops + the admin /customers screens.
 *
 * Returns [] if Supabase isn't configured (no mock fallback).
 * Customers are a DB-only entity in production.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { type Customer } from "./mock-data";
import { logEvent } from "./events-store";

interface DbRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  location_exceptions_enabled: boolean | null;
  timing_exceptions_enabled: boolean | null;
  /** Base64 data URL of the customer logo. Added by
   *  2026_05_11_customers_logo. Optional — null means use the
   *  initials-tile fallback in the rep UI. */
  logo_url: string | null;
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
    latitude: row.latitude,
    longitude: row.longitude,
    geofence_radius_m: row.geofence_radius_m,
    location_exceptions_enabled: row.location_exceptions_enabled,
    timing_exceptions_enabled: row.timing_exceptions_enabled,
    logo_url: row.logo_url ?? null,
  };
}

/** Single customer by id, used by /check-in to read lat/lng + geofence radius. */
export async function getCustomerById(id: string): Promise<Customer | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToCustomer(data as DbRow);
}

export async function listAllCustomers(): Promise<Customer[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] list error:", error.message);
    return [];
  }
  return (data as DbRow[]).map(rowToCustomer);
}

// ─── Rep-created customers (Feature A — May 13) ────────────────────

/** Brand-palette of distinct colors. The admin uses a wider set;
 *  mobile picks from this curated subset so rep-added customers
 *  visually fit alongside admin-added ones. Picked at random on
 *  create — managers can change it later from the customer detail
 *  page. */
const BRAND_PALETTE = [
  "#E5A017", // amber
  "#2E4FB8", // blue
  "#22A857", // green
  "#5b3da5", // purple
  "#C4364C", // rose
  "#10897F", // teal
  "#D9743A", // orange
  "#5C677D", // slate
];

/** First two letters of the first two words, uppercased.
 *  "GreenWave Innovations" → "GI"
 *  "Aria"                  → "AR"
 *  Falls back to "C?" if the name has no alphanumeric chars. */
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /\w/.test(w));
  if (words.length === 0) return "C?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** "GreenWave Innovations" → "greenwave-innovations-ab7q".
 *  Slug + 4-char timestamp suffix for uniqueness. Mirrors the
 *  admin createCustomer behaviour exactly. */
function buildCustomerId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "customer";
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface NewCustomerInput {
  /** Required. The display name shown everywhere. */
  name: string;
  /** Required. Site address used for the auto-created head-office
   *  site and as the basis for geocoding (Feature B). Empty string
   *  is allowed but the admin won't be able to fence the geofence
   *  until coords are filled in. */
  address: string;
  /** Optional head-office contact name + phone. */
  contactName?: string;
  contactPhone?: string;
}

/**
 * Rep creates a new customer from the mobile /add-customer flow.
 *
 * Straight insert into `customers` + auto-creates a head-office
 * `customer_sites` row + logs a `customer.created_by_rep` event
 * for the admin's Live Ops feed. Tags `created_by_rep_id` so the
 * admin Customers list can surface a "NEW" badge on the row.
 *
 * Code generation: queries the current max(code) and adds 1.
 * Two reps creating simultaneously could collide on the same
 * number — the DB doesn't enforce uniqueness on `code` (it's a
 * display-only field) so the duplicate is harmless; admin sees
 * both and can renumber if needed.
 */
export async function createCustomer(
  input: NewCustomerInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }

  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) return { ok: false, error: "Customer name is required." };
  if (!address) return { ok: false, error: "Address is required." };

  // Identify the rep creating this row so the admin can surface
  // who added it. Anonymous (no session) → fail cleanly; the
  // page-level auth gate should prevent this from ever firing.
  const { data: userData } = await supabase.auth.getUser();
  const repId = userData.user?.id ?? null;
  if (!repId) return { ok: false, error: "You need to be signed in." };

  // Next available customer code = max(code) + 1. Cheap query —
  // the customers table is small and we only need one row.
  const { data: maxRow } = await supabase
    .from("customers")
    .select("code")
    .order("code", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextCode = ((maxRow as { code?: number } | null)?.code ?? 0) + 1;

  const id = buildCustomerId(name);
  const initials = initialsFromName(name);
  const color = BRAND_PALETTE[Math.floor(Math.random() * BRAND_PALETTE.length)];

  const { error } = await supabase.from("customers").insert({
    id,
    name,
    initials,
    color,
    code: nextCode,
    address,
    active: true,
    created_by_rep_id: repId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] create failed:", error.message);
    return { ok: false, error: error.message };
  }

  // Head-office site — every customer has at least one site. The
  // address from the form becomes that site's address. Lat/lng
  // stay null until Feature B's geocode-task workflow lands them.
  await supabase.from("customer_sites").insert({
    customer_id: id,
    name: "Head office",
    address,
    latitude: null,
    longitude: null,
    geofence_radius_m: 100,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    is_head_office: true,
  });

  // Audit event — surfaces in the admin Live Ops feed in real time
  // so managers see the new customer appear without refreshing.
  await logEvent({
    event_type: "customer.created",
    customer_id: id,
    message: `Rep added new customer: ${name}`,
    meta: { source: "mobile", rep_id: repId, address },
  });

  return { ok: true, id };
}
