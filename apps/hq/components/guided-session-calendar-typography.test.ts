import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../app/design-v3.css", import.meta.url),
  "utf8",
);

const monthHeadingStart = stylesheet.indexOf(
  'body[data-zone="operator"]\n  :is(.guided-session-schedule, .guided-session-blackouts)\n  .duna-date-range__month\n  > h3 {',
);
const monthHeadingEnd = stylesheet.indexOf(
  'body[data-zone="operator"] .guided-session-schedule__rules {',
  monthHeadingStart,
);
const monthHeadingStyles = stylesheet.slice(monthHeadingStart, monthHeadingEnd);

describe("guided session calendar typography", () => {
  it("keeps month labels at calendar scale instead of the stage headline scale", () => {
    expect(monthHeadingStart).toBeGreaterThanOrEqual(0);
    expect(monthHeadingEnd).toBeGreaterThan(monthHeadingStart);
    expect(monthHeadingStyles).toMatch(/font-size:\s*1rem;/);
    expect(monthHeadingStyles).toMatch(/line-height:\s*1\.25;/);
    expect(monthHeadingStyles).toMatch(/max-width:\s*none;/);
  });
});
