import { test, expect } from "../fixtures/auth";
import { serviceClient, qaTag } from "../helpers/supabase";

/**
 * /customers/[id] — Contacts and Reps tabs.
 *
 * These tabs were rewritten in May 2026:
 *   - Contacts: inline CRUD form (add / edit / delete)
 *   - Reps: AssignRepPicker driven by a Combobox footer (multi-select +
 *     "Assign N reps" confirm button)
 *
 * Pre-rewrite there was no e2e coverage for either flow. Each test
 * creates its own QA-tagged customer and tears it down so the suite is
 * order-independent.
 */
test.describe("Customer detail — Contacts CRUD", () => {
  test("CONT-1: add → edit → delete a contact end-to-end", async ({
    adminPage: page,
  }) => {
    const sb = serviceClient();
    const name = qaTag("contacts_host");
    const { data: created, error } = await sb
      .from("customers")
      .insert({
        name,
        code: name.slice(0, 12),
        initials: "QA",
        color: "#888",
        active: true,
      })
      .select()
      .single();
    expect(error).toBeNull();
    const customerId = created!.id as string;

    try {
      await page.goto(`/customers/${customerId}`);
      await page.getByTestId("customer-tab-contacts").click();

      // Empty state — "Add contact" CTA opens the form.
      await page.getByRole("button", { name: /add contact/i }).click();

      // Fill the form (Name + Phone + Notes — Email left blank to
      // verify nullable fields don't trip the insert).
      await page.getByPlaceholder("Jane Smith").fill("Jane Smith");
      await page.getByPlaceholder("+27 21 555 0123").fill("+27 21 555 0123");
      await page
        .getByPlaceholder(/anything reps should know/i)
        .fill("Calls before 10am only.");
      await page.getByRole("button", { name: /^add contact$/i }).click();

      // Row should appear with the new name.
      await expect(page.getByText("Jane Smith")).toBeVisible();

      // DB-level: exactly one contact row for this customer.
      const { data: rows1 } = await sb
        .from("customer_contacts")
        .select("id, name, phone, notes")
        .eq("customer_id", customerId);
      expect(rows1).toHaveLength(1);
      expect(rows1![0].name).toBe("Jane Smith");
      expect(rows1![0].phone).toBe("+27 21 555 0123");

      // Edit the contact via the per-row pencil icon.
      await page.getByTitle("Edit contact").click();
      const nameInput = page.getByPlaceholder("Jane Smith");
      await nameInput.fill("Jane Smyth");
      await page.getByRole("button", { name: /^save$/i }).click();
      await expect(page.getByText("Jane Smyth")).toBeVisible();

      const { data: rows2 } = await sb
        .from("customer_contacts")
        .select("id, name")
        .eq("customer_id", customerId);
      expect(rows2).toHaveLength(1);
      expect(rows2![0].name).toBe("Jane Smyth");
      expect(rows2![0].id).toBe(rows1![0].id); // same row, not a clone

      // Delete via trash button (auto-accept the native confirm).
      page.once("dialog", (d) => d.accept());
      await page.getByTitle("Delete contact").click();

      // Empty state returns.
      await expect(page.getByText(/no contacts on file yet/i)).toBeVisible();

      // DB: contact gone (hard delete or marked deleted — both
      // produce zero rows for a fresh customer).
      const { data: rows3 } = await sb
        .from("customer_contacts")
        .select("id")
        .eq("customer_id", customerId);
      expect(rows3 ?? []).toHaveLength(0);
    } finally {
      await sb.from("customer_contacts").delete().eq("customer_id", customerId);
      await sb.from("customers").delete().eq("id", customerId);
    }
  });
});

test.describe("Customer detail — Reps assignment", () => {
  test("REPS-1: AssignRepPicker assigns the chosen rep and shows it in the list", async ({
    adminPage: page,
  }) => {
    const sb = serviceClient();
    const name = qaTag("reps_host");
    const { data: created, error } = await sb
      .from("customers")
      .insert({
        name,
        code: name.slice(0, 12),
        initials: "QA",
        color: "#888",
        active: true,
      })
      .select()
      .single();
    expect(error).toBeNull();
    const customerId = created!.id as string;

    // Find a rep profile to assign. We don't seed one — the test relies
    // on at least one `role='rep'` profile existing in the env.
    const { data: reps } = await sb
      .from("profiles")
      .select("id, name, email")
      .eq("role", "rep")
      .limit(1);
    test.skip(!reps || reps.length === 0, "No rep profile available in this env.");
    const rep = reps![0];

    try {
      await page.goto(`/customers/${customerId}`);
      await page.getByTestId("customer-tab-reps").click();

      // Empty-state CTA opens the AssignRepPicker (a Combobox with footer).
      await page.getByRole("button", { name: /assign a rep/i }).click();

      // Open the combobox panel — its trigger says "Choose reps to assign…".
      await page.getByText("Choose reps to assign…").click();

      // Tick the rep option (the panel renders one row per available
      // rep with the rep's display name).
      const repLabel = rep.name || rep.email || "";
      await page.getByRole("option", { name: new RegExp(repLabel, "i") }).click();

      // Confirm via the footer "Assign N rep(s)" button.
      await page
        .getByRole("button", { name: /^assign(\s+\d+\s+reps?)?$/i })
        .click();

      // Row appears in the assigned-reps list.
      await expect(page.getByText(repLabel)).toBeVisible();

      // DB: exactly one assignment row for this customer.
      const { data: assigns } = await sb
        .from("rep_customer_assignments")
        .select("rep_id, customer_id")
        .eq("customer_id", customerId);
      expect(assigns).toHaveLength(1);
      expect(assigns![0].rep_id).toBe(rep.id);
    } finally {
      await sb
        .from("rep_customer_assignments")
        .delete()
        .eq("customer_id", customerId);
      await sb.from("customers").delete().eq("id", customerId);
    }
  });
});
