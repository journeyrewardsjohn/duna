/**
 * Demo fixtures: participation (owner: PART-3). Group sessions in every
 * display state, the club default (labelled a proposed default), the
 * at-risk list, cancellations, attendance and a rule-change preview, built
 * from the worked examples in docs/plan/participation.md §14. Every credit
 * number is illustrative; no real people.
 */
import { demoOrganization, demoPeople, demoPlayer, demoVenues } from "../demo";
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
  {
    minParticipants: 3,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 1440,
    waitlist: true,
  },
  6,
);
const openPlay = rule(
  {
    minParticipants: 4,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 720,
    waitlist: true,
  },
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
  {
    n: 1,
    title: "Saturday semi-private",
    rule: semiPrivate,
    capacity: 2,
    booked: 1,
    startsInHours: 96,
  },
  // Example 2: the twelve-place clinic, 9 booked (a parent booked twins).
  {
    n: 2,
    title: "Thursday clinic",
    rule: clinic,
    capacity: 12,
    booked: 9,
    startsInHours: 57,
  },
  {
    n: 3,
    title: "Wednesday small group",
    rule: smallGroup,
    capacity: 6,
    booked: 6,
    waiting: 3,
    startsInHours: 33,
  },
  {
    n: 4,
    title: "Tuesday evening clinic",
    rule: clinic,
    capacity: 12,
    booked: 5,
    startsInHours: 10,
    outcome: "minimum-met",
  },
  {
    n: 5,
    title: "Tuesday small group",
    rule: smallGroup,
    capacity: 6,
    booked: 2,
    startsInHours: 8,
    outcome: "run-under-minimum",
  },
  // Example 3: open play that needed 4; only 3 joined.
  {
    n: 6,
    title: "Saturday open play",
    rule: openPlay,
    capacity: 6,
    booked: 3,
    startsInHours: 4,
    outcome: "cancel-under-minimum",
  },
  {
    n: 7,
    title: "Monday clinic",
    rule: clinic,
    capacity: 12,
    booked: 6,
    startsInHours: 30,
    outcome: "cancelled-by-club",
  },
  {
    n: 8,
    title: "Monday morning clinic",
    rule: clinic,
    capacity: 12,
    booked: 8,
    startsInHours: -3,
    outcome: "minimum-met",
  },
  {
    n: 9,
    title: "Sunday clinic",
    rule: clinic,
    capacity: 12,
    booked: 7,
    startsInHours: -40,
    outcome: "minimum-met",
    attendanceClosed: true,
  },
  { n: 10, title: "Private lesson", capacity: 1, booked: 0, startsInHours: 50 },
];

