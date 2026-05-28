/**
 * /api/users — server-only CRUD for auth users.
 *
 * Uses Supabase's service-role key to call auth.admin.* — bypasses RLS,
 * has full admin powers. ALWAYS verify the caller is a signed-in manager
 * before doing anything; otherwise any authenticated rep could spin up
 * manager accounts for themselves.
 *
 * Env vars (server-only, never expose to the client):
 *   - NEXT_PUBLIC_SUPABASE_URL          (already in Vercel)
 *   - SUPABASE_SERVICE_ROLE_KEY         (NEW — add via vercel env add)
 *
 * Routes:
 *   POST   /api/users         create  { email, password, name, role }
 *   PATCH  /api/users         update  { id, ?email, ?password, ?name, ?role }
 *   DELETE /api/users         delete  { id }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Verify the request was made by a signed-in manager. Returns the
 *  manager's user id on success, or a NextResponse on failure. */
async function requireManager(
  req: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          ok: false,
          error:
            "Server is missing SUPABASE_SERVICE_ROLE_KEY. Ask the deploy owner to add it.",
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
  // Use the anon key to read the caller's session, then check their role.
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

// ─── POST: create a user ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  let body: {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    /** May 28 — optional rep_type set at creation time so the manager
     *  can pick the category in the Add user modal without a follow-up
     *  edit. Ignored when role=manager (the field doesn't apply). */
    rep_type?: string | null;
    /** May 28 — optional manager_type set at creation time. Same
     *  semantics as rep_type but for managers. Ignored when role=rep. */
    manager_type?: string | null;
    /** May 28 (Mariska G2) — hire date. Empty / null = unknown.
     *  Applies to either role. region + group were removed same day
     *  after Gary's correction (those belong on customers, not
     *  users). */
    hire_date?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim() || null;
  const role = body.role === "manager" ? "manager" : "rep";

  // Normalise type values: trim, treat empty string as null. Only the
  // type matching the chosen role gets persisted — the other one is
  // forced to null so the row doesn't carry stale state if the
  // manager flips the role mid-form.
  const repType =
    role === "rep" ? ((body.rep_type ?? "").trim() || null) : null;
  const managerType =
    role === "manager" ? ((body.manager_type ?? "").trim() || null) : null;
  // May 28 (Mariska G2) — hire date. Same trim-or-null pattern as
  // the type fields. Postgres date column accepts YYYY-MM-DD; empty
  // string → null. Applied regardless of role.
  const hireDate = (body.hire_date ?? "").trim() || null;

  if (!email) {
    return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "password must be ≥ 6 chars" },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ...(name ? { name } : {}), role },
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }

  // The handle_new_user() trigger will insert into profiles, but it
  // looks at raw_user_meta_data. Belt-and-braces: upsert the profile
  // row here to guarantee name + role + type are correct even if the
  // trigger is ever disabled.
  if (data.user) {
    await sb.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        name,
        role,
        rep_type: repType,
        manager_type: managerType,
        hire_date: hireDate,
      },
      { onConflict: "id" }
    );
  }

  return NextResponse.json({ ok: true, id: data.user?.id });
}

// ─── PATCH: update a user ────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  let body: {
    id?: string;
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    /** May 27 — rep type category. Empty string / null = uncategorise.
     *  Anything else writes through as plain text; no server-side
     *  validation against app_settings.rep_types yet (the dropdown
     *  on the edit form is the authoritative source). */
    rep_type?: string | null;
    /** May 28 — manager type category. Same shape as rep_type; same
     *  caveat (no server-side validation against the vocabulary —
     *  client dropdown is authoritative). */
    manager_type?: string | null;
    /** May 28 (Mariska G2) — hire date. Empty string = clear.
     *  region + group were removed same day (customer attributes,
     *  not user attributes). */
    hire_date?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  const id = body.id;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id required" },
      { status: 400 }
    );
  }
  const sb = adminClient();

  // Auth-side update (email + password live on auth.users)
  const authPatch: { email?: string; password?: string } = {};
  if (body.email !== undefined && body.email.trim()) {
    authPatch.email = body.email.trim().toLowerCase();
  }
  if (body.password !== undefined && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "password must be ≥ 6 chars" },
        { status: 400 }
      );
    }
    authPatch.password = body.password;
  }
  if (Object.keys(authPatch).length > 0) {
    const { error } = await sb.auth.admin.updateUserById(id, authPatch);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }
  }

  // Profile-side update (name + role + email mirror + rep_type)
  const profilePatch: Record<string, unknown> = {};
  if (body.name !== undefined) profilePatch.name = body.name.trim() || null;
  if (body.role !== undefined) {
    profilePatch.role = body.role === "manager" ? "manager" : "rep";
  }
  if (body.rep_type !== undefined) {
    // Empty string / null = clear the category. Trim whitespace on
    // anything else so "Sales Rep " doesn't drift from "Sales Rep".
    const v = (body.rep_type ?? "").trim();
    profilePatch.rep_type = v.length > 0 ? v : null;
  }
  if (body.manager_type !== undefined) {
    // Same shape as rep_type. Empty / null = clear back to lenient
    // default-allow (the manager keeps full access until explicitly
    // re-assigned).
    const v = (body.manager_type ?? "").trim();
    profilePatch.manager_type = v.length > 0 ? v : null;
  }
  // May 28 (Mariska G2) — hire_date pass-through. Empty string =
  // clear. Applies to either role.
  if (body.hire_date !== undefined) {
    const v = (body.hire_date ?? "").trim();
    profilePatch.hire_date = v.length > 0 ? v : null;
  }
  if (authPatch.email) profilePatch.email = authPatch.email;
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await sb.from("profiles").update(profilePatch).eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE: delete a user ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.res;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }
  const id = body.id;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id required" },
      { status: 400 }
    );
  }
  if (id === gate.userId) {
    return NextResponse.json(
      { ok: false, error: "You can't delete your own account from here." },
      { status: 400 }
    );
  }

  const sb = adminClient();
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
  // The matching profiles row will cascade away via the auth.users FK
  // (handle_new_user() trigger pairs them up). If that wasn't set up
  // delete it explicitly:
  await sb.from("profiles").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
