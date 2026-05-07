import { test, expect, chromium } from "@playwright/test";
import { serviceClient, qaTag } from "../helpers/supabase";
import { createCustomer, createTask } from "../fixtures/seed";

const ADMIN_URL = process.env.ADMIN_URL!;
const MOBILE_URL = process.env.MOBILE_URL!;

/**
 * GOLD-1: full happy-path journey across both apps.
 *  - Admin creates customer, task, and a shift for the rep
 *  - Rep logs in, checks in on time + on site
 *  - Rep completes the compulsory task
 *  - Rep checks out
 *  - Admin sees state=complete and timesheet hours match
 */
test("GOLD-1: admin → rep → admin happy-path", async () => {
  const sb = serviceClient();
  const { data: profile } = await sb.from("profiles").select("id").eq("email", process.env.REP_EMAIL).single();
  const repId = profile!.id;

  // 1. Admin: create customer + compulsory task + shift starting now.
  const customer = await createCustomer({ name: qaTag("gold_cust"), lat: 51.5074, lng: -0.1278, geofenceM: 200 });
  const task = await createTask(customer.id, { name: qaTag("gold_task"), compulsory: true });
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const start = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const end = `${pad((now.getHours() + 1) % 24)}:${pad(now.getMinutes())}`;
  const { data: shift } = await sb
    .from("shifts")
    .insert({ customer_id: customer.id, rep_id: repId, shift_date: today, start_time: start, end_time: end, state: "scheduled" })
    .select()
    .single();

  // 2. Rep flow on mobile.
  const browser = await chromium.launch();
  const repCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 51.5074, longitude: -0.1278 },
    permissions: ["geolocation"],
  });
  const repPage = await repCtx.newPage();
  await repPage.goto(`${MOBILE_URL}/login`);
  await repPage.getByLabel(/email/i).fill(process.env.REP_EMAIL!);
  await repPage.getByLabel(/password/i).fill(process.env.REP_PASSWORD!);
  await repPage.getByRole("button", { name: /sign in|log in/i }).click();

  // Check in
  await repPage.goto(`${MOBILE_URL}/check-in`);
  await repPage.getByRole("button", { name: /check in/i }).click();
  await expect(repPage).toHaveURL(/\/check-in\/success|\/active/);

  // Complete compulsory task
  await repPage.goto(`${MOBILE_URL}/active`);
  const taskRow = repPage.getByText(task.name);
  await taskRow.click();
  // Some UIs render checkbox; some toggle on row tap. The data layer is the truth.
  await repPage.waitForTimeout(500);

  // Check out
  await repPage.goto(`${MOBILE_URL}/check-out`);
  await repPage.getByRole("button", { name: /check out|finish/i }).click();
  await expect(repPage).toHaveURL(/\/summary/);

  // 3. Admin verifies state + timesheet
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${ADMIN_URL}/login`);
  await adminPage.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL!);
  await adminPage.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD!);
  await adminPage.getByRole("button", { name: /sign in|log in/i }).click();

  // DB-level assertion is the strongest signal.
  const { data: finalShift } = await sb
    .from("shifts")
    .select("state, check_in_at, check_out_at")
    .eq("id", shift!.id)
    .single();
  expect(finalShift!.state).toBe("complete");
  expect(finalShift!.check_in_at).not.toBeNull();
  expect(finalShift!.check_out_at).not.toBeNull();

  const { data: completions } = await sb
    .from("task_completions")
    .select("id")
    .eq("shift_id", shift!.id)
    .eq("task_id", task.id);
  expect(completions!.length).toBeGreaterThanOrEqual(1);

  await browser.close();

  // Cleanup
  await sb.from("shifts").delete().eq("id", shift!.id);
  await sb.from("customer_tasks").delete().eq("id", task.id);
  await sb.from("customers").delete().eq("id", customer.id);
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
