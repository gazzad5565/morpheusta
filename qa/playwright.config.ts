import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config();

const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:3000";
const MOBILE_URL = process.env.MOBILE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./playwright",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "admin",
      testDir: "./playwright/admin",
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
    },
    {
      name: "mobile",
      testDir: "./playwright/mobile",
      use: { ...devices["iPhone 14"], baseURL: MOBILE_URL },
    },
    {
      name: "e2e",
      testDir: "./playwright/e2e",
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
    },
  ],
});
