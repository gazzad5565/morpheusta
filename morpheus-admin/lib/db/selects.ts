/**
 * Shared PostgREST select strings (May 29 review — refactor #4).
 *
 * These embed/column strings were pasted verbatim into many store
 * methods (the full shift join alone appeared 6× in shifts-store, the
 * customer embed in shifts + tasks). Centralising them means a column
 * added to an embed is edited ONCE here, not hunted across every call
 * site — which is exactly the kind of drift that silently breaks a
 * joined read when one copy is missed.
 *
 * Pure strings — no behaviour change; each constant expands to the
 * identical text the call sites used before.
 */

/** Joined customer summary used wherever a row shows its customer. */
export const CUSTOMER_EMBED = "customers(id,name,initials,color,code)";

/** Joined customer_sites row, aliased `site` (shift reads). */
export const SITE_EMBED =
  "site:customer_sites(id,name,address,latitude,longitude,geofence_radius_m,contact_name,contact_phone,contact_email,notes)";

/** Full shift row + joined customer + site — the canonical shift read. */
export const SHIFT_SELECT = `*, ${CUSTOMER_EMBED}, ${SITE_EMBED}`;

/** customer_tasks columns + joined customer summary. */
export const TASK_SELECT = `id, customer_id, name, description, duration_min, compulsory, sort_order, created_at, photo_count, photos_compulsory, requires_signature, ${CUSTOMER_EMBED}`;
