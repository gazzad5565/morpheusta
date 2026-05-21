import { test, expect } from "../fixtures/auth";
import { serviceClient, qaTag } from "../helpers/supabase";

/**
 * /customers/[id] — Sites tab, SiteEditor geocode-miss behaviour.
 *
 * When a manager edits a site's street text and the geocoder can't
 * resolve the new address, SiteEditor must keep the *existing* lat/lng
 * (rather than wiping the pin) and surface a note to that effect. This
 * spec covers that subtle branch so a future refactor can't silently
 * drop coordinates on a geocode failure.
 *
 * Mechanism: intercept GET /api/geocode and return a 500 so the catch
 * branch fires, then assert (a) the in-UI note appears, (b) the DB row
 * has the new address but unchanged coordinates.
 */
test.describe("SiteEditor — geocode miss keeps existing pin", () => {
  test("SITE-GEO-1: edit address with geocoder failing keeps original coords", async ({
    adminPage: page,
  }) => {
    const sb = serviceClient();
    const customerName = qaTag("site_geocode_host");
    const { data: customer, error: custErr } = await sb
      .from("customers")
      .insert({
        name: customerName,
        code: customerName.slice(0, 12),
        initials: "QA",
        color: "#888",
        active: true,
      })
      .select()
      .single();
    expect(custErr).toBeNull();
    const customerId = customer!.id as string;

    // Seed a site with known coordinates so we can assert they survive.
    const ORIG_LAT = -33.9249;
    const ORIG_LNG = 18.4241;
    const ORIG_ADDRESS = "1 Long Street, Cape Town";
    const NEW_ADDRESS = "Definitely-Not-A-Real-Address-XYZ-9999";
    const { data: site, error: siteErr } = await sb
      .from("customer_sites")
      .insert({
        customer_id: customerId,
        name: "Main",
        address: ORIG_ADDRESS,
        latitude: ORIG_LAT,
        longitude: ORIG_LNG,
        geofence_radius_m: 100,
        active: true,
      })
      .select()
      .single();
    expect(siteErr).toBeNull();
    const siteId = site!.id as string;

    // Force every /api/geocode call this test triggers to fail. The
    // SiteEditor's `else if (coords)` branch should then keep the
    // original pin and surface the "kept the existing pin" note.
    await page.route("**/api/geocode*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );

    try {
      await page.goto(`/customers/${customerId}`);
      await page.getByTestId("customer-tab-sites").click();

      // Open the row's editor via the pencil icon.
      await page.getByTitle("Edit site").click();

      // Change the address text. Crucially, we *type* a new value
      // without selecting an autocomplete suggestion, so `pickedCoords`
      // stays null and the save path hits the geocoder.
      const addrInput = page.getByPlaceholder(/1480 Riverside Way/i);
      await addrInput.fill(NEW_ADDRESS);

      await page.getByRole("button", { name: /save changes/i }).click();

      // The "kept the existing pin" note must appear after the geocode
      // failure. The editor stays open (it only closes on a clean save).
      await expect(page.getByText(/kept the existing pin/i)).toBeVisible();

      // DB-level assertion: address text updated, coords untouched.
      const { data: after } = await sb
        .from("customer_sites")
        .select("address, latitude, longitude")
        .eq("id", siteId)
        .single();
      expect(after!.address).toBe(NEW_ADDRESS);
      expect(after!.latitude).toBeCloseTo(ORIG_LAT, 4);
      expect(after!.longitude).toBeCloseTo(ORIG_LNG, 4);
    } finally {
      await sb.from("customer_sites").delete().eq("id", siteId);
      await sb.from("customers").delete().eq("id", customerId);
    }
  });
});
