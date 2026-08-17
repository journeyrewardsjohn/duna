import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../app/design-v3.css", import.meta.url),
  "utf8",
);

describe("HQ neutral surface theme", () => {
  it("keeps the light operator canvas neutral and its components white", () => {
    const operatorTheme = stylesheet.slice(
      stylesheet.indexOf('body[data-zone="operator"] {'),
      stylesheet.indexOf('html[data-theme="dark"] body[data-zone="operator"]'),
    );

    expect(operatorTheme).toContain("--ground: #f5f7fa;");
    expect(operatorTheme).toContain("--surface-1: #ffffff;");
    expect(operatorTheme).toContain("--surface-2: #f2f5f8;");
    expect(operatorTheme).toContain("--color-sand-light: var(--surface-2);");
  });

  it("gives dark mode the same canvas-to-surface depth", () => {
    const darkTheme = stylesheet.slice(
      stylesheet.indexOf('html[data-theme="dark"] body[data-zone="operator"]'),
      stylesheet.indexOf(".venue-create-stage__subheading"),
    );

    expect(darkTheme).toContain("--ground: #111820;");
    expect(darkTheme).toContain("--surface-1: #19222d;");
    expect(darkTheme).toContain("--surface-2: #222d39;");
  });

  it("keeps calendar framing white while demand colors remain meaningful", () => {
    expect(stylesheet).toMatch(
      /:is\(\.schedule-calendar, \.team-availability-calendar\) \{[\s\S]*?background: var\(--surface-1\);/,
    );
    expect(stylesheet).toContain("Calendar demand colors remain semantic");
  });
});
