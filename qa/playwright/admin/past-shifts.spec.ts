import { test, expect } from "../fixtures/auth";
import { serviceClient, qaTag } from "../helpers/supabase";

/**
 * /past-shifts — archive of completed (and optionally cancelled) shifts.
 *
 * This page was added in May 2026. The store function `listPastShifts`
 * is capped via `.limit()` so on a long-lived org the page can't pull
 * an unbounded payload — we don't assert the cap directly here, but the
 * smoke covers load + filter chip switching + view-toggle.
 */
test.describe("Past Shifts archive", () => {
  test("PAST-1: page loads with the default 30-day window and renders chips + table", async ({
    adminPage: page,
  }) => {
    await page.goto("/past-shifts");
    // The default period chip is "30 days". When no completed shifts
    // exist in the env, the body shows the EmptyState; either result
    // is acceptable for the smoke.
    await expect(page.getByRole("button", { name: /^7 days/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^30 days/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^90 days/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^all time/i })).toBeVisible();
    // Toggle between Table and Grid — both must render without error.
    await page.getByRole("button", { name: /^grid$/i }).click();
    await page.getByRole("button", { name: /^table$/i }).click();
  });

  test("PAST-2: a completed shift in the last 30 days appears in the archive", async ({
    adminPage: page,
  }) => {
    const sb = serviceClient();
    const customerName = qaTag("past_shift_host");
    const { data: customer } = await sb
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
    expect(customer).not.toBeNull();
    const customerId = customer!.id as string;

    // Insert a `complete` shift dated yesterday so it lands in every
    // (7/30/90/all) window. tasks_done==tasks_total so the row reads
    // as fully complete.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: shift, error: shiftErr } = await sb
      .from("shifts")
      .insert({
        customer_id: customerId,
        shift_date: yesterday,
        start_time: "09:00",
        end_time: "17:00",
        state: "complete",
        tasks_done: 4,
        tasks_total: 4,
      })
      .select()
      .single();
    expect(shiftErr).toBeNull();
    const shiftId = shift!.id as string;

    try {
      await page.goto("/past-shifts");
      // Use 90 days to maximise the chance the shift lands inside the
      // window even if the test runs near a daylight-savings flip.
      await page.getByRole("button", { name: /^90 days/i }).click();
      await expect(page.getByText(customerName)).toBeVisible();
    } finally {
      await sb.from("shifts").delete().eq("id", shiftId);
      await sb.from("customers").delete().eq("id", customerId);
    }
  });
});
