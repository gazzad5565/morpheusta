import { test, expect } from "../fixtures/auth";
import { serviceClient, qaTag } from "../helpers/supabase";

test.describe("Customers CRUD + data integrity", () => {
  test("CUST-1: create customer with address persists & shows in list", async ({ adminPage: page }) => {
    const name = qaTag("acme");
    await page.goto("/customers/new");
    await page.getByLabel(/name/i).fill(name);
    await page.getByLabel(/code/i).fill(name.slice(0, 12));
    await page.getByLabel(/address/i).fill("10 Downing Street, London");
    // Geocode button — wait for lat/lng to populate.
    await page.getByRole("button", { name: /geocode|find/i }).click();
    await expect(page.getByLabel(/latitude/i)).not.toHaveValue("");
    await page.getByRole("button", { name: /save|create/i }).click();

    await expect(page).toHaveURL(/\/customers/);
    await page.goto("/customers");
    await expect(page.getByText(name)).toBeVisible();

    // DI-1 + DI-2: exactly one row in DB with this name.
    const sb = serviceClient();
    const { data, error } = await sb.from("customers").select("id, name, latitude, longitude").eq("name", name);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].latitude).not.toBeNull();
  });

  test("CUST-3: duplicate-name guard does not create two rows on rapid double-click", async ({ adminPage: page }) => {
    const name = qaTag("dupe");
    await page.goto("/customers/new");
    await page.getByLabel(/name/i).fill(name);
    await page.getByLabel(/code/i).fill(name.slice(0, 12));
    // Disable button after first click should be the design — assert no double-write.
    const btn = page.getByRole("button", { name: /save|create/i });
    await btn.click({ clickCount: 2, delay: 10 });
    await expect(page).toHaveURL(/\/customers/);

    const sb = serviceClient();
    const { data } = await sb.from("customers").select("id").eq("name", name);
    expect(data!.length).toBe(1);
  });

  test("CUST-4: edit name — list reflects new name, no second row", async ({ adminPage: page }) => {
    const sb = serviceClient();
    const oldName = qaTag("rename_old");
    const newName = qaTag("rename_new");
    const { data: created } = await sb
      .from("customers")
      .insert({ name: oldName, code: oldName.slice(0, 12), initials: "QA", color: "#888", active: true })
      .select()
      .single();

    await page.goto(`/customers/${created!.id}/edit`);
    await page.getByLabel(/name/i).fill(newName);
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${created!.id}`));

    const { data: rows } = await sb.from("customers").select("id, name").or(`name.eq.${oldName},name.eq.${newName}`);
    expect(rows).toHaveLength(1);
    expect(rows![0].name).toBe(newName);
    expect(rows![0].id).toBe(created!.id); // same row, not a clone
  });

  test("CUST-6: toggle active surfaces under Inactive filter", async ({ adminPage: page }) => {
    const sb = serviceClient();
    const name = qaTag("inactive");
    const { data: created } = await sb
      .from("customers")
      .insert({ name, code: name.slice(0, 12), initials: "QA", color: "#888", active: true })
      .select()
      .single();

    await page.goto(`/customers/${created!.id}`);
    await page.getByRole("button", { name: /deactivate|set inactive/i }).click();
    await page.goto("/customers");
    await page.getByRole("button", { name: /^inactive$/i }).click();
    await expect(page.getByText(name)).toBeVisible();
  });

  test.afterAll(async () => {
    const sb = serviceClient();
    await sb.from("customers").delete().like("name", "qa_%");
  });
});
