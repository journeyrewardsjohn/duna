import { describe, expect, it } from "vitest";
import {
  affectedBy,
  clock,
  dragToTime,
  explainConflicts,
  filterItems,
  layoutLane,
  minuteOfPlaceDay,
  nearestAlternatives,
  nowAndNext,
  parseScheduleQuery,
  placeDay,
  scheduleHref,
  teamAvailabilityToInputs,
  weekDays,
  whoIsFree,
  type CoachFacts,
  type CourtFacts,
  type ScheduleItem,
} from "./schedule-model";

const LA = "America/Los_Angeles";
const day = placeDay("2026-11-28", LA);
const at = (hhmm: string, date = "2026-11-28", zone = LA) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = placeDay(date, zone);
  const hour = d.hours.find((entry) => entry.hour === h)!;
  return new Date(d.startMs + (hour.minute + m!) * 60_000).toISOString();
};

function item(
  partial: Partial<ScheduleItem> & { id: string; start: string; end: string },
): ScheduleItem {
  const { start, end, ...rest } = partial;
  return {
    source: "demo",
    kind: "booking",
    title: "Court hire",
    timeZone: LA,
    status: "confirmed",
    people: [],
    movable: true,
    startsAt: at(start),
    endsAt: at(end),
    ...rest,
  };
}

const court: CourtFacts = {
  id: "c1",
  name: "Community Court",
  placeId: "p1",
  timeZone: LA,
  windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startsAtMinute: 8 * 60,
    endsAtMinute: 20 * 60,
    mode: "open",
  })),
  overrides: [],
};
const courtTwo: CourtFacts = { ...court, id: "c2", name: "Championship Court" };

describe("place days", () => {
  it("measures an ordinary day in the place's zone", () => {
    expect(day.minutes).toBe(1440);
    expect(clock(day.startMs, LA)).toBe("12:00 AM");
    expect(day.hours).toHaveLength(24);
  });

  it("is 23 hours on the spring-forward day and skips the missing hour", () => {
    const spring = placeDay("2026-03-08", LA);
    expect(spring.minutes).toBe(1380);
    expect(spring.hours.map((entry) => entry.hour)).not.toContain(2);
    // 3 AM is drawn two hours after midnight, not three.
    expect(spring.hours.find((entry) => entry.hour === 3)?.minute).toBe(120);
  });

  it("is 25 hours on the fall-back day", () => {
    const fall = placeDay("2026-11-01", LA);
    expect(fall.minutes).toBe(1500);
    expect(fall.hours.find((entry) => entry.hour === 9)?.minute).toBe(600);
  });

  it("uses the place's zone, not the viewer's", () => {
    const tokyo = placeDay("2026-11-28", "Asia/Tokyo");
    expect(new Date(tokyo.startMs).toISOString()).toBe(
      "2026-11-27T15:00:00.000Z",
    );
  });

  it("starts weeks on Monday", () => {
    expect(weekDays("2026-11-28")[0]).toBe("2026-11-23");
    expect(weekDays("2026-11-23")).toHaveLength(7);
  });
});

