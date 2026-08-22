import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editor = readFileSync(
  new URL("./audience-editor.tsx", import.meta.url),
  "utf8",
);
const overview = readFileSync(
  new URL("./audience-overview.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(
  new URL("../globals.css", import.meta.url),
  "utf8",
);

describe("HQ Audience product experience", () => {
  it("exposes one unmistakable creation action and a useful empty state", () => {
    expect(page).toContain("buttonClassName");
    expect(page).toContain("Create audience");
    expect(overview).toContain("Create your first audience");
    expect(overview).toContain("Build a reusable group of people");
  });

  it("uses typed categorized rules without exposing internal identifiers", () => {
    expect(editor).toContain("FACT_CATEGORIES");
    expect(editor).toContain("All rules");
    expect(editor).toContain("Any rule");
    expect(editor).toContain("Lifetime value");
    expect(editor).toContain("startAdornment={<span>$</span>}");
    expect(editor).not.toContain("Event or product ID");
    expect(editor).not.toContain("minor currency units");
  });

  it("previews the complete definition including manual overlays", () => {
    expect(editor).toContain(
      'includePersonIds: mode === "dynamic" ? [] : included',
    );
    expect(editor).toContain(
      'excludePersonIds: mode === "hybrid" ? excluded : []',
    );
    expect(editor).toContain("candidateCount");
    expect(editor).toContain("Audience preview");
  });

  it("gives people identity and selection context", () => {
    expect(editor).toContain("Avatar");
    expect(editor).toContain("person.homeMarket");
    expect(editor).toContain("person.sandRating");
    expect(editor).toContain("Include");
    expect(editor).toContain("Exclude");
    expect(editor).toContain("Search by name, role, city, or Sand Rating");
  });

  it("stacks the builder and converts the overview table on narrow screens", () => {
    expect(stylesheet).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.audience-builder\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 680px\)[\s\S]*?\.audience-overview__table table,[\s\S]*?display:\s*block/,
    );
  });

  it("does not treat a single heading copy block as an action group", () => {
    expect(stylesheet).not.toContain(".hq-page-heading > div:last-child {");
    expect(stylesheet).toContain(
      ".hq-page-heading > div:last-child:not(:first-child)",
    );
  });
});
