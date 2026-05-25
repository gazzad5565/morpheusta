/**
 * lib/email.ts — single sendEmail() wrapper around Resend.
 *
 * Every Resend call in the admin goes through this file so we can:
 *   - Centralise the "no API key, log + skip" fallback (so local dev
 *     never crashes when RESEND_API_KEY isn't set).
 *   - Centralise the from-address (one place to swap when the org
 *     verifies a sending domain in Resend).
 *   - Centralise error formatting so callers get a flat
 *     { ok: true } | { ok: false, error, skipped? } shape.
 *
 * From-address: defaults to `Morpheus Ops <onboarding@resend.dev>`.
 * Resend's `onboarding@resend.dev` only delivers to YOUR verified
 * Resend account email, so the smoke test works without any DNS
 * setup — but bulk delivery to reps requires verifying a real
 * sending domain in Resend and overriding via RESEND_FROM.
 *
 * Env vars (server-only — never expose to the client):
 *   - RESEND_API_KEY   required for actual sends; absent → loud no-op
 *   - RESEND_FROM      optional override; e.g. `Morpheus Ops <hello@yourdomain.com>`
 */

import { Resend } from "resend";
import type { ReactElement } from "react";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_ADDRESS =
  process.env.RESEND_FROM || "Morpheus Ops <onboarding@resend.dev>";

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  react: ReactElement;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; skipped?: boolean };

export async function sendEmail({
  to,
  subject,
  react,
}: SendEmailArgs): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    // Loud no-op so local dev (where RESEND_API_KEY isn't set) doesn't
    // crash any code path that fires emails. The caller can branch on
    // `skipped` to UI-message "configure email to enable this" without
    // erroring out.
    console.warn(
      "[email] RESEND_API_KEY not set, skipping send",
      { to, subject }
    );
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: Array.isArray(to) ? to : [to],
    subject,
    react,
  });

  if (error) {
    console.error("[email] send failed", { to, subject, error });
    return { ok: false, error: error.message || "send failed" };
  }
  return { ok: true, id: data?.id ?? null };
}

/** Returns true when RESEND_API_KEY is present. Lets routes short-
 *  circuit with a clearer 503 if email isn't wired yet. */
export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}
