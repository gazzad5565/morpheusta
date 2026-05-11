/**
 * Customers store — Phase 3.
 *
 * Reads & writes the `customers` table in Supabase. No mock fallback —
 * if Supabase isn't reachable or returns an error, callers see an empty
 * list (and the failure surfaces in the console).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logEvent } from "./events-store";
import { notifySaved, notifySaveError } from "./save-status";
import type { Customer } from "./types";

interface DbRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  region: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean | null;
  geofence_radius_m: number | null;
  location_exceptions_enabled: boolean | null;
  timing_exceptions_enabled: boolean | null;
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
    geofence: row.geofence_radius_m ?? 100,
    shiftsThisWeek: 0,
    tier: "Standard",
    address: row.address ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    active: row.active ?? true,
    locationExceptionsEnabled: row.location_exceptions_enabled,
    timingExceptionsEnabled: row.timing_exceptions_enabled,
  };
}

export async function listCustomers(): Promise<Customer[]> {
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

export async function getCustomer(id: string): Promise<Customer | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] get error:", error.message);
    return null;
  }
  return data ? rowToCustomer(data as DbRow) : null;
}

export interface NewCustomer {
  name: string;
  initials: string;
  color: string;
  code: number;
  region?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
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
    address: c.address || null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
  });
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  // Every customer needs a head-office site immediately — single-site
  // customers never see a site picker, so this auto-create is what
  // makes that invisible. Multi-site customers add more sites from
  // /customers/[id] → Sites tab afterwards.
  await supabase.from("customer_sites").insert({
    customer_id: id,
    name: "Head office",
    address: c.address || null,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    geofence_radius_m: 100,
  });
  await logEvent({
    event_type: "customer.created",
    customer_id: id,
    message: `Added customer ${c.name}`,
  });
  notifySaved("customer");
  return { ok: true, id };
}

export interface CustomerPatch {
  name?: string;
  code?: string;
  initials?: string;
  color?: string;
  region?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number;
  /** null = inherit org default · true/false = override. */
  location_exceptions_enabled?: boolean | null;
  timing_exceptions_enabled?: boolean | null;
}

export async function updateCustomer(
  id: string,
  patch: CustomerPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase.from("customers").update(patch).eq("id", id);
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }

  // Sync the address change down to the head-office site row.
  //
  // Background: every customer auto-creates a "Head office" site
  // on create (see createCustomer above). The customer-detail page
  // reads the address from `customer_sites`, not from `customers`,
  // because the multi-site rollout (May 8) treats sites as the
  // primary location entity. If we update customers.address without
  // syncing the head-office site, the detail page keeps showing
  // "No address yet — open Sites to add one" even though the
  // managers just typed an address into the customer-edit form.
  //
  // Only sync when the patch actually touched address / lat / lng.
  // The "head office" site is the oldest active site for this
  // customer — robust against a manager renaming the auto-created
  // "Head office" site to something else.
  const touchesAddress =
    patch.address !== undefined ||
    patch.latitude !== undefined ||
    patch.longitude !== undefined;
  if (touchesAddress) {
    const sitePatch: Record<string, unknown> = {};
    if (patch.address !== undefined) sitePatch.address = patch.address;
    if (patch.latitude !== undefined) sitePatch.latitude = patch.latitude;
    if (patch.longitude !== undefined) sitePatch.longitude = patch.longitude;
    // Find the oldest active site for this customer — that's the
    // head office whether or not it's still literally named that.
    const { data: site } = await supabase
      .from("customer_sites")
      .select("id")
      .eq("customer_id", id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (site?.id) {
      // Best-effort — don't fail the whole customer save if the
      // site sync hits an RLS edge case; the manager can re-edit
      // from the Sites tab. Log so the issue is visible.
      const { error: siteErr } = await supabase
        .from("customer_sites")
        .update(sitePatch)
        .eq("id", site.id);
      if (siteErr) {
        // eslint-disable-next-line no-console
        console.warn(
          "[customers] head-office site sync failed:",
          siteErr.message
        );
      }
    }
  }

  notifySaved("customer");
  return { ok: true };
}

export async function setCustomerActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: row } = await supabase
    .from("customers")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("customers").update({ active }).eq("id", id);
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  const name = (row as { name?: string } | null)?.name || "customer";
  await logEvent({
    event_type: active ? "customer.reactivated" : "customer.deactivated",
    customer_id: id,
    message: `${active ? "Reactivated" : "Deactivated"} ${name}`,
  });
  notifySaved("customer");
  return { ok: true };
}

export async function deleteCustomer(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data: row } = await supabase
    .from("customers")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const name = (row as { name?: string } | null)?.name || "a customer";
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "customer.deleted",
    message: `Deleted customer ${name}`,
  });
  notifySaved("customer removed");
  return { ok: true };
}

/**
 * Realtime subscription on the customers table — INSERT, UPDATE,
 * DELETE all trigger the callback. /customers list mounts this so
 * a new customer added by another manager appears in real time
 * without a tab refresh. Per-call channel name to avoid sharing
 * a single channel between subscribers.
 */
let _customersChannelCounter = 0;
export function subscribeCustomers(onChange: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) return () => {};
  _customersChannelCounter += 1;
  const channelName = `customers_live_${Date.now()}_${_customersChannelCounter}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "customers" },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
