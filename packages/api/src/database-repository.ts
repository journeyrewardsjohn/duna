import {
  auditLog,
  consents,
  courtBookings,
  courts,
  divisions,
  eventTypes,
  getDatabase,
  guardianships,
  matchConfirmations,
  matches,
  memberships,
  membershipTiers,
  organizationMemberships,
  organizations,
  orders,
  people,
  pickupParticipants,
  pickupSessions,
  programs,
  privacyRequests,
  rallyEvents,
  ratingEvents,
  ratings,
  registrations,
  reports,
  sessions,
  teamMembers,
  teams,
  venues,
  walletAccounts,
  walletLedger,
} from "@duna/db";
import {
  evaluateTaxRails,
  foldWalletLedger,
  type AuditEvent,
  type BookingSummary,
  type Currency,
  type EventKind,
  type EventSummary,
  type MatchSummary,
  type Metric,
  type OrganizationSummary,
  type PersonRole,
  type PersonSummary,
  type VenueSummary,
  type WalletEntry,
} from "@duna/core";
import {
  foldScore,
  standardBeachFormat,
  type MatchFormat,
  type ScoreEvent,
} from "@duna/league-engine";
import {
  priceConsumerOrder,
  type CurrencyCode,
  type PricedOrderItem,
} from "@duna/pricing";
import { and, asc, desc, eq, gte, inArray, ne, or } from "drizzle-orm";
import type {
  AdminQueue,
  DunaRepository,
  OperatorScheduleItem,
  PickupMutationInput,
  PlayerSettings,
  PlayerWallet,
} from "./repository-contract";
import { loadGuardianReviewQueue } from "./identity";

const publicSessionStatuses = [
  "published",
  "registration-open",
  "live",
  "weather-hold",
] as const;

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function currency(value: string): Currency {
  const supported: readonly Currency[] = ["USD", "CAD", "AUD", "BRL", "EUR"];
  return supported.includes(value as Currency) ? (value as Currency) : "USD";
}

function plan(value: string): OrganizationSummary["plan"] {
  const supported: readonly OrganizationSummary["plan"][] = [
    "coach",
    "small-club",
    "club",
    "multi-venue",
  ];
  return supported.includes(value as OrganizationSummary["plan"])
    ? (value as OrganizationSummary["plan"])
    : "coach";
}