describe("slot layout", () => {
  it("puts overlapping items side by side and lone items full width", () => {
    const layout = layoutLane(
      [
        item({ id: "a", start: "09:00", end: "10:30" }),
        item({ id: "b", start: "10:00", end: "11:00" }),
        item({ id: "c", start: "10:15", end: "10:45" }),
        item({ id: "d", start: "12:00", end: "13:00" }),
      ],
      day,
    );
    const byId = new Map(
      layout.placed.map((placed) => [placed.item.id, placed]),
    );
    expect(byId.get("a")).toMatchObject({
      column: 0,
      columns: 3,
      top: 540,
      height: 90,
    });
    expect(byId.get("b")).toMatchObject({ column: 1, columns: 3 });
    expect(byId.get("c")).toMatchObject({ column: 2, columns: 3 });
    expect(byId.get("d")).toMatchObject({ column: 0, columns: 1 });
  });

  it("reuses a column once its item has ended", () => {
    const layout = layoutLane(
      [
        item({ id: "a", start: "09:00", end: "10:00" }),
        item({ id: "b", start: "09:30", end: "11:00" }),
        item({ id: "c", start: "10:00", end: "10:30" }),
      ],
      day,
    );
    const c = layout.placed.find((placed) => placed.item.id === "c")!;
    expect(c.column).toBe(0);
    expect(c.columns).toBe(2);
  });

  it("sends whole-day and all-day items to the all-day row", () => {
    const layout = layoutLane(
      [
        {
          ...item({ id: "closed", start: "00:00", end: "12:00" }),
          endsAt: new Date(day.endMs).toISOString(),
          kind: "block",
        },
        { ...item({ id: "flag", start: "09:00", end: "10:00" }), allDay: true },
        item({ id: "timed", start: "09:00", end: "10:00" }),
      ],
      day,
    );
    expect(layout.allDay.map((entry) => entry.id).sort()).toEqual([
      "closed",
      "flag",
    ]);
    expect(layout.placed.map((placed) => placed.item.id)).toEqual(["timed"]);
  });

  it("clips items that run over midnight and marks them", () => {
    const late = {
      ...item({ id: "late", start: "23:00", end: "23:30" }),
      endsAt: new Date(day.endMs + 60 * 60_000).toISOString(),
    };
    const [placed] = layoutLane([late], day).placed;
    expect(placed).toMatchObject({
      top: 1380,
      height: 60,
      continuesAfter: true,
    });
  });

  it("keeps a short block tall enough to press", () => {
    const [placed] = layoutLane(
      [item({ id: "s", start: "09:00", end: "09:05" })],
      day,
    ).placed;
    expect(placed!.height).toBe(20);
  });

  it("lays out a daylight-saving day by elapsed minutes", () => {
    const spring = placeDay("2026-03-08", LA);
    const [placed] = layoutLane(
      [item({ id: "x", start: "09:00", end: "10:00" })].map((entry) => ({
        ...entry,
        startsAt: at("09:00", "2026-03-08"),
        endsAt: at("10:00", "2026-03-08"),
      })),
      spring,
    ).placed;
    expect(placed!.top).toBe(8 * 60);
  });
});

describe("dragging", () => {
  const lesson = item({ id: "l", start: "10:00", end: "11:00" });
  it("moves by the pointer's travel, snapped to 15 minutes", () => {
    const next = dragToTime({
      day,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      grabMinute: 600 + 10,
      pointerMinute: 600 + 10 + 52,
      mode: "move",
    });
    expect(clock(next.startsAt, LA)).toBe("10:45 AM");
    expect(clock(next.endsAt, LA)).toBe("11:45 AM");
  });

  it("resizes only the end, never shorter than a step", () => {
    const longer = dragToTime({
      day,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      grabMinute: 660,
      pointerMinute: 690,
      mode: "resize",
    });
    expect(clock(longer.endsAt, LA)).toBe("11:30 AM");
    expect(longer.startsAt).toBe(lesson.startsAt);
    const shorter = dragToTime({
      day,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      grabMinute: 660,
      pointerMinute: 500,
      mode: "resize",
    });
    expect(clock(shorter.endsAt, LA)).toBe("10:15 AM");
  });

  it("keeps the item inside the day", () => {
    const next = dragToTime({
      day,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      grabMinute: 600,
      pointerMinute: 5000,
      mode: "move",
    });
    expect(next.endsAt).toBe(new Date(day.endMs).toISOString());
  });
});

