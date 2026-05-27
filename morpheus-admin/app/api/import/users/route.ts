/**
 * POST /api/import/users — create-or-update one user (rep or manager)
 * during a bulk import. Manager-gated.
 *
 * Body: { email, name, role, send_welcome_email, mode }
 *
 * Logic:
 *   - Look up existing user by email. If found:
 *       mode=skip   → return { outcome: "skipped" }
 *       mode=update → update profile name + role only. Password stays
 *                     untouched (Phase B's "Email this user" button is
 *                     the path for reseting credentials).
 *   - If not found:
 *       Generate a 12-char password, call auth.admin.createUser, upsert
 *       the profile row, optionally fire the welcome email via Resend
 *       (best-effort — a welcome-email failure doesn't fail the user
 *       creation, just gets logged so it lands in the run's errors_json
 *       via the caller).
 *
 * Why a dedicated route instead of reusing /api/users:
 *   - The import flow needs to handle dedup (skip-or-update) in one
 *     call, while /api/users is a strict create.
 *   - Welcome email send for imports should reuse the same template
 *     as Phase A's WelcomeEmail but trigger server-side without the
 *     manager needing to click anything.
 *   - The brief calls for this route explicitly; sets up a natural
 *     home for batching later if 200+ rep imports become slow.
 */

import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { createClient } from "@supabase/supabase-js";
import WelcomeEmail from "@/emails/WelcomeEmail";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
        { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
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

function generatePassword(length = 12): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*";
  const buf = new Uint32Array(length);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 1e9);
  }
  let out = "";
  for (let i = 0; i < length; i++) out += charset[buf[i] % charset.length];
  return out;
}

interface Body {
  email?: string;
  name?: string;
  role?: "rep" | "manager";
  send_welcome_email?: boolean;
  mode?: "skip" | "update";
  /** May 27 — rep_type category (Sales Rep / Merchandiser / Driver / …).
   *  Validated against the live vocabulary in app_settings.rep_types;
   *  unknown values are rejected with the list of valid options so
   *  the import wizard's failures CSV is actionable. Ignored when
   *  role=manager. Empty / null = uncategorised. */
  rep_type?: string | null;
}

export async function POST(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() || "";
  const role: "rep" | "manager" = body.role === "manager" ? "manager" : "rep";
  const sendWelcome = body.send_welcome_email === true;
  const mode: "skip" | "update" = body.mode === "update" ? "update" : "skip";
  // rep_type only meaningful for rep imports. Empty / null = uncategorised.
  const repTypeRaw = (body.rep_type ?? "").toString().trim();
  const wantsRepType = role === "rep" && repTypeRaw.length > 0;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "valid email is required" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name is required" },
      { status: 400 }
    );
  }

  const sb = adminClient();

  // Validate rep_type against the live vocabulary in
  // app_settings.rep_types. Done here (not in the adapter) because
  // the adapter's validate() is sync; an async DB fetch is awkward
  // there. Server-side check is the canonical source of truth anyway.
  let resolvedRepType: string | null = null;
  if (wantsRepType) {
    const { data: settingRow } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "rep_types")
      .maybeSingle();
    const rawList = (settingRow as { value?: unknown } | null)?.value;
    const types = Array.isArray(rawList) ? rawList : [];
    const names: string[] = [];
    for (const t of types) {
      if (t && typeof t === "object") {
        const n = (t as { name?: unknown }).name;
        if (typeof n === "string" && n.trim()) names.push(n.trim());
      }
    }
    const match = names.find(
      (n) => n.toLowerCase() === repTypeRaw.toLowerCase()
    );
    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          error: `unknown rep_type "${repTypeRaw}". Configured types: ${
            names.length > 0 ? names.join(", ") : "(none — add some from Manage rep types)"
          }`,
        },
        { status: 400 }
      );
    }
    // Use the canonical-cased name from the vocabulary so we don't
    // end up with "sales rep" / "Sales Rep" drift on profiles.
    resolvedRepType = match;
  }

  // Look up by email. The auth.admin API exposes listUsers; we
  // page through up to one batch (1000 users) and match locally.
  // For larger orgs this would warrant a different approach — but
  // bulk imports almost always run during onboarding when the auth
  // user count is under that threshold.
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    return NextResponse.json(
      { ok: false, error: `Couldn't look up users: ${listErr.message}` },
      { status: 500 }
    );
  }
  const existing = list.users.find(
    (u) => (u.email || "").toLowerCase() === email
  );

  if (existing) {
    if (mode === "skip") {
      return NextResponse.json({ ok: true, outcome: "skipped" });
    }
    // Update name + role on the profile, leave password alone. Only
    // touch rep_type when the import row specified one (don't wipe an
    // existing categorisation on an update import that omits the column).
    const updatePatch: Record<string, unknown> = { name, role };
    if (role === "rep" && wantsRepType) {
      updatePatch.rep_type = resolvedRepType;
    }
    const { error: profErr } = await sb
      .from("profiles")
      .update(updatePatch)
      .eq("id", existing.id);
    if (profErr) {
      return NextResponse.json(
        { ok: false, error: `Couldn't update profile: ${profErr.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, outcome: "updated" });
  }

  // Create — generate password + create auth user + upsert profile.
  const password = generatePassword(12);
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      {
        ok: false,
        error: `Couldn't create user: ${createErr?.message || "unknown"}`,
      },
      { status: 400 }
    );
  }
  // handle_new_user() trigger inserts the profile from metadata, but
  // belt-and-braces upsert so name+role(+rep_type) are guaranteed.
  await sb.from("profiles").upsert(
    {
      id: created.user.id,
      email,
      name,
      role,
      ...(role === "rep" && wantsRepType ? { rep_type: resolvedRepType } : {}),
    },
    { onConflict: "id" }
  );

  // Optional welcome email. Best-effort — failures don't fail the
  // user creation, just bubble back so the run's errors_json gets a
  // warning row.
  let emailSent = false;
  if (sendWelcome) {
    const appUrl = role === "manager" ? ADMIN_URL : MOBILE_URL;
    const result = await sendEmail({
      to: email,
      subject: "Welcome to Morpheus Ops — your login is inside",
      react: createElement(WelcomeEmail, {
        name,
        email,
        password,
        appUrl,
        role,
      }),
    });
    emailSent = result.ok;
    if (!result.ok) {
      return NextResponse.json({
        ok: true,
        outcome: "created",
        password,
        emailSent: false,
        warning: `User created but welcome email failed: ${result.error}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    outcome: "created",
    password,
    emailSent,
  });
}
