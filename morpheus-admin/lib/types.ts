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
}

/**
 * Minimal Rep shape used by `<RepAvatar />`. The full Profile shape
 * lives in lib/profiles-store.ts — components that need more fields
 * should import that, not this.
 */
export interface Rep {
  initials: string;
}