describe("conflicts by the shared rule", () => {
  const items = [
    item({
      id: "lesson",
      start: "10:00",
      end: "11:00",
      courtId: "c1",
      kind: "lesson",
      title: "Private lesson",
      coachId: "theo",
    }),
    {
      ...item({
        id: "groom",
        start: "12:00",
        end: "13:00",
        courtId: "c1",
        kind: "block",
        title: "Maintenance",
      }),
      reason: "Sand grooming",
    },
  ];

  it("says until when a court is booked", () => {
    const conflicts = explainConflicts(
      { startsAt: at("10:15"), endsAt: at("11:15"), court },
      items,
    );
    expect(conflicts.map((conflict) => conflict.sentence)).toEqual([
      "Community Court is booked until 11:00 AM",
    ]);
  });

  it("names a block and its reason", () => {
    const [conflict] = explainConflicts(
      { startsAt: at("12:30"), endsAt: at("13:30"), court },
      items,
    );
    expect(conflict!.sentence).toBe(
      "Community Court is blocked until 1:00 PM (Sand grooming)",
    );
  });

  it("says when the court is closed", () => {
    const [conflict] = explainConflicts(
      { startsAt: at("06:00"), endsAt: at("07:00"), court },
      items,
    );
    expect(conflict!.sentence).toBe("Community Court isn't open then");
  });

  it("lets an item move within its own time", () => {
    expect(
      explainConflicts(
        {
          startsAt: at("10:30"),
          endsAt: at("11:30"),
          court,
          ignoreId: "lesson",
        },
        items,
      ),
    ).toEqual([]);
  });

  it("explains a coach's time off, other commitments and hours", () => {
    const availability = teamAvailabilityToInputs({
      schedules: [
        {
          id: "s",
          status: "active",
          effectiveFrom: "2026-11-01",
          timezone: LA,
          windows: [{ weekday: 6, startsAt: "09:00", endsAt: "17:00" }],
        },
      ],
      blackouts: [],
      timeOff: [
        {
          id: "off",
          startsAt: at("00:00", "2026-11-29"),
          endsAt: new Date(placeDay("2026-11-30", LA).startMs).toISOString(),
          status: "approved",
        },
      ],
    });
    const theo: CoachFacts = {
      id: "theo",
      name: "Theo Park",
      staffProfileId: "t",
      availability,
    };
    expect(
      explainConflicts(
        {
          startsAt: at("10:30"),
          endsAt: at("11:30"),
          court: courtTwo,
          coach: theo,
        },
        items,
      )[0]!.sentence,
    ).toBe("Theo is teaching Private lesson until 11:00 AM");
    expect(
      explainConflicts(
        { startsAt: at("18:00"), endsAt: at("19:00"), coach: theo },
        items,
      )[0]!.sentence,
    ).toBe("Theo doesn't work at that time");
    expect(
      explainConflicts(
        {
          startsAt: at("10:00", "2026-11-29"),
          endsAt: at("11:00", "2026-11-29"),
          coach: theo,
        },
        items,
      )[0]!.sentence,
    ).toBe("Theo is off that day");
    const sam: CoachFacts = {
      id: "sam",
      name: "Sam Rivera",
      availability: { schedules: [], blackouts: [], timeOff: [] },
    };
    expect(
      explainConflicts(
        { startsAt: at("10:00"), endsAt: at("11:00"), coach: sam },
        items,
      )[0]!.sentence,
    ).toBe("Sam has no working hours set for that day");
  });

  it("offers the nearest free time and another court", () => {
    const alternatives = nearestAlternatives(
      { startsAt: at("10:15"), endsAt: at("11:15"), court },
      items,
      [court, courtTwo],
    );
    expect(alternatives.map((alternative) => alternative.label)).toEqual([
      "Community Court at 11:00 AM",
      "Championship Court at the same time",
    ]);
  });

  it("answers who is free, leaving out people with no availability on file", () => {
    const open = teamAvailabilityToInputs({
      schedules: [
        {
          id: "s",
          status: "active",
          effectiveFrom: "2026-01-01",
          timezone: LA,
          windows: [{ weekday: 6, startsAt: "08:00", endsAt: "20:00" }],
        },
      ],
      blackouts: [],
      timeOff: [],
    });
    const answer = whoIsFree(
      [
        { id: "theo", name: "Theo Park", availability: open },
        { id: "noa", name: "Noa Williams", availability: open },
        { id: "mara", name: "Mara Lewis" },
      ],
      items,
      at("10:00"),
      at("11:00"),
    );
    expect(answer.free.map((coach) => coach.name)).toEqual(["Noa Williams"]);
    expect(answer.busy[0]!.sentence).toBe(
      "Theo is teaching Private lesson until 11:00 AM",
    );
    expect(answer.unknown.map((coach) => coach.name)).toEqual(["Mara Lewis"]);
  });
});

