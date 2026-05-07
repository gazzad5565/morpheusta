import { test, expect } from "../fixtures/auth";
import { serviceClient, qaTag } from "../helpers/supabase";
import { createCustomer } from "../fixtures/seed";

test.describe("Schedule + shifts (regressions)", () => {
  test("SHIFT-2: 4-week weekly recurring creates exactly N rows (off-by-one regression)", async ({ adminPage: page }) => {
    const customer = await createCustomer({ name: qaTag("sched_cust") });
    await page.goto(`/schedule/new?customer=${customer.id}`);
    // Pick a Monday (today might not be one; the form has a date picker)
    const monday = nextMondayISO();
    await page.getByLabel(/date/i).fill(monday);
    await page.getByLabel(/start/i).fill("09:00");
    await page.getByLabel(/end/i).fill("17:00");
    // Enable recurring weekly for 4 weeks Mon-Fri
    await page.getByRole("button", { name: /repeat/i }).click();
    await page.getByLabel(/until/i).fill(addDaysISO(monday, 27)); // inclusive 4-calendar-week span
    await page.getByRole("button", { name: /save|create/i }).click();

    const sb = serviceClient();
    const { data } = await sb.from("shifts").select("id").eq("customer_id", customer.id);
    // 5 weekdays × 4 weeks = 20 rows. Critical: not 21 (off-by-one) or 25 (weekend bleed).
    expect(data!.length).toBe(20);
  });

  test("SHIFT-6: count chip appears on busy days (consistency)", async ({ adminPage: page }) => {
    const customer = await createCustomer({ name: qaTag("busy_day") });
    const day = nextMondayISO();
    const sb = serviceClient();
    // Seed 3 shifts on the same day — exceeds MAX_VISIBLE_LANES = 2.
    await Promise.all([
      sb.from("shifts").insert({ customer_id: customer.id, shift_date: day, start_time: "09:00", end_time: "10:00", state: "scheduled" }),
      sb.from("shifts").insert({ customer_id: customer.id, shift_date: day, start_time: "11:00", end_time: "12:00", state: "scheduled" }),
      sb.from("shifts").insert({ customer_id: customer.id, shift_date: day, start_time: "13:00", end_time: "14:00", state: "scheduled" }),
    ]);

    await page.goto("/schedule");
    // Navigate the calendar to the right week if the helper isn't on screen
    const chip = page.getByText(/3 SHIFTS/i);
    await expect(chip).toBeVisible({ timeout: 7_000 });
    // The lane-overflow "+N MORE" pill must NOT appear in count-chip mode.
    await expect(page.getByText(/\+\d+ more/i)).toHaveCount(0);
  });

  test("SHIFT-12: typed-RESET wipes ALL future shifts regardless of state", async ({ adminPage: page }) => {
    const sb = serviceClient();
    const customer = await createCustomer({ name: qaTag("reset_cust") });
    const day = nextMondayISO();
    // Seed mixed-state future shifts.
    await sb.from("shifts").insert([
      { customer_id: customer.id, shift_date: day, start_time: "09:00", end_time: "10:00", state: "scheduled" },
      { customer_id: customer.id, shift_date: day, start_time: "10:00", end_time: "11:00", state: "in_progress" },
      { customer_id: customer.id, shift_date: day, start_time: "11:00", end_time: "12:00", state: "complete" },
      { customer_id: customer.id, shift_date: day, start_time: "12:00", end_time: "13:00", state: "late" },
      { customer_id: customer.id, shift_date: day, start_time: "13:00", end_time: "14:00", state: "cancelled" },
    ]);

    await page.goto("/schedule/manage");
    page.once("dialog", async (d) => d.accept("RESET"));
    await page.getByRole("button", { name: /reset/i }).click();

    // After: zero future rows for this customer.
    const { data } = await sb
      .from("shifts")
      .select("id, state")
      .eq("customer_id", customer.id)
      .gte("shift_date", todayISO());
    expect(data!.length).toBe(0);
  });

  test.afterAll(async () => {
    const sb = serviceClient();
    await sb.from("shifts").delete().like("series_id", "qa_%");
    await sb.from("customers").delete().like("name", "qa_%");
  });
});

function nextMondayISO(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun..6=Sat
  const add = (8 - dow) % 7 || 7; // always *next* Monday
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
