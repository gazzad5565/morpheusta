/**
 * Site import adapter (Phase D — D2, May 25).
 *
 * Dedup key: (customer_code, site_name). Customer must already exist
 * (either in DB before this import OR in the same upload's customer
 * adapter ran first — sites import does NOT auto-create customers).
 *
 * Site address is plain text. Lat/lng are NULL on import and
 * geocode_status defaults to 'pending' from the Phase A migration —
 * the Phase E cron picks them up.
 */

import { supabase } from "@/lib/supabase";
import type {
  DuplicateMode,
  ImportAdapter,
  RawRow,
  UpsertOutcome,
} from "@/lib/import-types";

export const SITE_ADAPTER: ImportAdapter = {
  entity: "site",
  requiredFields: ["customer_code", "site_name"],
  optionalFields: ["address", "city", "region"],
  fieldLabels: {
    customer_code: "Customer code (integer — customer must already exist)",
    site_name: "Site name (e.g. 'Head office', 'Warehouse')",
    address: "Address (text — geocoded asynchronously)",
    city: "City",
    region: "Region",
  },
  fieldKinds: {
    customer_code: "link",
    site_name: "id",
  },
  linksTo: {
    customer_code: "customer",
  },
  matchRule:
    "Each row is one site. customer_code links to an existing customer (import customers first if needed). Two rows with the same customer_code + site_name = duplicate.",
  dedupKey: (row) => {
    const code = (row.customer_code || "").trim();
    const name = (row.site_name || "").trim().toLowerCase();
    return code && name ? `site:${code}::${name}` : "";
  },
  validate: (row) => {
    const errs: string[] = [];
    const code = (row.customer_code || "").trim();
    if (!code) errs.push("customer_code is required");
    else if (!/^\d+$/.test(code)) {
      errs.push(`customer_code must be an integer (got "${code}")`);
    }
    if (!row.site_name || !row.site_name.trim()) {
      errs.push("site_name is required");
    }
    return errs;
  },
  upsert: async (row: RawRow, mode: DuplicateMode): Promise<UpsertOutcome> => {
    if (!supabase) throw new Error("Supabase not configured");

    const code = parseInt(row.customer_code.trim(), 10);
    const siteName = row.site_name.trim();
    const address = (row.address || "").trim() || null;

    // Lookup the customer by code → get its text id (slug).
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (custErr) throw new Error(custErr.message);
    if (!customer) {
      throw new Error(
        `customer with code=${code} not found — import the customer first or add a row with this code to the customers import`
      );
    }
    const customerId = (customer as { id: string }).id;

    // Dedup — site with this exact name on this customer?
    const { data: existing, error: lookupErr } = await supabase
      .from("customer_sites")
      .select("id")
      .eq("customer_id", customerId)
      .eq("name", siteName)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);

    if (existing) {
      if (mode === "skip") return "skipped";
      const { error: updErr } = await supabase
        .from("customer_sites")
        .update({ address })
        .eq("id", (existing as { id: string }).id);
      if (updErr) throw new Error(updErr.message);
      return "updated";
    }

    const { error: insErr } = await supabase.from("customer_sites").insert({
      customer_id: customerId,
      name: siteName,
      address,
      latitude: null,
      longitude: null,
      geofence_radius_m: 100,
    });
    if (insErr) throw new Error(insErr.message);
    return "created";
  },
};
