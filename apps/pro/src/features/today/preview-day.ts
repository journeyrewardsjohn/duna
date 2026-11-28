/**
 * The preview build's day (credential-free demo mode only): a coach's day
 * around "now" at the demo club's pier venue, so Today and Schedule show
 * every state on a simulator. The shell says "Preview data" above it; live
 * builds never read this. Weather values are illustrative, not a forecast.
 */
import { demoVenues } from "@duna/core/demo";
import type { DayAtRiskInput, DayEntryInput, DayVenueInput } from "./day-model";

const HOUR = 60 * 60_000;
const pier = demoVenues[0]!;

/** The preview venue's zone: the day is shown in the club's time. */
export const previewTimeZone = pier.timezone;

const courtIds = {
  oneTwo: "40000000-0000-4000-8000-0000000000a1",
  three: "40000000-0000-4000-8000-0000000000a3",
  fiveSix: "40000000-0000-4000-8000-0000000000a5",
} as const;

export const previewVenue = (now: number): DayVenueInput => {
  const base = now - (now % HOUR) - HOUR;
  return {
    id: pier.id,
    name: pier.name,
    locality: pier.city,
    ...(pier.latitude !== undefined ? { latitude: pier.latitude } : {}),
    ...(pier.longitude !== undefined ? { longitude: pier.longitude } : {}),
    weather: {
      fetchedAt: new Date(now - (now % HOUR)).toISOString(),
      hourly: [19, 19, 18, 17, 16, 15, 15, 14, 14, 13, 13, 12].map(
        (temperatureC, index) => ({
          startsAt: new Date(base + index * HOUR).toISOString(),
          temperatureC,
          windSpeedKph: [13, 14, 15, 14, 12, 11, 10, 9, 9, 8, 8, 7][index],
          windGustKph: [19, 20, 22, 20, 18, 16, 14, 13, 12, 11, 11, 10][index],
          windFromDeg: 260,
          precipitationProbability: index > 8 ? 10 : 0,
        }),
      ),
    },
    courts: [
      { id: courtIds.oneTwo, lit: false },
      { id: courtIds.three, lit: true },
      { id: courtIds.fiveSix, lit: true },
    ],
  };
};

/** Example roster names (the boards' example club). */
const names = [
  "Maya Rivera",
  "Mara Lewis",
  "Jamie Stone",
  "Alex Chen",
  "Drew Park",
  "Sam Ortiz",
  "Riley Moss",
  "Kai Brooks",
] as const;

const roster = (people: readonly string[], marked: boolean) =>
  people.map((displayName) => ({
    displayName,
    status: "confirmed",
    ...(marked ? {} : { attendanceStatus: "scheduled" as const }),
  }));

export function previewDayEntries(now: number): readonly DayEntryInput[] {
  const base = now - (now % HOUR);
  const at = (hours: number) => new Date(base + hours * HOUR).toISOString();
  const common = {
    venueId: pier.id,
    venueName: pier.name,
  };
  return [
    {
      ...common,
      id: "preview-day-earlier",
      sourceType: "session",
      title: "U14 summer training",
      startsAt: at(-4),
      endsAt: at(-2.75),
      status: "completed",
      kind: "clinic",
      courtId: courtIds.fiveSix,
      courtName: "Courts 5–6",
      coachName: "Jordan Cruz",
      participantCount: 6,
      capacity: 8,
      attendees: roster(names.slice(0, 6), false),
    },
    {
      ...common,
      id: "preview-day-clinic",
      sourceType: "session",
      title: "Group clinic · Serve receive",
      startsAt: at(-0.5),
      endsAt: at(1),
      status: "live",
      kind: "clinic",
      courtId: courtIds.oneTwo,
      courtName: "Courts 1–2",
      coachName: "Jordan Cruz",
      participantCount: 7,
      capacity: 9,
      attendees: roster(names.slice(0, 7), true),
    },
    {
      ...common,
      id: "preview-day-private",
      sourceType: "session",
      title: "Private · Noa Williams",
      startsAt: at(1.5),
      endsAt: at(2.5),
      status: "scheduled",
      kind: "private-lesson",
      courtId: courtIds.three,
      courtName: "Court 3",
      coachName: "Jordan Cruz",
      participantCount: 1,
      capacity: 1,
      attendees: roster(["Noa Williams"], true),
    },
    {
      ...common,
      id: "preview-day-twos",
      sourceType: "session",
      title: "High performance 2s",
      startsAt: at(3),
      endsAt: at(4.5),
      status: "scheduled",
      kind: "clinic",
      courtId: courtIds.fiveSix,
      courtName: "Courts 5–6",
      coachName: "Theo Park",
      participantCount: 3,
      capacity: 8,
      attendees: roster(names.slice(2, 5), true),
    },
  ];
}

/** The high performance session is one player under its minimum of four. */
export function previewAtRisk(now: number): readonly DayAtRiskInput[] {
  const base = now - (now % HOUR);
  return [
    {
      subjectId: "preview-day-twos",
      title: "High performance 2s",
      startsAt: new Date(base + 3 * HOUR).toISOString(),
      booked: 3,
      min: 4,
      capacity: 8,
      lockAt: new Date(base + 1 * HOUR).toISOString(),
      displayState: "needs-players",
    },
  ];
}
