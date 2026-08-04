import { describe, expect, it } from "vitest";
import { compactPlayerName } from "./player-name";

describe("compactPlayerName", () => {
  it("shows a first initial and full last name", () => {
    expect(compactPlayerName("John Sutton")).toBe("J. Sutton");
    expect(compactPlayerName("Phil Dalhausser")).toBe("P. Dalhausser");
  });

  it("uses the final surname token and preserves mononyms", () => {
    expect(compactPlayerName("Taylor Marie Crabb")).toBe("T. Crabb");
    expect(compactPlayerName("Cherif")).toBe("Cherif");
  });
});
