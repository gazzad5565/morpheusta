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
  /** Optional — the typed address. Acts as both the site address
   *  string AND the input to a "Geocode address" path. Either this
   *  OR coords (lat/lng) must be present; createCustomer validates
   *  that explicitly. */
  address?: string;
  /** Optional pinned latitude. Set when the rep tapped "Use my
   *  current location" or "Geocode address" on the form. Locks
   *  independently of the address text — the rep can edit the
   *  display label freely while these coords remain the
   *  geofence's source of truth. */
  latitude?: number | null;
  longitude?: number | null;
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
  const address = (input.address ?? "").trim();
  const lat = input.latitude;
  const lng = input.longitude;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  if (!name) return { ok: false, error: "Customer name is required." };
  if (!address && !hasCoords) {
    return {
      ok: false,
      error:
        "Add an address OR pin the location — one of the two is needed so your manager can find the customer.",
    };
  }

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

  // Persist coords on both parent + child rows when the rep pinned
  // a location (either via GPS or address-geocode). Mirrors what
  // Feature B's geocode-task card does AFTER the fact, just shifted
  // earlier in the lifecycle — when the rep already knows where the
  // customer is, why force them through an extra visit to set it.
  const persistLat = hasCoords ? lat : null;
  const persistLng = hasCoords ? lng : null;

  const { error } = await supabase.from("customers").insert({
    id,
    name,
    initials,
    color,
    code: nextCode,
    address: address || null,
    latitude: persistLat,
    longitude: persistLng,
    active: true,
    created_by_rep_id: repId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] create failed:", error.message);
    return { ok: false, error: error.message };
  }

  // Head-office site — every customer has at least one site. The
  // address from the form becomes that site's address. Coords land
  // here too when the rep pinned at creation time, so the
  // geofenced check-in works on the very first visit. If the rep
  // only typed an address with no pin, lat/lng stay null and
  // Feature B's geocode card surfaces on the next /active.
  //
  // No is_head_office boolean — the schema uses the name 'Head
  // office' itself as the "primary site" signal (the customer_sites
  // 2026-05-08 migrations). Sticking literal-name parity with the
  // admin's createCustomer keeps single-site rendering happy
  // (the UI hides the site label when name == 'Head office').
  //
  // CRITICAL: this insert HAS to succeed or the customer is broken
  // (no site = no /shifts/new picker entry = admin can't schedule
  // against them). If it fails we roll back the customer row and
  // surface the error to the rep so they can retry.
  const { error: siteErr } = await supabase
    .from("customer_sites")
    .insert({
      customer_id: id,
      name: "Head office",
      address: address || null,
      latitude: persistLat,
      longitude: persistLng,
      geofence_radius_m: 100,
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
    });
  if (siteErr) {
    // Roll back the customer row so the rep can retry cleanly
    // instead of seeing an orphan customer in admin with "no sites".
    await supabase.from("customers").delete().eq("id", id);
    // eslint-disable-next-line no-console
    console.warn("[customers] site insert failed:", siteErr.message);
    return {
      ok: false,
      error: `Couldn't save site for this customer (${siteErr.message}). Please try again.`,
    };
  }

  // Audit event — surfaces in the admin Live Ops feed in real time
  // so managers see the new customer appear without refreshing.
  await logEvent({
    event_type: "customer.created",
    customer_id: id,
    message: `Rep added new customer: ${name}`,
    meta: {
      source: "mobile",
      rep_id: repId,
      address,
      // Tag whether coords were pinned at creation so the admin
      // can tell at a glance if this customer arrived "ready to
      // visit" vs "needs a geocode task later".
      pinned: hasCoords ? true : false,
    },
  });

  // When the rep pinned coords at create-time, also fire the
  // standard customer.geocoded event so the Live Ops feed shows
  // both the creation AND the location in the same way as the
  // Feature B card does. Keeps reporting consistent regardless of
  // when geocoding happened.
  if (hasCoords) {
    await logEvent({
      event_type: "customer.geocoded",
      customer_id: id,
      message: `Rep pinned location for new customer at creation`,
      meta: {
        latitude: persistLat,
        longitude: persistLng,
        source: "create-form",
        rep_id: repId,
      },
    });
  }

  return { ok: true, id };
}

// ─── Rep-driven geocoding (Feature B — May 13) ──────────────────────

/**
 * Geocode an address string by hitting the local /api/geocode
 * proxy (Nominatim under the hood). Returns null on failure so
 * callers can fall back to "use my current location".
 */
export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as
      | { latitude: number; longitude: number; displayName: string }
      | { error: string };
    if ("error" in json) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * Write coords to a customer_sites row + bubble them up to the
 * parent customers row if that's still missing them. Logs an
 * audit event so the admin sees how/where the geocode happened
 * (rep GPS vs typed address).
 *
 * Used by /active's geocode-task card when the rep completes
 * the "set this customer's location" prompt.
 */
