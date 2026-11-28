import "server-only";

/**
 * Demo mode for the Player pages (no database): sample plans and results so
 * the persona suite can walk Play, a result and its confirmation end to end.
 * Nothing here is ever on a production deployment or a signed-in server:
 * every switch needs demo mode, `DUNA_DEMO_PERSONAS=enabled` (only the
 * Playwright servers set it) and no WorkOS credentials, as the wallet's and
 * Home's demo switches do.
 *
 * - `duna-demo-plans=<scope>`: Play shows sample plans dated from today; what
 *   a test cancels or leaves is remembered for that scope only.
 * - `duna-demo-side=opponent`: on a demo result the viewer is the other side
 *   (the persona switch "the other side confirms").
 *
 * The answers to actions on these plans mirror the procedures' own shapes
 * and say "Demo" where a real answer would name money.
 */
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { BookingSummary, MatchSummary, PersonSummary } from "@duna/core";
import { demoPeople, demoPlayer } from "@duna/core/demo";
import { addScoreDemo } from "@duna/core/demo/add-score";
import { cookies } from "next/headers";
import type { CatalogBooking, CourtInvite } from "./api-types";

export const DEMO_PLANS_COOKIE = "duna-demo-plans";
export const DEMO_SIDE_COOKIE = "duna-demo-side";

export function demoSwitchesAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    !isWorkOSAuthKitConfigured(env) &&
    env.DUNA_DEMO_PERSONAS === "enabled" &&
    env.NEXT_PUBLIC_DEMO_MODE !== "false" &&
    env.VERCEL_ENV !== "production"
  );
}

/** Demo mode without a database: writes cannot reach a real table. */
export function demoWithoutDatabase(demo: boolean): boolean {
  return demo && !process.env.DATABASE_URL;
}

