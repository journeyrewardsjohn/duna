/**
 * Demo fixtures: team-availability (owner: B3a). Three demo coaches with
 * named schedules in every status, windows of every kind (several per
 * weekday), blackouts, time off in every status, a coverage grid and
 * coverage requests in every status and reason with offers in every status.
 * Shaped by `contracts/team-availability.ts`; parsed in
 * packages/api/src/contracts/team-availability.test.ts.
 */
import { demoOrganization, demoPeople } from "../demo";
import { demoId } from "./ids";

const id = (n: number) => demoId("team-availability", n);
const person = (index: number) => demoPeople[index]!;

const staffRef = (index: number, staffProfileId: string) => ({
  staffProfileId,
  personId: person(index).id,
  displayName: person(index).displayName,
  initials: person(index).initials,
});

export const teamAvailabilityDemoIds = {
  theo: id(1),
  noa: id(2),
  sam: id(3),
  summerSchedule: id(10),
  fallbackSchedule: id(11),
  draftSchedule: id(12),
  archivedSchedule: id(13),
  noaSchedule: id(14),
} as const;

export const teamAvailabilityDemoStaff = {
  theo: staffRef(0, teamAvailabilityDemoIds.theo),
  noa: staffRef(1, teamAvailabilityDemoIds.noa),
  sam: staffRef(2, teamAvailabilityDemoIds.sam),
};

const timezone = demoOrganization.timezone;
const window = (
  n: number,
  weekday: number,
  startsAt: string,
  endsAt: string,
  kind: "coaching" | "early" | "juniors" | "office" | "other",
  label?: string,
) => ({
  id: id(100 + n),
  weekday,
  startsAt,
  endsAt,
  kind,
  ...(label ? { label } : {}),
});

export const teamAvailabilityDemoSchedules = [
  {
    id: teamAvailabilityDemoIds.summerSchedule,
    staffProfileId: teamAvailabilityDemoIds.theo,
    name: "Winter term",
    status: "active" as const,
    effectiveFrom: "2026-11-01",
    effectiveTo: "2027-02-28",
    timezone,
    sourceText: "Mon and Wed 3 to 8, Tue early 7 to 9, Sat juniors 9 to 12",
    windows: [
      window(1, 1, "15:00", "20:00", "coaching"),
      window(2, 3, "15:00", "20:00", "coaching"),
      window(3, 2, "07:00", "09:00", "early"),
      window(4, 2, "15:00", "20:00", "coaching"),
      window(5, 6, "09:00", "12:00", "juniors", "Juniors"),
      window(6, 5, "12:00", "13:00", "office", "Planning"),
    ],
    updatedAt: "2026-11-20T17:00:00.000Z",
  },
  {
    id: teamAvailabilityDemoIds.fallbackSchedule,
    staffProfileId: teamAvailabilityDemoIds.theo,
    name: "Usual week",
    status: "fallback" as const,
    effectiveFrom: "2026-01-01",
    timezone,
    windows: [window(7, 4, "16:00", "19:00", "coaching")],
    updatedAt: "2026-01-02T17:00:00.000Z",
  },
  {
    id: teamAvailabilityDemoIds.draftSchedule,
    staffProfileId: teamAvailabilityDemoIds.theo,
    name: "Spring term",
    status: "draft" as const,
    effectiveFrom: "2027-03-01",
    effectiveTo: "2027-05-31",
    timezone,
    sourceText: "Weekdays after 4, plus Sunday mornings",
    windows: [
      window(8, 0, "08:00", "11:00", "other", "Sunday clinic"),
      window(9, 1, "16:00", "20:00", "coaching"),
    ],
    updatedAt: "2026-11-25T17:00:00.000Z",
  },
  {
    id: teamAvailabilityDemoIds.archivedSchedule,
    staffProfileId: teamAvailabilityDemoIds.theo,
    name: "Summer 2026",
    status: "archived" as const,
    effectiveFrom: "2026-06-01",
    effectiveTo: "2026-08-31",
    timezone,
    windows: [window(10, 1, "07:00", "12:00", "coaching")],
    updatedAt: "2026-09-01T17:00:00.000Z",
  },
  {
    id: teamAvailabilityDemoIds.noaSchedule,
    staffProfileId: teamAvailabilityDemoIds.noa,
    name: "Winter term",
    status: "active" as const,
    effectiveFrom: "2026-11-01",
    timezone,
    windows: [
      window(11, 1, "15:00", "18:00", "coaching"),
      window(12, 6, "09:00", "12:00", "juniors"),
    ],
    updatedAt: "2026-11-02T17:00:00.000Z",
  },
];

