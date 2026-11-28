/**
 * Demo fixtures: participation (owner: PART-3). Group sessions in every
 * display state, the club default (labelled a proposed default), the
 * at-risk list, cancellations, attendance and a rule-change preview, built
 * from the worked examples in docs/plan/participation.md §14. Every credit
 * number is illustrative; no real people.
 */
import { demoOrganization, demoPlayer } from "../demo";
import {
  participationDisplay,
  participationLockAt,
  readParticipationRuleV2,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
  type ParticipationDecisionOutcome,
  type ParticipationRuleV2,
  type ResolvedParticipationRule,
} from "../participation/index";
import { demoId } from "./ids";

/** Tuesday 8 December 2026, 9:00 AM in Los Angeles. */
export const PARTICIPATION_DEMO_NOW = "2026-12-08T17:00:00.000Z";
const now = new Date(PARTICIPATION_DEMO_NOW);
const zone = demoOrganization.timezone;
const hours = (value: number) => value * 3_600_000;

const rule = (value: Record<string, unknown>, capacity: number) =>
  resolveParticipationRuleV2(readParticipationRuleV2(value)!, { capacity });

const semiPrivate = rule(
  { minParticipants: 2, minimumPolicy: "cancel", lockMinutesBeforeStart: 1440 },
  2,
);
const clinic = rule(
  {
    minParticipants: 4,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 1440,
    waitlist: true,
    tiers: [
      { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
      { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
    ],
  },
  12,
);
const smallGroup = rule(
  { minParticipants: 3, minimumPolicy: "cancel", lockMinutesBeforeStart: 1440, waitlist: true },
  6,
);
const openPlay = rule(
  { minParticipants: 4, minimumPolicy: "cancel", lockMinutesBeforeStart: 720, waitlist: true },
  6,
);

interface DemoSession {
  readonly n: number;
  readonly title: string;
  readonly rule?: ResolvedParticipationRule;
  readonly capacity: number;
  readonly booked: number;
  readonly held?: number;
  readonly waiting?: number;
  readonly startsInHours: number;
  readonly durationHours?: number;
  readonly outcome?: ParticipationDecisionOutcome;
  readonly attendanceClosed?: boolean;
}

/** One session per display state (and one without a group rule). */
const sessions: readonly DemoSession[] = [
  // Example 1: Maya's semi-private, 1 of 2, decides Fri 9:00 AM.
  { n: 1, title: "Saturday semi-private", rule: semiPrivate, capacity: 2, booked: 1, startsInHours: 96 },
  // Example 2: the twelve-place clinic, 9 booked (a parent booked twins).
  { n: 2, title: "Thursday clinic", rule: clinic, capacity: 12, booked: 9, startsInHours: 57 },
  { n: 3, title: "Wednesday small group", rule: smallGroup, capacity: 6, booked: 6, waiting: 3, startsInHours: 33 },
  { n: 4, title: "Tuesday evening clinic", rule: clinic, capacity: 12, booked: 5, startsInHours: 10, outcome: "minimum-met" },
  { n: 5, title: "Tuesday small group", rule: smallGroup, capacity: 6, booked: 2, startsInHours: 8, outcome: "run-under-minimum" },
  // Example 3: open play that needed 4; only 3 joined.
  { n: 6, title: "Saturday open play", rule: openPlay, capacity: 6, booked: 3, startsInHours: 4, outcome: "cancel-under-minimum" },
  { n: 7, title: "Monday clinic", rule: clinic, capacity: 12, booked: 6, startsInHours: 30, outcome: "cancelled-by-club" },
  { n: 8, title: "Monday morning clinic", rule: clinic, capacity: 12, booked: 8, startsInHours: -3, outcome: "minimum-met" },
  { n: 9, title: "Sunday clinic", rule: clinic, capacity: 12, booked: 7, startsInHours: -40, outcome: "minimum-met", attendanceClosed: true },
  { n: 10, title: "Private lesson", capacity: 1, booked: 0, startsInHours: 50 },
];

function build(session: DemoSession) {
  const startsAt = new Date(now.getTime() + hours(session.startsInHours));
  const endsAt = new Date(startsAt.getTime() + hours(session.durationHours ?? 1.5));
  const lockAt = session.rule
    ? participationLockAt({
        startsAt,
        lockMinutesBeforeStart: session.rule.lockMinutesBeforeStart,
      })
    : undefined;
  const display = participationDisplay({
    rule: session.rule,
    title: session.title,
    capacity: session.capacity,
    booked: session.booked,
    held: session.held,
    waiting: session.waiting,
    outcome: session.outcome,
    decidedGroupSize: session.outcome ? session.booked : undefined,
    lockAt,
    startsAt,
    endsAt,
    now,
    timeZone: zone,
    clubName: demoOrganization.name,
    attendanceClosed: session.attendanceClosed,
    payment: { method: "credit" },
    viewer: { booked: false, quantity: 1 },
  });
  return {
    subjectType: "catalog-session-occurrence" as const,
    subjectId: demoId("participation", session.n),
    title: session.title,
    startsAt: startsAt.toISOString(),
    timezone: zone,
    hasGroupRule: display.hasGroupRule,
    displayState: display.state,
    display,
    copy: renderParticipationDisplay(display),
    ...(display.price
      ? { reserve: display.price.reservePerPlayer, maxCharge: display.price.maxCharge }
      : {}),
    alreadyBooked: false,
    ...(lockAt ? { lockAt: lockAt.toISOString() } : {}),
  };
}

const quotes = sessions.map(build);

/** A proposed default, not a club's real setting (PART.md §1). */
const clubDefaultRule: ParticipationRuleV2 = {
  version: 2,
  unit: "player",
  minParticipants: 3,
  minimumPolicy: "cancel",
  lockMinutesBeforeStart: 1440,
  waitlist: true,
  tiers: [],
};

const coachName = "Coach Rivera";

export const participationDemo = {
  now: PARTICIPATION_DEMO_NOW,
  /** Every display state, plus a session without a group rule. */
  quotes,
  defaults: {
    rules: clubDefaultRule,
    appliesTo: ["service"] as ("service" | "open-play" | "pickup")[],
    inheritedBy: 4,
    proposed: true,
  },
  setDefaultsInvalid: {
    rules: clubDefaultRule,
    issues: ["The minimum (5) can't be more than the 4 players a session holds."],
    warnings: [],
  },
  atRisk: {
    sessions: [
      {
        subjectType: "catalog-session-occurrence" as const,
        subjectId: quotes[0]!.subjectId,
        catalogItemId: demoId("participation", 101),
        title: quotes[0]!.title,
        startsAt: quotes[0]!.startsAt,
        timezone: zone,
        coachNames: [coachName],
        booked: 1,
        min: 2,
        capacity: 2,
        lockAt: quotes[0]!.lockAt!,
        displayState: "needs-players" as const,
        atStakeMinor: 0,
        atStakeCredits: 4,
      },
    ],
    totals: {
      sessions: 1,
      booked: 1,
      atStakeMinor: 0,
      atStakeCredits: 4,
      currency: "USD",
    },
  },
  preview: {
    issues: [],
    warnings: [
      {
        groupSize: 8,
        fromTotal: 21,
        toTotal: 16,
        unit: "credits" as const,
        message: "An 8th player lowers your total from 21 to 16 credits.",
      },
    ],
    changeClass: "loosens" as const,
    unbookedSessions: 6,
    bookedSessions: [
      { id: quotes[1]!.subjectId, startsAt: quotes[1]!.startsAt, booked: 9 },
    ],
  },
  applied: { updated: 1, skipped: [] as string[] },
  extendLock: {
    lockAt: new Date(new Date(quotes[0]!.lockAt!).getTime() + hours(12)).toISOString(),
    noticesQueued: 1,
  },
  runAnyway: { displayState: "needs-players" as const },
  cancelSession: {
    cancellations: [
      { bookingId: demoId("participation", 201), refundStatus: "credits-restored" as const },
      { bookingId: demoId("participation", 202), refundStatus: "refund-submitted" as const },
      { bookingId: demoId("participation", 203), refundStatus: "released" as const },
      { bookingId: demoId("participation", 204), refundStatus: "review-required" as const },
    ],
  },
  cancelRequest: { requestId: demoId("participation", 301) },
  cancelRequests: [
    {
      id: demoId("participation", 301),
      subjectType: "catalog-session-occurrence" as const,
      subjectId: quotes[1]!.subjectId,
      requestedByPersonId: demoPlayer.id,
      reason: "coach" as const,
      status: "open" as const,
      createdAt: PARTICIPATION_DEMO_NOW,
    },
  ],
  attendance: {
    recorded: 7,
    ignored: [{ bookingId: demoId("participation", 205), reason: "cancelled" }],
  },
};
