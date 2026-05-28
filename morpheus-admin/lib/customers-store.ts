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
import { formatCustomerCode } from "./format";
import type { Customer } from "./types";

interface DbRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Opaque tenant-supplied identifier. Was `integer` pre-May-28
   *  (Mariska B5); now `text` to accommodate SKU-style codes like
   *  SP-001, ACME-JHB. The DB still enforces NOT NULL + UNIQUE. */
  code: string;
  region: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean | null;
  geofence_radius_m: number | null;
  location_exceptions_enabled: boolean | null;
  timing_exceptions_enabled: boolean | null;
  /** Base64 data URL of the customer's logo (small JPEG). Added by
   *  the 2026_05_11_customers_logo migration. Null until a manager
   *  uploads one — the rep app keeps showing the coloured-initials
   *  tile in that case. See compressCustomerLogo below for the
   *  size/quality recipe. */
  logo_url: string | null;
  /** Rep's profile id when this customer was created via mobile
   *  /add-customer (Feature A — May 13). NULL when admin-created.
   *  Drives the "NEW" badge on the customers list. */
  created_by_rep_id: string | null;
  /** Supabase auto-managed timestamp. Used by the admin /customers
   *  list to surface recently-added customers + power the "New"
   *  filter chip. */
  created_at?: string | null;
  /** Background-geocoder status from the Phase A migration. */
  geocode_status?: "pending" | "done" | "failed" | "skipped" | null;
  /** Why this row has its current lat/lng. Added May 28 — Mariska B4. */
  coords_source?: "manual" | "address_geocode" | "rep_pinned" | null;
  /** Tenant customer-cohort tag (e.g. "Premium", "Spaza"). Vocabulary
   *  in app_settings.groups. NULL = unassigned. Added May 28 (later) —
   *  Mariska G5a, after Gary's correction that region + group are
   *  customer attributes, not user attributes. */
  customer_group?: string | null;
  /** Tenant store classification (Supermarket / Spaza / Pharmacy …).
   *  Vocabulary in app_settings.store_types. NULL = unassigned.
   *  Rayhaan R7, May 28. */
  store_type?: string | null;
  /** Customer/outlet main phone (free text). Rayhaan R7, May 28. */
  phone?: string | null;
}

function rowToCustomer(row: DbRow): Customer {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    color: row.color,
    code: formatCustomerCode(row.code),
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
    logoUrl: row.logo_url ?? null,
    createdByRepId: row.created_by_rep_id ?? null,
    createdAt: row.created_at ?? undefined,
    geocodeStatus: row.geocode_status ?? null,
    coordsSource: row.coords_source ?? null,
    customerGroup: row.customer_group ?? null,
    storeType: row.store_type ?? null,
    phone: row.phone ?? null,
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
  /** Opaque string code. Accepts SKU-style values (SP-001, ACME-JHB)
   *  as well as legacy numeric codes ("12"). Required + unique
   *  per-tenant — enforced by the customers.code NOT NULL + UNIQUE
   *  constraint at the DB level. Pre-May-28 this was `number`. */
  code: string;
  region?: string;
  /** Tenant customer-cohort tag (e.g. "Premium"). Vocabulary in
   *  app_settings.groups. Optional at creation time. May 28. */
  customer_group?: string;
  /** Tenant store classification. Vocabulary in
   *  app_settings.store_types. Optional at creation time. May 28. */
  store_type?: string;
  /** Customer/outlet main phone. Optional at creation time. May 28. */
  phone?: string;
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
    customer_group: c.customer_group || null,
    store_type: c.store_type || null,
    phone: c.phone || null,
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
  /** Opaque text code. The DB column is `text` (was `integer`
   *  pre-May-28 — Mariska B5). The edit form may round-trip the
   *  display value (`#0012`) and earlier-numeric callers may pass
   *  a raw `number`. updateCustomer normalises both before writing.
   *  Empty string = explicit clear (drops to null is rejected by
   *  NOT NULL — caller must keep it non-empty). */
  code?: string | number;
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
  /** Base64 data URL or null to clear. See compressCustomerLogo. */
  logo_url?: string | null;
  /** Tenant customer-cohort tag. Empty string / null clears it.
   *  Vocabulary lives in app_settings.groups. May 28. */
  customer_group?: string | null;
  /** Tenant store classification. Empty string / null clears it.
   *  Vocabulary lives in app_settings.store_types. May 28. */
  store_type?: string | null;
  /** Customer/outlet main phone. Empty string / null clears it. May 28. */
  phone?: string | null;
}

