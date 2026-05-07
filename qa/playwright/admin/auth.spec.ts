import { test, expect } from "@playwright/test";

test.describe("Admin auth", () => {
  test("LOGIN-A1: manager logs in with valid creds", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/(?!login)/);
  });

  test("LOGIN-A2: wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill("wrong-password-zzz");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 7_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("LOGIN-A5: unauthenticated visit redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login/);
  });

  test("LOGOUT-A1: sign-out clears session", async ({ page }) => {
    // Log in fresh
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/(?!login)/);

    // Sign out
    await page.getByRole("button", { name: /sign out|log out/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // Going back to a protected route should not work.
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login/);
  });
});
