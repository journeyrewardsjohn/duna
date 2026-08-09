import { defineConfig, devices } from "@playwright/test";

const webPort = Number.parseInt(process.env.PLAYWRIGHT_WEB_PORT ?? "3000", 10);
const hqPort = Number.parseInt(process.env.PLAYWRIGHT_HQ_PORT ?? "3001", 10);
const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ?? `http://127.0.0.1:${hqPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: process.env.CI ? 90_000 : 60_000,
  workers: Number.parseInt(
    process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? "2" : "4"),
    10,
  ),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webBaseUrl,
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `pnpm --filter @duna/web exec next dev --port ${webPort} --hostname 127.0.0.1`,
      port: webPort,
      env: { NEXT_PUBLIC_HQ_URL: hqBaseUrl },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @duna/hq exec next dev --port ${hqPort} --hostname 127.0.0.1`,
      port: hqPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet",
      use: {
        ...devices["iPad (gen 7)"],
        browserName: "chromium",
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 15"],
        browserName: "chromium",
      },
    },
  ],
});