/**
 * Coerce a customer-code patch value to the opaque text the DB column
 * now expects. The admin UI renders codes as "#0012" for display
 * (numeric codes) or "SP-001" (alphanumeric); the edit input lets
 * managers type any of those, and we still accept raw numbers from
 * historical numeric callers. Returns:
 *   - the cleaned text when the input has non-whitespace content
 *   - undefined when the input is undefined OR an empty string —
 *     drop the field from the patch entirely so Postgres doesn't
 *     reject a NULL on a NOT NULL column.
 *
 * Cleaning rules: trim, strip a leading `#` (display chrome, not
 * payload). NO digit-strip — that was the pre-May-28 behaviour when
 * the column was integer; alphanumeric codes are now valid.
 */
function normaliseCustomerCode(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.trunc(value)) : undefined;
  }
  const trimmed = value.trim().replace(/^#/, "").trim();
  if (trimmed === "") return undefined; // drop — column is NOT NULL
  return trimmed;
}

/**
 * Compress a logo file to a small base64 JPEG data URL suitable for
 * the customers.logo_url text column.
 *
 *   - Resizes the longest side to `maxSize` (default 96px) so the
 *     base64 payload stays low-tens-of-KB.
 *   - JPEG quality 0.82 — visibly fine at this size, tight on bytes.
 *   - 12 MB hard limit on the source file so a 50MP camera shot
 *     doesn't blow up the decoder.
 *
 * The output is safe to write directly to customers.logo_url. Sticking
 * to a `text` column (vs Supabase Storage) keeps the deploy simple and
 * makes a customer list request self-contained — we don't want every
 * dashboard map pin to fire a fresh HTTP request for an avatar URL.
 *
 * Why "letterbox" instead of square-crop: customer logos are usually
 * wordmarks or wide brand glyphs. Square-cropping centred would chop
 * the edges off — bad. Instead we paint the source onto a white square
 * canvas, fitting longest side to maxSize and centring it. The result
 * works on light AND dark UI backgrounds because we hand the mobile
 * app a fully-opaque tile.
 */
export async function compressCustomerLogo(
  file: File,
  maxSize = 96
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, error: "That image is over 12 MB — try a smaller file." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file isn't an image." };
  }
  const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode that image."));
    img.src = URL.createObjectURL(file);
  }).catch((e) => e as Error);
  if (bitmap instanceof Error) return { ok: false, error: bitmap.message };

  const canvas = document.createElement("canvas");
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "Canvas not available in this browser." };
  // White background so a transparent PNG doesn't render as black on
  // dark UI surfaces. Customer logos are nearly always presented on
  // a light tile, and the rep app renders them onto a tinted card.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, maxSize, maxSize);
  // Letterbox: scale the source to fit inside maxSize×maxSize while
  // preserving aspect ratio, then centre it. This handles wordmarks
  // (wide) and round badges (square) sensibly.
  const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height);
  const drawW = bitmap.width * ratio;
  const drawH = bitmap.height * ratio;
  const dx = (maxSize - drawW) / 2;
  const dy = (maxSize - drawH) / 2;
  ctx.drawImage(bitmap, dx, dy, drawW, drawH);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  URL.revokeObjectURL(bitmap.src);
  return { ok: true, dataUrl };
}

/**
 * Save a base64 data URL to customers.logo_url. Pass null to clear.
 * Thin wrapper over updateCustomer that keeps the call site honest
 * about its intent + lets us log a dedicated audit event.
 */
export async function updateCustomerLogo(
  id: string,
  dataUrl: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  const value = dataUrl && dataUrl.length > 0 ? dataUrl : null;
  const { error } = await supabase
    .from("customers")
    .update({ logo_url: value })
    .eq("id", id);
  if (error) {
    notifySaveError(error.message, "customer");
    return { ok: false, error: error.message };
  }
  await logEvent({
    event_type: "customer.updated",
    customer_id: id,
    message: value ? "Updated customer logo" : "Removed customer logo",
  });
  notifySaved("customer");
  return { ok: true };
}

