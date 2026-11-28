/**
 * Demo fixtures: training-programs (owner: B4). Programs in every state, a
 * week of sessions of every kind and status, conflicts, an after-practice
 * record and practice plans in every content state. Shaped by
 * `contracts/training-programs.ts`; parsed in
 * packages/api/src/contracts/training-programs.test.ts. People are the
 * fictional demo club's; values are placeholders, never a real business.
 */
import { demoOrganization, demoPeople, demoPlayer, demoVenues } from "../demo";
import { demoId } from "./ids";

const id = (n: number) => demoId("training-programs", n);
const ref = (person: {
  id: string;
  displayName: string;
  initials?: string;
}) => ({
  personId: person.id,
  displayName: person.displayName,
  ...(person.initials ? { initials: person.initials } : {}),
});

const leadCoach = ref(demoPeople[0]!);
const assistantCoach = ref(demoPeople[1]!);
const substituteCoach = ref(demoPeople[2]!);
const athlete = ref(demoPlayer);
const venueId = demoVenues[0]!.id;
const timezone = "America/Los_Angeles";

export const trainingProgramsDemoIds = {
  activeProgram: id(1),
  draftProgram: id(2),
  completedProgram: id(3),
  archivedProgram: id(4),
  cancelledProgram: id(5),
  publishedPlan: id(300),
  draftPlan: id(301),
  reviewPlan: id(302),
  archivedPlan: id(303),
  completedSession: id(100),
} as const;

const counts = (practices: number, plansAttached: number) => ({
  athletes: 12,
  weeks: 12,
  weeksOff: 2,
  practices,
  milestones: 2,
  plansAttached,
});

const summary = (
  n: number,
  slug: string,
  title: string,
  status: "draft" | "active" | "completed" | "archived" | "cancelled",
  startDate: string,
  endDate: string,
  extra: Record<string, unknown> = {},
) => ({
  id: id(n),
  slug,
  title,
  status,
  startDate,
  endDate,
  counts: counts(31, 4),
  leadCoach,
  ...extra,
});

export const trainingProgramsDemoSummaries = [
  summary(
    1,
    "fall-competition-build",
    "Fall competition build",
    "active",
    "2026-11-23",
    "2027-02-14",
    { currentWeek: 1 },
  ),
  summary(
    2,
    "spring-juniors",
    "Spring juniors",
    "draft",
    "2027-03-01",
    "2027-05-23",
  ),
  summary(
    3,
    "summer-elite",
    "Summer elite",
    "completed",
    "2026-06-01",
    "2026-08-23",
  ),
  summary(
    4,
    "winter-skills-2025",
    "Winter skills",
    "archived",
    "2025-12-01",
    "2026-02-22",
  ),
  summary(
    5,
    "holiday-camp",
    "Holiday camp",
    "cancelled",
    "2026-12-21",
    "2026-12-24",
  ),
];

