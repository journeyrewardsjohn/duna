import { describe, expect, it } from "vitest";
import {
  PARTICIPATION_COPY_KEYS,
  calendarDaysBetween,
  formatParticipationTime,
  participationDisplay,
  participationLockAt,
  readParticipationRuleV2,
  renderParticipationCopy,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
  validateLockExtension,
} from "./index";

const clinic = resolveParticipationRuleV2(
  readParticipationRuleV2({
    minParticipants: 4,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 1440,
    waitlist: true,
    tiers: [
      { minParticipants: 1, maxParticipants: 7, creditsPerPlayer: 3 },
      { minParticipants: 8, creditsPerPlayer: 2 },
    ],
  })!,
  { capacity: 12 },
);
// Thursday 10 December 2026, 6:00 PM Pacific = Friday 02:00 UTC.
const startsAt = new Date("2026-12-12T02:00:00.000Z");
const endsAt = new Date("2026-12-12T03:30:00.000Z");
const lockAt = participationLockAt({ startsAt, lockMinutesBeforeStart: 1440 });
const now = new Date("2026-12-08T17:00:00.000Z");
const zone = "America/Los_Angeles";

function view(
  overrides: Partial<Parameters<typeof participationDisplay>[0]> = {},
) {
  return renderParticipationDisplay(
    participationDisplay({
      rule: clinic,
      title: "Thursday clinic",
      capacity: 12,
      booked: 2,
      startsAt,
      endsAt,
      lockAt,
      now,
      timeZone: zone,
      ...overrides,
    }),
  );
}

describe("the words every surface shows", () => {
  it("needs players", () => {
    expect(view()).toMatchObject({
      status: "Needs 2 more",
      line: "Confirms Thu 6:00 PM if 2 more join",
      staff: "At risk · needs 2 by Thu 6:00 PM",
      price:
        "3 credits now. If more join by Thu 6:00 PM, the difference comes back.",
      ladder: ["1 to 7 players · 3 credits each", "8 or more · 2 credits each"],
      cancellation: "Free cancellation until Thu 6:00 PM",
    });
    expect(view({ booked: 3 }).line).toBe(
      "Confirms Thu 6:00 PM if 1 more joins",
    );
  });

  it("runs either way when the rule says run", () => {
    const run = resolveParticipationRuleV2(
      readParticipationRuleV2({ minParticipants: 4, minimumPolicy: "run" })!,
      { capacity: 12 },
    );
    expect(view({ rule: run }).line).toBe("Runs either way");
    expect(view({ rule: { ...clinic, minimumPolicy: "run" } }).line).toBe(
      "Runs either way · 2 more lowers the price",
    );
  });

  it("minimum reached, full, held places", () => {
    expect(view({ booked: 5 })).toMatchObject({
      status: "Minimum reached",
      line: "Confirms Thu 6:00 PM",
      staff: "On track · 5 of 12",
    });
    expect(view({ booked: 12, waiting: 3 })).toMatchObject({
      status: "Full",
      line: "3 waiting",
      staff: "Full · 3 waiting",
    });
    expect(view({ booked: 12 }).line).toBe("Join the waitlist");
    expect(view({ booked: 11, held: 1 }).line).toBe("1 place being booked");
  });

  it("after the lock", () => {
    const after = new Date("2026-12-11T03:00:00.000Z");
    expect(
      view({
        booked: 9,
        outcome: "minimum-met",
        decidedGroupSize: 9,
        now: after,
      }),
    ).toMatchObject({
      status: "Confirmed · 9 players",
      staff: "Confirmed · 9",
      price: "Group confirmed · you pay 2 credits",
    });
    expect(
      view({
        booked: 2,
        outcome: "run-under-minimum",
        decidedGroupSize: 2,
        now: after,
      }),
    ).toMatchObject({
      status: "Confirmed · small group",
      staff: "Running with 2 of 4",
    });
    expect(
      view({
        booked: 2,
        outcome: "cancel-under-minimum",
        decidedGroupSize: 2,
        now: after,
      }),
    ).toMatchObject({
      status: "Cancelled · not enough players",
      staff: "Cancelled · 2 of 4 booked",
    });
    expect(
      view({
        outcome: "cancelled-by-club",
        clubName: "Beach Elite",
        cancelledByName: "Jordan",
      }),
    ).toMatchObject({
      status: "Cancelled by Beach Elite",
      staff: "Cancelled by Jordan",
    });
  });

  it("late cancellation costs the final price (decision 4)", () => {
    const display = participationDisplay({
      rule: clinic,
      capacity: 12,
      booked: 9,
      outcome: "minimum-met",
      decidedGroupSize: 9,
      startsAt,
      endsAt,
      lockAt,
      now: new Date("2026-12-11T03:00:00.000Z"),
      timeZone: zone,
      viewer: { booked: true, quantity: 1, reservedCredits: 3 },
    });
    expect(display.cancellation).toMatchObject({
      allowed: true,
      free: false,
      lateCharge: 2,
    });
    expect(renderParticipationCopy(display.cancellation.line!)).toBe(
      "Cancelling now costs 2 credits. You get them back if someone takes your place.",
    );
  });

  it("done, absent and settled", () => {
    const after = new Date("2026-12-12T04:00:00.000Z");
    expect(
      view({
        booked: 5,
        outcome: "minimum-met",
        now: after,
        viewer: { booked: true, quantity: 1, absent: true },
      }),
    ).toMatchObject({
      status: "Done",
      line: "You were marked absent",
      staff: "Mark attendance",
    });
    expect(
      view({
        booked: 5,
        outcome: "minimum-met",
        now: after,
        attendanceClosed: true,
      }).staff,
    ).toBe("Done");
  });

  it("a session without a rule shows only places", () => {
    expect(view({ rule: undefined, booked: 9 })).toMatchObject({
      status: "3 spots left",
    });
  });

  it("gives screen readers one sentence", () => {
    expect(
      view({ booked: 4, rule: { ...clinic, minParticipants: 6 } }).a11y,
    ).toBe(
      "Thursday clinic. Needs 2 more. Confirms Thu 6:00 PM if 2 more join. 4 of 12 places booked.",
    );
  });

  it("has English for every key", () => {
    for (const key of PARTICIPATION_COPY_KEYS) {
      expect(
        renderParticipationCopy({ key, params: { n: 2, title: "Clinic" } }),
      ).not.toBe("");
    }
  });
});

