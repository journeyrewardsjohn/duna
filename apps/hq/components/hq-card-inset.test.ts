import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const moneyWorkspace = readFileSync(
  new URL("./money-workspace.tsx", import.meta.url),
  "utf8",
);

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  return match?.[1] ?? "";
}

describe("HQ card inset contract", () => {
  it("provides one responsive inset for content cards", () => {
    const inset = ruleBody(".hq-card--inset");

    expect(inset).toMatch(
      /--hq-card-inset:\s*clamp\(1rem,\s*1\.4vw,\s*1\.5rem\);/,
    );
    expect(inset).toMatch(/padding:\s*var\(--hq-card-inset\);/);
  });

  it("keeps every Money shell on the shared inset contract", () => {
    const cardClassNames = [...moneyWorkspace.matchAll(/className="([^"]+)"/g)]
      .map((match) => match[1] ?? "")
      .filter((className) => className.split(/\s+/).includes("hq-card"));

    expect(cardClassNames).toHaveLength(7);
    cardClassNames.forEach((className) => {
      expect(className.split(/\s+/)).toContain("hq-card--inset");
    });
  });

  it("contains the wide ledger inside the Money workspace", () => {
    const workspace = ruleBody(".money-workspace");
    const table = ruleBody(".money-activity-table");

    expect(workspace).toMatch(/min-width:\s*0;/);
    expect(workspace).toMatch(/width:\s*100%;/);
    expect(stylesheet).toMatch(
      /\.money-workspace > \*,\s*\.money-ledger-layout > \*,\s*\.money-secondary-grid > \*\s*\{\s*min-width:\s*0;/,
    );
    expect(table).toMatch(/max-width:\s*100%;/);
  });
});