export const trainingProgramsDemoProgram = {
  ...trainingProgramsDemoSummaries[0]!,
  purpose:
    "Build serve-receive and transition for the winter tournament block.",
  targetAudience: "Competitive juniors, ages 14–17",
  objectives: ["Serve-receive above 2.2", "Transition attack under pressure"],
  timezone,
  defaultPracticeMinutes: 90,
  catalogItemId: id(900),
  sourceText:
    "Fall build for 12 juniors, Mon and Wed 4–6, Sat 9–11, Nov 23 to Feb 14, off over the holidays",
  coaches: [
    { ...leadCoach, role: "lead" as const, weekdays: [] },
    { ...assistantCoach, role: "assistant" as const, weekdays: [1, 6] },
  ],
  weeklySlots: [
    {
      id: id(10),
      weekday: 1,
      startsAt: "16:00",
      endsAt: "18:00",
      intervalWeeks: 1,
      venueId,
      courtIds: [],
      lightingNote: "Under lights after 4:45 PM",
    },
    {
      id: id(11),
      weekday: 3,
      startsAt: "16:00",
      endsAt: "18:00",
      intervalWeeks: 1,
      venueId,
      courtIds: [],
      lightingNote: "Under lights after 4:45 PM",
    },
    {
      id: id(12),
      weekday: 6,
      startsAt: "09:00",
      endsAt: "11:00",
      intervalWeeks: 1,
      venueId,
      courtIds: [],
      lightingNote: "Daylight",
    },
  ],
  exceptions: [
    {
      id: id(20),
      kind: "break" as const,
      startsOn: "2026-12-21",
      endsOn: "2027-01-03",
      label: "Holiday break",
    },
    {
      id: id(21),
      kind: "tournament" as const,
      startsOn: "2027-01-23",
      endsOn: "2027-01-24",
      label: "[winter tournament]",
      sourceUrl: "https://events.example/winter",
    },
    {
      id: id(22),
      kind: "travel" as const,
      startsOn: "2027-01-22",
      endsOn: "2027-01-22",
      label: "Travel day",
    },
    {
      id: id(23),
      kind: "blackout" as const,
      startsOn: "2026-11-26",
      endsOn: "2026-11-26",
      label: "Courts closed",
    },
  ],
  weeks: [
    {
      weekNumber: 1,
      startsOn: "2026-11-23",
      phase: "build" as const,
      plannedLoad: 52,
    },
    {
      weekNumber: 2,
      startsOn: "2026-11-30",
      phase: "build" as const,
      plannedLoad: 58,
    },
    {
      weekNumber: 3,
      startsOn: "2026-12-07",
      phase: "maintain" as const,
      plannedLoad: 62,
    },
    {
      weekNumber: 4,
      startsOn: "2026-12-14",
      phase: "build" as const,
      plannedLoad: 66,
    },
    {
      weekNumber: 5,
      startsOn: "2026-12-21",
      phase: "break" as const,
      plannedLoad: 0,
      note: "Holiday break",
    },
    {
      weekNumber: 9,
      startsOn: "2027-01-18",
      phase: "taper" as const,
      plannedLoad: 45,
    },
    {
      weekNumber: 10,
      startsOn: "2027-01-25",
      phase: "recover" as const,
      plannedLoad: 35,
    },
  ],
  updatedAt: "2026-11-27T18:00:00.000Z",
};

export const trainingProgramsDemoCancelledProgram = {
  ...trainingProgramsDemoSummaries[4]!,
  purpose: "[camp purpose]",
  targetAudience: "Juniors",
  objectives: [],
  timezone,
  defaultPracticeMinutes: 120,
  coaches: [{ ...leadCoach, role: "lead" as const, weekdays: [] }],
  weeklySlots: [],
  exceptions: [],
  weeks: [],
  cancellation: {
    cancelledAt: "2026-11-25T17:00:00.000Z",
    reason: "Not enough sign-ups",
    cancelledBy: leadCoach,
  },
  updatedAt: "2026-11-25T17:00:00.000Z",
};

const day = (date: string, from: string, to: string) => ({
  startsAt: `${date}T${from}:00.000Z`,
  endsAt: `${date}T${to}:00.000Z`,
});

const programId = trainingProgramsDemoIds.activeProgram;
const kinds = [
  "practice",
  "tournament",
  "travel",
  "recovery",
  "strength",
  "conditioning",
  "plyometrics",
  "film",
  "meeting",
  "assessment",
  "rest",
] as const;

export const trainingProgramsDemoSessions = kinds.map((kind, index) => {
  const n = 100 + index;
  const status =
    index === 0
      ? ("completed" as const)
      : index === 1
        ? ("ready" as const)
        : index === 3
          ? ("cancelled" as const)
          : ("planned" as const);
  const plan =
    kind === "practice"
      ? {
          mode: "plan" as const,
          practicePlanId: trainingProgramsDemoIds.publishedPlan,
          practicePlanVersionId: id(310),
          title: "Serve-receive under pressure",
          plannedLoad: 55,
        }
      : kind === "conditioning" || kind === "plyometrics" || kind === "strength"
        ? {
            mode: "focus" as const,
            focus: kind === "strength" ? "Lower body" : "Jump volume",
            plannedLoad: 50,
            estimatedTouches: kind === "strength" ? 0 : 40,
            estimatedJumps: kind === "strength" ? 0 : 60,
            loadEstimateSource:
              kind === "strength"
                ? ("coach-edited" as const)
                : kind === "plyometrics"
                  ? ("derived-from-scene" as const)
                  : ("assumed" as const),
          }
        : { mode: "none" as const };
  return {
    id: id(n),
    programId,
    kind,
    title:
      kind === "tournament"
        ? "Scrimmage vs [visiting club]"
        : `${kind[0]!.toUpperCase()}${kind.slice(1)}`,
    ...day(`2026-12-${String(1 + index).padStart(2, "0")}`, "00:00", "02:00"),
    timezone,
    status,
    source:
      index === 1
        ? ("manual" as const)
        : index === 7
          ? ("ai-draft" as const)
          : ("program" as const),
    venueId,
    coaches:
      index === 2
        ? [{ ...substituteCoach, role: "substitute" as const }]
        : [
            { ...leadCoach, role: "lead" as const },
            ...(index === 0
              ? [{ ...assistantCoach, role: "assistant" as const }]
              : []),
          ],
    plan,
    needsCover: index === 4,
    athleteCount: 12,
    ...(status === "cancelled"
      ? {
          cancellation: {
            cancelledAt: "2026-12-03T22:00:00.000Z",
            reason: "Rain",
            cancelledBy: leadCoach,
          },
        }
      : {}),
  };
});

