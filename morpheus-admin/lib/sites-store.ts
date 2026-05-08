/**
 * Customer sites — every shift happens at a *site* belonging to a
 * customer. Customers can have one or many sites (e.g. a chain with
 * multiple stores, a warehouse + a retail outlet). The site holds the
 * address, coordinates, and the geofence radius used at check-in.
 *
 * Single-site customers behave just like the old single-address world:
 * the site is implicit, no picker, no extra UX. Multi-site customers
 * surface the picker wherever a shift is being created or edited.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { notifySaved, notifySaveError } from "./save-status";
import { logEvent } from "./events-store";

export interface CustomerSite {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listSitesForCustomer(
  customerId: string,
  opts?: { includeInactive?: boolean }
): Promise<CustomerSite[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  let q = supabase
    .from("customer_sites")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[sites] listForCustomer:", error.message);
    return [];
  }
  return (data ?? []) as CustomerSite[];
}

export async function listSitesByCustomerIds(
  customerIds: string[]
): Promise<Record<string, CustomerSite[]>> {
  if (!isSupabaseConfigured() || !supabase || customerIds.length === 0) return {};
  const { data, error } = await supabase
    .from("customer_sites")
    .select("*")
    .in("customer_id", customerIds)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[sites] listByCustomerIds:", error.message);
    return {};
  }
  const grouped: Record<string, CustomerSite[]> = {};
  for (const row of (data ?? []) as CustomerSite[]) {
    (grouped[row.customer_id] ||= []).push(row);
  }
  return grouped;
}

export async function getSite(id: string): Promise<CustomerSite | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("customer_sites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as CustomerSite) ?? null;
}

export interface NewSite {
  customer_id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
}

export async function createSite(
  s: NewSite
): Promise<{ ok: boolean; error?: string; site?: CustomerSite }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { data, error } = await supabase
    .from("customer_sites")
    .insert({
      customer_id: s.customer_id,
      name: s.name.trim(),
      address: s.address ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      geofence_radius_m: s.geofence_radius_m ?? null,
    })
    .select()
    .single();
  if (error) {
    notifySaveError(error.message, "site");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "customer.site_added",
    customer_id: s.customer_id,
    message: `Added site "${s.name.trim()}"`,
  });
  notifySaved("site");
  return { ok: true, site: data as CustomerSite };
}

export interface SitePatch {
  name?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
  active?: boolean;
}

export async function updateSite(
  id: string,
  patch: SitePatch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { error } = await supabase.from("customer_sites").update(patch).eq("id", id);
  if (error) {
    notifySaveError(error.message, "site");
    return { ok: false, error: error.message };
  }
  notifySaved("site");
  return { ok: true };
}

/**
 * Soft-delete by flipping active=false. Hard delete is only allowed
 * when no shifts (past or future) reference this site — checked
 * client-side by deleteSite below. Soft-delete is the safe default.
 */
export async function deactivateSite(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  return updateSite(id, { active: false });
}

export async function reactivateSite(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  return updateSite(id, { active: true });
}

/**
 * Hard delete. Refuses if any shift references the site (FK is
 * ON DELETE SET NULL but we surface the warning in the UI before
 * letting the manager nuke historical attribution).
 */
export async function deleteSite(
  id: string
): Promise<{ ok: boolean; error?: string; shiftsAttached?: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { count, error: cntErr } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("site_id", id);
  if (cntErr) {
    notifySaveError(cntErr.message, "site");
    return { ok: false, error: cntErr.message };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Site has ${count} shift${count === 1 ? "" : "s"} attached. Deactivate it instead.`,
      shiftsAttached: count ?? 0,
    };
  }
  const { error } = await supabase.from("customer_sites").delete().eq("id", id);
  if (error) {
    notifySaveError(error.message, "site");
    return { ok: false, error: error.message };
  }
  notifySaved("site");
  return { ok: true };
}

/**
 * Convenience: pick the site that should be the default when a UI
 * needs *one* site for a customer (e.g. the legacy address box on
 * the detail header). Returns the oldest active site, or null.
 */
export function defaultSiteOf(sites: CustomerSite[]): CustomerSite | null {
  const active = sites.filter((s) => s.active);
  if (active.length === 0) return null;
  return active[0];
}
