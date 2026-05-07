import { test as base, Page, expect } from "@playwright/test";

type Roles = {
  /** A page already logged in as a manager (admin console). */
  adminPage: Page;
  /** A page already logged in as a rep (mobile app). */
  repPage: Page;
};

/**
 * Logs in via the actual login form so we exercise the real auth path.
 * For speed in big suites, swap to a `storageState` file written once
 * in a global setup; this version trades a couple of seconds for higher fidelity.
 */
export const test = base.extend<Roles>({
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/^.*\/(?!login).*$/, { timeout: 10_000 });
    await use(page);
    await ctx.close();
  },
  repPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      ...devicesIPhone(),
      geolocation: { latitude: 51.5074, longitude: -0.1278 }, // London by default
      permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.REP_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.REP_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/^.*\/(?!login).*$/, { timeout: 10_000 });
    await use(page);
    await ctx.close();
  },
});

export const expectVisible = async (page: Page, selector: string) => {
  await expect(page.locator(selector)).toBeVisible();
};

function devicesIPhone() {
  return {
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  };
}