export const trainingProgramsDemoConflicts = [
  {
    id: "conflict-1",
    programId,
    sessionId: id(101),
    kind: "milestone-overlaps-practice" as const,
    description: "[winter tournament] falls on a Saturday practice",
    suggestedResolutions: ["drop-practice" as const, "keep-both" as const],
    status: "open" as const,
  },
  {
    id: "conflict-2",
    programId,
    sessionId: id(104),
    kind: "coach-blackout" as const,
    description: `${leadCoach.displayName} is unavailable`,
    suggestedResolutions: ["ask-cover" as const, "move-practice" as const],
    status: "open" as const,
  },
  {
    id: "conflict-3",
    programId,
    sessionId: id(105),
    kind: "coach-time-off" as const,
    description: `${assistantCoach.displayName} has approved time off`,
    suggestedResolutions: ["ask-cover" as const],
    status: "resolved" as const,
    resolution: "ask-cover" as const,
  },
  {
    id: "conflict-4",
    programId,
    sessionId: id(106),
    kind: "court-unavailable" as const,
    description: "Court 2 is closed for maintenance",
    suggestedResolutions: ["move-practice" as const, "drop-practice" as const],
    status: "resolved" as const,
    resolution: "move-practice" as const,
  },
];

export const trainingProgramsDemoOutcome = {
  sessionId: trainingProgramsDemoIds.completedSession,
  plannedLoad: 55,
  coachRpe: 6,
  actualLoad: 58,
  attendance: [
    { ...athlete, present: true, proposed: false },
    { ...ref(demoPeople[3]!), present: false, proposed: true },
  ],
  blocks: [
    {
      blockId: id(320),
      title: "Warm-up",
      plannedMinutes: 15,
      actualMinutes: 15,
      outcome: "Done as planned",
    },
    {
      blockId: id(321),
      title: "Serve-receive",
      plannedMinutes: 25,
      actualMinutes: 25,
      outcome: "62% passes on target",
    },
    {
      blockId: id(322),
      title: "Transition",
      plannedMinutes: 20,
      actualMinutes: 15,
      outcome: "Cut to 15 min",
    },
    {
      blockId: id(323),
      title: "Games",
      plannedMinutes: 25,
      outcome: "2 games to 21",
    },
  ],
  notes: "[coach notes]",
  recordedAt: "2026-12-01T02:15:00.000Z",
};

const block = (
  n: number,
  sequence: number,
  title: string,
  kind: "drill" | "warmup" | "meeting" | "cool-down" | "free-play" | "custom",
  startsAtMinute: number,
  durationMinutes: number,
  intensity: number,
  estimateSource: "assumed" | "coach-edited" | "derived-from-scene",
  extra: Record<string, unknown> = {},
) => ({
  id: id(n),
  sequence,
  lane: "all",
  title,
  kind,
  startsAtMinute,
  durationMinutes,
  transitionMinutes: 0,
  intensity,
  plannedLoad: Math.min(100, Math.round(intensity * 9.2)),
  estimateSource,
  locked: false,
  ...extra,
});

const planBlocks = [
  block(320, 0, "Warm-up", "warmup", 0, 15, 3, "assumed", {
    estimatedTouches: 20,
    estimatedJumps: 5,
    estimatedMetres: 120,
  }),
  block(321, 1, "Serve-receive", "drill", 15, 25, 6, "derived-from-scene", {
    lane: "Court 1",
    focus: "Serve-receive",
    drillId: demoId("training-drills", 1),
    drillVersionId: demoId("training-drills", 13),
    estimatedTouches: 120,
    estimatedJumps: 10,
    estimatedMetres: 313,
  }),
  block(322, 1, "Transition", "drill", 15, 25, 7, "coach-edited", {
    lane: "Court 2",
    focus: "Transition",
    estimatedTouches: 90,
    estimatedJumps: 30,
    estimatedMetres: 280,
  }),
  block(324, 2, "Team talk", "meeting", 40, 5, 1, "assumed"),
  block(323, 3, "Games", "free-play", 45, 35, 7, "assumed", {
    estimatedTouches: 51,
    estimatedJumps: 10,
    estimatedMetres: 115,
  }),
  block(325, 4, "Cool down", "cool-down", 80, 5, 2, "assumed"),
  block(326, 5, "Notes", "custom", 85, 5, 1, "assumed", { locked: true }),
];

