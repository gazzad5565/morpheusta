/**
 * Adapter registry — maps an EntityType to its ImportAdapter.
 *
 * Phase D (May 25): replaced the Phase C stubs with the real adapters
 * living in lib/import-adapters/<entity>.ts. Each adapter's upsert
 * does the actual DB write (or, for users, calls /api/import/users
 * server-side so the service-role key + Resend send stay off the
 * client).
 */

import type { EntityType, ImportAdapter, RawRow } from "./import-types";
import { CUSTOMER_ADAPTER } from "./import-adapters/customer";
import { SITE_ADAPTER } from "./import-adapters/site";
import { REP_ADAPTER, MANAGER_ADAPTER } from "./import-adapters/user";
import { SHIFT_ADAPTER } from "./import-adapters/shift";

const REGISTRY: Record<EntityType, ImportAdapter> = {
  customer: CUSTOMER_ADAPTER,
  site: SITE_ADAPTER,
  rep: REP_ADAPTER,
  manager: MANAGER_ADAPTER,
  shift: SHIFT_ADAPTER,
};

export function getAdapter(entity: EntityType): ImportAdapter {
  return REGISTRY[entity];
}

/** Normalise a raw row through the column mapping: maps file-column
 *  headers back to adapter field keys. e.g. mapping {name:"Customer
 *  Name"} on a row {"Customer Name":"Acme"} returns {name:"Acme"}.
 *  Unmapped fields are absent from the output. */
export function normalizeRow(
  raw: RawRow,
  mapping: Record<string, string>
): RawRow {
  const out: RawRow = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    const v = raw[header];
    out[field] = (v ?? "").toString();
  }
  return out;
}
