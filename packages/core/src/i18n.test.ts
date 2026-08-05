import { describe, expect, it } from "vitest";
import { formatVenueTime } from "./i18n";

describe("formatVenueTime", () => {
  it("supports dateStyle without mixing incompatible component options", () => {
    expect(
      formatVenueTime(
        "2026-06-14T11:30:00.000Z",
        "America/Los_Angeles",
        "en-US",
        { dateStyle: "full" },
      ),
    ).toBe("Sunday, June 14, 2026");
  });

  it("keeps the compact date and time defaults", () => {
    expect(
      formatVenueTime("2026-06-14T11:30:00.000Z", "America/Los_Angeles"),
    ).toBe("Jun 14, 4:30 AM");
  });
});