/** The scope of the sample plans, or null when the switch is off. */
export async function demoPlansScope(): Promise<string | null> {
  if (!demoSwitchesAllowed()) return null;
  const value = (await cookies()).get(DEMO_PLANS_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : null;
}

export async function demoViewerIsOpponent(): Promise<boolean> {
  if (!demoSwitchesAllowed()) return false;
  return (await cookies()).get(DEMO_SIDE_COOKIE)?.value === "opponent";
}

// ---------------------------------------------------------------- plans --

interface PlanScopeState {
  readonly gone: Set<string>;
  readonly rejoined: Set<string>;
}

const planScopes = new Map<string, PlanScopeState>();

function scopeState(scope: string): PlanScopeState {
  let state = planScopes.get(scope);
  if (!state) {
    state = { gone: new Set(), rejoined: new Set() };
    planScopes.set(scope, state);
    // Keep the memory small: a test run makes a few dozen scopes.
    if (planScopes.size > 200) {
      const oldest = planScopes.keys().next().value;
      if (oldest) planScopes.delete(oldest);
    }
  }
  return state;
}

export const DEMO_PLAN_IDS = {
  clinic: "demo-plan-clinic",
  hosted: "demo-plan-hosted",
  court: "demo-plan-court",
  waitlist: "demo-plan-waitlist",
  away: "demo-plan-away",
  junior: "demo-plan-junior",
  past: "demo-plan-past",
} as const;

export function isDemoPlanId(id: string): boolean {
  return id.startsWith("demo-plan-");
}

export function rememberDemoPlan(
  scope: string,
  id: string,
  change: "gone" | "rejoined",
): void {
  const state = scopeState(scope);
  if (change === "gone") {
    state.gone.add(id);
    state.rejoined.delete(id);
  } else {
    state.rejoined.add(id);
  }
}

function at(now: number, days: number, hourUtc: number): string {
  const date = new Date(now);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function plus(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

const DEMO_ORG = {
  id: "d0130000-0000-4000-8000-000000000900",
  slug: "south-bay-beach",
  name: "South Bay Beach Club",
};

/** Sample plans dated from today, for the viewer and (for a guardian) a junior. */
export function demoPlans(input: {
  readonly scope: string;
  readonly now: number;
  readonly juniors: readonly { personId: string; displayName: string }[];
}): { bookings: BookingSummary[]; catalog: CatalogBooking[] } {
  const state = scopeState(input.scope);
  const { now } = input;
  const clinicStart = at(now, 3, 1);
  const awayStart = at(now, 9, 19);
  const juniorStart = at(now, 4, 0);
  const catalogBase = {
    orderId: "d0130000-0000-4000-8000-000000000901",
    catalogItemId: "d0130000-0000-4000-8000-000000000902",
    organization: DEMO_ORG,
    sessionStatus: "scheduled" as const,
    deliveryMode: "venue" as const,
    coaches: [{ personId: demoPeople[1]!.id, displayName: "Theo Park" }],
    paidByPersonId: demoPlayer.id,
    quantity: 1,
    paymentMethod: "credit" as const,
    bookedAt: plus(clinicStart, -10 * 24 * 60),
    cancellable: true,
    refundIfCancelledNow: true,
  };
  const self = {
    personId: demoPlayer.id,
    displayName: demoPlayer.displayName,
    isSelf: true,
  };
  const catalog: CatalogBooking[] = [
    {
      ...catalogBase,
      bookingId: DEMO_PLAN_IDS.clinic,
      status: "confirmed",
      catalogItemSlug: "serve-receive-lab",
      title: "Serve + Receive Lab",
      subtype: "clinic",
      startsAt: clinicStart,
      endsAt: plus(clinicStart, 90),
      timezone: "America/Los_Angeles",
      venue: {
        id: "d0130000-0000-4000-8000-000000000903",
        name: "Manhattan Beach Pier · Court 4",
        countryCode: "US",
      },
      participant: self,
      bookedBy: self,
      creditsReserved: 3,
      participation: {
        bookedCount: 2,
        playersNeeded: 2,
        spotsRemaining: 6,
        displayState: "needs-players",
      },
      refundableUntil: plus(clinicStart, -24 * 60),
    } as unknown as CatalogBooking,
    {
      ...catalogBase,
      bookingId: DEMO_PLAN_IDS.away,
      status: "confirmed",
      catalogItemSlug: "waikiki-weekend-clinic",
      title: "Waikiki Weekend Clinic",
      subtype: "clinic",
      startsAt: awayStart,
      endsAt: plus(awayStart, 120),
      timezone: "Pacific/Honolulu",
      venue: {
        id: "d0130000-0000-4000-8000-000000000904",
        name: "Queen's Beach",
        countryCode: "US",
      },
      participant: self,
      bookedBy: self,
      creditsReserved: 4,
      participation: {
        bookedCount: 5,
        playersNeeded: 0,
        spotsRemaining: 3,
        displayState: "minimum-reached",
      },
      refundableUntil: plus(awayStart, -24 * 60),
    } as unknown as CatalogBooking,
    ...input.juniors.slice(0, 1).map(
      (junior) =>
        ({
          ...catalogBase,
          bookingId: DEMO_PLAN_IDS.junior,
          status: "confirmed",
          catalogItemSlug: "junior-sand-skills",
          title: "Junior Sand Skills",
          subtype: "clinic",
          startsAt: juniorStart,
          endsAt: plus(juniorStart, 60),
          timezone: "America/Los_Angeles",
          venue: {
            id: "d0130000-0000-4000-8000-000000000905",
            name: "Hermosa Beach · Court 2",
            countryCode: "US",
          },
          participant: {
            personId: junior.personId,
            displayName: junior.displayName,
            isSelf: false,
          },
          bookedBy: self,
          creditsReserved: 2,
          participation: {
            bookedCount: 6,
            playersNeeded: 0,
            spotsRemaining: 2,
            displayState: "minimum-reached",
          },
          refundableUntil: plus(juniorStart, -24 * 60),
        }) as unknown as CatalogBooking,
    ),
  ].filter((booking) => !state.gone.has(booking.bookingId));

  const hostedStart = at(now, 2, 2);
  const courtStart = at(now, 5, 16);
  const waitlistStart = at(now, 6, 17);
  const pastStart = at(now, -4, 2);
  const waitlistGone = state.gone.has(DEMO_PLAN_IDS.waitlist);
  const bookings = (
    [
      {
        id: DEMO_PLAN_IDS.hosted,
        source: "pickup",
        sessionId: "d0130000-0000-4000-8000-000000000910",
        sessionSlug: "golden-hour-4s",
        title: "Golden Hour 4s",
        kind: "pickup",
        startsAt: hostedStart,
        endsAt: plus(hostedStart, 90),
        venueName: "Hermosa Beach · Pier Courts",
        venueTimezone: "America/Los_Angeles",
        status: "confirmed",
        amount: { amountMinor: 0, currency: "USD" },
        paymentStatus: "free",
        participantNames: ["Mara Lewis", "Theo Park", "Elena Torres"],
        pickup: {
          capacity: 8,
          confirmedCount: 3,
          spotsRemaining: 5,
          waitlistEnabled: true,
          approvalRequired: false,
          visibility: "public",
          pricePerPerson: { amountMinor: 0, currency: "USD" },
          canAddPlayers: true,
          isCreator: true,
        },
      } as BookingSummary,
      {
        id: DEMO_PLAN_IDS.court,
        source: "court",
        title: "Court time",
        kind: "court-rental",
        startsAt: courtStart,
        endsAt: plus(courtStart, 60),
        venueName: "Manhattan Beach Pier",
        venueTimezone: "America/Los_Angeles",
        court: { id: "d0130000-0000-4000-8000-000000000911", name: "Court 4" },
        status: "confirmed",
        amount: { amountMinor: 4800, currency: "USD" },
        paymentStatus: "paid",
        participantNames: ["Mara Lewis", "Theo Park"],
      },
      ...(waitlistGone && !state.rejoined.has(DEMO_PLAN_IDS.waitlist)
        ? []
        : [
            {
              id: DEMO_PLAN_IDS.waitlist,
              source: "registration" as const,
              sessionId: "d0130000-0000-4000-8000-000000000912",
              sessionSlug: "sunset-open",
              title: "Sunset Open · Women's AA",
              kind: "tournament" as const,
              startsAt: waitlistStart,
              endsAt: plus(waitlistStart, 8 * 60),
              venueName: "Hermosa Beach · Pier Courts",
              venueTimezone: "America/Los_Angeles",
              organization: DEMO_ORG,
              status: "waitlisted" as const,
              amount: { amountMinor: 6000, currency: "USD" },
              participantNames: ["Mara Lewis"],
              canCancel: true,
            },
          ]),
      {
        id: DEMO_PLAN_IDS.past,
        source: "pickup",
        title: "Sunday Morning 2s",
        kind: "pickup",
        startsAt: pastStart,
        endsAt: plus(pastStart, 90),
        venueName: "Manhattan Beach Pier",
        venueTimezone: "America/Los_Angeles",
        status: "confirmed",
        amount: { amountMinor: 0, currency: "USD" },
        paymentStatus: "free",
        participantNames: ["Mara Lewis", "Noa Williams"],
      },
    ] as unknown as BookingSummary[]
  ).filter(
    (booking) => !state.gone.has(booking.id) || state.rejoined.has(booking.id),
  );
  return { bookings, catalog };
}

// -------------------------------------------------------------- results --

interface DemoMatch {
  summary: MatchSummary;
  confirmedPersonIds: string[];
  reporterId: string;
}

const demoMatches = new Map<string, DemoMatch>();

function person(
  value: PersonSummary,
  claim?: PersonSummary["profileClaimStatus"],
): PersonSummary {
  return claim ? { ...value, profileClaimStatus: claim } : value;
}

function seedClaimed(): DemoMatch {
  const id = addScoreDemo.claimedMatchId;
  const existing = demoMatches.get(id);
  if (existing) return existing;
  const match: DemoMatch = {
    reporterId: demoPlayer.id,
    confirmedPersonIds: [demoPlayer.id],
    summary: {
      id,
      status: "pending-verification",
      confirmationRequired: true,
      playedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      venueName: "Dockside Sand Courts",
      teamA: [person(demoPlayer), person(demoPeople[4]!)],
      teamB: [person(demoPeople[1]!), person(demoPeople[2]!)],
      score: [
        [21, 18],
        [19, 21],
        [15, 12],
      ],
      winner: "A",
      ratingDelta: 0,
      verification: "self-reported",
      matchType: "competitive",
      teamSize: 2,
      canRemove: true,
      origin: "self-reported",
    },
  };
  demoMatches.set(id, match);
  return match;
}

/** A demo result by id (the add-score landing is always there). */
export function demoMatch(id: string): DemoMatch | undefined {
  if (id === addScoreDemo.claimedMatchId) return seedClaimed();
  return demoMatches.get(id);
}

export function demoMatchList(): MatchSummary[] {
  return [...demoMatches.values()].map((match) => match.summary);
}

/** Save a result in demo mode: it waits for the other side. */
export function recordDemoMatch(input: {
  readonly teamA: readonly PersonSummary[];
  readonly teamB: readonly PersonSummary[];
  readonly sets: readonly (readonly [number, number])[];
  readonly venueName: string;
  readonly playedAt: string;
  readonly matchType: "competitive" | "friendly";
}): string {
  const id = crypto.randomUUID();
  const youWon =
    input.sets.filter(([a, b]) => a > b).length >
    input.sets.filter(([a, b]) => b > a).length;
  demoMatches.set(id, {
    reporterId: demoPlayer.id,
    confirmedPersonIds: [demoPlayer.id],
    summary: {
      id,
      status: "pending-verification",
      confirmationRequired: true,
      playedAt: input.playedAt,
      venueName: input.venueName,
      teamA: [...input.teamA],
      teamB: [...input.teamB],
      score: input.sets.map(([a, b]) => [a, b] as const),
      winner: youWon ? "A" : "B",
      ratingDelta: 0,
      verification: "self-reported",
      matchType: input.matchType,
      teamSize: input.teamA.length,
      canRemove: true,
      origin: "self-reported",
    },
  });
  return id;
}

/** The demo person who looks at a result from the other side. */
export function demoOpponentOf(id: string): PersonSummary | undefined {
  const match = demoMatch(id);
  if (!match) return undefined;
  const reporterSide = match.summary.teamA.some(
    (candidate) => candidate.id === match.reporterId,
  )
    ? "A"
    : "B";
  const other =
    reporterSide === "A" ? match.summary.teamB : match.summary.teamA;
  return other.find(
    (candidate) =>
      candidate.profileClaimStatus !== "unclaimed" &&
      candidate.profileClaimStatus !== "claim-pending",
  );
}

/** Confirm or dispute a demo result as `personId`. */
export function answerDemoMatch(
  id: string,
  personId: string,
  decision: "confirmed" | "disputed",
): {
  status: "pending-verification" | "verified" | "disputed";
  ratingApplied: boolean;
} {
  const match = demoMatch(id);
  if (!match) throw new Error("This result isn’t here any more.");
  if (decision === "disputed") {
    match.summary = {
      ...match.summary,
      status: "disputed",
      dispute: { status: "pending", reasonCode: "wrong-score" },
    };
    return { status: "disputed", ratingApplied: false };
  }
  if (!match.confirmedPersonIds.includes(personId)) {
    match.confirmedPersonIds.push(personId);
  }
  const sides = (["A", "B"] as const).filter((side) =>
    (side === "A" ? match.summary.teamA : match.summary.teamB).some(
      (candidate) => match.confirmedPersonIds.includes(candidate.id),
    ),
  );
  if (sides.length < 2) {
    return { status: "pending-verification", ratingApplied: false };
  }
  const counts =
    match.summary.matchType !== "friendly" && match.summary.teamSize === 2;
  const before = demoPlayer.rating.display;
  const delta = counts ? (match.summary.winner === "A" ? 0.06 : -0.04) : 0;
  match.summary = {
    ...match.summary,
    status: "verified",
    verification: "both-confirmed",
    ratingImpact: counts ? "sand-rating" : "history-only",
    ratingDelta: delta,
    ...(counts
      ? {
          ratingBefore: before,
          ratingAfter: Math.round((before + delta) * 100) / 100,
        }
      : {}),
    canRemove: false,
  };
  return { status: "verified", ratingApplied: counts };
}

export function removeDemoMatch(id: string): void {
  demoMatches.delete(id);
}

export function demoMatchScoring(id: string):
  | {
      status: "pending-verification" | "verified" | "disputed";
      confirmedPersonIds: string[];
      pendingClaims: { personId: string; displayName: string }[];
    }
  | undefined {
  const match = demoMatch(id);
  if (!match) return undefined;
  const status = match.summary.status;
  return {
    status:
      status === "verified" || status === "disputed"
        ? status
        : "pending-verification",
    confirmedPersonIds: [...match.confirmedPersonIds],
    pendingClaims: [],
  };
}

// -------------------------------------------------------------- invites --

export const DEMO_INVITE_TOKEN = "demo-court-invite";

const acceptedInvites = new Set<string>();

/** A sample court invitation (demo mode, no database). */
export function demoCourtInvite(
  token: string,
  scope: string | null,
  now = Date.now(),
): CourtInvite | undefined {
  if (token !== DEMO_INVITE_TOKEN) return undefined;
  const accepted = acceptedInvites.has(`${scope ?? ""}:${token}`);
  const startsAt = new Date(now + 2 * 86_400_000);
  startsAt.setUTCHours(1, 0, 0, 0);
  return {
    bookingId: "d0130000-0000-4000-8000-000000000920",
    inviteToken: token,
    venueName: "Manhattan Beach Pier",
    courtName: "Court 4",
    organizerName: "Theo Park",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
    timezone: "America/Los_Angeles",
    bookingStatus: "confirmed" as const,
    participant: {
      id: "d0130000-0000-4000-8000-000000000921",
      displayName: demoPlayer.displayName,
      role: "player",
      status: accepted ? ("accepted" as const) : ("invited" as const),
      shareAmountMinor: 0,
    },
    policy: {
      title: "Manhattan Beach Pier cancellation policy",
      markdown:
        "Cancel at least 24 hours before the start for a full refund. Inside 24 hours the court is still yours and the booking is not refunded.",
      refundBeforeHours: 24,
      requireFullScroll: false,
    },
    currency: "USD",
    available: !accepted,
  };
}

export function acceptDemoInvite(token: string, scope: string | null): void {
  acceptedInvites.add(`${scope ?? ""}:${token}`);
}