describe("time zones and the lock", () => {
  it("uses the day name within 6 days and the date beyond", () => {
    expect(
      formatParticipationTime({ at: lockAt, now, timeZone: zone }).label,
    ).toBe("Thu 6:00 PM");
    expect(
      formatParticipationTime({
        at: lockAt,
        now: new Date("2026-12-01T17:00:00.000Z"),
        timeZone: zone,
      }).label,
    ).toBe("Dec 10, 6:00 PM");
  });

  it("adds the viewer's time when it differs", () => {
    expect(
      formatParticipationTime({
        at: lockAt,
        now,
        timeZone: zone,
        viewerTimeZone: "America/New_York",
      }).labelWithViewer,
    ).toBe("Thu 6:00 PM PST (9:00 PM your time)");
    expect(
      formatParticipationTime({
        at: lockAt,
        now,
        timeZone: zone,
        viewerTimeZone: zone,
      }).labelWithViewer,
    ).toBeUndefined();
  });

  it("24 hours before is 24 real hours across the autumn change", () => {
    // Sunday 1 November 2026 09:00 PST; clocks fell back at 02:00 that day.
    const start = new Date("2026-11-01T17:00:00.000Z");
    const lock = participationLockAt({
      startsAt: start,
      lockMinutesBeforeStart: 1440,
    });
    expect(start.getTime() - lock.getTime()).toBe(24 * 3_600_000);
    expect(
      formatParticipationTime({
        at: lock,
        now: new Date("2026-10-30T12:00:00.000Z"),
        timeZone: zone,
      }).label,
    ).toBe("Sat 10:00 AM");
  });

  it("and across the spring change", () => {
    // Sunday 14 March 2027 09:00 PDT; clocks sprang forward at 02:00.
    const start = new Date("2027-03-14T16:00:00.000Z");
    const lock = participationLockAt({
      startsAt: start,
      lockMinutesBeforeStart: 1440,
    });
    expect(
      formatParticipationTime({
        at: lock,
        now: new Date("2027-03-12T12:00:00.000Z"),
        timeZone: zone,
      }).label,
    ).toBe("Sat 8:00 AM");
    expect(
      formatParticipationTime({
        at: lock,
        now: new Date("2027-03-12T12:00:00.000Z"),
        timeZone: "Europe/Madrid",
      }).label,
    ).toBe("Sat 5:00 PM");
  });

  it("counts calendar days in the venue's zone", () => {
    // 23:30 Pacific on the 9th is already the 10th in UTC.
    expect(
      calendarDaysBetween(
        new Date("2026-12-09T20:00:00.000Z"),
        new Date("2026-12-10T07:30:00.000Z"),
        zone,
      ),
    ).toBe(0);
  });

  it("moves the lock for a session opened inside its window, and honours an extension", () => {
    const opened = new Date(startsAt.getTime() - 6 * 3_600_000);
    expect(
      participationLockAt({
        startsAt,
        lockMinutesBeforeStart: 1440,
        openedAt: opened,
      }).getTime(),
    ).toBe(startsAt.getTime() - 3 * 3_600_000);
    const later = new Date(lockAt.getTime() + 3_600_000);
    expect(
      participationLockAt({
        startsAt,
        lockMinutesBeforeStart: 1440,
        overrideAt: later,
      }),
    ).toEqual(later);
    expect(
      validateLockExtension({
        currentLockAt: lockAt,
        requestedLockAt: startsAt,
        startsAt,
        now,
      }),
    ).toBe("We need to decide before the session starts.");
    expect(
      validateLockExtension({
        currentLockAt: lockAt,
        requestedLockAt: later,
        startsAt,
        now,
      }),
    ).toBeUndefined();
  });
});