function build(session: DemoSession) {
  const startsAt = new Date(now.getTime() + hours(session.startsInHours));
  const endsAt = new Date(
    startsAt.getTime() + hours(session.durationHours ?? 1.5),
  );
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
      ? {
          reserve: display.price.reservePerPlayer,
          maxCharge: display.price.maxCharge,
        }
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
const coachId = demoId("participation", 601);
const venue = demoVenues[0]!;
const courtId = demoId("participation", 602);

/**
 * PART-B: the staff session list (`operator.catalogSessionOccurrences`) in
 * demo mode, one session per display state, with coach, court, venue and a
 * junior booked by a guardian. Names are the demo club's fictional people.
 */
function demoRoster(session: DemoSession, index: number) {
  const names = demoPeople.map((person) => person.displayName);
  const rows: {
    fulfillmentId: string;
    orderId: string;
    personId: string;
    displayName: string;
    payerPersonId: string;
    quantity: number;
    paymentMethod?: string;
    confirmed: boolean;
    reservedCredits: number;
    isMinor: boolean;
    guardianDisplayName?: string;
  }[] = [];
  let seat = 0;
  for (let place = 0; place < session.booked; place += 1) {
    const n = 1000 + index * 50 + place;
    // The second booking of every session is a junior booked by a guardian.
    const junior = rows.length === 1;
    // The twins: one parent booking two places in the twelve-place clinic.
    const quantity = session.n === 2 && place === 0 ? 2 : 1;
    if (quantity === 2) place += 1;
    const personId = junior
      ? demoId("participation", n + 500)
      : demoId("participation", n);
    rows.push({
      fulfillmentId: demoId("participation", n + 2000),
      orderId: demoId("participation", n + 4000),
      personId,
      displayName: junior ? "Sam Lewis" : names[seat % names.length]!,
      payerPersonId: junior ? demoPlayer.id : personId,
      quantity,
      paymentMethod: place % 3 === 2 ? "card" : "credit",
      confirmed: true,
      reservedCredits:
        place % 3 === 2
          ? 0
          : (session.rule?.tiers[0]?.creditsPerPlayer ?? 2) * quantity,
      isMinor: junior,
      ...(junior ? { guardianDisplayName: demoPlayer.displayName } : {}),
    });
    seat += 1;
  }
  return rows;
}

const occurrences = sessions.map((session, index) => {
  const quote = quotes[index]!;
  const startsAt = new Date(quote.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + hours(session.durationHours ?? 1.5),
  );
  const rule = session.rule;
  const lockAt = quote.lockAt;
  const status =
    session.outcome === "cancel-under-minimum" ||
    session.outcome === "cancelled-by-club"
      ? ("cancelled" as const)
      : endsAt <= now
        ? ("complete" as const)
        : ("scheduled" as const);
  return {
    id: quote.subjectId,
    catalogItemId: demoId("participation", 101),
    title: session.title,
    startsAt: quote.startsAt,
    endsAt: endsAt.toISOString(),
    timezone: zone,
    status,
    capacity: session.capacity,
    confirmedCount: session.booked,
    coach: { id: coachId, displayName: coachName },
    court: index % 2 === 0 ? { id: courtId, name: "Court 3" } : null,
    venue: { id: venue.id, name: venue.name, timeZone: venue.timezone },
    ...(rule && lockAt
      ? {
          participation: {
            capacity: session.capacity,
            bookedCount: session.booked,
            spotsRemaining: Math.max(0, session.capacity - session.booked),
            minParticipants: rule.minParticipants,
            minimumMet: session.booked >= rule.minParticipants,
            playersNeeded: Math.max(0, rule.minParticipants - session.booked),
            decisionAt: lockAt,
            lockAt,
            freeCancelUntil: lockAt,
            status:
              session.outcome === "cancel-under-minimum"
                ? ("cancelled-under-minimum" as const)
                : session.outcome === "run-under-minimum"
                  ? ("running-under-minimum" as const)
                  : session.outcome === "minimum-met"
                    ? ("confirmed" as const)
                    : ("open" as const),
            displayState: quote.displayState as Exclude<
              typeof quote.displayState,
              "open"
            >,
            waitlistCount: session.waiting ?? 0,
            heldCount: session.held ?? 0,
            minimumPolicy: rule.minimumPolicy,
            settlementBasis: "cutoff" as const,
            atStakeCredits:
              (rule.tiers[0]?.creditsPerPlayer ?? 2) * session.booked,
            atStakeMinor: 0,
          },
        }
      : {}),
    bookings: demoRoster(session, index),
  };
});

/** `operator.participation.cancelPreview` for the Thursday clinic (twins, a junior, a card payer). */
const previewSession = occurrences[1]!;
const cancelPreview = {
  subjectType: "catalog-session-occurrence" as const,
  subjectId: previewSession.id,
  bookings: previewSession.bookings.map((booking) => ({
    bookingId: booking.fulfillmentId,
    displayName: booking.isMinor
      ? booking.displayName.split(" ")[0]!
      : booking.displayName,
    isMinor: booking.isMinor,
    quantity: booking.quantity,
    method:
      booking.paymentMethod === "card"
        ? ("card" as const)
        : ("credits" as const),
    outcome:
      booking.paymentMethod === "card"
        ? ("refund-submitted" as const)
        : ("credits-restored" as const),
    ...(booking.paymentMethod === "card"
      ? { cardRefundMinor: 3_000 * booking.quantity, currency: "USD" }
      : { creditsBack: booking.reservedCredits }),
  })),
  totals: {
    bookings: previewSession.bookings.length,
    places: previewSession.bookings.reduce((sum, row) => sum + row.quantity, 0),
    creditsBack: previewSession.bookings
      .filter((row) => row.paymentMethod !== "card")
      .reduce((sum, row) => sum + row.reservedCredits, 0),
    cardRefunds: previewSession.bookings.filter(
      (row) => row.paymentMethod === "card",
    ).length,
    cardRefundMinor: previewSession.bookings
      .filter((row) => row.paymentMethod === "card")
      .reduce((sum, row) => sum + 3_000 * row.quantity, 0),
    currency: "USD",
    released: 0,
    reviewRequired: 0,
  },
  notices: previewSession.bookings.map((booking) => ({
    bookingId: booking.fulfillmentId,
    audience: booking.guardianDisplayName ?? booking.displayName,
    audienceRole: booking.isMinor ? ("guardian" as const) : ("player" as const),
    channel: "notice" as const,
  })),
};

export const participationDemo = {
  now: PARTICIPATION_DEMO_NOW,
  /** PART-B: `operator.catalogSessionOccurrences` in demo mode. */
  occurrences,
  /** PART-B: `operator.participation.cancelPreview` (money for `payments:read`). */
  cancelPreview,
  /** PART-B: `operator.participation.resolveCancelRequest`. */
  cancelRequestApproved: {
    requestId: demoId("participation", 301),
    status: "approved" as const,
    cancellations: [
      {
        bookingId: demoId("participation", 201),
        refundStatus: "credits-restored" as const,
      },
    ],
    coachNotified: false,
  },
  cancelRequestDeclined: {
    requestId: demoId("participation", 301),
    status: "declined" as const,
    cancellations: [],
    coachNotified: false,
  },
  /** PART-B: `operator.participation.shareLink`. */
  shareLink: {
    url: "/i/demoShare123",
    code: "demoShare123",
    expiresAt: quotes[0]!.startsAt,
  },
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
    issues: [
      "The minimum (5) can't be more than the 4 players a session holds.",
    ],
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
    lockAt: new Date(
      new Date(quotes[0]!.lockAt!).getTime() + hours(12),
    ).toISOString(),
    noticesQueued: 1,
  },
  runAnyway: { displayState: "needs-players" as const },
  cancelSession: {
    cancellations: [
      {
        bookingId: demoId("participation", 201),
        refundStatus: "credits-restored" as const,
      },
      {
        bookingId: demoId("participation", 202),
        refundStatus: "refund-submitted" as const,
      },
      {
        bookingId: demoId("participation", 203),
        refundStatus: "released" as const,
      },
      {
        bookingId: demoId("participation", 204),
        refundStatus: "review-required" as const,
      },
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
  waitlistJoined: {
    entryId: demoId("participation", 401),
    position: 2,
    status: "waiting" as const,
  },
  waitlistOffer: {
    entryId: demoId("participation", 402),
    position: 1,
    status: "offered" as const,
    holdExpiresAt: new Date(now.getTime() + hours(2)).toISOString(),
  },
  waitlistLeft: { status: "cancelled" as const },
  inviteLink: {
    url: "/i/demoInvite12",
    code: "demoInvite12",
    expiresAt: quotes[0]!.startsAt,
  },
  invite: {
    title: quotes[0]!.title,
    club: demoOrganization.name,
    startsAt: quotes[0]!.startsAt,
    timezone: zone,
    displayState: "needs-players" as const,
    needs: 1,
    status: quotes[0]!.copy.status,
    ...(quotes[0]!.copy.line ? { line: quotes[0]!.copy.line } : {}),
    bookHref: `/clubs/${demoOrganization.slug}/products/semi-private?session=${quotes[0]!.subjectId}&invite=demoInvite12`,
  },
  mergeSessions: {
    moved: 3,
    refunded: 1,
    priceChanges: [
      { bookingId: demoId("participation", 211), creditsReturned: 0 },
      { bookingId: demoId("participation", 212), creditsReturned: 0 },
      { bookingId: demoId("participation", 213), creditsReturned: 0 },
    ],
  },
  mergeDivisions: { moved: 4 },
  subjectRule: {
    rules: { ...clubDefaultRule, minParticipants: 4, unit: "team" as const },
    issues: [] as string[],
    warnings: [],
  },
  rulesToReview: [
    {
      subjectType: "session" as const,
      subjectId: demoId("participation", 501),
      title: "Saturday junior clinic",
      startsAt: new Date(now.getTime() + hours(100)).toISOString(),
      minParticipants: 4,
    },
    {
      subjectType: "pickup-session" as const,
      subjectId: demoId("participation", 502),
      title: "Sunday sunrise pickup",
      startsAt: new Date(now.getTime() + hours(120)).toISOString(),
      minParticipants: 4,
    },
  ],
  keptRule: { state: "kept" as const },
  attendance: {
    recorded: 7,
    ignored: [{ bookingId: demoId("participation", 205), reason: "cancelled" }],
  },
};