export async function setCustomerSiteCoords(args: {
  /** Null when the shift was scheduled against a customer that
   *  doesn't have a customer_sites row yet (legacy data, or rep-
   *  created customer whose auto-site creation missed). In that
   *  case we look up the customer's primary site OR create one,
   *  then write the coords against it — so the rep can ALWAYS
   *  self-pin a location and never has to "flag the manager". */
  siteId: string | null;
  customerId: string;
  latitude: number;
  longitude: number;
  /** "gps"     — used the rep's current device location (most
   *              accurate when actually on-site)
   *  "address" — geocoded the customer's typed address. */
  source: "gps" | "address";
  /** Friendly text shown in the audit event. The display name
   *  from the geocoder, or "Rep's GPS" for the GPS path. */
  resolvedDescription: string;
  /** Optional site name supplied by the rep in the /active geocode
   *  card. When present we update `customer_sites.name` AND, if
   *  the site currently has no `address`, synthesise one so the
   *  admin /customers overview + mobile /active dashboard both
   *  show a meaningful location label instead of "no address yet".
   *  May 14 — Gary asked us to force a site name on rep-geocoded
   *  sites because otherwise they end up as "Main" with a pin and
   *  no human-readable label anywhere. */
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const { customerId, latitude, longitude, source, resolvedDescription } = args;
  let { siteId } = args;
  const cleanName = (args.name || "").trim();

  // Resolve a real siteId when the caller didn't have one. Two
  // sub-steps:
  //   (a) try to find the customer's primary site (active first)
  //   (b) if none exists, create a new "Head office" site
  // This is what makes the rep-side flow tolerant of legacy data
  // where shifts.site_id is null + customers have no site rows.
  if (!siteId) {
    const { data: existingSite } = await supabase
      .from("customer_sites")
      .select("id")
      .eq("customer_id", customerId)
      .order("active", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    siteId = (existingSite as { id?: string } | null)?.id ?? null;
    if (!siteId) {
      const { data: created, error: createErr } = await supabase
        .from("customer_sites")
        .insert({
          customer_id: customerId,
          name: cleanName || "Head office",
          latitude,
          longitude,
          geofence_radius_m: 100,
        })
        .select("id")
        .single();
      if (createErr) return { ok: false, error: createErr.message };
      siteId = (created as { id: string } | null)?.id ?? null;
      if (!siteId) {
        return { ok: false, error: "Couldn't create a site for this customer." };
      }
    }
  }

  // 1. Update the customer_sites row — this is the one mobile uses
  //    for the geofence on check-in/out. When a name is supplied
  //    we update the name too. We ALSO populate `address` (if null)
  //    with a synthesised label so downstream UIs that gate on
  //    "is there an address?" stop saying "no address yet" once
  //    the rep has dropped a pin.
  const syntheticAddress = cleanName
    ? `${cleanName} · Pinned ${source === "gps" ? "via rep GPS" : "via address geocode"}`
    : `Pinned location · ${source === "gps" ? "rep GPS" : "address geocode"}`;
  const siteUpdate: Record<string, unknown> = { latitude, longitude };
  if (cleanName) siteUpdate.name = cleanName;
  // Pull the existing site row first so we only overwrite address /
  // name when they're empty — never stomp a manager's curated value.
  const { data: existing } = await supabase
    .from("customer_sites")
    .select("address")
    .eq("id", siteId)
    .maybeSingle();
  const hasExistingAddress =
    !!(existing as { address?: string | null } | null)?.address;
  if (!hasExistingAddress) siteUpdate.address = syntheticAddress;
  const { error: siteErr } = await supabase
    .from("customer_sites")
    .update(siteUpdate)
    .eq("id", siteId);
  if (siteErr) return { ok: false, error: siteErr.message };

  // Backfill the shift's site_id link too so the next /active load
  // resolves the site through the normal join. We don't know which
  // shift the rep is on at this layer, so just patch every shift
  // for this customer + this rep that's missing a site_id. Cheap
  // (1–2 rows in practice). Service-role isn't needed — RLS lets
  // the rep update their own shifts.
  {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      await supabase
        .from("shifts")
        .update({ site_id: siteId })
        .eq("customer_id", customerId)
        .eq("rep_id", userId)
        .is("site_id", null);
    }
  }

  // 2. ALSO update the parent customers row if it's missing coords.
  //    Admin's customers page shows lat/lng on the customer overview;
  //    keeping them in sync avoids the awkward "site has coords,
  //    parent customer doesn't" state. Same address-fallback rule
  //    so the customer-level "no address" tile fills in too.
  const customerUpdate: Record<string, unknown> = { latitude, longitude };
  if (!hasExistingAddress) customerUpdate.address = syntheticAddress;
  await supabase
    .from("customers")
    .update(customerUpdate)
    .eq("id", customerId)
    .is("latitude", null);

  await logEvent({
    event_type: "customer.geocoded",
    customer_id: customerId,
    message: `Rep set location for customer (${source === "gps" ? "device GPS" : "address geocode"})`,
    meta: {
      site_id: siteId,
      latitude,
      longitude,
      source,
      resolved: resolvedDescription,
      site_name: cleanName || null,
    },
  });

  return { ok: true };
}
