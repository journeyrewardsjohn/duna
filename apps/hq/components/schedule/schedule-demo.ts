/**
 * Demo mode only (no Duna Database): a believable club day for the demo
 * club, and the changes a person makes to it, kept in a cookie in their own
 * browser so the schedule can be tried end to end. Nothing here is stored
 * anywhere else, and the screen says so ("Demo: changes stay in this
 * browser"). The people and coaches are the demo club's own fixtures.
 */
import { demoPlayer } from "@duna/core/demo";
import { teamAvailabilityDemoStaff } from "@duna/core/demo/team-availability";
import { addCalendarDays, wallTimeToInstant } from "@duna/scheduling";
import type { ItemKind, ItemPerson, ScheduleItem } from "./schedule-model";

export const DEMO_SCHEDULE_COOKIE = "duna-demo-schedule";
const LIMIT = 3_800;

export interface DemoCreated {
  readonly id: string;
  readonly kind: ItemKind;
  readonly title: string;
  readonly who?: string;
  readonly personId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly priceMinor?: number;
  readonly reason?: string;
  readonly mode?: "blocked" | "maintenance" | "weather";
}

export interface DemoScheduleStore {
  readonly created: readonly DemoCreated[];
  readonly moved: Readonly<
    Record<string, { startsAt: string; endsAt: string; courtId?: string }>
  >;
  /** item id → roster ids checked in (true) or put back (false). */
  readonly checkIns: Readonly<
    Record<string, Readonly<Record<string, boolean>>>
  >;
  readonly cancelled: readonly string[];
  readonly paid: readonly string[];
  /** item id → people added (and roster ids removed) by hand. */
  readonly roster: Readonly<
    Record<
      string,
      {
        readonly added: readonly {
          id: string;
          personId: string;
          name: string;
        }[];
        readonly removed: readonly string[];
      }
    >
  >;
}

const empty: DemoScheduleStore = {
  created: [],
  moved: {},
  checkIns: {},
  cancelled: [],
  paid: [],
  roster: {},
};

export function parseDemoSchedule(
  value: string | undefined,
): DemoScheduleStore {
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as Partial<DemoScheduleStore>;
    return {
      created: Array.isArray(parsed.created) ? parsed.created : [],
      moved:
        parsed.moved && typeof parsed.moved === "object" ? parsed.moved : {},
      checkIns:
        parsed.checkIns && typeof parsed.checkIns === "object"
          ? parsed.checkIns
          : {},
      cancelled: Array.isArray(parsed.cancelled) ? parsed.cancelled : [],
      paid: Array.isArray(parsed.paid) ? parsed.paid : [],
      roster:
        parsed.roster && typeof parsed.roster === "object" ? parsed.roster : {},
    };
  } catch {
    return empty;
  }
}

/** Serialises the store, dropping the oldest creations past the cookie's size. */
export function serializeDemoSchedule(store: DemoScheduleStore): string {
  let next = store;
  let value = JSON.stringify(next);
  while (value.length > LIMIT && next.created.length > 0) {
    next = { ...next, created: next.created.slice(1) };
    value = JSON.stringify(next);
  }
  return value;
}

/**
 * The demo coaches: the team fixtures (`@duna/core/demo/team-availability`),
 * whose first coach is the signed-in demo person, Mara Lewis.
 */
export const demoCoaches = [
  teamAvailabilityDemoStaff.theo,
  teamAvailabilityDemoStaff.noa,
  teamAvailabilityDemoStaff.sam,
].map((ref) => ({
  id: ref.personId,
  name: ref.displayName,
  staffProfileId: ref.staffProfileId,
}));

const at = (date: string, hour: number, minute: number, zone: string) =>
  new Date(wallTimeToInstant(date, hour * 60 + minute, zone)).toISOString();

function roster(
  itemId: string,
  names: readonly { id?: string; name: string }[],
  payment?: ItemPerson["payment"],
): ItemPerson[] {
  return names.map((person, index) => ({
    id: `${itemId}:p${index}`,
    ...(person.id ? { personId: person.id } : {}),
    name: person.name,
    checkedIn: false,
    ...(payment ? { payment } : {}),
  }));
}

