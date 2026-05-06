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
}

export interface Task {
  id: string;
  name: string;
  compulsory: boolean;
  duration: number;
  description: string;
  kind?: "task" | "break";
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