const planSummary = (
  n: number,
  slug: string,
  title: string,
  status: "draft" | "review" | "published" | "archived",
  version: number,
) => ({
  id: id(n),
  slug,
  title,
  status,
  durationMinutes: 90,
  plannedLoad: 53,
  version,
  updatedAt: "2026-11-27T18:00:00.000Z",
});

export const trainingProgramsDemoPracticePlanSummaries = [
  planSummary(
    300,
    "serve-receive-pressure",
    "Serve-receive under pressure",
    "published",
    3,
  ),
  planSummary(301, "transition-basics", "Transition basics", "draft", 1),
  planSummary(302, "junior-ball-control", "Junior ball control", "review", 2),
  planSummary(303, "summer-taper", "Summer taper", "archived", 4),
  planSummary(
    304,
    "defence-and-transition",
    "Defence and transition",
    "published",
    2,
  ),
  planSummary(305, "game-day-warm-up", "Game-day warm-up", "draft", 1),
];

export const trainingProgramsDemoPracticePlan = {
  ...trainingProgramsDemoPracticePlanSummaries[0]!,
  purpose: "Raise first-contact quality under serve pressure.",
  targetAudience: "Competitive juniors",
  versionId: id(310),
  targetLoad: 62,
  assumptions: {
    athletes: 12,
    courts: 2,
    ballsPerCourt: 3,
    level: "Intermediate",
    seasonWeek: 1,
    targetLoad: 62,
  },
  blocks: planBlocks,
  totals: {
    minutes: 90,
    plannedMinutes: 90,
    load: 53,
    targetLoad: 62,
    touches: 281,
    jumps: 55,
    metres: 828,
    workRestRatio: "1:1.5",
    focusMix: [
      { focus: "Serve-receive", percent: 40 },
      { focus: "Transition", percent: 35 },
      { focus: "Games", percent: 25 },
    ],
  },
  programId,
  phase: "build" as const,
  sessionId: trainingProgramsDemoIds.completedSession,
};

export const trainingProgramsDemoProposal = {
  sourceText: trainingProgramsDemoProgram.sourceText,
  draft: {
    title: "Fall competition build",
    purpose: "",
    targetAudience: "Juniors",
    objectives: [],
    startDate: "2026-11-23",
    endDate: "2027-02-14",
    timezone,
    defaultPracticeMinutes: 120,
    coaches: [
      { personId: leadCoach.personId, role: "lead" as const, weekdays: [] },
    ],
    weeklySlots: trainingProgramsDemoProgram.weeklySlots.map((slot) => ({
      weekday: slot.weekday,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      intervalWeeks: slot.intervalWeeks,
      venueId: slot.venueId,
      courtIds: slot.courtIds,
    })),
    exceptions: [trainingProgramsDemoProgram.exceptions[0]!].map(
      (exception) => ({
        kind: exception.kind,
        startsOn: exception.startsOn,
        endsOn: exception.endsOn,
        label: exception.label,
      }),
    ),
    athletePersonIds: [],
  },
  assumptions: [
    "Courts at the club's main venue",
    "No practice on public holidays",
  ],
  needsCheck: [{ field: "coaches", note: "Who is the assistant coach?" }],
};

export const trainingProgramsDemo = {
  domain: "training-programs",
  organizationId: demoOrganization.id,
  summaries: trainingProgramsDemoSummaries,
  program: trainingProgramsDemoProgram,
  cancelledProgram: trainingProgramsDemoCancelledProgram,
  proposal: trainingProgramsDemoProposal,
  sessions: trainingProgramsDemoSessions,
  conflicts: trainingProgramsDemoConflicts,
  outcome: trainingProgramsDemoOutcome,
  practicePlanSummaries: trainingProgramsDemoPracticePlanSummaries,
  practicePlan: trainingProgramsDemoPracticePlan,
} as const;