describe("the address", () => {
  it("reads and writes only what differs from the defaults", () => {
    const query = parseScheduleQuery(
      {
        date: "2026-11-30",
        view: "week",
        by: "coach",
        kind: "lesson,nonsense,block",
        court: "all",
      },
      "2026-11-28",
    );
    expect(query).toMatchObject({
      date: "2026-11-30",
      view: "week",
      by: "coach",
      kinds: ["lesson", "block"],
    });
    expect(query.court).toBeUndefined();
    expect(scheduleHref(query, { view: "day" }, "2026-11-28")).toBe(
      "/schedule?date=2026-11-30&by=coach&kind=lesson%2Cblock",
    );
    expect(
      scheduleHref(parseScheduleQuery({}, "2026-11-28"), {}, "2026-11-28"),
    ).toBe("/schedule");
  });

  it("ignores impossible dates and lets a phone default to the list", () => {
    expect(parseScheduleQuery({ date: "2026-02-30" }, "2026-11-28").date).toBe(
      "2026-11-28",
    );
    expect(parseScheduleQuery({}, "2026-11-28", "list").view).toBe("list");
  });

  it("filters by court, coach and kind", () => {
    const items = [
      item({
        id: "a",
        start: "09:00",
        end: "10:00",
        courtId: "c1",
        kind: "lesson",
        coachId: "theo",
      }),
      item({ id: "b", start: "09:00", end: "10:00", courtId: "c2" }),
    ];
    expect(
      filterItems(items, { kinds: ["lesson"] }).map((entry) => entry.id),
    ).toEqual(["a"]);
    expect(
      filterItems(items, { kinds: [], court: "c2" }).map((entry) => entry.id),
    ).toEqual(["b"]);
    expect(
      filterItems(items, { kinds: [], coach: "theo" }).map((entry) => entry.id),
    ).toEqual(["a"]);
  });
});

describe("the front desk", () => {
  const nowMs = Date.parse(at("10:20"));
  const items: ScheduleItem[] = [
    {
      ...item({ id: "now", start: "10:00", end: "11:00", courtId: "c1" }),
      people: [{ id: "r1", name: "Elena", checkedIn: false, payment: "due" }],
      amountMinor: 4800,
      paidMinor: 0,
    },
    {
      ...item({
        id: "soon",
        start: "10:45",
        end: "11:45",
        courtId: "c2",
        kind: "lesson",
      }),
      people: [{ id: "r2", name: "Noah", checkedIn: true }],
    },
    item({ id: "later", start: "13:00", end: "14:00" }),
    { ...item({ id: "gone", start: "10:00", end: "11:00" }), cancelled: true },
  ];

  it("lists what is on now, what starts within the hour, who is missing and who owes", () => {
    const strip = nowAndNext(items, nowMs);
    expect(strip.onNow.map((entry) => entry.id)).toEqual(["now"]);
    expect(strip.next.map((entry) => entry.id)).toEqual(["soon"]);
    expect(strip.notCheckedIn.map((entry) => entry.person.name)).toEqual([
      "Elena",
    ]);
    expect(strip.unpaid.map((entry) => entry.id)).toEqual(["now"]);
  });

  it("lists what a closure would affect", () => {
    expect(
      affectedBy(items, {
        courtIds: ["c1", "c2"],
        startsAt: at("10:30"),
        endsAt: at("12:00"),
      }).map((entry) => entry.id),
    ).toEqual(["now", "soon"]);
  });

  it("measures minutes from the place's midnight", () => {
    expect(minuteOfPlaceDay(at("10:20"), day)).toBe(620);
  });
});
