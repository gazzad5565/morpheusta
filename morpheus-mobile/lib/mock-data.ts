/**
 * Type exports only.
 *
 * The mobile app used to ship with mock arrays (SAMPLE.shifts, ALL_CUSTOMERS,
 * ACTIVE_SAMPLE_TASKS, LIBRARY_DATA) so the UI could render before the
 * Supabase wiring was done. All of those are gone now — every page reads
 * from the DB. The shapes below are kept here because various pages still
 * import them as types.
 */

export interface Shift {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  start: string;
  end: string;
  distance: string;
  /** Base64 data URL of the customer's logo. Optional — when present
   *  the rep-side avatar tile renders the logo instead of the coloured
   *  initials. Set on the admin-side customer edit form; travels with
   *  every shift row via the customers join. */
  logoUrl?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  region: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
  /** Per-customer override for off-site/geofence exceptions.
   *  null = inherit org-wide app_settings.location_exceptions_enabled. */
  location_exceptions_enabled?: boolean | null;
  /** Per-customer override for late/early timing exceptions.
   *  null = inherit org-wide app_settings.timing_exceptions_enabled. */
  timing_exceptions_enabled?: boolean | null;
  /** Customer logo as a base64 data URL. Set from the admin; the rep
   *  app shows it on shift cards and the customer picker in place of
   *  the coloured-initials tile. */
  logo_url?: string | null;
}

export interface Task {
  id: string;
  name: string;
  compulsory: boolean;
  duration: number;
  description: string;
  kind?: "task" | "break";
  /** Number of photos the rep must capture during this task. 0 =
   *  no photos. Set by admin per-task on the customer-edit page. */
  photoCount?: number;
  /** When photoCount > 0, whether all N photos are required to
   *  mark the task complete. Default true. */
  photosCompulsory?: boolean;
  /** When true, the rep must capture a customer signature on the
   *  in-app signature pad before this task can be marked complete.
   *  Independent of photoCount — a task can require photos and/or
   *  signature. Feature D (May 13). */
  requiresSignature?: boolean;
}

export interface LibFile {
  id: string;
  name: string;
  modified: string;
  size: string;
  isNew: boolean;
  type: "pdf" | "doc";
}

export interface LibImage {
  id: string;
  name: string;
  modified: string;
  isNew: boolean;
  swatch: string;
}
