import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  return match?.[1] ?? "";
}

describe("HQ sidebar layout", () => {
  it("keeps group headings at their natural height inside the scroll rail", () => {
    const sectionHeading = ruleBody(
      ".hq-shell:not(.admin-shell) .hq-sidebar__section",
    );

    expect(sectionHeading).toMatch(/flex:\s*0 0 auto;/);
    expect(sectionHeading).not.toMatch(/overflow:\s*hidden;/);
  });
});