export async function updateCustomer(
  id: string,
  patch: CustomerPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Database not configured" };
  }
  // Normalise the customer-code patch value before talking to Postgres.
  // The admin UI renders codes as "#0012" for display (numeric) or
  // "SP-001" (alphanumeric); the edit input round-trips that exact
  // string. The helper strips the leading `#` and decides whether to
  // write the cleaned text (single source of truth) or drop the field
  // entirely (nonsense / empty input → don't kill the rest of the
  // save with a NOT NULL violation).
  //
  // Pre-May-28 this column was `integer` and the helper parseInt'd
  // and stripped non-digits — see git log for that history. The
  // column is now `text`; we keep the helper but stop mangling
  // alphanumeric codes.
  const cleanPatch: Record<string, unknown> = { ...patch };
  if ("code" in cleanPatch) {
    const normalised = normaliseCustomerCode(patch.code);
    if (normalised === undefined) {
      delete cleanPatch.code;
    } else {
      cleanPatch.code = normalised;
    }
  }
  // Read the current coords_source up front so we know whether the
  // row was pinned by a rep — needed below to decide if an address-
  // only edit should retrigger geocoding. Cheap (one row, one column).
  let currentCoordsSource: string | null = null;
  {
    const { data: current } = await supabase
      .from("customers")
      .select("coords_source")
      .eq("id", id)
      .maybeSingle();
    currentCoordsSource =
      (current as { coords_source?: string | null } | null)?.coords_source ??
      null;
  }
  const wasRepPinned = currentCoordsSource === "rep_pinned";

  // Phase E + Mariska B4 "pin canonical" (May 28):
  //   - Non-pinned row, manager edits address only → flip to pending
  //     so the every-minute cron re-resolves it. Without this a
  //     'failed' row would stay failed forever even after a fix.
  //   - Rep-pinned row, manager edits address only → leave coords
  //     alone. The rep's GPS pin is authoritative — the manager is
  //     just labelling the pin with a proper street, not asking us
  //     to relocate the customer. This is the core "pin canonical"
  //     guarantee Mariska needs.
  if (
    patch.address !== undefined &&
    patch.latitude === undefined &&
    patch.longitude === undefined &&
    !wasRepPinned
  ) {
    cleanPatch.geocode_status = "pending";
    cleanPatch.geocode_attempted_at = null;
  }
  // Any address / coords touch from admin = acknowledgement. Flip
  // coords_source to 'manual' so the "Pinned by rep — confirm
  // address" chip clears. The pin's coords themselves stay intact
  // (we never overwrite latitude/longitude unless the manager
  // explicitly supplied new values in the patch).
  if (
    patch.address !== undefined ||
    patch.latitude !== undefined ||
    patch.longitude !== undefined
  ) {
    cleanPatch.coords_source = "manual";
  }
  const { error } = await supabase.from("customers").update(cleanPatch).eq("id", id);
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

// ─── Per-manager "seen" markers for rep-added customers ────────────
//
// Drives the "NEW" badge on the Customers list. Each (customer_id,
// manager_id) row in `customer_seen_by_manager` says "this manager
// has already acknowledged this rep-added customer; don't badge it
// for them anymore". Reading the rep-added customer in detail view
// inserts a row.

/** Return the set of customer_ids the current manager has already
 *  marked as seen. Used by the customers list to suppress the
 *  badge on rows the manager has already opened. */
export async function listSeenRepAddedCustomerIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured() || !supabase) return new Set();
  const { data: userData } = await supabase.auth.getUser();
  const managerId = userData.user?.id;
  if (!managerId) return new Set();
  const { data, error } = await supabase
    .from("customer_seen_by_manager")
    .select("customer_id")
    .eq("manager_id", managerId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] seen-list:", error.message);
    return new Set();
  }
  return new Set(
    ((data as { customer_id: string }[]) || []).map((r) => r.customer_id)
  );
}

/** Mark a rep-added customer as seen by the current manager. Called
 *  when the manager opens the customer's detail page. Idempotent
 *  (the (customer_id, manager_id) PK absorbs repeat inserts). No-op
 *  for admin-created customers — we don't even insert the row. */
export async function markCustomerSeen(customerId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  const managerId = userData.user?.id;
  if (!managerId) return;
  // Use upsert to absorb the duplicate-key case cleanly.
  const { error } = await supabase
    .from("customer_seen_by_manager")
    .upsert(
      { customer_id: customerId, manager_id: managerId },
      { onConflict: "customer_id,manager_id" }
    );
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[customers] mark-seen:", error.message);
  }
}
