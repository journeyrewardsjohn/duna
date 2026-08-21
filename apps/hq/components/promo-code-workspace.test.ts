import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./promo-code-workspace.tsx", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(
  new URL("../app/design-v3.css", import.meta.url),
  "utf8",
);

describe("promo code creation workspace", () => {
  it("captures the promotion as a guided four-stage decision flow", () => {
    expect(component).toContain('{ label: "The offer", shortLabel: "Offer" }');
    expect(component).toContain("Eligible purchases");
    expect(component).toContain("Availability");
    expect(component).toContain("Review and create");
    expect(component).toContain("SmartDateRangePicker");
  });

  it("keeps a live summary beside the active stage and stacks it responsively", () => {
    expect(component).toContain('className="promo-preview"');
    expect(component).toContain("What you’re creating");
    expect(stylesheet).toMatch(
      /\.promo-creator__form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(300px, 380px\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.promo-creator__form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it("hides optional constraints until the operator turns them on", () => {
    expect(component).toContain("Set a minimum purchase");
    expect(component).toContain("Cap the discount");
    expect(component).toContain("Limit total redemptions");
    expect(component).toContain("Limit uses per member");
  });
});
