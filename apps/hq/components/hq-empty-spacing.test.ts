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

describe("HQ empty-state spacing", () => {
  it("separates empty-state copy and actions", () => {
    const emptyState = ruleBody(".hq-empty");
    const bodyCopy = ruleBody(".hq-empty > span");
    const action = ruleBody(".hq-empty > .hq-button");

    expect(emptyState).toMatch(/gap:\s*0\.45rem;/);
    expect(bodyCopy).toMatch(/line-height:\s*1\.5;/);
    expect(action).toMatch(/margin-top:\s*0\.3rem;/);
  });
});