/**
 * The demo club's day on each date in [from, to]: a court hire, a junior
 * clinic that needs one more player, a private lesson, sand grooming and a
 * league night; today also has a court on now and a lesson starting soon,
 * so "Now and next" has something to show. Times are wall-clock times in
 * the place's zone.
 */
export function demoDayItems(input: {
  readonly from: string;
  readonly to: string;
  readonly zone: string;
  readonly today: string;
  readonly nowMs: number;
  readonly placeId: string;
  readonly placeName: string;
  readonly courts: readonly { id: string; name: string }[];
  readonly people: readonly { id: string; name: string }[];
}): ScheduleItem[] {
  const [main, second] = input.courts;
  if (!main) return [];
  const side = second ?? main;
  const people =
    input.people.length > 0
      ? input.people
      : [{ id: demoPlayer.id, name: demoPlayer.displayName }];
  const person = (index: number) => people[index % people.length]!;
  // Mara Lewis is the signed-in demo person: as a coach she sees her own day.
  const [mara, theo] = demoCoaches as [
    (typeof demoCoaches)[number],
    (typeof demoCoaches)[number],
  ];
  const base = {
    timeZone: input.zone,
    placeId: input.placeId,
    placeName: input.placeName,
    source: "demo" as const,
  };
  const items: ScheduleItem[] = [];
  for (
    let date = input.from;
    date <= input.to;
    date = addCalendarDays(date, 1)
  ) {
    const key = (name: string) => `demo-${date}-${name}`;
    items.push(
      {
        ...base,
        id: key("hire"),
        kind: "booking",
        title: "Court hire",
        who: person(0).name,
        startsAt: at(date, 8, 0, input.zone),
        endsAt: at(date, 9, 0, input.zone),
        courtId: side.id,
        courtName: side.name,
        status: "confirmed",
        people: roster(key("hire"), [person(0)], "paid"),
        amountMinor: 4_800,
        paidMinor: 4_800,
        currency: "USD",
        movable: true,
      },
      {
        ...base,
        id: key("clinic"),
        kind: "session",
        title: "Junior clinic",
        who: `${mara.name} · ages 9–12`,
        startsAt: at(date, 9, 0, input.zone),
        endsAt: at(date, 10, 30, input.zone),
        courtId: main.id,
        courtName: main.name,
        coachId: mara.id,
        coachName: mara.name,
        status: "registration-open",
        capacity: 8,
        booked: 5,
        minimum: 6,
        people: roster(key("clinic"), [0, 1, 2, 3, 4].map(person), "paid"),
        movable: true,
      },
      {
        ...base,
        id: key("lesson"),
        kind: "lesson",
        title: "Private lesson",
        who: `${theo.name} · ${person(1).name}`,
        startsAt: at(date, 10, 0, input.zone),
        endsAt: at(date, 11, 0, input.zone),
        courtId: side.id,
        courtName: side.name,
        coachId: theo.id,
        coachName: theo.name,
        status: "confirmed",
        people: roster(key("lesson"), [person(1)], "paid"),
        movable: true,
      },
      {
        ...base,
        id: key("grooming"),
        kind: "block",
        title: "Maintenance",
        who: "Sand grooming",
        reason: "Sand grooming",
        blockMode: "maintenance",
        startsAt: at(date, 12, 0, input.zone),
        endsAt: at(date, 13, 0, input.zone),
        courtId: main.id,
        courtName: main.name,
        status: "blocked",
        people: [],
        movable: false,
      },
      {
        ...base,
        id: key("league"),
        kind: "event",
        title: "Sunset Summer Series",
        who: "League night",
        startsAt: at(date, 18, 30, input.zone),
        endsAt: at(date, 20, 0, input.zone),
        courtId: main.id,
        courtName: main.name,
        status: "published",
        people: [],
        movable: false,
        href: "/events?type=league",
      },
    );
    if (date === input.today) {
      const quarter = 15 * 60_000;
      const now = Math.floor(input.nowMs / quarter) * quarter;
      const onNowStart = new Date(now - 2 * quarter).toISOString();
      items.push(
        {
          ...base,
          id: key("walkin"),
          kind: "booking",
          title: "Court hire",
          who: person(3).name,
          startsAt: onNowStart,
          endsAt: new Date(now + 4 * quarter).toISOString(),
          courtId: side.id,
          courtName: side.name,
          status: "confirmed",
          people: roster(key("walkin"), [person(3)], "due"),
          amountMinor: 4_800,
          paidMinor: 0,
          currency: "USD",
          movable: true,
        },
        {
          ...base,
          id: key("soon"),
          kind: "lesson",
          title: "Private lesson",
          who: `${mara.name} · ${person(4).name}`,
          startsAt: new Date(now + 2 * quarter).toISOString(),
          endsAt: new Date(now + 6 * quarter).toISOString(),
          courtId: main.id,
          courtName: main.name,
          coachId: mara.id,
          coachName: mara.name,
          status: "confirmed",
          people: roster(key("soon"), [person(4), person(2)], "paid"),
          movable: true,
        },
      );
    }
  }
  return items;
}

