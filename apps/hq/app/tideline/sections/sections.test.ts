import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tideline gallery sections", () => {
  it("sections/index.ts lists every section file once, and nothing else", () => {
    const directory = import.meta.dirname;
    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => name.slice(0, -4))
      .sort();
    const lines = readFileSync(`${directory}/index.ts`, "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      expect(line).toMatch(
        /^export \{ default as [A-Za-z]+ \} from "\.\/[a-z-]+";$/,
      );
    }
    const listed = lines.map((line) => line.split('"./')[1]!.slice(0, -2));
    expect(new Set(listed).size, "a section is listed twice").toBe(
      listed.length,
    );
    expect([...listed].sort()).toEqual(files);
  });
});
