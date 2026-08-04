import { describe, expect, it } from "vitest";
import { datePillDays, instantIsoDay, parseIsoDay } from "./date-filter";

describe("date filters", () => {
  it("rejects malformed and impossible calendar days", () => {
    expect(parseIsoDay("2026-08-04")).toBe("2026-08-04");
    expect(parseIsoDay("2026-02-30")).toBeUndefined();
    expect(parseIsoDay("August 4")).toBeUndefined();
  });

  it("builds a stable seven-day window across month boundaries", () => {
    expect(datePillDays("2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("resolves an instant into the venue calendar day", () => {
    expect(instantIsoDay("2026-08-05T02:30:00Z", "America/Los_Angeles")).toBe(
      "2026-08-04",
    );
  });
});
