/**
 * User import adapter (Phase D — D3 rep + D4 manager, May 25).
 *
 * One file, two adapters via the role param. Dedup key = email
 * (lowercased). Generates a 12-char password server-side, calls the
 * service-role /api/import/users route to create the auth user +
 * profile, then optionally fires the welcome email via Resend (the
 * server route handles the email send so the API key stays
 * server-only).
 *
 * Skip mode: existing user with this email = skipped.
 * Update mode: existing user = update name + role (but does NOT
 * touch their password — that's the job of the "Email this user"
 * button on the user's edit page, which respects whether the
 * manager wants to regenerate or just resend an invite link).
 */

import { supabase } from "@/lib/supabase";
import type {
  DuplicateMode,
  ImportAdapter,
  RawRow,
  UpsertOutcome,
} from "@/lib/import-types";

/** Client-side request shape for POST /api/import/users. The server
 *  handles the auth user creation + optional welcome email. */
async function callImportUsersRoute(payload: {
  email: string;
  name: string;
  role: "rep" | "manager";
  send_welcome_email: boolean;
  mode: DuplicateMode;
  /** May 27 — optional rep_type category. Server validates against
   *  app_settings.rep_types and rejects unknown values with a clear
   *  error message that lists the available types. */
  rep_type?: string | null;
  manager_type?: string | null;
}): Promise<{
  ok: boolean;
  outcome?: UpsertOutcome;
  error?: string;
  password?: string;
  emailSent?: boolean;
}> {
  if (!supabase) {
    return { ok: false, error: "Supabase not configured" };
  }
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const r = await fetch("/api/import/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const json = await r.json();
  if (!r.ok || !json.ok) {
    return { ok: false, error: json.error || `HTTP ${r.status}` };
  }
  return {
    ok: true,
    outcome: json.outcome,
    password: json.password,
    emailSent: json.emailSent,
  };
}

function userAdapter(role: "rep" | "manager"): ImportAdapter {
  // Managers don't have a rep_type — only the rep adapter advertises
  // the column. (Managers import would silently ignore it anyway.)
  const isRep = role === "rep";
  return {
    entity: role,
    requiredFields: ["email", "name"],
    optionalFields: isRep
      ? ["send_welcome_email", "rep_type"]
      : ["send_welcome_email", "manager_type"],
    fieldLabels: {
      email: "Email address",
      name: "Full name",
      send_welcome_email:
        "Send welcome email (true/false — overrides the import-run default)",
      rep_type:
        "Rep type (Sales Rep / Merchandiser / Driver / … — must match a configured type)",
      manager_type:
        "Manager type (Owner / Operations / View only / … — must match a configured type)",
    },
    fieldKinds: {
      email: "id",
    },
    matchRule: `Each row is one ${role}. Two rows with the same email (case-insensitive) = duplicate. Existing users are matched by email.`,
    dedupKey: (row) => {
      const email = (row.email || "").trim().toLowerCase();
      return email ? `email:${email}` : "";
    },
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
    upsert: async (
      row: RawRow,
      mode: DuplicateMode
    ): Promise<UpsertOutcome> => {
      const email = row.email.trim().toLowerCase();
      const name = row.name.trim();
      // rep_type only meaningful for rep imports; managers don't have
      // one. Empty string => null (uncategorised).
      const repType = isRep
        ? ((row.rep_type || "").trim() || null)
        : null;
      // manager_type only meaningful for manager imports (May 29).
      const managerType = !isRep
        ? ((row.manager_type || "").trim() || null)
        : null;
      // Per-row override: if the CSV has a non-empty send_welcome_email
      // column, that wins over the import-run default. Run default is
      // applied server-side from the request body.
      const perRowOverride = (row.send_welcome_email || "").trim().toLowerCase();
      // Default to true on the client — server respects per-run default
      // when this is the default sentinel.
      const sendWelcome =
        perRowOverride === "" ? true : perRowOverride === "true" || perRowOverride === "yes" || perRowOverride === "1";

      const result = await callImportUsersRoute({
        email,
        name,
        role,
        send_welcome_email: sendWelcome,
        mode,
        rep_type: repType,
        manager_type: managerType,
      });

      if (!result.ok) {
        throw new Error(result.error || "user creation failed");
      }
      return result.outcome ?? "created";
    },
  };
}

export const REP_ADAPTER: ImportAdapter = userAdapter("rep");
export const MANAGER_ADAPTER: ImportAdapter = userAdapter("manager");
