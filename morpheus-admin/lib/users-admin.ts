/**
 * Client-side helpers for /api/users.
 *
 * Each call attaches the current Supabase session's access token in
 * Authorization: Bearer …, so the server route can verify the caller
 * is a manager before doing anything sensitive.
 */

import { supabase } from "./supabase";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: "manager" | "rep";
  /** Optional rep category at creation time (Sales Rep / Merchandiser
   *  / …). Empty string / null means "uncategorised — allow all". Only
   *  applied when role=rep; ignored server-side otherwise. May 28. */
  rep_type?: string | null;
  /** Optional manager category at creation time (Owner / Operations /
   *  View only / …). Empty string / null means "unrestricted". Only
   *  applied when role=manager. May 28. */
  manager_type?: string | null;
  /** Optional region tag (e.g. "Gauteng"). Vocabulary in
   *  app_settings.regions. Empty / null = unassigned. Mariska G2
   *  (May 28). */
  region?: string | null;
  /** Optional work group tag (e.g. "Cape route"). DB column is
   *  group_name (SQL reserved-word avoidance); the wire shape is
   *  also group_name. Vocabulary in app_settings.groups. May 28. */
  group_name?: string | null;
  /** Optional hire date (YYYY-MM-DD). Distinct from created_at.
   *  Empty / null = unknown. May 28. */
  hire_date?: string | null;
}

export async function createUser(
  input: CreateUserInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const json = (await r.json()) as { ok: boolean; error?: string; id?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface UpdateUserInput {
  id: string;
  email?: string;
  password?: string;
  name?: string;
  role?: "manager" | "rep";
  /** Rep category (Sales Rep / Merchandiser / Driver / …). Passing
   *  an empty string clears the category. Ignored when role=manager. */
  rep_type?: string | null;
  /** Manager category (Owner / Operations / View only / …). Empty
   *  string / null clears the category back to lenient default-allow.
   *  Ignored when role=rep. May 28. */
  manager_type?: string | null;
  /** Region / group / hire_date tags — Mariska G2 (May 28). Empty
   *  string / null clears the field. Vocabularies live in
   *  app_settings.regions / .groups; hire_date is freeform YYYY-MM-DD. */
  region?: string | null;
  group_name?: string | null;
  hire_date?: string | null;
}

export async function updateUser(
  input: UpdateUserInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const json = (await r.json()) as { ok: boolean; error?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteUser(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "DELETE",
      headers: await authHeaders(),
      body: JSON.stringify({ id }),
    });
    const json = (await r.json()) as { ok: boolean; error?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Email this user their credentials (Phase B — May 25).
 *
 *  regenerate=true → server generates a fresh password, updates auth,
 *    emails the user via WelcomeEmail with the new password as the
 *    credentials. Response includes newPassword so the modal can echo
 *    it back as a "copy as fallback if email is slow" affordance.
 *  regenerate=false → server mints a one-time recovery link via
 *    Supabase admin API and emails it via InviteEmail. The user's
 *    existing password (if any) is untouched.
 *
 *  On success, profiles.last_credentials_sent_at is bumped by the
 *  server so the caller can refresh the profile row to update the
 *  "Last sent: X ago" line.
 */
export interface SendCredentialsResponse {
  ok: boolean;
  error?: string;
  /** True when the server changed the password (regenerate=true path). */
  regenerated?: boolean;
  /** True when the email was skipped because RESEND_API_KEY isn't set. */
  skipped?: boolean;
  sentTo?: string;
  messageId?: string | null;
  /** Echoed back ONLY for the regenerate=true path so the modal can
   *  show it as a copy-fallback. Null/undefined for the invite path. */
  newPassword?: string;
  /** True when regenerate=true changed the password BUT the email
   *  delivery then failed — partial success, manager needs to share
   *  newPassword by another channel. */
  passwordReset?: boolean;
  message?: string;
}

export async function sendCredentials(
  id: string,
  regenerate: boolean
): Promise<SendCredentialsResponse> {
  try {
    const r = await fetch(
      `/api/users/${encodeURIComponent(id)}/send-credentials`,
      {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ regenerate }),
      }
    );
    const json = (await r.json()) as SendCredentialsResponse;
    if (!r.ok && !json.passwordReset) {
      return {
        ok: false,
        error: json.error || `HTTP ${r.status}`,
        skipped: json.skipped,
      };
    }
    // passwordReset=true is a partial-success: HTTP error code, but
    // the password DID change. Surface to the modal so it can show
    // both the new password (so it isn't lost) AND the email error.
    return json;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Generate a random password the admin can share with a new user.
 *  12 chars, mixed alphanumeric + a couple of symbols. */
export function randomPassword(length = 12): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*";
  let out = "";
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buf = new Uint32Array(length);
    window.crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out += charset[buf[i] % charset.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += charset[Math.floor(Math.random() * charset.length)];
    }
  }
  return out;
}
