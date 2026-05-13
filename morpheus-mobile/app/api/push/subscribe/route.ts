/**
 * /api/push/subscribe — manage this device's push subscription.
 *
 *   POST   /api/push/subscribe   { endpoint, p256dh, auth, userAgent? }
 *      Upserts a row in push_subscriptions for the authenticated rep.
 *      Idempotent on endpoint — re-calling with the same endpoint
 *      bumps last_seen_at instead of inserting a duplicate.
 *
 *   DELETE /api/push/subscribe   { endpoint }
 *      Removes this device's row. Called from unsubscribeFromPush().
 *
 * Auth: Bearer token in the Authorization header. We use the anon
 * key + bearer token to create a per-request Supabase client, which
 * means RLS does the heavy lifting — the WITH CHECK clause on the
 * push_subscriptions_insert_own policy guarantees a rep can only
 * write rows where rep_id = themselves.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function requireRep(
  req: NextRequest
): Promise<{ ok: true; userId: string; token: string } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !ANON_KEY) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Server is missing Supabase config" },
        { status: 500 }
      ),
    };
  }
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 }),
    };
  }
  const sb = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 }),
    };
  }
  return { ok: true, userId: data.user.id, token };
}

/** Per-request Supabase client that carries the rep's auth token so
 *  RLS enforces row ownership. */
function repClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRep(req);
  if (!gate.ok) return gate.res;

  let body: {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    userAgent?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = (body.endpoint || "").trim();
  const p256dh = (body.p256dh || "").trim();
  const authKey = (body.auth || "").trim();
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { ok: false, error: "endpoint, p256dh, and auth are required" },
      { status: 400 }
    );
  }

  const sb = repClient(gate.token);
  const { error } = await sb
    .from("push_subscriptions")
    .upsert(
      {
        rep_id: gate.userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: body.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRep(req);
  if (!gate.ok) return gate.res;

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const endpoint = (body.endpoint || "").trim();
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "endpoint is required" },
      { status: 400 }
    );
  }

  const sb = repClient(gate.token);
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
