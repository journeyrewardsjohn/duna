import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

const calendarStart = stylesheet.indexOf(".schedule-calendar {");
const calendarEnd = stylesheet.indexOf(".sand-history-dispute", calendarStart);
const calendarStyles = stylesheet.slice(calendarStart, calendarEnd);

describe("schedule calendar typography", () => {
  it("keeps every explicit readable font size at 10px or larger", () => {
    const fontSizes = Array.from(
      calendarStyles.matchAll(/font-size:\s*([^;]+);/g),
      (match) => match[1]?.trim() ?? "",
    );

    const undersized = fontSizes.filter((value) => {
      const size = value.match(/([0-9.]+)(px|rem)/);
      if (!size) return false;

      const numeric = Number(size[1]);
      const pixels = size[2] === "rem" ? numeric * 16 : numeric;
      return pixels < 10;
    });

    expect(calendarStart).toBeGreaterThanOrEqual(0);
    expect(calendarEnd).toBeGreaterThan(calendarStart);
    expect(fontSizes.length).toBeGreaterThan(0);
    expect(undersized).toEqual([]);
  });
});
