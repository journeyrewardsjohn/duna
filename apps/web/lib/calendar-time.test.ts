import { describe, expect, it } from "vitest";
import { calendarInstantDay, calendarWeekStart } from "./calendar-time";

describe("player calendar venue days", () => {
  it("keeps the same instant on each venue's local date", () => {
    const instant = "2026-09-20T02:30:00Z";
    expect(calendarInstantDay(instant, "America/Los_Angeles")).toBe(
      "2026-09-19",
    );
    expect(calendarInstantDay(instant, "Europe/London")).toBe("2026-09-20");
    expect(calendarInstantDay(instant, "Asia/Tokyo")).toBe("2026-09-20");
  });
  it("handles the repeated hour on daylight-saving transitions", () => {
    for (const instant of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"])
      expect(calendarInstantDay(instant, "America/Los_Angeles")).toBe(
        "2026-11-01",
      );
  });
  it("keeps weeks continuous across month and year boundaries", () => {
    expect(calendarWeekStart("2026-01-01")).toBe("2025-12-28");
    expect(calendarWeekStart("2026-02-01")).toBe("2026-02-01");
  });
});
