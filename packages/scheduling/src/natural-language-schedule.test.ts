import { describe, expect, it } from "vitest";
import { parseNaturalLanguageSchedule } from "./natural-language-schedule";

describe("natural language schedule drafts", () => {
  it("turns the coach's school example into reviewable weekly blocks", () => {
    expect(
      parseNaturalLanguageSchedule(
        "I can't work on Mon, Weds, Fri from Noon-3pm for school",
      ),
    ).toEqual({
      status: "ready",
      summary: "Monday, Wednesday, Friday · 12:00 PM–3:00 PM",
      reason: "school",
      blocks: [
        {
          weekday: 1,
          day: "Monday",
          startsAtMinute: 720,
          endsAtMinute: 900,
        },
        {
          weekday: 3,
          day: "Wednesday",
          startsAtMinute: 720,
          endsAtMinute: 900,
        },
        {
          weekday: 5,
          day: "Friday",
          startsAtMinute: 720,
          endsAtMinute: 900,
        },
      ],
      warnings: [],
    });
  });

  it("keeps unclear requests in draft instead of publishing guesses", () => {
    const draft = parseNaturalLanguageSchedule("I have class sometimes");
    expect(draft.status).toBe("needs-clarification");
    expect(draft.blocks).toEqual([]);
    expect(draft.warnings).toHaveLength(2);
  });
});