function formatUsd(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function relativeAge(occurredAt: Date, now = new Date()): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - occurredAt.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function slaLabel(dueAt: Date, now = new Date()): string {
  const minutes = Math.floor((dueAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return `${Math.abs(minutes)} min overdue`;
  if (minutes < 60) return `${minutes} min remaining`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
}

function walletDescription(reasonCode: string): string {
  return titleCase(reasonCode);
}

async function loadPeople(
  personIds: readonly string[],
): Promise<PersonSummary[]> {
  if (personIds.length === 0) return [];
  const database = getDatabase();
  const [personRows, ratingRows, membershipRows, guardianRows] =
    await Promise.all([
      database
        .select()
        .from(people)
        .where(inArray(people.id, [...personIds])),
      database
        .select()
        .from(ratings)
        .where(inArray(ratings.personId, [...personIds])),
      database
        .select()
        .from(organizationMemberships)
        .where(
          and(
            inArray(organizationMemberships.personId, [...personIds]),
            eq(organizationMemberships.active, true),
          ),
        ),
      database
        .select()
        .from(guardianships)
        .where(inArray(guardianships.minorId, [...personIds])),
    ]);
  const ratingByPerson = new Map(
    ratingRows.map((row) => [row.personId, row] as const),
  );
  const rolesByPerson = new Map<string, Set<PersonRole>>();
  for (const personId of personIds)
    rolesByPerson.set(personId, new Set(["player"]));
  for (const row of membershipRows) {
    rolesByPerson.get(row.personId)?.add(row.role);
  }
  const guardiansByMinor = new Map<string, string[]>();
  for (const row of guardianRows) {
    const current = guardiansByMinor.get(row.minorId) ?? [];
    current.push(row.guardianId);
    guardiansByMinor.set(row.minorId, current);
  }
  const order = new Map(personIds.map((id, index) => [id, index] as const));
  return personRows
    .map((person): PersonSummary => {
      const rating = ratingByPerson.get(person.id);
      return {
        id: person.id,
        displayName: person.displayName,
        handle: person.handle,
        initials: initials(person.displayName),
        homeMarket: person.homeMarket ?? "Market not set",
        roles: [
          ...(rolesByPerson.get(person.id) ?? new Set<PersonRole>(["player"])),
        ],
        isMinor: person.isMinor,
        guardianIds: guardiansByMinor.get(person.id),
        rating: rating
          ? {
              display: rating.display,
              mu: rating.mu,
              phi: rating.phi,
              sigma: rating.sigma,
              confidence: rating.confidence,
              discipline: rating.discipline,
            }
          : {
              display: 3,
              mu: 1_500,
              phi: 350,
              sigma: 0.06,
              confidence: "Provisional",
              discipline: "beach-2s",
            },
      };
    })
    .sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

function storedMatchFormat(value: unknown): MatchFormat {
  const stored =
    typeof value === "object" && value !== null
      ? (value as Partial<MatchFormat>)
      : {};
  return {
    ...standardBeachFormat,
    ...stored,
    scoringSystem: stored.scoringSystem === "sideout" ? "sideout" : "rally",
  };
}

function summaryVerification(
  value: string | null,
): MatchSummary["verification"] {
  if (
    value === "live-scored" ||
    value === "desk" ||
    value === "both-confirmed" ||
    value === "auto-accepted" ||
    value === "self-reported" ||
    value === "group-confirmed"
  ) {
    return value;
  }
  return "auto-accepted";
}

async function loadMatchHistory(personId: string): Promise<MatchSummary[]> {
  const database = getDatabase();
  const ownMembershipRows = await database
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.personId, personId));
  const ownTeamIds = [...new Set(ownMembershipRows.map((row) => row.teamId))];
  if (ownTeamIds.length === 0) return [];
  const matchRows = await database
    .select()
    .from(matches)
    .where(
      and(
        or(
          inArray(matches.teamAId, ownTeamIds),
          inArray(matches.teamBId, ownTeamIds),
        ),
        inArray(matches.status, [
          "pending-verification",
          "verified",
          "disputed",
          "complete",
          "forfeit",
        ]),
      ),
    )
    .orderBy(desc(matches.completedAt), desc(matches.createdAt));
  if (matchRows.length === 0) return [];
  const matchIds = matchRows.map((match) => match.id);
  const allTeamIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        [match.teamAId, match.teamBId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  ];
  const [
    allMembershipRows,
    teamRows,
    rallyRows,
    deltaRows,
    venueRows,
    confirmationRows,
  ] = await Promise.all([
    database
      .select()
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, allTeamIds)),
    database.select().from(teams).where(inArray(teams.id, allTeamIds)),
    database
      .select()
      .from(rallyEvents)
      .where(inArray(rallyEvents.matchId, matchIds))
      .orderBy(asc(rallyEvents.sequence)),
    database
      .select()
      .from(ratingEvents)
      .where(
        and(
          eq(ratingEvents.personId, personId),
          inArray(ratingEvents.matchId, matchIds),
        ),
      ),
    database
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(
        inArray(
          venues.id,
          matchRows.flatMap((match) => (match.venueId ? [match.venueId] : [])),
        ),
      ),
    database
      .select()
      .from(matchConfirmations)
      .where(
        and(
          eq(matchConfirmations.personId, personId),
          inArray(matchConfirmations.matchId, matchIds),
        ),
      ),
  ]);
  const allPersonIds = [
    ...new Set(allMembershipRows.map((member) => member.personId)),
  ];
  const peopleRows = await loadPeople(allPersonIds);
  const personById = new Map(
    peopleRows.map((person) => [person.id, person] as const),
  );
  const teamById = new Map(teamRows.map((team) => [team.id, team] as const));
  const venueById = new Map(
    venueRows.map((venue) => [venue.id, venue.name] as const),
  );
  const confirmationByMatch = new Map(
    confirmationRows.map((row) => [row.matchId, row] as const),
  );
  const deltaByMatch = new Map(
    deltaRows.map((event) => {
      const before =
        typeof event.before.display === "number" ? event.before.display : 0;
      const after =
        typeof event.after.display === "number" ? event.after.display : before;
      return [event.matchId, after - before] as const;
    }),
  );
  return matchRows.flatMap((match): MatchSummary[] => {
    if (!match.teamAId || !match.teamBId) return [];
    const teamA = teamById.get(match.teamAId);
    const teamB = teamById.get(match.teamBId);
    if (!teamA || !teamB) return [];
    const teamAPlayers = allMembershipRows
      .filter((member) => member.teamId === teamA.id)
      .flatMap((member) => {
        const person = personById.get(member.personId);
        return person ? [person] : [];
      });
    const teamBPlayers = allMembershipRows
      .filter((member) => member.teamId === teamB.id)
      .flatMap((member) => {
        const person = personById.get(member.personId);
        return person ? [person] : [];
      });
    if (teamAPlayers.length === 0 || teamBPlayers.length === 0) return [];
    const events = rallyRows
      .filter((event) => event.matchId === match.id)
      .map((event) => event.payload as unknown as ScoreEvent);
    let score;
    try {
      score = foldScore(events, storedMatchFormat(match.format));
    } catch {
      return [];
    }
    const winner =
      match.winnerTeamId === match.teamAId
        ? "A"
        : match.winnerTeamId === match.teamBId
          ? "B"
          : score.winner;
    if (!winner) return [];
    const confirmation = confirmationByMatch.get(match.id);
    const status =
      match.status === "pending-verification" ||
      match.status === "verified" ||
      match.status === "disputed"
        ? match.status
        : "complete";
    return [
      {
        id: match.id,
        status,
        confirmationRequired:
          status === "pending-verification" &&
          confirmation?.decision !== "confirmed",
        playedAt: (
          match.completedAt ??
          match.startedAt ??
          match.scheduledAt ??
          match.createdAt
        ).toISOString(),
        venueName:
          (match.venueId && venueById.get(match.venueId)) ??
          "Location not recorded",
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        score: score.sets
          .filter((set) => set.winner)
          .map((set) => [set.a, set.b] as const),
        winner,
        ratingDelta: deltaByMatch.get(match.id) ?? 0,
        verification: summaryVerification(match.verification),
      },
    ];
  });
}

interface ScopedEvent {
  readonly event: EventSummary;
  readonly organizationId?: string;
}

