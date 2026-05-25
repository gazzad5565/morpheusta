/**
 * Shared types for the import hub (Phase C+).
 *
 * The hub is entity-agnostic — it loads an ImportAdapter for the
 * entity the user picked and the rest of the flow (parse → map →
 * validate → preview → commit) reads from the adapter. Adding a new
 * importable entity later is a new adapter + adapter-registry entry,
 * not a page rewrite.
 */

export type EntityType = "customer" | "site" | "rep" | "manager" | "shift";

export const ENTITY_LABEL: Record<EntityType, string> = {
  customer: "Customers",
  site: "Sites",
  rep: "Reps",
  manager: "Managers",
  shift: "Shifts",
};

export const ENTITY_DESCRIPTION: Record<EntityType, string> = {
  customer:
    "Unique key: code (integer). Matching code = duplicate. No dependencies — customers can be imported standalone.",
  site: "Unique key: customer_code + site_name. Depends on customer (must already exist OR be in a customer import first).",
  rep: "Unique key: email. Auto-generated password; optional welcome email delivers credentials.",
  manager:
    "Unique key: email. Same as reps but with admin console access.",
  shift:
    "Unique key: customer_code + rep_email + date + start_time. Depends on customer AND rep (both must already exist). Weekly recurrence expands into N shifts.",
};

/** A row from the parsed file. Keys are the original column headers
 *  (post-trim, post-BOM-strip) and values are the raw cell strings. */
export type RawRow = Record<string, string>;

/** The user's column-mapping choices: maps each adapter field name to
 *  one of the parsed file's column headers (or "" for "ignore this
 *  field on this import"). */
export type ColumnMapping = Record<string, string>;

/** Result of running a row through validation. */
export interface RowValidation {
  /** Per-row errors. Empty array = valid. */
  errors: string[];
  /** True when the row matched an existing record (dedup-key collision).
   *  Use this to render the Skip / Update preview counts. */
  isDuplicate: boolean;
}

/** What an adapter does with a single normalized row. Phase D will
 *  implement these for real; Phase C ships stubs that throw. */
export type UpsertOutcome = "created" | "updated" | "skipped" | "failed";

/** Behaviour when a row's dedup key matches an existing record. */
export type DuplicateMode = "skip" | "update";

/** Per-field semantic role. Drives the badges in the Map step so the
 *  user can see at a glance which columns identify the row, which
 *  link it to other entities, and which are plain data. */
export type FieldKind = "id" | "link" | "data";

/** Per-entity adapter interface. Every adapter lives in
 *  lib/import-adapters/<entity>.ts and self-registers via the
 *  adapter registry. */
export interface ImportAdapter {
  entity: EntityType;
  /** Field keys that MUST be present and non-empty for a row to commit. */
  requiredFields: string[];
  /** Field keys that the user can map but aren't required. */
  optionalFields: string[];
  /** Human label per field for the column-mapping UI. */
  fieldLabels: Record<string, string>;
  /** Semantic role per field — id (unique identifier for this
   *  entity), link (references another entity that must already
   *  exist), or data (plain attribute). Drives the Map step badges
   *  + the "How matching works" callout. Fields not listed default
   *  to "data". */
  fieldKinds?: Record<string, FieldKind>;
  /** For fields with kind="link", which entity they link to. The
   *  Map step uses this to render "LINK → Customer" instead of just
   *  "LINK", so the user knows what must exist first. */
  linksTo?: Record<string, EntityType>;
  /** Plain-English summary of how dedup works for this entity. One
   *  sentence. Rendered in the Map step's matching-rules callout. */
  matchRule?: string;
  /** Compute the dedup key for a normalized row. Two rows with the
   *  same key are treated as the "same" record for duplicate detection. */
  dedupKey: (normalized: RawRow) => string;
  /** Synchronous per-row validation. Return error messages; empty
   *  array = row is valid. Does NOT check duplicate status — the hub
   *  separately calls dedupKey + checks the in-DB set. */
  validate: (normalized: RawRow) => string[];
  /** Commit one normalized row. Phase D implements; Phase C stubs throw.
   *  Returns the outcome label for the run's counts. */
  upsert: (normalized: RawRow, mode: DuplicateMode) => Promise<UpsertOutcome>;
}

/** Per-row state inside the Preview step. */
export interface PreviewRow {
  rowIndex: number;
  raw: RawRow;
  normalized: RawRow;
  errors: string[];
  isDuplicate: boolean;
  /** Predicted outcome based on errors + duplicate state + dup mode. */
  predicted: "create" | "update" | "skip" | "fail";
}

/** The full state the hub tracks between steps. */
export interface ImportRunState {
  entity: EntityType;
  filename: string | null;
  headers: string[];
  rows: RawRow[];
  mapping: ColumnMapping;
  duplicateMode: DuplicateMode;
  /** Per-entity boolean options. e.g. "sendWelcomeEmail" for rep/manager. */
  options: Record<string, boolean>;
  preview: PreviewRow[];
  /** Set after Commit runs. */
  result: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    runId: string | null;
    failures: PreviewRow[];
  } | null;
}

/** The five wizard steps. */
export type StepId = "source" | "map" | "settings" | "preview" | "result";

export const STEP_ORDER: StepId[] = [
  "source",
  "map",
  "settings",
  "preview",
  "result",
];

export const STEP_LABEL: Record<StepId, string> = {
  source: "Source",
  map: "Map columns",
  settings: "Settings",
  preview: "Preview",
  result: "Result",
};
