import { defineConfig } from "@playwright/test";
import releaseGate from "./playwright.config";
import { visualNow, visualTimezone } from "./tests/e2e/hq-visual/harness";

/**
 * HQ visual-regression baselines and runtime CSS coverage.
 *
 * This config is deliberately separate from `playwright.config.ts`, so
 * `pnpm test:e2e` and `pnpm verify` never run it. See "HQ visual regression"
 * in docs/OPERATIONS.md for how baselines are generated and compared.
 */
const port = Number.parseInt(
  process.env.PLAYWRIGHT_HQ_VISUAL_PORT ?? "3210",
  10,
);
const baseURL = `http://127.0.0.1:${port}`;

// Screenshots compare a production build. Runtime CSS coverage needs the
// development server, whose stylesheet keeps one marker per source file.
const serverMode = process.env.HQ_VISUAL_SERVER === "dev" ? "dev" : "start";

// The suite builds HQ itself, inside the demo environment below, so a
// screenshot can never come from a stale or connected build. Next.js is
// started through node directly: the clock preload must reach the server
// process and nothing else.
const next = `node --require ../../tests/e2e/hq-visual/pinned-clock.cjs node_modules/next/dist/bin/next ${serverMode} --port ${port} --hostname 127.0.0.1`;
const serverCommand =
  serverMode === "dev" ? next : `pnpm build:agent && pnpm build && ${next}`;

// Committed baselines are Linux renders from the pinned Playwright container.
// Any other host keeps its own baselines in an ignored folder, for comparing
// a branch against its own base on the same machine.
const committedBaselines = process.platform === "linux";
const snapshotPathTemplate = committedBaselines
  ? "{testDir}/__screenshots__/{projectName}/{arg}{ext}"
  : `{testDir}/.local-baselines/${process.platform}/{projectName}/{arg}{ext}`;

// The release gate's three viewports, rendered at one device pixel per CSS
// pixel. Tall phone pages at 3x exceed the compositor's surface limits and
// resample fixed-position images differently from run to run; at 1x the
// layout is identical and the baselines are a ninth of the size.
const viewports = (releaseGate.projects ?? []).map((project) => ({
  name: project.name ?? "desktop",
  use: { ...project.use, deviceScaleFactor: 1 },
}));

export default defineConfig({
  testDir: "./tests/e2e/hq-visual",
  outputDir: "./test-results/hq-visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  workers: Number.parseInt(
    process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? "2" : "4"),
    10,
  ),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/hq-visual" }],
  ],
  snapshotPathTemplate,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Tolerate rasterizer rounding (two levels per channel); fail anything
      // a person could see, including a one-step change in a neutral surface.
      threshold: 0.01,
      maxDiffPixels: 0,
    },
  },
  use: {
    baseURL,
    browserName: "chromium",
    // Playwright's bundled headless Chromium rasterizes in software, so two
    // runs produce identical pixels. Branded Chrome composites on the GPU and
    // does not.
    channel: undefined,
    launchOptions: {
      args: [
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-lcd-text",
        "--font-render-hinting=none",
      ],
    },
    locale: "en-US",
    timezoneId: visualTimezone,
    trace: "retain-on-failure",
  },
  webServer: {
    command: serverCommand,
    cwd: "./apps/hq",
    port,
    // Only a server started with the pinned clock renders the baselines, so
    // reuse is an explicit local debugging choice, never a default.
    reuseExistingServer: process.env.HQ_VISUAL_REUSE_SERVER === "1",
    // Covers the agent and Next.js production builds on a cold runner.
    timeout: 900_000,
    env: {
      DUNA_VISUAL_NOW: visualNow,
      TZ: visualTimezone,
      NEXT_PUBLIC_DEMO_MODE: "true",
      // Demo adapter only. Blank values win over any app-local .env file, so
      // this suite cannot reach a database or an identity provider.
      DATABASE_URL: "",
      NEON_READ_ONLY_REPLICA: "",
      DUNA_DATA_SOURCE: "demo",
      WORKOS_API_KEY: "",
      WORKOS_CLIENT_ID: "",
      WORKOS_COOKIE_PASSWORD: "",
    },
  },
  projects: [
    ...viewports.map((viewport) => ({
      ...viewport,
      testMatch: ["hq-visual.spec.ts", "route-manifest.spec.ts"],
    })),
    ...viewports.map((viewport) => ({
      ...viewport,
      name: `coverage-${viewport.name}`,
      testMatch: ["css-coverage.spec.ts"],
    })),
  ],
});