async function loadEvents(input?: {
  readonly includeUnlistedPickups?: boolean;
}): Promise<ScopedEvent[]> {
  const database = getDatabase();
  const [
    sessionRows,
    pickupRows,
    divisionRows,
    registrationRows,
    pickupParticipantRows,
  ] = await Promise.all([
    database
      .select({
        id: sessions.id,
        slug: sessions.slug,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        timezone: sessions.timezone,
        status: sessions.status,
        capacity: sessions.capacity,
        programKind: programs.kind,
        programOrganizationId: programs.organizationId,
        eventTypeKind: eventTypes.kind,
        eventTypeOrganizationId: eventTypes.organizationId,
        priceMinor: eventTypes.priceMinor,
        priceCurrency: eventTypes.currency,
        venueName: venues.name,
        venueOrganizationId: venues.organizationId,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(inArray(sessions.status, [...publicSessionStatuses]))
      .orderBy(asc(sessions.startsAt)),
    database
      .select({
        id: pickupSessions.id,
        title: pickupSessions.title,
        hostName: people.displayName,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        venueLabel: pickupSessions.venueLabel,
        note: pickupSessions.note,
        format: pickupSessions.format,
        recordMatches: pickupSessions.recordMatches,
        visibility: pickupSessions.visibility,
        venueTimezone: venues.timezone,
        directOrganizationId: pickupSessions.organizationId,
        venueOrganizationId: venues.organizationId,
        capacity: pickupSessions.capacity,
        ratingMinimum: pickupSessions.ratingMinimum,
        ratingMaximum: pickupSessions.ratingMaximum,
        currency: pickupSessions.currency,
        costMinor: pickupSessions.costMinor,
      })
      .from(pickupSessions)
      .innerJoin(people, eq(pickupSessions.hostPersonId, people.id))
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(
        input?.includeUnlistedPickups
          ? inArray(pickupSessions.visibility, ["public", "unlisted"])
          : eq(pickupSessions.visibility, "public"),
      )
      .orderBy(asc(pickupSessions.startsAt)),
    database
      .select({
        id: divisions.id,
        sessionId: divisions.sessionId,
        name: divisions.name,
        discipline: divisions.discipline,
        ratingBasis: divisions.ratingBasis,
        capacity: divisions.capacity,
        entryFeeMinor: divisions.entryFeeMinor,
        currency: divisions.currency,
      })
      .from(divisions),
    database
      .select({
        sessionId: registrations.sessionId,
        divisionId: registrations.divisionId,
        status: registrations.status,
        holdExpiresAt: registrations.holdExpiresAt,
      })
      .from(registrations)
      .where(
        inArray(registrations.status, ["pending", "confirmed", "checked-in"]),
      ),
    database
      .select({
        pickupSessionId: pickupParticipants.pickupSessionId,
        status: pickupParticipants.status,
        holdExpiresAt: pickupParticipants.holdExpiresAt,
      })
      .from(pickupParticipants)
      .where(
        inArray(pickupParticipants.status, [
          "pending",
          "confirmed",
          "checked-in",
        ]),
      ),
  ]);
  const organizationIds = new Set<string>();
  for (const row of sessionRows) {
    const id =
      row.programOrganizationId ??
      row.eventTypeOrganizationId ??
      row.venueOrganizationId;
    if (id) organizationIds.add(id);
  }
  for (const row of pickupRows) {
    const id = row.directOrganizationId ?? row.venueOrganizationId;
    if (id) organizationIds.add(id);
  }
  const organizationRows =
    organizationIds.size === 0
      ? []
      : await database
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, [...organizationIds]));
  const organizationNames = new Map(
    organizationRows.map((row) => [row.id, row.name] as const),
  );
  const registrationCount = new Map<string, number>();
  const divisionRegistrationCount = new Map<string, number>();
  const now = new Date();
  for (const row of registrationRows) {
    if (
      row.status === "pending" &&
      (!row.holdExpiresAt || row.holdExpiresAt <= now)
    ) {
      continue;
    }
    registrationCount.set(
      row.sessionId,
      (registrationCount.get(row.sessionId) ?? 0) + 1,
    );
    if (row.divisionId) {
      divisionRegistrationCount.set(
        row.divisionId,
        (divisionRegistrationCount.get(row.divisionId) ?? 0) + 1,
      );
    }
  }
  const pickupParticipantCount = new Map<string, number>();
  for (const row of pickupParticipantRows) {
    if (
      row.status !== "pending" ||
      (row.holdExpiresAt !== null && row.holdExpiresAt > now)
    ) {
      pickupParticipantCount.set(
        row.pickupSessionId,
        (pickupParticipantCount.get(row.pickupSessionId) ?? 0) + 1,
      );
    }
  }
  const sessionEvents: ScopedEvent[] = sessionRows.map((row) => {
    const kind = (row.programKind ??
      row.eventTypeKind ??
      "open-play") as EventKind;
    const organizationId =
      row.programOrganizationId ??
      row.eventTypeOrganizationId ??
      row.venueOrganizationId ??
      undefined;
    const occupied = registrationCount.get(row.id) ?? 0;
    const eventDivisions = divisionRows
      .filter((division) => division.sessionId === row.id)
      .map((division) => ({
        id: division.id,
        name: division.name,
        discipline: division.discipline,
        ratingBasis: division.ratingBasis,
        price: {
          amountMinor: division.entryFeeMinor,
          currency: currency(division.currency),
        },
        spotsRemaining: Math.max(
          0,
          division.capacity - (divisionRegistrationCount.get(division.id) ?? 0),
        ),
        capacity: division.capacity,
      }));
    const startingPrice =
      eventDivisions.length > 0
        ? Math.min(
            ...eventDivisions.map((division) => division.price.amountMinor),
          )
        : (row.priceMinor ?? 0);
    const startingCurrency =
      eventDivisions[0]?.price.currency ?? currency(row.priceCurrency ?? "USD");
    return {
      organizationId,
      event: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        kind,
        organizationName:
          (organizationId && organizationNames.get(organizationId)) ??
          "Independent organizer",
        venueName: row.venueName ?? "Location shared after registration",
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        timezone: row.timezone,
        price: {
          amountMinor: startingPrice,
          currency: startingCurrency,
        },
        spotsRemaining: Math.max(0, row.capacity - occupied),
        capacity: row.capacity,
        divisions: eventDivisions.length > 0 ? eventDivisions : undefined,
        live: row.status === "live",
        tags: [titleCase(kind), titleCase(row.status)],
      },
    };
  });
  const pickupEvents: ScopedEvent[] = pickupRows.map((row) => {
    const organizationId =
      row.directOrganizationId ?? row.venueOrganizationId ?? undefined;
    const occupied = pickupParticipantCount.get(row.id) ?? 0;
    return {
      organizationId,
      event: {
        id: row.id,
        slug: `pickup-${row.id}`,
        title: row.title,
        kind: "pickup",
        organizationName:
          (organizationId && organizationNames.get(organizationId)) ??
          `Hosted by ${row.hostName}`,
        venueName: row.venueLabel,
        description: row.note ?? undefined,
        format: row.format,
        recordMatches: row.recordMatches,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        timezone: row.venueTimezone ?? "America/New_York",
        price: {
          amountMinor: row.costMinor,
          currency: currency(row.currency),
        },
        spotsRemaining: Math.max(0, row.capacity - occupied),
        capacity: row.capacity,
        ratingRange:
          row.ratingMinimum !== null && row.ratingMaximum !== null
            ? [row.ratingMinimum, row.ratingMaximum]
            : undefined,
        tags: [
          "Pickup",
          row.format === "king-queen" ? "King / Queen" : row.format,
          row.costMinor === 0 ? "Free" : "Paid",
        ],
      },
    };
  });
  return [...sessionEvents, ...pickupEvents].sort((a, b) =>
    a.event.startsAt.localeCompare(b.event.startsAt),
  );
}

