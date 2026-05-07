import { test, expect } from "@playwright/test";
import { serviceClient, qaTag } from "../helpers/supabase";
import { createCustomer, createShift } from "../fixtures/seed";

const REP_EMAIL = process.env.REP_EMAIL!;
const REP_PASSWORD = process.env.REP_PASSWORD!;

async function loginRep(page: any) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(REP_EMAIL);
  await page.getByLabel(/password/i).fill(REP_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(?!login)/);
}

async function getRepProfileId(): Promise<string> {
  const sb = serviceClient();
  const { data } = await sb.from("profiles").select("id").eq("email", REP_EMAIL).single();
  return data!.id;
}

test.describe("Mobile check-in (exception engine)", () => {
  test("M-CHECKIN-OK: on-time, on-site → state=in_progress, no exception event", async ({ browser }) => {
    const customer = await createCustomer({ name: qaTag("oncheck_cust"), lat: 51.5074, lng: -0.1278, geofenceM: 100 });
    const repId = await getRepProfileId();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const start = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const end = `${pad(now.getHours() + 1)}:${pad(now.getMinutes())}`;
    const shift = await createShift({ customer_id: customer.id, rep_id: repId, shift_date: today, start_time: start, end_time: end });

    const ctx = await browser.newContext({
      ...iphone(),
      geolocation: { latitude: 51.5074, longitude: -0.1278 }, // exactly on-site
      permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    await loginRep(page);
    await page.goto("/check-in");
    await page.getByRole("button", { name: /check in/i }).click();

    await expect(page).toHaveURL(/\/check-in\/success|\/active/);

    const sb = serviceClient();
    const { data: shiftRow } = await sb.from("shifts").select("state, check_in_at").eq("id", shift.id).single();
    expect(shiftRow!.state).toBe("in_progress");
    expect(shiftRow!.check_in_at).not.toBeNull();

    const { data: events } = await sb.from("shift_events").select("event_type").eq("shift_id", shift.id);
    const types = (events ?? []).map((e: any) => e.event_type);
    expect(types).not.toContain("exception.late");
    expect(types).not.toContain("exception.off_site");
    await ctx.close();
  });

  test("M-CHECKIN-OFFSITE: outside geofence → exception type=off_site", async ({ browser }) => {
    const customer = await createCustomer({ name: qaTag("off_cust"), lat: 51.5074, lng: -0.1278, geofenceM: 50 });
    const repId = await getRepProfileId();
    const today = new Date().toISOString().slice(0, 10);
    const shift = await createShift({ customer_id: customer.id, rep_id: repId, shift_date: today, start_time: "08:00", end_time: "16:00" });

    const ctx = await browser.newContext({
      ...iphone(),
      geolocation: { latitude: 51.6, longitude: -0.2 }, // ~13km away — well outside 50m
      permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    await loginRep(page);
    await page.goto("/check-in");

    // The page should detect off-site and demand a reason.
    await expect(page.getByText(/off[- ]site|outside.*geofence|away from/i)).toBeVisible();
    await page.getByRole("button", { name: /traffic|emergency|other/i }).first().click();
    await page.getByRole("button", { name: /check in|confirm/i }).click();

    const sb = serviceClient();
    const { data: events } = await sb.from("shift_events").select("event_type").eq("shift_id", shift.id);
    expect(events!.some((e: any) => e.event_type === "exception.off_site")).toBe(true);
    await ctx.close();
  });

  test.afterAll(async () => {
    const sb = serviceClient();
    await sb.from("shifts").delete().like("series_id", "qa_%");
    await sb.from("customers").delete().like("name", "qa_%");
  });
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iphone() {
  return {
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  };
}