export const teamAvailabilityDemoBlackouts = [
  {
    id: id(200),
    staffProfileId: teamAvailabilityDemoIds.theo,
    startsAt: "2026-12-12T08:00:00.000Z",
    endsAt: "2026-12-14T08:00:00.000Z",
    reason: "Tournament travel",
    sessionsNeedingCover: 3,
  },
];

const timeOff = (
  n: number,
  status: "requested" | "approved" | "declined" | "cancelled",
  startsAt: string,
  endsAt: string,
  reason: string,
  sessionsNeedingCover: number,
) => ({
  id: id(300 + n),
  staffProfileId: teamAvailabilityDemoIds.theo,
  startsAt,
  endsAt,
  reason,
  status,
  requestedAt: "2026-11-20T16:00:00.000Z",
  ...(status === "approved" || status === "declined"
    ? {
        decidedAt: "2026-11-21T16:00:00.000Z",
        decidedBy: {
          personId: person(3).id,
          displayName: person(3).displayName,
          initials: person(3).initials,
        },
      }
    : {}),
  ...(status === "declined" ? { decisionNote: "Finals week" } : {}),
  sessionsNeedingCover,
});

export const teamAvailabilityDemoTimeOff = [
  timeOff(
    1,
    "approved",
    "2026-12-22T08:00:00.000Z",
    "2026-12-27T08:00:00.000Z",
    "Family holiday",
    4,
  ),
  timeOff(
    2,
    "requested",
    "2027-01-09T08:00:00.000Z",
    "2027-01-10T08:00:00.000Z",
    "Course",
    2,
  ),
  timeOff(
    3,
    "declined",
    "2026-12-05T08:00:00.000Z",
    "2026-12-06T08:00:00.000Z",
    "Personal",
    0,
  ),
  timeOff(
    4,
    "cancelled",
    "2026-11-30T08:00:00.000Z",
    "2026-12-01T08:00:00.000Z",
    "Personal",
    0,
  ),
];

export const teamAvailabilityDemoStaffPage = {
  staff: teamAvailabilityDemoStaff.theo,
  schedules: teamAvailabilityDemoSchedules.filter(
    (schedule) => schedule.staffProfileId === teamAvailabilityDemoIds.theo,
  ),
  blackouts: teamAvailabilityDemoBlackouts,
  timeOff: teamAvailabilityDemoTimeOff,
};

/** Weekday afternoons and Saturday mornings; Saturday 10:00 has nobody free. */
export const teamAvailabilityDemoCoverageGrid = {
  weekStartsOn: "2026-12-06",
  timezone,
  cells: [1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    [9, 10, 15, 16, 17].map((hour) => {
      const sessions = weekday === 6 ? (hour < 12 ? 2 : 0) : hour >= 15 ? 2 : 0;
      const coachesFree =
        weekday === 6 && hour === 10
          ? 0
          : weekday === 6
            ? 1
            : hour >= 15
              ? 3
              : 1;
      return {
        weekday,
        hour,
        sessions,
        coachesFree,
        short: sessions > 0 && coachesFree < sessions,
      };
    }),
  ),
};

