/**
 * Background geocoder cron (Phase E, May 25).
 *
 * Runs every minute (see morpheus-admin/vercel.json). Pulls up to 50
 * rows from customers UNION customer_sites where geocode_status =
 * 'pending', geocodes each address via Nominatim, writes lat/lng +
 * geocode_status='done' on success, geocode_status='failed' on
 * miss. Sleeps 1s between Nominatim calls to honour the ToS rate
 * limit (1 req/sec).
 *
 * The "next tick" / "live import" path:
 *   - Phase D customer/site adapters insert rows with
 *     geocode_status='pending' (the column default from the Phase A
 *     migration).
 *   - This cron picks them up within 60s.
 *   - If Nominatim can't resolve the address, the row flips to
 *     'failed'. The manual edit-address flow re-saves the row →
 *     server-side update should flip it back to 'pending' (handled
 *     in the manual edit code — see the badge UI hook).
 *
 * 50 rows × 1s/row = 50s per tick. Comfortably under Vercel's 60s
 * function timeout. If the queue is empty most rows return quickly
 * and we exit early.
 *
 * Auth: same CRON_SECRET bearer pattern as other cron routes.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/geocode-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

const BATCH_LIMIT = 50;
const RATE_LIMIT_DELAY_MS = 1100; // Nominatim ToS: 1 req/sec — buffer.

function unauthorised() {
  return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
}

function authedFromHeader(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${CRON_SECRET}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface PendingRow {
  table: "customers" | "customer_sites";
  id: string;
  address: string;
}

export async function GET(req: NextRequest) {
  if (!authedFromHeader(req)) return unauthorised();
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Split the batch budget between customers and sites so neither
  // table starves the other if both have backlogs. 25 each.
  const half = Math.ceil(BATCH_LIMIT / 2);

  const [{ data: custRows, error: custErr }, { data: siteRows, error: siteErr }] =
    await Promise.all([
      sb
        .from("customers")
        .select("id, address")
        .eq("geocode_status", "pending")
        .not("address", "is", null)
        .order("geocode_attempted_at", { ascending: true, nullsFirst: true })
        .limit(half),
      sb
        .from("customer_sites")
        .select("id, address")
        .eq("geocode_status", "pending")
        .not("address", "is", null)
        .order("geocode_attempted_at", { ascending: true, nullsFirst: true })
        .limit(half),
    ]);

  if (custErr || siteErr) {
    return Response.json(
      {
        ok: false,
        error: custErr?.message || siteErr?.message,
      },
      { status: 500 }
    );
  }

  const queue: PendingRow[] = [
    ...((custRows || []) as { id: string; address: string }[]).map((r) => ({
      table: "customers" as const,
      id: r.id,
      address: r.address,
    })),
    ...((siteRows || []) as { id: string; address: string }[]).map((r) => ({
      table: "customer_sites" as const,
      id: r.id,
      address: r.address,
    })),
  ];

  if (queue.length === 0) {
    return Response.json({ ok: true, processed: 0, message: "queue empty" });
  }

  let done = 0;
  let failed = 0;
  const errors: { id: string; table: string; error: string }[] = [];

  for (let i = 0; i < queue.length; i++) {
    const row = queue[i];
    try {
      const hit = await geocodeAddress(row.address);
      if (hit) {
        await sb
          .from(row.table)
          .update({
            latitude: hit.latitude,
            longitude: hit.longitude,
            geocode_status: "done",
            geocode_attempted_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        done += 1;
      } else {
        await sb
          .from(row.table)
          .update({
            geocode_status: "failed",
            geocode_attempted_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failed += 1;
      }
    } catch (e) {
      failed += 1;
      errors.push({
        id: row.id,
        table: row.table,
        error: e instanceof Error ? e.message : String(e),
      });
      // Even on error mark it attempted so we don't hammer a
      // permanently-broken address on every tick. It stays 'pending'
      // for retry next tick — but its geocode_attempted_at moves
      // forward so the NULLS FIRST ordering pushes it behind newer
      // pending rows.
      await sb
        .from(row.table)
        .update({ geocode_attempted_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    // Honour Nominatim's 1 req/sec — skip the sleep on the last
    // iteration since there's nothing waiting.
    if (i < queue.length - 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return Response.json({
    ok: true,
    processed: queue.length,
    done,
    failed,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