/** Applies the person's demo changes to the day. */
export function applyDemoStore(
  items: readonly ScheduleItem[],
  store: DemoScheduleStore,
  context: {
    readonly zone: string;
    readonly placeId: string;
    readonly placeName: string;
    readonly courts: readonly { id: string; name: string }[];
    readonly coaches: readonly { id: string; name: string }[];
  },
): ScheduleItem[] {
  const created = store.created.map((entry): ScheduleItem => {
    const court = context.courts.find(
      (candidate) => candidate.id === entry.courtId,
    );
    const coach = context.coaches.find(
      (candidate) => candidate.id === entry.coachId,
    );
    return {
      id: entry.id,
      source: "demo",
      kind: entry.kind,
      title: entry.title,
      ...(entry.who ? { who: entry.who } : {}),
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      timeZone: context.zone,
      placeId: context.placeId,
      placeName: context.placeName,
      ...(court ? { courtId: court.id, courtName: court.name } : {}),
      ...(coach ? { coachId: coach.id, coachName: coach.name } : {}),
      status: entry.kind === "block" ? "blocked" : "confirmed",
      people:
        entry.kind === "block" || !entry.who
          ? []
          : [
              {
                id: `${entry.id}:p0`,
                ...(entry.personId ? { personId: entry.personId } : {}),
                name: entry.who,
                checkedIn: false,
                payment: entry.priceMinor ? "due" : "free",
              },
            ],
      ...(entry.priceMinor
        ? { amountMinor: entry.priceMinor, paidMinor: 0, currency: "USD" }
        : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.mode ? { blockMode: entry.mode } : {}),
      movable: entry.kind !== "block",
    };
  });
  return (
    [...items, ...created]
      // A removed block is gone, not shown as cancelled.
      .filter(
        (item) => !(item.kind === "block" && store.cancelled.includes(item.id)),
      )
      .map((item) => {
        const moved = store.moved[item.id];
        const court = moved?.courtId
          ? context.courts.find((candidate) => candidate.id === moved.courtId)
          : undefined;
        const checks = store.checkIns[item.id] ?? {};
        const paid = store.paid.includes(item.id);
        return {
          ...item,
          ...(moved ? { startsAt: moved.startsAt, endsAt: moved.endsAt } : {}),
          ...(court ? { courtId: court.id, courtName: court.name } : {}),
          ...(store.cancelled.includes(item.id)
            ? { cancelled: true, status: "cancelled" }
            : {}),
          ...(paid ? { paidMinor: item.amountMinor } : {}),
          people: [
            ...item.people,
            ...(store.roster[item.id]?.added ?? []).map(
              (person): ItemPerson => ({
                ...person,
                checkedIn: false,
              }),
            ),
          ]
            .filter(
              (person) => !store.roster[item.id]?.removed.includes(person.id),
            )
            .map((person) => ({
              ...person,
              ...(person.id in checks ? { checkedIn: checks[person.id]! } : {}),
              ...(paid && person.payment === "due"
                ? { payment: "paid" as const }
                : {}),
            })),
        };
      })
  );
}