const offer = (
  n: number,
  staff: ReturnType<typeof staffRef>,
  rank: number,
  status:
    "suggested" | "asked" | "accepted" | "declined" | "assigned" | "withdrawn",
  rationale: string,
) => ({
  id: id(500 + n),
  staff,
  rank,
  status,
  rationale,
  ...(status !== "suggested" ? { askedAt: "2026-12-01T16:00:00.000Z" } : {}),
  ...(["accepted", "declined", "assigned"].includes(status)
    ? { respondedAt: "2026-12-01T17:00:00.000Z" }
    : {}),
});

const { theo, noa, sam } = teamAvailabilityDemoStaff;

const request = (
  n: number,
  title: string,
  startsAt: string,
  endsAt: string,
  reason:
    | "time-off"
    | "blackout"
    | "schedule-change"
    | "no-coach-assigned"
    | "manual",
  status: "open" | "asking" | "covered" | "nobody-free" | "cancelled",
  offers: ReturnType<typeof offer>[],
  extra: { coveredBy?: ReturnType<typeof staffRef> } = {},
) => ({
  id: id(400 + n),
  target:
    n % 2 === 0
      ? { kind: "session" as const, sessionId: id(600 + n) }
      : { kind: "training-event" as const, trainingEventId: id(700 + n) },
  title,
  startsAt,
  endsAt,
  ...(reason === "no-coach-assigned" ? {} : { originalStaff: theo }),
  reason,
  status,
  ...(extra.coveredBy ? { coveredBy: extra.coveredBy } : {}),
  offers,
  ...(["covered", "cancelled", "nobody-free"].includes(status)
    ? { resolvedAt: "2026-12-02T16:00:00.000Z" }
    : {}),
});

export const teamAvailabilityDemoCoverageRequests = [
  request(
    1,
    "Juniors practice",
    "2026-12-13T17:00:00.000Z",
    "2026-12-13T19:00:00.000Z",
    "blackout",
    "open",
    [
      offer(1, noa, 0, "suggested", "Free, coaches juniors"),
      offer(2, sam, 1, "suggested", "Free"),
    ],
  ),
  request(
    2,
    "Private lesson",
    "2026-12-22T23:00:00.000Z",
    "2026-12-23T00:00:00.000Z",
    "time-off",
    "asking",
    [
      offer(3, noa, 0, "asked", "Free, same level"),
      offer(4, sam, 1, "declined", "Free"),
    ],
  ),
  request(
    3,
    "Adult clinic",
    "2026-12-23T23:00:00.000Z",
    "2026-12-24T01:00:00.000Z",
    "time-off",
    "covered",
    [
      offer(5, noa, 0, "assigned", "Free"),
      offer(6, sam, 1, "withdrawn", "Free"),
    ],
    { coveredBy: noa },
  ),
  request(
    4,
    "Early session",
    "2026-12-15T15:00:00.000Z",
    "2026-12-15T17:00:00.000Z",
    "schedule-change",
    "nobody-free",
    [],
  ),
  request(
    5,
    "Saturday drop-in",
    "2026-12-19T18:00:00.000Z",
    "2026-12-19T20:00:00.000Z",
    "no-coach-assigned",
    "asking",
    [offer(7, sam, 0, "accepted", "Free")],
  ),
  request(
    6,
    "Team practice",
    "2026-12-08T23:00:00.000Z",
    "2026-12-09T01:00:00.000Z",
    "manual",
    "cancelled",
    [],
  ),
];

export const teamAvailabilityDemo = {
  domain: "team-availability",
  staff: teamAvailabilityDemoStaffPage,
  schedules: teamAvailabilityDemoSchedules,
  blackouts: teamAvailabilityDemoBlackouts,
  timeOff: teamAvailabilityDemoTimeOff,
  coverageGrid: teamAvailabilityDemoCoverageGrid,
  coverageRequests: teamAvailabilityDemoCoverageRequests,
} as const;
