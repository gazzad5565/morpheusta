/**
 * zod schemas for DB row shapes (May 29 review — refactor #11).
 *
 * One schema per table-row shape, used by the stores via
 * lib/db/validate.ts to turn silent `as T` casts into validated reads
 * that LOG schema drift. Unknown columns are stripped (default zod
 * object behaviour) so a `select('*')` returning extra columns never
 * trips validation — only a KNOWN column with the wrong type, or a
 * missing required column, is treated as drift.
 *
 * Rollout note: this starts with the customers row (the store behind
 * the May 29 region bug). The remaining stores adopt the same
 * schema-per-row pattern incrementally.
 */

import { z } from "zod";

/** `customers` row — mirrors lib/customers-store DbRow. */
export const customerRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  color: z.string(),
  code: z.string(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  active: z.boolean().nullable(),
  geofence_radius_m: z.number().nullable(),
  location_exceptions_enabled: z.boolean().nullable(),
  timing_exceptions_enabled: z.boolean().nullable(),
  logo_url: z.string().nullable(),
  created_by_rep_id: z.string().nullable(),
  created_at: z.string().nullable().optional(),
  geocode_status: z
    .enum(["pending", "done", "failed", "skipped"])
    .nullable()
    .optional(),
  coords_source: z
    .enum(["manual", "address_geocode", "rep_pinned"])
    .nullable()
    .optional(),
  customer_group: z.string().nullable().optional(),
  store_type: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export type CustomerRow = z.infer<typeof customerRowSchema>;
