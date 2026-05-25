/**
 * POST /api/email/test — manager-gated email transport smoke test.
 *
 * Body: { to: string }
 *
 * Sends the WelcomeEmail template to `to` with placeholder credentials
 * so we test BOTH the Resend transport AND the React Email render in
 * one shot. Useful for verifying prod email is wired up after adding
 * RESEND_API_KEY to Vercel — manager opens /settings/import (or curls
 * this endpoint directly), pastes their email, hits send.
 *
 * Real production "send credentials to user" is the separate
 * /api/users/[id]/send-credentials route landing in Phase B; this one
 * just proves the wire works.
 */

import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import WelcomeEmail from "@/emails/WelcomeEmail";
import { sendEmail, isEmailConfigured } from "@/lib/email";

// Force Node runtime — Resend's `react` prop goes through
// @react-email/render which relies on react-dom/server. Edge would
// work for raw HTML sends but explicit nodejs avoids any surprise.
export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Same shape as /api/users requireManager — kept inline (rather than
// shared) until at least three routes need it; then we'd extract.
async function requireManager(
  req: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          ok: false,
          error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      ),
    };
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      ),
    };
  }
  const callerSb = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await callerSb.auth.getUser(token);
  if (userErr || !userData.user) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 }
      ),
    };
  }
  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "manager") {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Manager role required" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, userId: userData.user.id };
}

const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "https://morpheus-admin.vercel.app";

export async function POST(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Email is not configured on the server. Add RESEND_API_KEY to the morpheus-admin Vercel project (Production + Preview + Development) and redeploy.",
      },
      { status: 503 }
    );
  }

  let body: { to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  const to = body.to?.trim().toLowerCase();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      { ok: false, error: "to must be a valid email address" },
      { status: 400 }
    );
  }

  const result = await sendEmail({
    to,
    subject: "Morpheus Ops — email transport test",
    react: createElement(WelcomeEmail, {
      name: "Test User",
      email: to,
      password: "smoke-test-password-1234",
      appUrl: ADMIN_URL,
      role: "manager",
    }),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, skipped: result.skipped ?? false },
      { status: result.skipped ? 503 : 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    id: result.id,
    sentTo: to,
    note: "If you don't see it, check that your Resend account has this address as a verified recipient (onboarding@resend.dev only delivers to verified emails until a sending domain is added).",
  });
}