async function loadVenues(organizationId?: string): Promise<VenueSummary[]> {
  const database = getDatabase();
  const venueRows = await database
    .select()
    .from(venues)
    .where(
      organizationId
        ? and(
            eq(venues.organizationId, organizationId),
            ne(venues.status, "draft"),
          )
        : ne(venues.status, "draft"),
    )
    .orderBy(asc(venues.name));
  if (venueRows.length === 0) return [];
  const courtRows = await database
    .select({ venueId: courts.venueId, status: courts.status })
    .from(courts)
    .where(
      inArray(
        courts.venueId,
        venueRows.map((row) => row.id),
      ),
    );
  const counts = new Map<string, number>();
  for (const row of courtRows) {
    if (row.status === "active") {
      counts.set(row.venueId, (counts.get(row.venueId) ?? 0) + 1);
    }
  }
  return venueRows.map((row) => {
    const courtCount = counts.get(row.id) ?? 0;
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      city: row.locality ?? "City not set",
      region: row.administrativeArea ?? row.countryCode,
      timezone: row.timezone,
      courtCount,
      openNow: row.status === "active",
      latitude: row.latitude ?? 0,
      longitude: row.longitude ?? 0,
      tags: [
        `${courtCount} ${courtCount === 1 ? "court" : "courts"}`,
        row.temporary ? "Temporary" : "Facility",
      ],
    };
  });
}

async function loadOrganizations(
  organizationId?: string,
): Promise<OrganizationSummary[]> {
  const database = getDatabase();
  const organizationRows = await database
    .select()
    .from(organizations)
    .where(organizationId ? eq(organizations.id, organizationId) : undefined)
    .orderBy(asc(organizations.name));
  if (organizationRows.length === 0) return [];
  const ids = organizationRows.map((row) => row.id);
  const [membershipRows, venueRows] = await Promise.all([
    database
      .select({
        organizationId: organizationMemberships.organizationId,
        personId: organizationMemberships.personId,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.organizationId, ids),
          eq(organizationMemberships.active, true),
        ),
      ),
    database
      .select({ id: venues.id, organizationId: venues.organizationId })
      .from(venues)
      .where(inArray(venues.organizationId, ids)),
  ]);
  return organizationRows.map((row) => {
    const memberIds = new Set(
      membershipRows
        .filter((membership) => membership.organizationId === row.id)
        .map((membership) => membership.personId),
    );
    const staffIds = new Set(
      membershipRows
        .filter(
          (membership) =>
            membership.organizationId === row.id &&
            ["owner", "manager", "coach", "front-desk", "accountant"].includes(
              membership.role,
            ),
        )
        .map((membership) => membership.personId),
    );
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      legalName: row.legalName ?? row.name,
      plan: plan(row.plan),
      memberCount: memberIds.size,
      staffCount: staffIds.size,
      venueCount: venueRows.filter((venue) => venue.organizationId === row.id)
        .length,
      timezone: row.timezone,
      stripeStatus: row.stripeChargesEnabled
        ? "connected"
        : row.stripeAccountId
          ? "restricted"
          : "pending",
    };
  });
}

async function loadWallet(personId: string): Promise<PlayerWallet> {
  const database = getDatabase();
  const account = await database.query.walletAccounts.findFirst({
    where: eq(walletAccounts.personId, personId),
  });
  if (!account) {
    return {
      balanceMinor: 0,
      availableMinor: 0,
      pendingMinor: 0,
      currency: "USD",
      entries: [],
      taxFormStatus: "not-required",
    };
  }
  const rows = await database
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.walletAccountId, account.id))
    .orderBy(desc(walletLedger.createdAt));
  const ledgerEntries = rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    taxCharacter: row.taxCharacter,
    reasonCode: row.reasonCode,
    occurredAt: row.createdAt.toISOString(),
  }));
  const balance = foldWalletLedger(ledgerEntries);
  const tax = evaluateTaxRails({ entries: ledgerEntries });
  const entries = rows.flatMap((row): WalletEntry[] => {
    if (row.status === "reversed") return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        description: walletDescription(row.reasonCode),
        amount: {
          amountMinor:
            row.direction === "credit" ? row.amountMinor : -row.amountMinor,
          currency: currency(row.currency),
        },
        occurredAt: row.createdAt.toISOString(),
        status: row.status,
        taxCharacter: row.taxCharacter === "refund" ? "none" : row.taxCharacter,
      },
    ];
  });
  return {
    balanceMinor: balance.totalMinor,
    availableMinor: balance.availableMinor,
    pendingMinor: balance.pendingMinor,
    currency: "USD",
    entries,
    taxFormStatus: tax.taxFormCollectionRequired ? "pending" : "not-required",
  };
}

function settingsCurrency(value: string): CurrencyCode {
  const supported: readonly CurrencyCode[] = [
    "USD",
    "CAD",
    "AUD",
    "BRL",
    "EUR",
  ];
  return supported.includes(value as CurrencyCode)
    ? (value as CurrencyCode)
    : "USD";
}

