/**
 * Shared domain types for the admin app.
 *
 * Stripped during the stabilisation pass — this file used to mirror the
 * shape of the original mock-data arrays (Rep, Shift, FeedItem,
 * AuditEntry, etc). All of those are gone now and the types travel
 * with their own stores (e.g. ShiftRow lives in lib/shifts-store.ts).
 *
 * What survived: Customer (used by half the app) and a tiny Rep shape
 * used only by the avatar component.
 */

export interface Customer {
  id: string;
  name: string;
  initials: string;
  code: string;
  /** Tenant-defined region tag (e.g. "Gauteng"). Vocabulary in
   *  app_settings.regions. Pre-Phase-4 rows may carry legacy values
   *  like "North" / "South" that aren't in the current vocab — the
   *  edit form preserves them so they don't get blown away on save. */
  region: string;
  /** Tenant-defined customer cohort tag (e.g. "Premium", "Spaza").
   *  Vocabulary in app_settings.groups. NULL = unassigned. Mariska
   *  G5a, May 28 (Gary's correction: region + group are CUSTOMER
   *  attributes, not user attributes — the column on profiles was
   *  reverted same day). */
  customerGroup?: string | null;
  sites: number;
  geofence: number;
  shiftsThisWeek: number;
  color: string;
  tier?: "Premium" | "Standard";
  address?: string;
  latitude?: number;
  longitude?: number;
  active?: boolean;
  /** Per-customer override for off-site/geofence exceptions.
   *  null = inherit org-wide app_settings.location_exceptions_enabled. */
  locationExceptionsEnabled?: boolean | null;
  /** Per-customer override for late/early timing exceptions.
   *  null = inherit org-wide app_settings.timing_exceptions_enabled. */
  timingExceptionsEnabled?: boolean | null;
  /** Base64 data URL of the customer logo (small compressed JPEG).
   *  Uploaded from the admin customer-edit form. The mobile rep app
   *  renders this in place of the coloured-initials tile when set.
   *  Null = use the initials-tile fallback. See compressCustomerLogo
   *  in customers-store.ts. */
  logoUrl?: string | null;
  /** Set when a rep created the customer from the mobile
   *  /add-customer flow. NULL = manager-created. Drives the "NEW"
   *  badge on the admin /customers list, which clears once a
   *  manager opens the customer's detail page.
   *  See db/migrations/2026_05_13_customers_created_by_rep.sql. */
  createdByRepId?: string | null;
  /** ISO timestamp from the `customers.created_at` column. Pulled
   *  by listCustomers + getCustomer so the admin list can sort and
   *  filter by "recently added" without a separate query. */
  createdAt?: string;
  /** Background-geocoder status from the Phase A migration. 'pending'
   *  = waiting in the cron's queue; 'done' = has lat/lng; 'failed' =
   *  Nominatim couldn't resolve the address; 'skipped' = no address
   *  to geocode. The Phase E cron drains 'pending' rows once per
   *  minute. Manual address edits flip the row back to 'pending'. */
  geocodeStatus?: "pending" | "done" | "failed" | "skipped" | null;
  /** Why this customer has its current lat/lng. NULL for legacy /
   *  pre-May-28 rows. 'manual' = admin curated; 'address_geocode' =
   *  Phase E cron resolved from address text (potentially stale);
   *  'rep_pinned' = field rep dropped a GPS pin via /active
   *  geocode-task card (coords trustworthy, address may not match).
   *  Drives the "Pinned by rep — confirm address" chip on the
   *  customer detail page. Mariska B4, May 28. */
  coordsSource?: "manual" | "address_geocode" | "rep_pinned" | null;
}

/**
 * Minimal Rep shape used by `<RepAvatar />`. The full Profile shape
 * lives in lib/profiles-store.ts — components that need more fields
 * should import that, not this.
 */
export interface Rep {
  initials: string;
}
