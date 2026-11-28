import { defineConfig, devices } from "@playwright/test";

const webPort = Number.parseInt(process.env.PLAYWRIGHT_WEB_PORT ?? "3000", 10);
const hqPort = Number.parseInt(process.env.PLAYWRIGHT_HQ_PORT ?? "3001", 10);
const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ?? `http://127.0.0.1:${hqPort}`;
// Viewport suites represent separate local clients. Sharing one loopback IP
// exhausts the public API bucket in fast production-build runs. Keep the real
// limiter enabled, and never supply a synthetic identity to a remote target.
const localTargets = [webBaseUrl, hqBaseUrl].every((url) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
);
const clientHeaders = (client: number) =>
  localTargets ? { "x-forwarded-for": `127.0.0.${client}` } : undefined;
const webServerCommand = process.env.CI
  ? `pnpm --filter @duna/web exec next start --port ${webPort} --hostname 127.0.0.1`
  : `pnpm --filter @duna/web exec next dev --port ${webPort} --hostname 127.0.0.1`;
const hqServerCommand = process.env.CI
  ? `pnpm --filter @duna/hq exec next start --port ${hqPort} --hostname 127.0.0.1`
  : `pnpm --filter @duna/hq exec next dev --port ${hqPort} --hostname 127.0.0.1`;

// The persona suite (tests/e2e/personas) signs in as a chosen demo persona
// through a test-only cookie. The servers honour it only with this variable,
// only in demo mode and never on a production deployment
// (packages/api/src/demo-persona.ts).
const personaSwitch = { DUNA_DEMO_PERSONAS: "enabled" };
const personaSuite = "**/personas/**";

// Gallery run (docs/OPERATIONS.md "Component gallery end-to-end"): with
// TIDELINE_GALLERY=1 only the Tideline specs have anything to do, and they
// need only HQ, so the public web server is not started.
const galleryRun = process.env.TIDELINE_GALLERY === "1";

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
    ...(galleryRun
      ? []
      : [
          {
            command: webServerCommand,
            port: webPort,
            env: { NEXT_PUBLIC_HQ_URL: hqBaseUrl, ...personaSwitch },
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]),
    {
      command: hqServerCommand,
      port: hqPort,
      env: galleryRun
        ? { ...personaSwitch, TIDELINE_GALLERY: "1" }
        : personaSwitch,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "desktop",
      testIgnore: personaSuite,
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: clientHeaders(2),
      },
    },
    {
      name: "tablet",
      testIgnore: personaSuite,
      use: {
        ...devices["iPad (gen 7)"],
        browserName: "chromium",
        extraHTTPHeaders: clientHeaders(3),
      },
    },
    {
      name: "mobile",
      testIgnore: personaSuite,
      use: {
        ...devices["iPhone 15"],
        browserName: "chromium",
        extraHTTPHeaders: clientHeaders(4),
      },
    },
    {
      // Persona journeys (Q0): one desktop width, its own project so the
      // viewport suites above are unchanged. Run alone with
      // `pnpm test:e2e --project=personas`.
      name: "personas",
      testDir: "./tests/e2e/personas",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: clientHeaders(5),
      },
    },
  ],
});
