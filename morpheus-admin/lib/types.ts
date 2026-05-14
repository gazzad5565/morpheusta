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
  region: string;
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
}

/**
 * Minimal Rep shape used by `<RepAvatar />`. The full Profile shape
 * lives in lib/profiles-store.ts — components that need more fields
 * should import that, not this.
 */
export interface Rep {
  initials: string;
}