async function loadPlayerSettings(personId: string): Promise<PlayerSettings> {
  const database = getDatabase();
  const [
    person,
    summary,
    guardianRows,
    dependentRows,
    membershipRows,
    consentRows,
    privacyRequestRows,
  ] = await Promise.all([
    database.query.people.findFirst({ where: eq(people.id, personId) }),
    loadPeople([personId]).then((rows) => rows[0]),
    database
      .select()
      .from(guardianships)
      .where(eq(guardianships.minorId, personId)),
    database
      .select()
      .from(guardianships)
      .where(eq(guardianships.guardianId, personId)),
    database
      .select({
        id: memberships.id,
        status: memberships.status,
        currentPeriodEndsAt: memberships.currentPeriodEndsAt,
        pausedUntil: memberships.pausedUntil,
        pauseMonthsUsed: memberships.pauseMonthsUsed,
        cancelAtPeriodEnd: memberships.cancelAtPeriodEnd,
        tierName: membershipTiers.name,
        interval: membershipTiers.interval,
        priceMinor: membershipTiers.priceMinor,
        currency: membershipTiers.currency,
        benefits: membershipTiers.benefits,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(eq(memberships.personId, personId))
      .orderBy(desc(memberships.updatedAt))
      .limit(1),
    database
      .select({
        scope: consents.scope,
        granted: consents.granted,
        recordedAt: consents.occurredAt,
      })
      .from(consents)
      .where(eq(consents.personId, personId))
      .orderBy(desc(consents.occurredAt)),
    database
      .select({
        id: privacyRequests.id,
        kind: privacyRequests.kind,
        status: privacyRequests.status,
        requestedAt: privacyRequests.createdAt,
      })
      .from(privacyRequests)
      .where(eq(privacyRequests.personId, personId))
      .orderBy(desc(privacyRequests.createdAt)),
  ]);
  if (!person || !summary) throw new Error("Player profile was not found");

  const householdIds = [
    ...guardianRows.map((row) => row.guardianId),
    ...dependentRows.map((row) => row.minorId),
  ];
  const householdPeople = new Map(
    (await loadPeople([...new Set(householdIds)])).map((entry) => [
      entry.id,
      entry,
    ]),
  );
  const household: PlayerSettings["household"] = [
    ...guardianRows.flatMap((row) => {
      const householdPerson = householdPeople.get(row.guardianId);
      return householdPerson
        ? [
            {
              person: householdPerson,
              relationship: row.relationship,
              role: "guardian" as const,
              verified: row.verified,
              emergencyContact: row.emergencyContact,
              canApproveSpending: row.canApproveSpending,
            },
          ]
        : [];
    }),
    ...dependentRows.flatMap((row) => {
      const householdPerson = householdPeople.get(row.minorId);
      return householdPerson
        ? [
            {
              person: householdPerson,
              relationship: row.relationship,
              role: "dependent" as const,
              verified: row.verified,
              emergencyContact: row.emergencyContact,
              canApproveSpending: row.canApproveSpending,
            },
          ]
        : [];
    }),
  ];
  const latestConsentByScope = new Map<
    PlayerSettings["consents"][number]["scope"],
    PlayerSettings["consents"][number]
  >();
  for (const row of consentRows) {
    if (!latestConsentByScope.has(row.scope)) {
      latestConsentByScope.set(row.scope, {
        scope: row.scope,
        granted: row.granted,
        recordedAt: row.recordedAt.toISOString(),
      });
    }
  }
  const membership = membershipRows[0];
  const interval =
    membership?.interval === "month" || membership?.interval === "year"
      ? membership.interval
      : undefined;
  const visibility =
    person.profileVisibility === "public" ||
    person.profileVisibility === "members"
      ? person.profileVisibility
      : "private";
  const measurementSystem =
    person.measurementSystem === "metric" ? "metric" : "imperial";
  const ageBand =
    person.ageBand === "under-13" ||
    person.ageBand === "teen" ||
    person.ageBand === "adult"
      ? person.ageBand
      : "unknown";
  return {
    profile: {
      person: summary,
      email: person.email ?? undefined,
      phoneE164: person.phoneE164 ?? undefined,
      visibility,
      locale: person.locale,
      measurementSystem,
      ageBand,
      ageVerified: person.ageVerifiedAt !== null,
      birthDate: person.birthDate ?? undefined,
      parentalConsentRecorded: person.parentalConsentAt !== null,
    },
    household,
    membership:
      membership && interval
        ? {
            id: membership.id,
            status: membership.status,
            tierName: membership.tierName,
            interval,
            priceMinor: membership.priceMinor,
            currency: settingsCurrency(membership.currency),
            benefits: membership.benefits,
            currentPeriodEndsAt: membership.currentPeriodEndsAt?.toISOString(),
            pausedUntil: membership.pausedUntil?.toISOString(),
            pauseMonthsUsed: membership.pauseMonthsUsed,
            cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
          }
        : undefined,
    dunaPlusPlans: [
      {
        interval: "month",
        priceMinor: 799,
        currency: "USD",
        configured: Boolean(process.env.STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID),
      },
      {
        interval: "year",
        priceMinor: 5_900,
        currency: "USD",
        configured: Boolean(process.env.STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID),
      },
    ],
    consents: [...latestConsentByScope.values()],
    privacyRequests: privacyRequestRows.flatMap((request) => {
      if (
        request.kind !== "account-deletion" ||
        ![
          "queued",
          "identity-review",
          "legal-hold",
          "completed",
          "cancelled",
        ].includes(request.status)
      ) {
        return [];
      }
      return [
        {
          id: request.id,
          kind: request.kind,
          status:
            request.status as PlayerSettings["privacyRequests"][number]["status"],
          requestedAt: request.requestedAt.toISOString(),
        },
      ];
    }),
  };
}

async function loadAdminQueues(): Promise<AdminQueue[]> {
  const database = getDatabase();
  const [rows, guardianReviews] = await Promise.all([
    database
      .select()
      .from(reports)
      .where(
        inArray(reports.status, ["open", "triaged", "investigating", "held"]),
      )
      .orderBy(asc(reports.slaDueAt)),
    loadGuardianReviewQueue(),
  ]);
  return [
    ...rows.map((row) => ({
      id: row.id,
      title: titleCase(row.category),
      detail: `${titleCase(row.entityType)} report`,
      age: relativeAge(row.createdAt),
      sla: slaLabel(row.slaDueAt),
      priority: row.involvesMinor
        ? "urgent"
        : row.category.includes("wallet")
          ? "high"
          : "normal",
    })),
    ...guardianReviews.map((review) => ({
      id: `guardianship:${review.guardianId}:${review.minorId}`,
      title: "Guardian relationship",
      detail: `${review.guardianName} · ${review.minorName} · ${review.relationship}`,
      age: relativeAge(new Date(review.createdAt)),
      sla: "Review within 1 business day",
      priority: review.minorAgeBand === "under-13" ? "urgent" : "high",
    })),
  ];
}

async function loadAudit(): Promise<AuditEvent[]> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: auditLog.id,
      occurredAt: auditLog.createdAt,
      actorName: people.displayName,
      actorType: auditLog.actorType,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      reason: auditLog.reason,
    })
    .from(auditLog)
    .leftJoin(people, eq(auditLog.actorPersonId, people.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorName: row.actorName ?? titleCase(row.actorType),
    action: row.action,
    entity: `${titleCase(row.entityType)} · ${row.entityId}`,
    reason: row.reason,
    severity:
      row.action.includes("suspend") || row.action.includes("delete")
        ? "critical"
        : row.action.includes("hold") || row.action.includes("override")
          ? "attention"
          : "info",
  }));
}

