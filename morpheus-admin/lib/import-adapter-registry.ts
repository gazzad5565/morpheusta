/**
 * Adapter registry — maps an EntityType to its ImportAdapter.
 *
 * Phase C ships STUB adapters: they have real requiredFields /
 * optionalFields / fieldLabels / dedupKey / validate so the column-
 * mapping + preview UI works end-to-end, but their upsert() throws
 * "Phase D not implemented" so the Commit button surfaces a clear
 * "the writes aren't wired up yet" message.
 *
 * Phase D will replace each stub with the real adapter living in
 * lib/import-adapters/<entity>.ts. The hub doesn't care — it just
 * looks up the adapter for the picked entity.
 */

import type {
  EntityType,
  ImportAdapter,
  RawRow,
  UpsertOutcome,
} from "./import-types";

function notImplemented(entity: EntityType): () => Promise<UpsertOutcome> {
  return async () => {
    throw new Error(
      `Import for ${entity} isn't wired up yet (Phase D). The preview + validation work; the Commit button is the next thing to ship.`
    );
  };
}

const CUSTOMER_ADAPTER: ImportAdapter = {
  entity: "customer",
  requiredFields: ["code", "name"],
  optionalFields: ["initials", "color", "region", "city", "address"],
  fieldLabels: {
    code: "Customer code",
    name: "Customer name",
    initials: "Initials (2-3 chars)",
    color: "Brand colour (hex)",
    region: "Region",
    city: "City",
    address: "Address",
  },
  dedupKey: (row) => (row.code || "").trim().toLowerCase(),
  validate: (row) => {
    const errs: string[] = [];
    if (!row.code || !row.code.trim()) errs.push("code is required");
    if (!row.name || !row.name.trim()) errs.push("name is required");
    if (row.color && !/^#?[0-9a-f]{6}$/i.test(row.color.trim())) {
      errs.push("color must be a 6-char hex (e.g. #15B4D6)");
    }
    return errs;
  },
  upsert: notImplemented("customer"),
};

const SITE_ADAPTER: ImportAdapter = {
  entity: "site",
  requiredFields: ["customer_code", "site_name"],
  optionalFields: ["address", "city", "region"],
  fieldLabels: {
    customer_code: "Customer code (must exist)",
    site_name: "Site name (e.g. 'Head office')",
    address: "Address",
    city: "City",
    region: "Region",
  },
  dedupKey: (row) =>
    `${(row.customer_code || "").trim().toLowerCase()}::${(row.site_name || "").trim().toLowerCase()}`,
  validate: (row) => {
    const errs: string[] = [];
    if (!row.customer_code || !row.customer_code.trim()) {
      errs.push("customer_code is required");
    }
    if (!row.site_name || !row.site_name.trim()) {
      errs.push("site_name is required");
    }
    return errs;
  },
  upsert: notImplemented("site"),
};

function userAdapter(entity: "rep" | "manager"): ImportAdapter {
  return {
    entity,
    requiredFields: ["email", "name"],
    optionalFields: ["send_welcome_email"],
    fieldLabels: {
      email: "Email address",
      name: "Full name",
      send_welcome_email: "Send welcome email (true/false — overrides default)",
    },
    dedupKey: (row) => (row.email || "").trim().toLowerCase(),
    validate: (row) => {
      const errs: string[] = [];
      const email = (row.email || "").trim();
      if (!email) errs.push("email is required");
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errs.push(`email "${email}" doesn't look valid`);
      }
      if (!row.name || !row.name.trim()) errs.push("name is required");
      return errs;
    },
    upsert: notImplemented(entity),
  };
}

const SHIFT_ADAPTER: ImportAdapter = {
  entity: "shift",
  requiredFields: [
    "customer_code",
    "rep_email",
    "start_date",
    "start_time",
    "end_time",
    "recurrence",
  ],
  optionalFields: ["end_date", "days_of_week"],
  fieldLabels: {
    customer_code: "Customer code (must exist)",
    rep_email: "Rep email (must exist)",
    start_date: "Start date (YYYY-MM-DD)",
    end_date: "End date (YYYY-MM-DD) — required for weekly recurrence",
    days_of_week: "Days of week (Mon|Wed|Fri) — required for weekly recurrence",
    start_time: "Start time (HH:MM, 24h)",
    end_time: "End time (HH:MM, 24h)",
    recurrence: "Recurrence (once | weekly)",
  },
  dedupKey: (row) =>
    `${(row.customer_code || "").trim().toLowerCase()}::${(row.rep_email || "").trim().toLowerCase()}::${(row.start_date || "").trim()}::${(row.start_time || "").trim()}`,
  validate: (row) => {
    const errs: string[] = [];
    if (!row.customer_code || !row.customer_code.trim()) {
      errs.push("customer_code is required");
    }
    if (!row.rep_email || !row.rep_email.trim()) {
      errs.push("rep_email is required");
    }
    if (!row.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date.trim())) {
      errs.push("start_date must be ISO format (YYYY-MM-DD)");
    }
    if (
      row.end_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date.trim())
    ) {
      errs.push("end_date must be ISO format (YYYY-MM-DD)");
    }
    const startT = (row.start_time || "").trim();
    const endT = (row.end_time || "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startT)) {
      errs.push("start_time must be HH:MM (24h)");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endT)) {
      errs.push("end_time must be HH:MM (24h)");
    }
    if (
      /^([01]\d|2[0-3]):[0-5]\d$/.test(startT) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(endT) &&
      startT >= endT
    ) {
      errs.push("end_time must be after start_time");
    }
    const recurrence = (row.recurrence || "once").trim().toLowerCase();
    if (recurrence !== "once" && recurrence !== "weekly") {
      errs.push("recurrence must be 'once' or 'weekly'");
    }
    if (recurrence === "weekly") {
      if (!row.end_date) errs.push("weekly recurrence requires end_date");
      if (!row.days_of_week) errs.push("weekly recurrence requires days_of_week");
    }
    return errs;
  },
  upsert: notImplemented("shift"),
};

const REGISTRY: Record<EntityType, ImportAdapter> = {
  customer: CUSTOMER_ADAPTER,
  site: SITE_ADAPTER,
  rep: userAdapter("rep"),
  manager: userAdapter("manager"),
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
