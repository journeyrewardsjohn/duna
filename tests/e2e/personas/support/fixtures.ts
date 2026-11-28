import { test as base, expect } from "@playwright/test";
import { expectAccessible, type A11yAllowance } from "./a11y";
import { knownA11yFindings, knownIssues } from "./known-issues";
import {
  DEMO_PERSONA_COOKIE,
  personas,
  type Persona,
  type PersonaId,
} from "./personas";
import { formatIssues, QualityMonitor, type QualityAllowance } from "./quality";

export const webBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "3000"}`;
export const hqBaseUrl =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

/** An absolute HQ URL for a path. */
export function hq(path: string) {
  return new URL(path, hqBaseUrl).toString();
}

interface PersonaOptions {
  /** The persona every page in the test is signed in as. */
  persona: PersonaId;
  /**
   * Issues this test expects, by a short name, each with a reason. Prefer
   * fixing the page. (An object, not an array: Playwright reads an array
   * passed to test.use as a [value, options] pair.)
   */
  qualityAllowances: Readonly<Record<string, QualityAllowance>>;
  /** Accessibility findings this test expects, by name, with a reason. */
  a11yAllowances: Readonly<Record<string, A11yAllowance>>;
}

interface PersonaFixtures {
  personaProfile: Persona;
  quality: QualityMonitor;
  /** Run the built-in accessibility scan on the current page now. */
  checkAccessibility: () => Promise<void>;
  /** Automatic: scans the page a passing step ends on. */
  accessibilityScan: void;
}

export const test = base.extend<PersonaOptions & PersonaFixtures>({
  persona: ["player", { option: true }],
  qualityAllowances: [{}, { option: true }],
  a11yAllowances: [{}, { option: true }],

  personaProfile: async ({ persona }, use) => {
    await use(personas[persona]);
  },

  // Signs the browser context in as the persona on both apps. Cookies are
  // scoped by host, not port, so one cookie per origin covers web and HQ.
  context: async ({ context, persona }, use) => {
    await context.addCookies(
      [webBaseUrl, hqBaseUrl].map((url) => ({
        name: DEMO_PERSONA_COOKIE,
        value: persona,
        url,
      })),
    );
    await QualityMonitor.install(context);
    await use(context);
  },

  // Automatic: every journey fails on page errors, console errors, 5xx
  // responses, failed requests and duplicate mutations (quality.ts).
  quality: [
    async ({ context, qualityAllowances }, use, testInfo) => {
      const monitor = new QualityMonitor([
        new URL(webBaseUrl).origin,
        new URL(hqBaseUrl).origin,
      ]);
      for (const page of context.pages()) monitor.watch(page);
      context.on("page", (page) => monitor.watch(page));
      await use(monitor);
      const unexpected = monitor.unexpected([
        ...knownIssues,
        ...Object.values(qualityAllowances),
      ]);
      if (unexpected.length > 0 && testInfo.status === "passed") {
        await testInfo.attach("quality-issues", {
          body: formatIssues(unexpected),
          contentType: "text/plain",
        });
        throw new Error(
          `Interaction quality checks failed (definition-of-done.md):\n${formatIssues(unexpected)}`,
        );
      }
    },
    { auto: true },
  ],

  checkAccessibility: async ({ page, a11yAllowances }, use) => {
    await use(() =>
      expectAccessible(page, [
        ...knownA11yFindings,
        ...Object.values(a11yAllowances),
      ]),
    );
  },

  // Automatic: the page a passing step ends on gets the accessibility scan
  // (a11y.ts), so no journey can skip it.
  accessibilityScan: [
    async ({ page, checkAccessibility }, use, testInfo) => {
      await use();
      if (testInfo.status !== "passed" || page.isClosed()) return;
      if (!page.url().startsWith("http")) return;
      await checkAccessibility();
    },
    { auto: true },
  ],
});

export { expect };
