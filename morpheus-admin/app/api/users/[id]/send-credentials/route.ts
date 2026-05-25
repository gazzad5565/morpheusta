/**
 * POST /api/users/[id]/send-credentials — re-send a user their login.
 *
 * Body: { regenerate: boolean }
 *
 *   regenerate=true:
 *     - Generate a fresh temporary password server-side.
 *     - auth.admin.updateUserById(id, {password}) — actually changes
 *       the password (the user's old one stops working).
 *     - Send WelcomeEmail with that fresh password as the credentials.
 *
 *   regenerate=false:
 *     - Leave the password alone — we don't even know what it is
 *       (Supabase stores hashes).
 *     - auth.admin.generateLink({type:'recovery', email, options:
 *       {redirectTo}}) — Supabase mints a one-time magic link.
 *     - Send InviteEmail with that link as the CTA. Clicking it signs
 *       the user in to the right app (admin for managers, mobile PWA
 *       for reps) and they can change their password from Profile.
 *
 * On a successful send, profiles.last_credentials_sent_at is bumped
 * so the modal's "Last sent: X ago" line reflects the action.
 *
 * Manager-gated via the same shape as /api/users/route.ts. The user
 * can't trigger this on themselves through the UI but we don't block
 * it server-side either — a manager re-emailing their own credentials
 * is a legitimate "I lost the password I just generated" flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import WelcomeEmail from "@/emails/WelcomeEmail";
import InviteEmail from "@/emails/InviteEmail";
import { sendEmail, isEmailConfigured } from "@/lib/email";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Per-role landing URL. Each is the *app* the user should land in
// when they click the email's CTA. Resolves to a sensible fallback
// when the env var isn't set so the route still works in dev / when
// env config drifts.
const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "https://morpheus-admin.vercel.app";
const MOBILE_URL =
  process.env.NEXT_PUBLIC_MOBILE_URL ||
  "https://morpheusta-khaki-omega.vercel.app";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

// Same password generator shape as the client-side randomPassword()
// in lib/users-admin.ts — duplicated here so the server can mint
// passwords without importing client-only modules. 12 chars from an
// ambiguity-stripped charset.
function generateServerPassword(length = 12): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*";
  const buf = new Uint32Array(length);
  // Node's webcrypto is available in the runtime; falls back to
  // Math.random if not (shouldn't happen on the nodejs runtime but
  // the safety net keeps tests + edge-case envs happy).
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  let out = "";
  for (let i = 0; i < length; i++) out += charset[buf[i] % charset.length];
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
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

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "user id required" },
      { status: 400 }
    );
  }

  let body: { regenerate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  const regenerate = body.regenerate === true;

  const sb = adminClient();

  // Pull the user's auth row (email) + the profile row (name, role).
  // Two round-trips because Supabase splits auth.users and profiles —
  // there's no PostgREST join we can rely on for auth.users without
  // dropping into the admin API.
  const { data: authData, error: authErr } = await sb.auth.admin.getUserById(id);
  if (authErr || !authData?.user) {
    return NextResponse.json(
      { ok: false, error: authErr?.message || "User not found" },
      { status: 404 }
    );
  }
  const email = (authData.user.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "User has no email address on record" },
      { status: 422 }
    );
  }

  const { data: profileData, error: profileErr } = await sb
    .from("profiles")
    .select("id, name, role")
    .eq("id", id)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json(
      { ok: false, error: profileErr.message },
      { status: 500 }
    );
  }
  const profile = profileData as { name: string | null; role: string } | null;
  const role: "rep" | "manager" =
    profile?.role === "manager" ? "manager" : "rep";
  const name = profile?.name ?? null;
  const appUrl = role === "manager" ? ADMIN_URL : MOBILE_URL;

  // ── Branch: regenerate (fresh password) vs invite (recovery link) ──

  if (regenerate) {
    const newPassword = generateServerPassword(12);
    const { error: pwErr } = await sb.auth.admin.updateUserById(id, {
      password: newPassword,
    });
    if (pwErr) {
      return NextResponse.json(
        { ok: false, error: `Couldn't reset password: ${pwErr.message}` },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      to: email,
      subject: "Your Morpheus Ops login — new password inside",
      react: createElement(WelcomeEmail, {
        name,
        email,
        password: newPassword,
        appUrl,
        role,
      }),
    });
    if (!result.ok) {
      // Password is already changed at this point — the email failure
      // doesn't roll that back. Surface the partial-success state so
      // the manager knows to share the password manually.
      return NextResponse.json(
        {
          ok: false,
          error: `Password reset but email failed: ${result.error}`,
          passwordReset: true,
          newPassword,
          skipped: result.skipped ?? false,
        },
        { status: result.skipped ? 503 : 502 }
      );
    }

    await sb
      .from("profiles")
      .update({ last_credentials_sent_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      regenerated: true,
      sentTo: email,
      messageId: result.id,
      // Echoed back to the modal so the manager can copy the password
      // as a fallback (in case the email is slow / spam-foldered).
      newPassword,
      message: `New password generated and emailed to ${email}.`,
    });
  }

  // Recovery-link path. Supabase's generateLink returns a one-time
  // sign-in URL — clicking it lands the user in their app's home,
  // authenticated, no password entry required. They can then set a
  // permanent password from Profile → Change password.
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: appUrl },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't generate sign-in link: ${linkErr?.message || "no link returned"}`,
      },
      { status: 400 }
    );
  }
  const actionUrl = linkData.properties.action_link;

  const result = await sendEmail({
    to: email,
    subject: "You've been invited to Morpheus Ops",
    react: createElement(InviteEmail, {
      name,
      email,
      actionUrl,
      role,
    }),
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't send email: ${result.error}`,
        skipped: result.skipped ?? false,
      },
      { status: result.skipped ? 503 : 502 }
    );
  }

  await sb
    .from("profiles")
    .update({ last_credentials_sent_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    regenerated: false,
    sentTo: email,
    messageId: result.id,
    message: `Invite link emailed to ${email}.`,
  });
}
