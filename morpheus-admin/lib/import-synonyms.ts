/**
 * Synonyms registry — used by the import hub to auto-map a file's
 * column headers to adapter field keys.
 *
 * Each entity has a map of {fieldKey -> [synonym, synonym, ...]} where
 * synonyms are CASE-INSENSITIVE strings the auto-mapper compares
 * (post-trim) against the file's column headers. First match wins.
 *
 * Adding a synonym is cheap — drop it in the right entity's list. If
 * a file lands with an unrecognised header, the user picks the right
 * field manually from a dropdown in the Map Columns step; that
 * choice is per-import (not persisted) since header conventions vary
 * between clients.
 */

import type { EntityType } from "./import-types";

/** Lowercase + collapse non-alphanum so "Customer Name" == "customer_name"
 *  == "customer-name" == "customername". Aggressive on purpose. */
export function normalizeHeader(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type SynonymMap = Record<string, string[]>;

const CUSTOMER_SYNONYMS: SynonymMap = {
  code: ["code", "customer code", "account code", "account number", "acct", "account #", "id"],
  name: ["name", "customer name", "account name", "company", "company name", "business name"],
  initials: ["initials", "short"],
  color: ["color", "colour", "hex", "brand color"],
  region: ["region", "area", "territory"],
  city: ["city", "town"],
  address: ["address", "street address", "street", "location", "physical address"],
};

const SITE_SYNONYMS: SynonymMap = {
  customer_code: ["customer code", "customer", "account code", "account #", "account number", "customer id"],
  site_name: ["site name", "site", "branch", "branch name", "store name", "store", "location name"],
  address: ["address", "site address", "street", "street address", "location"],
  city: ["city", "town"],
  region: ["region", "area", "territory"],
};

const USER_SYNONYMS: SynonymMap = {
  email: ["email", "e-mail", "email address", "mail"],
  name: ["name", "full name", "display name", "person", "rep name", "manager name"],
  // Optional. If set on the row, that takes precedence over the
  // settings-page default — useful when one CSV mixes "send" and
  // "don't send" rows.
  send_welcome_email: ["send welcome email", "send email", "email welcome"],
  // Optional. Only meaningful for rep imports; managers ignore it.
  // Server validates against the live app_settings.rep_types vocabulary
  // and rejects unknown values with a list of valid options.
  rep_type: ["rep type", "type", "category", "rep category", "role type"],
};

const SHIFT_SYNONYMS: SynonymMap = {
  customer_code: ["customer code", "customer", "account code", "account #", "account number"],
  rep_email: ["rep email", "rep", "assignee", "assigned to", "user email", "email"],
  start_date: ["start date", "start", "date", "from date", "shift date"],
  end_date: ["end date", "until", "to date", "through"],
  days_of_week: [
    "days of week",
    "days",
    "weekdays",
    "recurrence days",
    "day of week",
  ],
  start_time: ["start time", "from time", "time start", "begin"],
  end_time: ["end time", "to time", "time end", "finish"],
  recurrence: ["recurrence", "repeat", "pattern", "frequency"],
};

const REGISTRY: Record<EntityType, SynonymMap> = {
  customer: CUSTOMER_SYNONYMS,
  site: SITE_SYNONYMS,
  rep: USER_SYNONYMS,
  manager: USER_SYNONYMS,
  shift: SHIFT_SYNONYMS,
};

export function getSynonymsForEntity(entity: EntityType): SynonymMap {
  return REGISTRY[entity];
}

/**
 * Best-effort auto-map: returns {fieldKey -> matchingHeader} for every
 * field that found a header match. Headers not matched stay unmapped
 * and the UI shows them as "(ignore on import)" — the user can pick
 * a field manually from a dropdown.
 */
export function autoMap(
  entity: EntityType,
  headers: string[]
): Record<string, string> {
  const synonyms = getSynonymsForEntity(entity);
  // Pre-normalise headers once; map of normalized → original.
  const normalizedHeaders = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !normalizedHeaders.has(n)) normalizedHeaders.set(n, h);
  }
  const out: Record<string, string> = {};
  for (const [field, candidates] of Object.entries(synonyms)) {
    for (const candidate of candidates) {
      const n = normalizeHeader(candidate);
      const original = normalizedHeaders.get(n);
      if (original) {
        out[field] = original;
        break;
      }
    }
  }
  return out;
}
