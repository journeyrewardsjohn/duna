import { describe, expect, it } from "vitest";
import { activeSectionId, sectionHref } from "./document-core";

describe("activeSectionId", () => {
  const headings = [
    { id: "a", top: -400 },
    { id: "b", top: 60 },
    { id: "c", top: 500 },
  ];
  it("is the last heading that has passed the offset", () => {
    expect(activeSectionId(headings, 96)).toBe("b");
    expect(activeSectionId(headings, 40)).toBe("a");
  });
  it("is the first heading before any has passed", () => {
    expect(activeSectionId([{ id: "a", top: 300 }], 96)).toBe("a");
    expect(activeSectionId([], 96)).toBeUndefined();
  });
});

describe("sectionHref", () => {
  it("builds the absolute link to a heading", () => {
    expect(
      sectionHref(
        { origin: "https://duna.coach", pathname: "/legal/terms" },
        "1-scope",
      ),
    ).toBe("https://duna.coach/legal/terms#1-scope");
  });
});