function scheduleFromEvents(
  events: readonly EventSummary[],
  timezone: string,
): OperatorScheduleItem[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return events.slice(0, 8).map((event) => ({
    time: formatter.format(new Date(event.startsAt)),
    court: event.venueName,
    title: event.title,
    detail: `${event.spotsRemaining} spots remaining · ${titleCase(event.kind)}`,
    state: event.live ? "live" : "scheduled",
  }));
}

function connectedBookingStatus(
  status: string,
): BookingSummary["status"] | undefined {
  if (status === "waitlisted") return "waitlisted";
  if (status === "pending" || status === "held") return "needs-action";
  if (status === "confirmed" || status === "checked-in") return "confirmed";
  return undefined;
}

async function loadPlayerBookings(personId: string): Promise<BookingSummary[]> {
  const database = getDatabase();
  const person = await database.query.people.findFirst({
    where: eq(people.id, personId),
  });
  if (!person) return [];
  const now = new Date();
  const [registrationRows, pickupRows, courtRows] = await Promise.all([
    database
      .select({
        id: registrations.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        status: registrations.status,
        programKind: programs.kind,
        eventTypeKind: eventTypes.kind,
        venueName: venues.name,
        orderTotalMinor: orders.totalMinor,
        orderCurrency: orders.currency,
      })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(orders, eq(registrations.orderId, orders.id))
      .where(
        and(
          eq(registrations.personId, personId),
          inArray(registrations.status, [
            "pending",
            "confirmed",
            "waitlisted",
            "checked-in",
          ]),
          gte(sessions.endsAt, now),
        ),
      ),
    database
      .select({
        id: pickupParticipants.id,
        title: pickupSessions.title,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        status: pickupParticipants.status,
        venueName: pickupSessions.venueLabel,
        connectedVenueName: venues.name,
        orderTotalMinor: orders.totalMinor,
        orderCurrency: orders.currency,
      })
      .from(pickupParticipants)
      .innerJoin(
        pickupSessions,
        eq(pickupParticipants.pickupSessionId, pickupSessions.id),
      )
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .leftJoin(orders, eq(pickupParticipants.orderId, orders.id))
      .where(
        and(
          eq(pickupParticipants.personId, personId),
          inArray(pickupParticipants.status, [
            "pending",
            "confirmed",
            "waitlisted",
          ]),
          gte(pickupSessions.endsAt, now),
        ),
      ),
    database
      .select({
        id: courtBookings.id,
        courtName: courts.name,
        startsAt: courtBookings.startsAt,
        endsAt: courtBookings.endsAt,
        status: courtBookings.status,
        venueName: venues.name,
        orderTotalMinor: orders.totalMinor,
        orderCurrency: orders.currency,
      })
      .from(courtBookings)
      .innerJoin(courts, eq(courtBookings.courtId, courts.id))
      .innerJoin(venues, eq(courtBookings.venueId, venues.id))
      .leftJoin(orders, eq(courtBookings.orderId, orders.id))
      .where(
        and(
          eq(courtBookings.personId, personId),
          inArray(courtBookings.status, ["held", "confirmed"]),
          gte(courtBookings.endsAt, now),
        ),
      ),
  ]);
  const bookings: BookingSummary[] = [
    ...registrationRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          title: row.title,
          kind: row.programKind ?? row.eventTypeKind ?? "open-play",
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          venueName: row.venueName ?? "Venue not assigned",
          status,
          amount: {
            amountMinor: row.orderTotalMinor ?? 0,
            currency: currency(row.orderCurrency ?? "USD"),
          },
          participantNames: [person.displayName],
        },
      ];
    }),
    ...pickupRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          title: row.title,
          kind: "pickup",
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          venueName:
            row.connectedVenueName ?? row.venueName ?? "Community location",
          status,
          amount: {
            amountMinor: row.orderTotalMinor ?? 0,
            currency: currency(row.orderCurrency ?? "USD"),
          },
          participantNames: [person.displayName],
        },
      ];
    }),
    ...courtRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          title: `Court rental · ${row.courtName}`,
          kind: "court-rental",
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          venueName: row.venueName,
          status,
          amount: {
            amountMinor: row.orderTotalMinor ?? 0,
            currency: currency(row.orderCurrency ?? "USD"),
          },
          participantNames: [person.displayName],
        },
      ];
    }),
  ];
  return bookings.sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
  );
}

