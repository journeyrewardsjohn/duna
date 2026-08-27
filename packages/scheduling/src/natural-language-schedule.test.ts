import { describe, expect, it } from "vitest";
import {
  findRecurringScheduleConflicts,
  parseNaturalLanguageSchedule,
} from "./natural-language-schedule";

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

  it("understands a single Friday, until, and a timezone suffix", () => {
    expect(
      parseNaturalLanguageSchedule(
        "Every Friday only available 8am until 2pm EST",
      ),
    ).toMatchObject({
      status: "ready",
      summary: "Friday · 8:00 AM–2:00 PM",
      blocks: [
        {
          weekday: 5,
          startsAtMinute: 480,
          endsAtMinute: 840,
        },
      ],
    });
  });

  it("creates split shifts for weekday groups", () => {
    const draft = parseNaturalLanguageSchedule(
      "Weekdays from 9am to 1pm and 3pm to 7pm",
    );
    expect(draft.status).toBe("ready");
    expect(draft.blocks).toHaveLength(10);
    expect(draft.blocks.filter((block) => block.weekday === 1)).toEqual([
      expect.objectContaining({ startsAtMinute: 540, endsAtMinute: 780 }),
      expect.objectContaining({ startsAtMinute: 900, endsAtMinute: 1_140 }),
    ]);
  });

  it("reports overlaps with existing schedules before a draft is applied", () => {
    const draft = parseNaturalLanguageSchedule("Friday 8am until 2pm");
    expect(
      findRecurringScheduleConflicts({
        proposed: draft.blocks,
        existing: [
          {
            weekday: 5,
            startsAtMinute: 9 * 60,
            endsAtMinute: 12 * 60,
            scheduleName: "Usual availability",
          },
          {
            weekday: 1,
            startsAtMinute: 9 * 60,
            endsAtMinute: 12 * 60,
            scheduleName: "Monday shift",
          },
        ],
      }),
    ).toHaveLength(1);
  });
});
