/**
 * Customer import adapter (Phase D, May 25).
 *
 * Dedup key: customer code (integer). Importing the same code twice
 * in skip mode is a no-op; in update mode it overwrites the existing
 * row's name / initials / colour / region / city / address (but does
 * NOT delete sites — those are managed via the Sites tab).
 *
 * Address comes in as plain text. Lat/lng are left NULL and
 * geocode_status defaults to 'pending' from the Phase A migration,
 * so the Phase E cron will pick them up within 60s of import.
 *
 * Every new customer gets a "Head office" site auto-created (matches
 * the manual createCustomer flow in lib/customers-store.ts), so a
 * single-site customer never needs the Sites tab.
 */

import { supabase } from "@/lib/supabase";
import type {
  DuplicateMode,
  ImportAdapter,
  RawRow,
  UpsertOutcome,
} from "@/lib/import-types";

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "customer";
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const DEFAULT_COLOUR = "#15B4D6";

export const CUSTOMER_ADAPTER: ImportAdapter = {
  entity: "customer",
  requiredFields: ["code", "name"],
  optionalFields: ["initials", "color", "region", "city", "address"],
  fieldLabels: {
    code: "Customer code (integer account number)",
    name: "Customer name",
    initials: "Initials (2-3 chars — auto from name if blank)",
    color: "Brand colour (hex like #15B4D6 — defaults to cyan if blank)",
    region: "Region",
    city: "City",
    address: "Address (text — geocoded asynchronously)",
  },
  fieldKinds: {
    code: "id",
  },
  matchRule:
    "Each row is one customer. Two rows with the same code = duplicate. Existing customers are matched by code.",
  dedupKey: (row) => {
    const code = (row.code || "").trim();
    return code ? `code:${code}` : "";
  },
  validate: (row) => {
    const errs: string[] = [];
    const code = (row.code || "").trim();
    if (!code) errs.push("code is required");
    else if (!/^\d+$/.test(code)) {
      errs.push(`code must be an integer (got "${code}")`);
    }
    if (!row.name || !row.name.trim()) errs.push("name is required");
    if (row.color && !/^#?[0-9a-f]{6}$/i.test(row.color.trim())) {
      errs.push(`color must be a 6-char hex (got "${row.color}")`);
    }
    return errs;
  },
  upsert: async (row: RawRow, mode: DuplicateMode): Promise<UpsertOutcome> => {
    if (!supabase) throw new Error("Supabase not configured");

    const code = parseInt(row.code.trim(), 10);
    const name = row.name.trim();
    const initials = (row.initials || "").trim() || deriveInitials(name);
    let color = (row.color || "").trim() || DEFAULT_COLOUR;
    if (!color.startsWith("#")) color = `#${color}`;
    const address = (row.address || "").trim() || null;
    const region = (row.region || "").trim() || null;
    const city = (row.city || "").trim() || null;

    // Dedup check — existing customer with this code?
    const { data: existing, error: lookupErr } = await supabase
      .from("customers")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);

    if (existing) {
      if (mode === "skip") return "skipped";
      const { error: updErr } = await supabase
        .from("customers")
        .update({ name, initials, color, region, city, address })
        .eq("id", (existing as { id: string }).id);
      if (updErr) throw new Error(updErr.message);
      return "updated";
    }

    // Create — slug-style id matches the rest of the codebase.
    const id = `${slugifyName(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error: insErr } = await supabase.from("customers").insert({
      id,
      code,
      name,
      initials,
      color,
      region,
      city,
      address,
      latitude: null,
      longitude: null,
    });
    if (insErr) throw new Error(insErr.message);

    // Auto-create the Head office site so single-site customers
    // never need the Sites tab.
    await supabase.from("customer_sites").insert({
      customer_id: id,
      name: "Head office",
      address,
      latitude: null,
      longitude: null,
      geofence_radius_m: 100,
    });

    return "created";
  },
};