async function createPickup(input: PickupMutationInput): Promise<EventSummary> {
  const database = getDatabase();
  const matchingVenue = await database.query.venues.findFirst({
    where: input.organizationId
      ? and(
          eq(venues.organizationId, input.organizationId),
          eq(venues.name, input.venueName),
        )
      : eq(venues.name, input.venueName),
  });
  const pickupId = crypto.randomUUID();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const organizationId =
    input.organizationId ?? matchingVenue?.organizationId ?? undefined;
  const organization = organizationId
    ? await database.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      })
    : undefined;
  if (
    input.costMinor > 0 &&
    (!organization?.stripeAccountId || !organization.stripeChargesEnabled)
  ) {
    throw new Error(
      "Paid pickup requires an organization with Stripe charges enabled so Duna never holds host funds.",
    );
  }
  await database.batch([
    database.insert(pickupSessions).values({
      id: pickupId,
      hostPersonId: input.hostPersonId,
      organizationId,
      venueId: matchingVenue?.id,
      venueLabel: input.venueName,
      title: input.title,
      format: input.format,
      note: input.note,
      recordMatches: input.recordMatches,
      startsAt,
      endsAt,
      capacity: input.capacity,
      ratingMinimum: input.ratingMinimum,
      ratingMaximum: input.ratingMaximum,
      visibility: input.visibility,
      costMinor: input.costMinor,
      currency: input.currency,
    }),
    database.insert(pickupParticipants).values({
      pickupSessionId: pickupId,
      personId: input.hostPersonId,
      status: "confirmed",
    }),
    database.insert(auditLog).values({
      organizationId,
      actorPersonId: input.hostPersonId,
      actorType: "person",
      action: "pickup.created",
      entityType: "pickup-session",
      entityId: pickupId,
      reason: "Player created a community pickup.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    }),
  ]);
  return {
    id: pickupId,
    slug: `pickup-${pickupId}`,
    title: input.title,
    kind: "pickup",
    organizationName: organization?.name ?? "Player-hosted pickup",
    venueName: input.venueName,
    description: input.note,
    format: input.format,
    recordMatches: input.recordMatches,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: matchingVenue?.timezone ?? "America/New_York",
    price: { amountMinor: input.costMinor, currency: input.currency },
    spotsRemaining: Math.max(0, input.capacity - 1),
    capacity: input.capacity,
    ratingRange:
      input.ratingMinimum !== undefined && input.ratingMaximum !== undefined
        ? [input.ratingMinimum, input.ratingMaximum]
        : undefined,
    tags: [
      "Pickup",
      input.format === "king-queen" ? "King / Queen" : input.format,
      input.costMinor === 0 ? "Free" : "Paid",
    ],
  };
}

export const databaseRepository = {
  public: {
    events: async () => (await loadEvents()).map(({ event }) => event),
    eventBySlug: async (slug: string) =>
      (
        await loadEvents({
          includeUnlistedPickups: true,
        })
      ).find(({ event }) => event.slug === slug)?.event,
    venues: () => loadVenues(),
    players: async (limit: number) => {
      const database = getDatabase();
      const rows = await database
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.status, "active"),
            eq(people.profileVisibility, "public"),
            eq(people.isMinor, false),
          ),
        )
        .orderBy(asc(people.displayName))
        .limit(limit);
      return loadPeople(rows.map((row) => row.id));
    },
    playerByHandle: async (handle: string) => {
      const database = getDatabase();
      const person = await database.query.people.findFirst({
        where: and(
          eq(people.handle, handle),
          eq(people.status, "active"),
          eq(people.profileVisibility, "public"),
        ),
      });
      if (!person || person.isMinor) return undefined;
      return (await loadPeople([person.id]))[0];
    },
    organizationBySlug: async (slug: string) =>
      (await loadOrganizations()).find(
        (organization) => organization.slug === slug,
      ),
  },
  player: {
    dashboard: async (personId: string) => {
      const [player, events, wallet, matchHistory, bookings] =
        await Promise.all([
          loadPeople([personId]).then((rows) => rows[0]),
          loadEvents().then((rows) => rows.map(({ event }) => event)),
          loadWallet(personId),
          loadMatchHistory(personId),
          loadPlayerBookings(personId),
        ]);
      if (!player) throw new Error("Player profile was not found");
      const metrics: Metric[] = [
        {
          label: "Sand Rating",
          value: player.rating.display.toFixed(2),
          change: player.rating.confidence,
        },
        {
          label: "Rated matches",
          value: String(
            matchHistory.filter((match) => match.status === "verified").length,
          ),
          change:
            matchHistory.length === 0
              ? "No connected match history"
              : `${matchHistory.length} submitted`,
          trend:
            matchHistory.reduce(
              (total, match) => total + match.ratingDelta,
              0,
            ) > 0
              ? "up"
              : "flat",
        },
        {
          label: "Upcoming",
          value: String(bookings.length),
          change:
            bookings.length === 0
              ? "No connected bookings"
              : `${events.length} published options`,
        },
        {
          label: "Wallet",
          value: formatUsd(wallet.availableMinor),
          change: "Available",
        },
      ];
      return {
        player,
        metrics,
        bookings,
        events,
        feed: [],
        recentMatches: matchHistory.slice(0, 3),
        walletBalanceMinor: wallet.balanceMinor,
        currency: "USD" as const,
      };
    },
    matchHistory: loadMatchHistory,
    wallet: loadWallet,
    settings: loadPlayerSettings,
    quote: (input: {
      items: readonly PricedOrderItem[];
      isDunaPlus: boolean;
    }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD" satisfies CurrencyCode,
        isDunaPlus: input.isDunaPlus,
      }),
    createPickup,
  },
  operator: {
    dashboard: async (organizationId: string) => {
      const database = getDatabase();
      const [organization, scopedEvents, organizationVenues, orderRows] =
        await Promise.all([
          loadOrganizations(organizationId).then((rows) => rows[0]),
          loadEvents().then((rows) =>
            rows
              .filter((row) => row.organizationId === organizationId)
              .map(({ event }) => event),
          ),
          loadVenues(organizationId),
          database
            .select({
              totalMinor: orders.totalMinor,
              status: orders.status,
            })
            .from(orders)
            .where(
              and(
                eq(orders.organizationId, organizationId),
                inArray(orders.status, ["paid", "partially-refunded"]),
              ),
            ),
        ]);
      if (!organization) throw new Error("Organization was not found");
      const courtCount = organizationVenues.reduce(
        (total, venue) => total + venue.courtCount,
        0,
      );
      const grossSalesMinor = orderRows.reduce(
        (total, order) => total + order.totalMinor,
        0,
      );
      const totalCapacity = scopedEvents.reduce(
        (total, event) => total + event.capacity,
        0,
      );
      const occupied = scopedEvents.reduce(
        (total, event) =>
          total + Math.max(0, event.capacity - event.spotsRemaining),
        0,
      );
      const fillRate =
        totalCapacity === 0 ? undefined : (occupied / totalCapacity) * 100;
      return {
        organization,
        metrics: [
          {
            label: "Gross sales",
            value: formatUsd(grossSalesMinor),
            change: "Paid connected orders",
          },
          { label: "Members", value: String(organization.memberCount) },
          {
            label: "Fill rate",
            value:
              fillRate === undefined
                ? "Unavailable"
                : `${fillRate.toFixed(1)}%`,
            change:
              fillRate === undefined
                ? "No published capacity"
                : `${occupied} of ${totalCapacity} spots`,
          },
          { label: "Active courts", value: String(courtCount) },
          {
            label: "Stripe",
            value: titleCase(organization.stripeStatus),
            tone:
              organization.stripeStatus === "connected"
                ? "positive"
                : "warning",
          },
        ],
        schedule: scheduleFromEvents(scopedEvents, organization.timezone),
        events: scopedEvents,
        alerts:
          organization.stripeStatus === "connected"
            ? []
            : [
                {
                  id: "stripe",
                  title: "Payments need attention",
                  detail: "Complete the connected-account readiness steps.",
                  action: "Review payments",
                  tone: "warning",
                },
              ],
      };
    },
    schedule: async (organizationId: string) => {
      const [organization, eventRows] = await Promise.all([
        loadOrganizations(organizationId).then((rows) => rows[0]),
        loadEvents(),
      ]);
      if (!organization) throw new Error("Organization was not found");
      return scheduleFromEvents(
        eventRows
          .filter((row) => row.organizationId === organizationId)
          .map(({ event }) => event),
        organization.timezone,
      );
    },
    organization: async (organizationId: string) => {
      const organization = (await loadOrganizations(organizationId))[0];
      if (!organization) throw new Error("Organization was not found");
      return organization;
    },
    members: async (organizationId: string) => {
      const database = getDatabase();
      const rows = await database
        .select({ personId: organizationMemberships.personId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.active, true),
          ),
        );
      return loadPeople([...new Set(rows.map((row) => row.personId))]);
    },
    events: async (organizationId: string) =>
      (await loadEvents())
        .filter((row) => row.organizationId === organizationId)
        .map(({ event }) => event),
  },
  admin: {
    overview: async () => {
      const database = getDatabase();
      const [
        organizationRows,
        ratingRows,
        reportRows,
        orderRows,
        queues,
        audit,
      ] = await Promise.all([
        database.select({ id: organizations.id }).from(organizations),
        database.select({ personId: ratings.personId }).from(ratings),
        database
          .select({ status: reports.status })
          .from(reports)
          .where(
            inArray(reports.status, [
              "open",
              "triaged",
              "investigating",
              "held",
            ]),
          ),
        database
          .select({ totalMinor: orders.totalMinor, status: orders.status })
          .from(orders)
          .where(inArray(orders.status, ["paid", "partially-refunded"])),
        loadAdminQueues(),
        loadAudit(),
      ]);
      const gmvMinor = orderRows.reduce(
        (total, order) => total + order.totalMinor,
        0,
      );
      const metrics: Metric[] = [
        { label: "Platform GMV", value: formatUsd(gmvMinor) },
        {
          label: "Active operators",
          value: String(organizationRows.length),
        },
        {
          label: "Rated players",
          value: String(new Set(ratingRows.map((row) => row.personId)).size),
        },
        {
          label: "Open safety SLAs",
          value: String(reportRows.length),
          tone: reportRows.length > 0 ? "warning" : "positive",
        },
      ];
      return {
        metrics,
        queues,
        audit,
        system: [
          { service: "API", status: "healthy", detail: "Serving requests" },
          {
            service: "Database",
            status: "healthy",
            detail: "Connected and queryable",
          },
          {
            service: "Stripe webhooks",
            status: process.env.STRIPE_WEBHOOK_SECRET
              ? "configured"
              : "attention",
            detail: process.env.STRIPE_WEBHOOK_SECRET
              ? "Signing secret connected"
              : "Signing secret missing",
          },
          {
            service: "Wallet reconciliation",
            status: "attention",
            detail: "Processor balance feed required",
          },
          {
            service: "Messaging",
            status: "attention",
            detail: "Provider not connected",
          },
        ],
      };
    },
    organizations: () => loadOrganizations(),
    queues: loadAdminQueues,
    audit: loadAudit,
  },
} satisfies DunaRepository;
