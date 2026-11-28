import { expect, type Page } from "@playwright/test";

/**
 * Accessibility scan built only from what the repository already has
 * (Playwright's accessibility tree, `ariaSnapshot`). It checks what an agent
 * and a screen reader both depend on:
 * - every button, link, field, tab, option, menu item and image has a name;
 * - the document has a language and a title;
 * - there is one main landmark.
 *
 * It runs automatically after every passing journey step (fixtures.ts). It is
 * not a WCAG audit (no contrast, no ARIA-rule checks): the full scan waits for
 * a scanner the team has not added yet; see docs/plan/persona-journeys.md,
 * "Accessibility scan".
 */
const NAMED_ROLES = [
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "img",
] as const;

const unnamedLine = new RegExp(
  `^\\s*- (${NAMED_ROLES.join("|")})(?=\\s*(?:\\[|:|$))`,
);

export interface A11yFinding {
  readonly rule:
    | "unnamed-control"
    | "document-language"
    | "document-title"
    | "main-landmark";
  readonly detail: string;
}

export async function scanAccessibility(page: Page): Promise<A11yFinding[]> {
  const findings: A11yFinding[] = [];
  const snapshot = await page.locator("body").ariaSnapshot();
  const lines = snapshot.split("\n");
  lines.forEach((line, index) => {
    const match = line.match(unnamedLine);
    if (!match) return;
    // Give the reviewer the nearest named ancestor line as context.
    const context = lines
      .slice(Math.max(0, index - 3), index)
      .map((entry) => entry.trim())
      .join(" / ");
    findings.push({
      rule: "unnamed-control",
      detail: `${match[1]} without a name (after: ${context || "start of page"})`,
    });
  });
  const facts = await page.evaluate(() => ({
    lang: document.documentElement.getAttribute("lang") ?? "",
    title: document.title.trim(),
    mains: document.querySelectorAll("main, [role='main']").length,
  }));
  if (!facts.lang) {
    findings.push({ rule: "document-language", detail: "<html> has no lang" });
  }
  if (!facts.title) {
    findings.push({ rule: "document-title", detail: "the page has no title" });
  }
  if (facts.mains !== 1) {
    findings.push({
      rule: "main-landmark",
      detail: `expected one main landmark, found ${facts.mains}`,
    });
  }
  return findings;
}

/** A finding the journey expects on one page, with the reason and owner. */
export interface A11yAllowance {
  /** Matches the page URL; omit for every page. */
  readonly page?: RegExp;
  readonly match: RegExp;
  readonly reason: string;
}

export async function expectAccessible(
  page: Page,
  allow: readonly A11yAllowance[] = [],
) {
  const url = page.url();
  const findings = (await scanAccessibility(page)).filter(
    (finding) =>
      !allow.some(
        (allowance) =>
          (allowance.page?.test(url) ?? true) &&
          allowance.match.test(`[${finding.rule}] ${finding.detail}`),
      ),
  );
  expect(
    findings,
    `Accessibility findings on ${page.url()}:\n${findings
      .map((finding) => `- [${finding.rule}] ${finding.detail}`)
      .join("\n")}`,
  ).toEqual([]);
}
