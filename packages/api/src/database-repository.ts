import {
  auditLog,
  consents,
  courtBookings,
  courts,
  divisions,
  eventBlueprints,
  eventPolicyAcceptances,
  eventTypes,
  getDatabase,
  guardianInvitations,
  guardianships,
  importedMatches,
  matchConfirmations,
  matchHistoryDisputes,
  matches,
  memberships,
  membershipTiers,
  organizationMemberships,
  organizations,
  orders,
  people,
  playerPublicProfiles,
  playerSourceConnections,
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
  tickets,
  ticketTypes,
  teamEntries,
  venues,
  walletAccounts,
  walletLedger,
  worldRankings,
} from "@duna/db";
import {
  evaluateTaxRails,
  foldWalletLedger,
  type AuditEvent,
  type BookingSummary,
  type Currency,
  type EventKind,
  type EventFeature,
  type EventLocation,
  type EventMedia,
  type EventPolicy,
  type EventSummary,
  type EventTeamFormat,
  type EventSurface,
  type EventGender,
  type EventPoolPlay,
  type EventSeedingMethod,
  type LeagueRecurrence,
  type TournamentFormat,
  type MatchSummary,
  type Metric,
  MEMBERSHIP_PLANS,
  type OrganizationSummary,
  PLATFORM_MEMBERSHIP_TIER_CODES,
  membershipPlanForTierCode,
  type PersonRole,
  type PersonSummary,
  publicPlayerPath,
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
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import type {
  AdminOrganizationDetail,
  AdminQueue,
  DunaRepository,
  OperatorScheduleItem,
  PickupMutationInput,
  PlayerSettings,
  PlayerWallet,
} from "./repository-contract";
import { loadGuardianReviewQueue } from "./identity";
import { loadIdentityVerification } from "./identity-verification";
import { getDunaPlusEntitlement, membershipPlanOffers } from "./membership";
import { resolveOrganizationCommissionPolicy } from "./organization-billing";

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

const playerAccentIds = [
  "dune-gold",
  "marine",
  "deep-coral",
  "moss",
  "terracotta",
  "slate-blue",
  "ochre",
  "plum",
  "sea-green",
  "ink",
] as const satisfies readonly PlayerSettings["publicIdentity"]["accentId"][];

function playerAccentId(
  value: string | null | undefined,
): PlayerSettings["publicIdentity"]["accentId"] {
  return playerAccentIds.includes(
    value as PlayerSettings["publicIdentity"]["accentId"],
  )
    ? (value as PlayerSettings["publicIdentity"]["accentId"])
    : "dune-gold";
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
  const [
    personRows,
    ratingRows,
    membershipRows,
    guardianRows,
    publicProfileRows,
    worldRankingRows,
  ] = await Promise.all([
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
    database
      .select({
        personId: playerPublicProfiles.personId,
        countryCode: playerPublicProfiles.countryCode,
        hometown: playerPublicProfiles.hometown,
      })
      .from(playerPublicProfiles)
      .where(
        and(
          inArray(playerPublicProfiles.personId, [...personIds]),
          eq(playerPublicProfiles.publicationStatus, "published"),
        ),
      ),
    database
      .select({
        personId: worldRankings.personId,
        countryCode: worldRankings.countryCode,
        rankingDate: worldRankings.rankingDate,
      })
      .from(worldRankings)
      .where(inArray(worldRankings.personId, [...personIds]))
      .orderBy(desc(worldRankings.rankingDate)),
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
  const publicProfileByPerson = new Map(
    publicProfileRows.map((row) => [row.personId, row] as const),
  );
  const countryByPerson = new Map<string, string>();
  for (const row of worldRankingRows) {
    if (row.personId && row.countryCode && !countryByPerson.has(row.personId)) {
      countryByPerson.set(row.personId, row.countryCode);
    }
  }
  return personRows
    .map((person): PersonSummary => {
      const rating = ratingByPerson.get(person.id);
      const publicProfile = publicProfileByPerson.get(person.id);
      return {
        id: person.id,
        displayName: person.displayName,
        handle: person.handle,
        publicPath: publicPlayerPath({
          id: person.id,
          displayName: person.displayName,
          handle: person.handle,
          homeMarket: publicProfile?.hometown ?? person.homeMarket,
          countryCode:
            publicProfile?.countryCode ?? countryByPerson.get(person.id),
          profileClaimStatus: person.profileClaimStatus as
            "claimed" | "unclaimed" | "claim-pending" | "merged",
        }),
        initials: initials(person.displayName),
        homeMarket: person.homeMarket ?? "Market not set",
        roles: [
          ...(rolesByPerson.get(person.id) ?? new Set<PersonRole>(["player"])),
        ],
        isMinor: person.isMinor,
        guardianIds: guardiansByMinor.get(person.id),
        avatarUrl: person.avatarUrl ?? undefined,
        profileClaimStatus:
          person.profileClaimStatus as PersonSummary["profileClaimStatus"],
        isProfessional: person.isProfessional,
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
  const divisionIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        match.divisionId ? [match.divisionId] : [],
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
    disputeRows,
    importedContextRows,
    divisionContextRows,
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
      .where(inArray(ratingEvents.matchId, matchIds)),
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
    database
      .select()
      .from(matchHistoryDisputes)
      .where(
        and(
          eq(matchHistoryDisputes.personId, personId),
          inArray(matchHistoryDisputes.matchId, matchIds),
        ),
      ),
    database
      .select({
        canonicalMatchId: importedMatches.canonicalMatchId,
        title: importedMatches.title,
        roundLabel: importedMatches.roundLabel,
        location: importedMatches.location,
        sourceUrl: importedMatches.sourceUrl,
      })
      .from(importedMatches)
      .where(inArray(importedMatches.canonicalMatchId, matchIds)),
    divisionIds.length > 0
      ? database
          .select({
            divisionId: divisions.id,
            divisionName: divisions.name,
            sessionTitle: sessions.title,
            sessionSlug: sessions.slug,
            venueName: venues.name,
            venueLocality: venues.locality,
            venueRegion: venues.administrativeArea,
          })
          .from(divisions)
          .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
          .leftJoin(venues, eq(sessions.venueId, venues.id))
          .where(inArray(divisions.id, divisionIds))
      : Promise.resolve([]),
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
  const disputeByMatch = new Map(
    disputeRows.map((row) => [row.matchId, row] as const),
  );
  const ratingByMatch = new Map(
    deltaRows
      .filter((event) => event.personId === personId)
      .map((event) => {
        const before =
          typeof event.before.display === "number" ? event.before.display : 0;
        const after =
          typeof event.after.display === "number"
            ? event.after.display
            : before;
        const explanation =
          typeof event.explanation === "object" && event.explanation !== null
            ? event.explanation
            : {};
        const optionalNumber = (value: unknown) =>
          typeof value === "number" && Number.isFinite(value)
            ? value
            : undefined;
        return [
          event.matchId,
          {
            before,
            after,
            delta: after - before,
            explanation: {
              expectedWinProbability: optionalNumber(
                explanation.expectedWinProbability,
              ),
              actualResult: optionalNumber(explanation.actualResult),
              pointShare: optionalNumber(explanation.pointShare),
              marginMultiplier: optionalNumber(explanation.marginMultiplier),
              responsibilityWeight: optionalNumber(
                explanation.responsibilityWeight,
              ),
              verificationWeight: optionalNumber(
                explanation.verificationWeight,
              ),
              displayDelta:
                optionalNumber(explanation.displayDelta) ?? after - before,
            },
          },
        ] as const;
      }),
  );
  const ratingBeforeByMatchPerson = new Map(
    deltaRows.flatMap((event) => {
      const display =
        typeof event.before.display === "number"
          ? event.before.display
          : undefined;
      return display === undefined
        ? []
        : [[`${event.matchId}:${event.personId}`, display] as const];
    }),
  );
  const importedContextByMatch = new Map(
    importedContextRows.flatMap((row) =>
      row.canonicalMatchId ? [[row.canonicalMatchId, row] as const] : [],
    ),
  );
  const divisionContextById = new Map(
    divisionContextRows.map((row) => [row.divisionId, row] as const),
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
    const format =
      typeof match.format === "object" && match.format !== null
        ? match.format
        : {};
    const events = rallyRows
      .filter((event) => event.matchId === match.id)
      .map((event) => event.payload as unknown as ScoreEvent);
    const storedSets = Array.isArray(format.sets)
      ? format.sets.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const set = value as { a?: unknown; b?: unknown };
          return Number.isSafeInteger(set.a) &&
            Number.isSafeInteger(set.b) &&
            Number(set.a) >= 0 &&
            Number(set.b) >= 0 &&
            set.a !== set.b
            ? [{ a: Number(set.a), b: Number(set.b) }]
            : [];
        })
      : [];
    let scoredSets: readonly { readonly a: number; readonly b: number }[] = [];
    let foldedWinner: "A" | "B" | undefined;
    if (events.length > 0) {
      try {
        const score = foldScore(events, storedMatchFormat(match.format));
        scoredSets = score.sets
          .filter((set) => set.winner)
          .map((set) => ({ a: set.a, b: set.b }));
        foldedWinner = score.winner;
      } catch {
        if (storedSets.length === 0) return [];
      }
    }
    if (scoredSets.length === 0) scoredSets = storedSets;
    if (scoredSets.length === 0) return [];
    const setWinsA = scoredSets.filter((set) => set.a > set.b).length;
    const setWinsB = scoredSets.filter((set) => set.b > set.a).length;
    const winner =
      match.winnerTeamId === match.teamAId
        ? "A"
        : match.winnerTeamId === match.teamBId
          ? "B"
          : (foldedWinner ??
            (setWinsA > setWinsB
              ? "A"
              : setWinsB > setWinsA
                ? "B"
                : undefined));
    if (!winner) return [];
    const confirmation = confirmationByMatch.get(match.id);
    const dispute = disputeByMatch.get(match.id);
    const importedContext = importedContextByMatch.get(match.id);
    const divisionContext = match.divisionId
      ? divisionContextById.get(match.divisionId)
      : undefined;
    const matchType =
      "matchType" in format &&
      (format.matchType === "competitive" || format.matchType === "friendly")
        ? format.matchType
        : undefined;
    const teamSize =
      "teamSize" in format &&
      typeof format.teamSize === "number" &&
      Number.isInteger(format.teamSize)
        ? format.teamSize
        : teamAPlayers.length;
    const recordingMode =
      "recordingMode" in format &&
      (format.recordingMode === "completed" || format.recordingMode === "live")
        ? format.recordingMode
        : undefined;
    const storedLocation =
      "location" in format &&
      typeof format.location === "object" &&
      format.location !== null &&
      "label" in format.location &&
      typeof format.location.label === "string"
        ? {
            label: format.location.label,
            googlePlaceId:
              "googlePlaceId" in format.location &&
              typeof format.location.googlePlaceId === "string"
                ? format.location.googlePlaceId
                : undefined,
            name:
              "name" in format.location &&
              typeof format.location.name === "string"
                ? format.location.name
                : undefined,
            address:
              "address" in format.location &&
              typeof format.location.address === "string"
                ? format.location.address
                : undefined,
            latitude:
              "latitude" in format.location &&
              typeof format.location.latitude === "number"
                ? format.location.latitude
                : undefined,
            longitude:
              "longitude" in format.location &&
              typeof format.location.longitude === "number"
                ? format.location.longitude
                : undefined,
          }
        : undefined;
    const bestOf =
      "bestOf" in format &&
      typeof format.bestOf === "number" &&
      Number.isInteger(format.bestOf)
        ? format.bestOf
        : scoredSets.length;
    const teamRating = (players: readonly PersonSummary[]) => {
      const values = players.flatMap((player) => {
        const rating = ratingBeforeByMatchPerson.get(
          `${match.id}:${player.id}`,
        );
        return rating === undefined ? [] : [rating];
      });
      return values.length === players.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined;
    };
    const teamARating = teamRating(teamAPlayers);
    const teamBRating = teamRating(teamBPlayers);
    const teamAChance =
      teamARating !== undefined && teamBRating !== undefined
        ? Math.round(
            (100 / (1 + 10 ** ((teamBRating - teamARating) / 1.5))) * 10,
          ) / 10
        : undefined;
    const favorite =
      teamAChance === undefined || teamAChance === 50
        ? "even"
        : teamAChance > 50
          ? "A"
          : "B";
    const rating = ratingByMatch.get(match.id);
    const origin =
      "importedMatchId" in format || "source" in format
        ? "imported"
        : recordingMode === "live"
          ? "live-scored"
          : match.verification === "self-reported"
            ? "self-reported"
            : "live-scored";
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
          storedLocation?.label ??
          importedContext?.location ??
          divisionContext?.venueName ??
          ([divisionContext?.venueLocality, divisionContext?.venueRegion]
            .filter(Boolean)
            .join(", ") ||
            undefined) ??
          "Location not recorded",
        ...(importedContext?.title || divisionContext?.sessionTitle
          ? {
              eventName:
                importedContext?.title ?? divisionContext?.sessionTitle,
            }
          : {}),
        ...(divisionContext?.sessionSlug
          ? { eventSlug: divisionContext.sessionSlug }
          : {}),
        ...(importedContext?.roundLabel || divisionContext?.divisionName
          ? {
              roundLabel:
                importedContext?.roundLabel ?? divisionContext?.divisionName,
            }
          : {}),
        ...(importedContext?.sourceUrl
          ? { sourceUrl: importedContext.sourceUrl }
          : {}),
        formatSummary: `Beach ${teamSize === 2 ? "doubles" : `${teamSize}-player teams`} · best of ${bestOf}`,
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        score: scoredSets.map((set) => [set.a, set.b] as const),
        winner,
        ratingDelta: rating?.delta ?? 0,
        ratingBefore: rating?.before,
        ratingAfter: rating?.after,
        ratingExplanation: rating?.explanation,
        location: storedLocation,
        ...(teamAChance !== undefined
          ? {
              prediction: {
                teamA: teamAChance,
                teamB: Math.round((100 - teamAChance) * 10) / 10,
                favorite,
                outcome:
                  favorite === "even"
                    ? ("even" as const)
                    : winner === favorite
                      ? ("predicted" as const)
                      : ("upset" as const),
                basis: "Sand Rating" as const,
              },
            }
          : {}),
        origin,
        ratingEligibility: match.ratingEligible ? "eligible" : "held",
        matchType,
        teamSize,
        recordingMode,
        ratingImpact:
          matchType === "friendly" || teamSize !== 2
            ? "history-only"
            : "sand-rating",
        dispute: dispute
          ? {
              status:
                dispute.status === "upheld" ||
                dispute.status === "rejected" ||
                dispute.status === "withdrawn"
                  ? dispute.status
                  : "pending",
              reasonCode: dispute.reasonCode,
            }
          : undefined,
        canRemove:
          origin === "self-reported" &&
          match.createdByPersonId === personId &&
          match.status === "pending-verification" &&
          !match.ratingAppliedAt,
        verification: summaryVerification(match.verification),
      },
    ];
  });
}

export async function loadPublicImportedMatchSummary(
  matchId: string,
): Promise<MatchSummary | undefined> {
  const database = getDatabase();
  const [importedMatch] = await database
    .select({ id: importedMatches.id })
    .from(importedMatches)
    .where(
      and(
        eq(importedMatches.canonicalMatchId, matchId),
        eq(importedMatches.importState, "approved"),
      ),
    )
    .limit(1);
  if (!importedMatch) return undefined;

  const [match] = await database
    .select({
      teamAId: matches.teamAId,
      teamBId: matches.teamBId,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (
    !match?.teamAId ||
    !match.teamBId ||
    !["verified", "complete"].includes(match.status)
  ) {
    return undefined;
  }

  const participants = await database
    .select({
      personId: people.id,
      status: people.status,
      profileVisibility: people.profileVisibility,
      isMinor: people.isMinor,
    })
    .from(teamMembers)
    .innerJoin(people, eq(teamMembers.personId, people.id))
    .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]));
  if (
    participants.length < 2 ||
    participants.some(
      (participant) =>
        participant.status !== "active" ||
        participant.profileVisibility !== "public" ||
        participant.isMinor,
    )
  ) {
    return undefined;
  }

  return (await loadMatchHistory(participants[0]!.personId)).find(
    (candidate) => candidate.id === matchId,
  );
}

interface ScopedEvent {
  readonly event: EventSummary;
  readonly organizationId?: string;
}

interface StoredDivisionSettings {
  readonly teamFormat?: EventTeamFormat;
  readonly surface?: EventSurface;
  readonly gender?: EventGender;
  readonly ratingMinimum?: number;
  readonly ratingMaximum?: number;
  readonly ageMinimum?: number;
  readonly ageMaximum?: number;
  readonly tournamentFormat?: TournamentFormat;
  readonly poolPlay?: EventPoolPlay;
  readonly seeding?: EventSeedingMethod;
  readonly teamEntryFeeMinor?: number;
  readonly playerEntryFeeMinor?: number;
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
    registrationAttendeeRows,
    pickupAttendeeRows,
    blueprintRows,
    ticketTypeRows,
    issuedTicketRows,
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
        hostPersonId: people.id,
        hostName: people.displayName,
        hostHandle: people.handle,
        hostAvatarUrl: people.avatarUrl,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        venueLabel: pickupSessions.venueLabel,
        note: pickupSessions.note,
        format: pickupSessions.format,
        recordMatches: pickupSessions.recordMatches,
        visibility: pickupSessions.visibility,
        lifecycleStatus: pickupSessions.status,
        approvalRequired: pickupSessions.approvalRequired,
        directAddress: pickupSessions.address,
        directGooglePlaceId: pickupSessions.googlePlaceId,
        directLatitude: pickupSessions.latitude,
        directLongitude: pickupSessions.longitude,
        locationConfidence: pickupSessions.locationConfidence,
        venueTimezone: venues.timezone,
        directOrganizationId: pickupSessions.organizationId,
        venueOrganizationId: venues.organizationId,
        capacity: pickupSessions.capacity,
        ratingMinimum: pickupSessions.ratingMinimum,
        ratingMaximum: pickupSessions.ratingMaximum,
        currency: pickupSessions.currency,
        costMinor: pickupSessions.costMinor,
        venueAddressLine1: venues.addressLine1,
        venueAddressLine2: venues.addressLine2,
        venueLocality: venues.locality,
        venueAdministrativeArea: venues.administrativeArea,
        venuePostalCode: venues.postalCode,
        venueCountryCode: venues.countryCode,
        venueGooglePlaceId: venues.googlePlaceId,
        venueLatitude: venues.latitude,
        venueLongitude: venues.longitude,
      })
      .from(pickupSessions)
      .innerJoin(people, eq(pickupSessions.hostPersonId, people.id))
      .leftJoin(venues, eq(pickupSessions.venueId, venues.id))
      .where(
        and(
          input?.includeUnlistedPickups
            ? inArray(pickupSessions.visibility, ["public", "unlisted"])
            : eq(pickupSessions.visibility, "public"),
          eq(pickupSessions.status, "active"),
        ),
      )
      .orderBy(asc(pickupSessions.startsAt)),
    database
      .select({
        id: divisions.id,
        sessionId: divisions.sessionId,
        name: divisions.name,
        description: divisions.description,
        discipline: divisions.discipline,
        ratingBasis: divisions.ratingBasis,
        capacity: divisions.capacity,
        minimumTeams: divisions.minimumTeams,
        maximumTeams: divisions.maximumTeams,
        teamSize: divisions.teamSize,
        priceBasis: divisions.priceBasis,
        settings: divisions.settings,
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
    database
      .select({
        sessionId: registrations.sessionId,
        personId: registrations.personId,
      })
      .from(registrations)
      .innerJoin(people, eq(registrations.personId, people.id))
      .where(
        and(
          inArray(registrations.status, ["confirmed", "checked-in"]),
          eq(people.status, "active"),
          eq(people.profileVisibility, "public"),
          eq(people.isMinor, false),
        ),
      ),
    database
      .select({
        pickupSessionId: pickupParticipants.pickupSessionId,
        personId: pickupParticipants.personId,
      })
      .from(pickupParticipants)
      .innerJoin(people, eq(pickupParticipants.personId, people.id))
      .where(
        and(
          inArray(pickupParticipants.status, ["confirmed", "checked-in"]),
          eq(people.status, "active"),
          eq(people.profileVisibility, "public"),
          eq(people.isMinor, false),
        ),
      ),
    database
      .select({
        sessionId: eventBlueprints.sessionId,
        shortSummary: eventBlueprints.shortSummary,
        description: eventBlueprints.description,
        media: eventBlueprints.media,
        location: eventBlueprints.location,
        features: eventBlueprints.features,
        policies: eventBlueprints.policies,
        recurrence: eventBlueprints.recurrence,
      })
      .from(eventBlueprints),
    database
      .select({
        id: ticketTypes.id,
        sessionId: ticketTypes.sessionId,
        name: ticketTypes.name,
        description: ticketTypes.description,
        priceMinor: ticketTypes.priceMinor,
        currency: ticketTypes.currency,
        quantity: ticketTypes.quantity,
        waitlistEnabled: ticketTypes.waitlistEnabled,
        approvalRequired: ticketTypes.approvalRequired,
        availableOnline: ticketTypes.availableOnline,
        availableInPerson: ticketTypes.availableInPerson,
      })
      .from(ticketTypes),
    database
      .select({
        ticketTypeId: tickets.ticketTypeId,
        status: tickets.status,
      })
      .from(tickets)
      .where(
        inArray(tickets.status, ["held", "issued", "transferred", "scanned"]),
      ),
  ]);
  const featurePersonIds = blueprintRows.flatMap((blueprint) =>
    (blueprint.features as unknown as readonly EventFeature[])
      .map((feature) => feature.personId)
      .filter((id): id is string => Boolean(id)),
  );
  const attendeeIds = [
    ...new Set([
      ...registrationAttendeeRows.map((row) => row.personId),
      ...pickupAttendeeRows.map((row) => row.personId),
      ...featurePersonIds,
    ]),
  ];
  const attendeePeople = await loadPeople(attendeeIds);
  const attendeeById = new Map(
    attendeePeople.map((person) => [person.id, person] as const),
  );
  const publicAttendee = (personId: string) => {
    const person = attendeeById.get(personId);
    return person
      ? {
          id: person.id,
          displayName: person.displayName,
          handle: person.handle,
          publicPath: person.publicPath,
          initials: person.initials,
          avatarUrl: person.avatarUrl,
          homeMarket: person.homeMarket,
          ratingDisplay: person.rating.display,
        }
      : undefined;
  };
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
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          })
          .from(organizations)
          .where(inArray(organizations.id, [...organizationIds]));
  const organizationNames = new Map(
    organizationRows.map((row) => [row.id, row.name] as const),
  );
  const organizationSlugs = new Map(
    organizationRows.map((row) => [row.id, row.slug] as const),
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
  const blueprintBySession = new Map(
    blueprintRows.map((blueprint) => [blueprint.sessionId, blueprint] as const),
  );
  const issuedTicketCount = new Map<string, number>();
  for (const ticket of issuedTicketRows) {
    issuedTicketCount.set(
      ticket.ticketTypeId,
      (issuedTicketCount.get(ticket.ticketTypeId) ?? 0) + 1,
    );
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
    const blueprint = blueprintBySession.get(row.id);
    const blueprintLocation = blueprint?.location as EventLocation | undefined;
    const eventDivisions: NonNullable<EventSummary["divisions"]> = divisionRows
      .filter((division) => division.sessionId === row.id)
      .map((division) => {
        const settings = division.settings as unknown as StoredDivisionSettings;
        const teamSize = Math.max(1, division.teamSize);
        const teamEntryFeeMinor =
          Number.isSafeInteger(settings.teamEntryFeeMinor) &&
          (settings.teamEntryFeeMinor ?? -1) >= 0
            ? settings.teamEntryFeeMinor!
            : division.priceBasis === "per-person"
              ? division.entryFeeMinor * teamSize
              : division.entryFeeMinor;
        const playerEntryFeeMinor =
          Number.isSafeInteger(settings.playerEntryFeeMinor) &&
          (settings.playerEntryFeeMinor ?? -1) >= 0
            ? settings.playerEntryFeeMinor!
            : division.priceBasis === "per-person"
              ? division.entryFeeMinor
              : Math.ceil(division.entryFeeMinor / teamSize);
        return {
          id: division.id,
          name: division.name,
          description: division.description ?? undefined,
          discipline: division.discipline,
          ratingBasis: division.ratingBasis,
          price: {
            amountMinor: division.entryFeeMinor,
            currency: currency(division.currency),
          },
          teamPrice: {
            amountMinor: teamEntryFeeMinor,
            currency: currency(division.currency),
          },
          playerPrice: {
            amountMinor: playerEntryFeeMinor,
            currency: currency(division.currency),
          },
          spotsRemaining: Math.max(
            0,
            division.capacity -
              (divisionRegistrationCount.get(division.id) ?? 0),
          ),
          capacity: division.capacity,
          minimumTeams: division.minimumTeams,
          maximumTeams: division.maximumTeams ?? undefined,
          teamFormat: settings.teamFormat,
          teamSize: division.teamSize,
          surface: settings.surface,
          gender: settings.gender,
          priceBasis:
            division.priceBasis === "per-person" ? "per-person" : "per-team",
          ratingMinimum: settings.ratingMinimum,
          ratingMaximum: settings.ratingMaximum,
          ageMinimum: settings.ageMinimum,
          ageMaximum: settings.ageMaximum,
          tournamentFormat: settings.tournamentFormat,
          poolPlay: settings.poolPlay,
          seeding: settings.seeding,
        };
      });
    const eventTickets: NonNullable<EventSummary["tickets"]> = ticketTypeRows
      .filter((ticket) => ticket.sessionId === row.id)
      .map((ticket) => ({
        id: ticket.id,
        name: ticket.name,
        description: ticket.description ?? undefined,
        price: {
          amountMinor: ticket.priceMinor,
          currency: currency(ticket.currency),
        },
        quantity: ticket.quantity ?? undefined,
        remaining:
          ticket.quantity === null
            ? undefined
            : Math.max(
                0,
                ticket.quantity - (issuedTicketCount.get(ticket.id) ?? 0),
              ),
        waitlistEnabled: ticket.waitlistEnabled,
        approvalRequired: ticket.approvalRequired,
        availableOnline: ticket.availableOnline,
        availableInPerson: ticket.availableInPerson,
      }));
    // A spectator ticket is not a player entry. Prefer division pricing for
    // the event's primary callout and only fall back to tickets for events
    // without a playable division.
    const optionPrices =
      eventDivisions.length > 0
        ? eventDivisions.map((division) =>
            Math.min(
              division.teamPrice.amountMinor,
              division.playerPrice.amountMinor,
            ),
          )
        : eventTickets.map((ticket) => ticket.price.amountMinor);
    const startingPrice =
      optionPrices.length > 0
        ? Math.min(...optionPrices)
        : (row.priceMinor ?? 0);
    const startingCurrency =
      eventDivisions[0]?.price.currency ??
      eventTickets[0]?.price.currency ??
      currency(row.priceCurrency ?? "USD");
    return {
      organizationId,
      event: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        kind,
        organizationId,
        organizationSlug:
          (organizationId && organizationSlugs.get(organizationId)) ??
          undefined,
        organizationName:
          (organizationId && organizationNames.get(organizationId)) ??
          "Independent organizer",
        venueName:
          blueprintLocation?.venueName ??
          row.venueName ??
          "Location shared after registration",
        shortSummary: blueprint?.shortSummary ?? undefined,
        description: blueprint?.description ?? undefined,
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
        tickets: eventTickets.length > 0 ? eventTickets : undefined,
        media:
          blueprint && blueprint.media.length > 0
            ? (blueprint.media as unknown as readonly EventMedia[])
            : undefined,
        location: blueprintLocation
          ? {
              ...blueprintLocation,
              confidence:
                blueprintLocation.googlePlaceId &&
                blueprintLocation.latitude !== undefined &&
                blueprintLocation.longitude !== undefined
                  ? "confirmed"
                  : "approximate",
            }
          : undefined,
        features:
          blueprint && blueprint.features.length > 0
            ? (blueprint.features as unknown as readonly EventFeature[]).map(
                (feature) => {
                  const person = feature.personId
                    ? attendeeById.get(feature.personId)
                    : undefined;
                  return person
                    ? {
                        ...feature,
                        personHandle: person.handle,
                        personPublicPath: person.publicPath,
                        personInitials: person.initials,
                        personName: person.displayName,
                        personHomeMarket: person.homeMarket,
                        personRating: person.rating.display,
                        imageUrl: feature.imageUrl ?? person.avatarUrl,
                      }
                    : feature;
                },
              )
            : undefined,
        policies:
          blueprint && blueprint.policies.length > 0
            ? (blueprint.policies as unknown as readonly EventPolicy[])
            : undefined,
        recurrence: blueprint?.recurrence
          ? (blueprint.recurrence as unknown as LeagueRecurrence)
          : undefined,
        attendees: registrationAttendeeRows
          .filter((attendee) => attendee.sessionId === row.id)
          .map((attendee) => publicAttendee(attendee.personId))
          .filter((attendee) => attendee !== undefined),
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
        organizationId,
        organizationSlug:
          (organizationId && organizationSlugs.get(organizationId)) ??
          undefined,
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
        location: {
          mode: "venue",
          venueName: row.venueLabel,
          address:
            row.directAddress ??
            ([
              row.venueAddressLine1,
              row.venueAddressLine2,
              row.venueLocality,
              row.venueAdministrativeArea,
              row.venuePostalCode,
              row.venueCountryCode,
            ]
              .filter(Boolean)
              .join(", ") ||
              undefined),
          googlePlaceId:
            row.directGooglePlaceId ?? row.venueGooglePlaceId ?? undefined,
          latitude: row.directLatitude ?? row.venueLatitude ?? undefined,
          longitude: row.directLongitude ?? row.venueLongitude ?? undefined,
          confidence:
            row.locationConfidence === "confirmed"
              ? "confirmed"
              : "approximate",
        },
        attendees: pickupAttendeeRows
          .filter((attendee) => attendee.pickupSessionId === row.id)
          .map((attendee) => publicAttendee(attendee.personId))
          .filter((attendee) => attendee !== undefined),
        host: {
          id: row.hostPersonId,
          displayName: row.hostName,
          handle: row.hostHandle,
          initials: initials(row.hostName),
          avatarUrl: row.hostAvatarUrl ?? undefined,
        },
        approvalRequired: row.approvalRequired,
        visibility: row.visibility === "unlisted" ? "unlisted" : "public",
        lifecycleStatus:
          row.lifecycleStatus === "cancelled"
            ? "cancelled"
            : row.lifecycleStatus === "completed"
              ? "completed"
              : "active",
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
    const commission = resolveOrganizationCommissionPolicy(row);
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
      effectivePlan: commission.effectivePlan,
      operatorCommissionBps: commission.rateBps,
      commissionSource: commission.source,
      stripeFeeMetadataStatus: commission.stripeSyncStatus,
    };
  });
}

async function searchAdminPlayers(
  query: string | undefined,
  limit: number,
): Promise<PersonSummary[]> {
  const database = getDatabase();
  const normalizedQuery = query?.trim();
  const personRows = await database
    .select({ id: people.id })
    .from(people)
    .where(
      normalizedQuery
        ? and(
            eq(people.status, "active"),
            or(
              ilike(people.displayName, `%${normalizedQuery}%`),
              ilike(people.handle, `%${normalizedQuery}%`),
              ilike(people.email, `%${normalizedQuery}%`),
            ),
          )
        : eq(people.status, "active"),
    )
    .orderBy(asc(people.displayName))
    .limit(limit);
  return loadPeople(personRows.map((row) => row.id));
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

function playingExperience(
  value: string,
): PlayerSettings["profile"]["playingExperience"] {
  return [
    "not-set",
    "amateur",
    "high-school",
    "collegiate",
    "professional",
  ].includes(value)
    ? (value as PlayerSettings["profile"]["playingExperience"])
    : "not-set";
}

function profileOnboardingStatus(
  value?: string,
): PlayerSettings["profile"]["onboardingStatus"] {
  return [
    "not-started",
    "in-progress",
    "guardian-required",
    "complete",
  ].includes(value ?? "")
    ? (value as PlayerSettings["profile"]["onboardingStatus"])
    : "not-started";
}

function settingsAgeBand(value?: string): PlayerSettings["profile"]["ageBand"] {
  return ["under-13", "teen", "adult"].includes(value ?? "")
    ? (value as PlayerSettings["profile"]["ageBand"])
    : "unknown";
}

function guardianInvitationStatus(
  value: string,
): NonNullable<PlayerSettings["guardianInvitation"]>["status"] {
  return ["pending", "claimed", "expired", "cancelled"].includes(value)
    ? (value as NonNullable<PlayerSettings["guardianInvitation"]>["status"])
    : "expired";
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
    sourceConnectionRows,
    guardianInvitation,
    identityVerification,
    publicProfile,
    dunaPlus,
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
        tierCode: membershipTiers.code,
        tierName: membershipTiers.name,
        interval: membershipTiers.interval,
        priceMinor: membershipTiers.priceMinor,
        currency: membershipTiers.currency,
        benefits: membershipTiers.benefits,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.personId, personId),
          inArray(memberships.status, [
            "active",
            "trialing",
            "past_due",
            "unpaid",
            "incomplete",
          ]),
          isNull(membershipTiers.organizationId),
          inArray(membershipTiers.code, [...PLATFORM_MEMBERSHIP_TIER_CODES]),
        ),
      )
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
    database
      .select()
      .from(playerSourceConnections)
      .where(eq(playerSourceConnections.personId, personId))
      .orderBy(desc(playerSourceConnections.updatedAt)),
    database.query.guardianInvitations.findFirst({
      where: eq(guardianInvitations.minorId, personId),
      orderBy: desc(guardianInvitations.createdAt),
    }),
    loadIdentityVerification(personId),
    database.query.playerPublicProfiles.findFirst({
      where: eq(playerPublicProfiles.personId, personId),
    }),
    getDunaPlusEntitlement(personId),
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
  const householdMetadata = new Map(
    (householdIds.length > 0
      ? await database
          .select({
            id: people.id,
            status: people.profileOnboardingStatus,
            birthDate: people.birthDate,
            ageBand: people.ageBand,
            genderCategory: people.genderCategory,
          })
          .from(people)
          .where(inArray(people.id, [...new Set(householdIds)]))
      : []
    ).map((entry) => [entry.id, entry] as const),
  );
  const household: PlayerSettings["household"] = [
    ...guardianRows.flatMap((row) => {
      const householdPerson = householdPeople.get(row.guardianId);
      const metadata = householdMetadata.get(row.guardianId);
      return householdPerson
        ? [
            {
              person: householdPerson,
              relationship: row.relationship,
              role: "guardian" as const,
              verified: row.verified,
              emergencyContact: row.emergencyContact,
              canApproveSpending: row.canApproveSpending,
              birthDate: metadata?.birthDate ?? undefined,
              ageBand: settingsAgeBand(metadata?.ageBand),
              genderCategory: metadata?.genderCategory ?? undefined,
              onboardingStatus: profileOnboardingStatus(metadata?.status),
            },
          ]
        : [];
    }),
    ...dependentRows.flatMap((row) => {
      const householdPerson = householdPeople.get(row.minorId);
      const metadata = householdMetadata.get(row.minorId);
      return householdPerson
        ? [
            {
              person: householdPerson,
              relationship: row.relationship,
              role: "dependent" as const,
              verified: row.verified,
              emergencyContact: row.emergencyContact,
              canApproveSpending: row.canApproveSpending,
              birthDate: metadata?.birthDate ?? undefined,
              ageBand: settingsAgeBand(metadata?.ageBand),
              genderCategory: metadata?.genderCategory ?? undefined,
              onboardingStatus: profileOnboardingStatus(metadata?.status),
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
  const membershipPlan = membership
    ? membershipPlanForTierCode(membership.tierCode)
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
      genderCategory: person.genderCategory ?? undefined,
      parentalConsentRecorded: person.parentalConsentAt !== null,
      legalGivenName: person.legalGivenName ?? undefined,
      legalMiddleName: person.legalMiddleName ?? undefined,
      legalFamilyName: person.legalFamilyName ?? undefined,
      heightMillimeters: person.heightMillimeters ?? undefined,
      playingExperience: playingExperience(person.playingExperience),
      playedIndoorPrior: person.playedIndoorPrior ?? undefined,
      yearsPlaying: person.yearsPlaying ?? undefined,
      collegeName: person.collegeName ?? undefined,
      experienceSummary: person.experienceSummary ?? undefined,
      onboardingStatus: profileOnboardingStatus(person.profileOnboardingStatus),
      onboardingCompletedAt: person.profileOnboardingCompletedAt?.toISOString(),
    },
    identityVerification,
    publicIdentity: {
      tier:
        person.isProfessional && identityVerification.status === "verified"
          ? "verified-pro"
          : "claimed",
      accentId: playerAccentId(publicProfile?.accentId),
    },
    sourceConnections: sourceConnectionRows.flatMap((connection) => {
      if (
        connection.source !== "volleyball-life" &&
        connection.source !== "bvbinfo"
      ) {
        return [];
      }
      if (
        ![
          "queued",
          "syncing",
          "linked",
          "review-required",
          "failed",
          "disconnected",
        ].includes(connection.status)
      ) {
        return [];
      }
      return [
        {
          id: connection.id,
          source: connection.source,
          profileUrl: connection.profileUrl,
          apiProfileUrl: connection.apiProfileUrl ?? undefined,
          externalPersonId: connection.externalPersonId,
          profileSnapshot: connection.profileSnapshot,
          verificationStatus:
            connection.verificationStatus === "confirmed" ||
            connection.verificationStatus === "rejected"
              ? connection.verificationStatus
              : "pending",
          status:
            connection.status as PlayerSettings["sourceConnections"][number]["status"],
          lastSyncedAt: connection.lastSyncedAt?.toISOString(),
          lastError: connection.lastError ?? undefined,
          progress: {
            phase: connection.progressPhase,
            current: connection.progressCurrent,
            total: connection.progressTotal,
            matchesFound: connection.matchesFound,
            profilesFound: connection.profilesFound,
          },
          nextRefreshAt: connection.nextRefreshAt?.toISOString(),
        },
      ];
    }),
    guardianInvitation: guardianInvitation
      ? {
          id: guardianInvitation.id,
          status: guardianInvitationStatus(guardianInvitation.status),
          expiresAt: guardianInvitation.expiresAt.toISOString(),
        }
      : undefined,
    voiceOnboarding: {
      configured: Boolean(
        process.env.LIVEKIT_URL &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET,
      ),
      aiConfigured: Boolean(
        process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
      ),
    },
    household,
    dunaPlus,
    membership:
      membership && membershipPlan && interval
        ? {
            id: membership.id,
            status: membership.status,
            tierName: MEMBERSHIP_PLANS[membershipPlan].name,
            interval,
            priceMinor: membership.priceMinor,
            currency: settingsCurrency(membership.currency),
            benefits: MEMBERSHIP_PLANS[membershipPlan].benefits,
            currentPeriodEndsAt: membership.currentPeriodEndsAt?.toISOString(),
            pausedUntil: membership.pausedUntil?.toISOString(),
            pauseMonthsUsed: membership.pauseMonthsUsed,
            cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
          }
        : undefined,
    dunaPlusPlans: membershipPlanOffers(),
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

async function loadAudit(organizationId?: string): Promise<AuditEvent[]> {
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
    .where(
      organizationId ? eq(auditLog.organizationId, organizationId) : undefined,
    )
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

async function loadAdminOrganization(
  organizationId: string,
): Promise<AdminOrganizationDetail | undefined> {
  const database = getDatabase();
  const organization = (await loadOrganizations(organizationId))[0];
  if (!organization) return undefined;
  const organizationRecord = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organizationRecord) return undefined;
  const commission = resolveOrganizationCommissionPolicy(organizationRecord);

  const [membershipRows, organizationVenues, scopedEvents, orderRows, audit] =
    await Promise.all([
      database
        .select({ personId: organizationMemberships.personId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.active, true),
          ),
        ),
      loadVenues(organizationId),
      loadEvents({ includeUnlistedPickups: true }).then((rows) =>
        rows
          .filter((row) => row.organizationId === organizationId)
          .map((row) => row.event),
      ),
      database
        .select({
          status: orders.status,
          totalMinor: orders.totalMinor,
          currency: orders.currency,
        })
        .from(orders)
        .where(eq(orders.organizationId, organizationId)),
      loadAudit(organizationId),
    ]);

  const peopleForOrganization = await loadPeople([
    ...new Set(membershipRows.map((row) => row.personId)),
  ]);
  const paidOrders = orderRows.filter((row) =>
    ["paid", "partially-refunded"].includes(row.status),
  );
  const grossVolumeMinor = paidOrders.reduce(
    (total, order) => total + order.totalMinor,
    0,
  );
  const currencyCode =
    orderRows.find((order) => order.currency)?.currency ?? "USD";
  const upcomingEvents = scopedEvents.filter(
    (event) =>
      new Date(event.endsAt).getTime() >= Date.now() &&
      event.lifecycleStatus !== "cancelled",
  ).length;
  const activeCourts = organizationVenues.reduce(
    (total, venue) => total + venue.courtCount,
    0,
  );

  return {
    organization,
    canManageCommission: false,
    metrics: [
      {
        label: "Gross volume",
        value: formatUsd(grossVolumeMinor),
        change: `${paidOrders.length} paid orders`,
      },
      {
        label: "People",
        value: String(organization.memberCount),
        change: `${organization.staffCount} staff`,
      },
      {
        label: "Venues + courts",
        value: `${organization.venueCount} / ${activeCourts}`,
        change: "Connected inventory",
      },
      {
        label: "Upcoming activity",
        value: String(upcomingEvents),
        change: `${scopedEvents.length} total events`,
      },
    ],
    people: peopleForOrganization,
    venues: organizationVenues,
    events: scopedEvents,
    audit,
    billing: {
      configuredPlan: commission.configuredPlan,
      effectivePlan: commission.effectivePlan,
      subscriptionStatus: commission.subscriptionStatus,
      interval:
        organizationRecord.planBillingInterval === "month" ||
        organizationRecord.planBillingInterval === "year"
          ? organizationRecord.planBillingInterval
          : undefined,
      currentPeriodEndsAt:
        organizationRecord.planCurrentPeriodEndsAt?.toISOString(),
      cancelAtPeriodEnd: organizationRecord.planCancelAtPeriodEnd,
      commission,
    },
    commerce: {
      paidOrders: paidOrders.length,
      pendingOrders: orderRows.filter((row) => row.status === "pending").length,
      refundedOrders: orderRows.filter((row) =>
        ["partially-refunded", "refunded"].includes(row.status),
      ).length,
      grossVolumeMinor,
      currency: currencyCode,
    },
  };
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
  if (status === "invited" || status === "pending" || status === "held")
    return "needs-action";
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
        sessionId: sessions.id,
        sessionSlug: sessions.slug,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        status: registrations.status,
        programKind: programs.kind,
        eventTypeKind: eventTypes.kind,
        venueName: venues.name,
        orderTotalMinor: orders.totalMinor,
        orderCurrency: orders.currency,
        orderStatus: orders.status,
        cancellationPolicy: eventTypes.cancellationPolicy,
        teamClaimToken: teamEntries.claimToken,
        teamExpectedSize: teamEntries.expectedTeamSize,
        teamPaymentMode: teamEntries.paymentMode,
        teamStatus: teamEntries.status,
        teamRoster: teamEntries.roster,
      })
      .from(registrations)
      .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .leftJoin(orders, eq(registrations.orderId, orders.id))
      .leftJoin(teamEntries, eq(teamEntries.registrationId, registrations.id))
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
        pickupSessionId: pickupSessions.id,
        title: pickupSessions.title,
        startsAt: pickupSessions.startsAt,
        endsAt: pickupSessions.endsAt,
        status: pickupParticipants.status,
        venueName: pickupSessions.venueLabel,
        connectedVenueName: venues.name,
        orderId: pickupParticipants.orderId,
        addedByPersonId: pickupParticipants.addedByPersonId,
        paidByPersonId: pickupParticipants.paidByPersonId,
        capacity: pickupSessions.capacity,
        costMinor: pickupSessions.costMinor,
        currency: pickupSessions.currency,
        hostPersonId: pickupSessions.hostPersonId,
        approvalRequired: pickupSessions.approvalRequired,
        note: pickupSessions.note,
        smartRules: pickupSessions.smartRules,
        visibility: pickupSessions.visibility,
        orderTotalMinor: orders.totalMinor,
        orderCurrency: orders.currency,
        orderStatus: orders.status,
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
            "invited",
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
        orderStatus: orders.status,
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
  const registrationSessionIds = [
    ...new Set(registrationRows.map((row) => row.sessionId)),
  ];
  const pickupSessionIds = [
    ...new Set(pickupRows.map((row) => row.pickupSessionId)),
  ];
  const pickupAttributionIds = [
    ...new Set(
      pickupRows.flatMap((row) =>
        [row.addedByPersonId, row.paidByPersonId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  ];
  const [
    registrationParticipantRows,
    pickupParticipantRows,
    pickupAttributionPeople,
  ] = await Promise.all([
    registrationSessionIds.length
      ? database
          .select({
            sessionId: registrations.sessionId,
            displayName: people.displayName,
          })
          .from(registrations)
          .innerJoin(people, eq(registrations.personId, people.id))
          .where(
            and(
              inArray(registrations.sessionId, registrationSessionIds),
              inArray(registrations.status, ["confirmed", "checked-in"]),
            ),
          )
      : Promise.resolve([]),
    pickupSessionIds.length
      ? database
          .select({
            pickupSessionId: pickupParticipants.pickupSessionId,
            orderId: pickupParticipants.orderId,
            displayName: people.displayName,
            holdExpiresAt: pickupParticipants.holdExpiresAt,
            status: pickupParticipants.status,
          })
          .from(pickupParticipants)
          .innerJoin(people, eq(pickupParticipants.personId, people.id))
          .where(
            and(
              inArray(pickupParticipants.pickupSessionId, pickupSessionIds),
              inArray(pickupParticipants.status, [
                "invited",
                "pending",
                "confirmed",
                "checked-in",
                "waitlisted",
              ]),
            ),
          )
      : Promise.resolve([]),
    loadPeople(pickupAttributionIds),
  ]);
  const registrationNamesBySession = new Map<string, string[]>();
  for (const row of registrationParticipantRows) {
    registrationNamesBySession.set(row.sessionId, [
      ...(registrationNamesBySession.get(row.sessionId) ?? []),
      row.displayName,
    ]);
  }
  const pickupNamesBySession = new Map<string, string[]>();
  const pickupCountByOrder = new Map<string, number>();
  const pickupOccupiedBySession = new Map<string, number>();
  for (const row of pickupParticipantRows) {
    if (["confirmed", "checked-in"].includes(row.status)) {
      pickupNamesBySession.set(row.pickupSessionId, [
        ...(pickupNamesBySession.get(row.pickupSessionId) ?? []),
        row.displayName,
      ]);
    }
    if (
      ["confirmed", "checked-in"].includes(row.status) ||
      (row.status === "pending" &&
        Boolean(row.holdExpiresAt && row.holdExpiresAt > now))
    ) {
      pickupOccupiedBySession.set(
        row.pickupSessionId,
        (pickupOccupiedBySession.get(row.pickupSessionId) ?? 0) + 1,
      );
    }
    if (row.orderId && ["confirmed", "checked-in"].includes(row.status)) {
      pickupCountByOrder.set(
        row.orderId,
        (pickupCountByOrder.get(row.orderId) ?? 0) + 1,
      );
    }
  }
  const pickupAttributionById = new Map(
    pickupAttributionPeople.map((attribution) => [
      attribution.id,
      attribution.displayName,
    ]),
  );
  const bookings: BookingSummary[] = [
    ...registrationRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          source: "registration",
          sessionId: row.sessionId,
          sessionSlug: row.sessionSlug,
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
          participantNames: registrationNamesBySession.get(row.sessionId) ?? [
            person.displayName,
          ],
          paymentStatus:
            (row.orderTotalMinor ?? 0) === 0
              ? "free"
              : row.orderStatus === "paid" ||
                  row.orderStatus === "partially-refunded"
                ? "paid"
                : row.orderStatus === "refunded"
                  ? "refunded"
                  : "payment-required",
          canEdit: row.startsAt.getTime() > now.getTime(),
          canCancel: row.startsAt.getTime() > now.getTime(),
          cancellationDeadline: row.startsAt.toISOString(),
          ...(row.teamClaimToken &&
          row.teamExpectedSize &&
          (row.teamPaymentMode === "self" || row.teamPaymentMode === "team") &&
          (row.teamStatus === "assembling" ||
            row.teamStatus === "ready" ||
            row.teamStatus === "confirmed" ||
            row.teamStatus === "cancelled" ||
            row.teamStatus === "expired")
            ? {
                team: {
                  claimToken: row.teamClaimToken,
                  expectedTeamSize: row.teamExpectedSize,
                  paymentMode: row.teamPaymentMode,
                  status: row.teamStatus,
                  roster: [
                    {
                      personId: person.id,
                      displayName: person.displayName,
                      status: "captain" as const,
                      paid:
                        row.orderStatus === "paid" ||
                        row.orderStatus === "partially-refunded",
                      editable: false,
                    },
                    ...(row.teamRoster ?? []).map((member) => ({
                      ...(member.personId ? { personId: member.personId } : {}),
                      ...(member.inviteTarget
                        ? { inviteTarget: member.inviteTarget }
                        : {}),
                      displayName:
                        member.displayName ??
                        member.inviteTarget ??
                        "Invited teammate",
                      status: member.status,
                      paid:
                        row.teamPaymentMode === "team" ||
                        Boolean(member.paidAt),
                      editable:
                        row.teamPaymentMode === "team" || !member.paidAt,
                    })),
                  ],
                },
              }
            : {}),
        },
      ];
    }),
    ...pickupRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      const pairedSpotCount = row.orderId
        ? pickupCountByOrder.get(row.orderId)
        : undefined;
      const paidByAnotherPlayer = Boolean(
        row.paidByPersonId && row.paidByPersonId !== personId,
      );
      const occupiedCount =
        pickupOccupiedBySession.get(row.pickupSessionId) ?? 0;
      const spotsRemaining = Math.max(0, row.capacity - occupiedCount);
      const isCreator = row.hostPersonId === personId;
      const waitlistEnabled = row.smartRules.waitlistEnabled;
      return [
        {
          id: row.id,
          source: "pickup",
          sessionId: row.pickupSessionId,
          sessionSlug: `pickup-${row.pickupSessionId}`,
          title: row.title,
          kind: "pickup",
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          venueName:
            row.connectedVenueName ?? row.venueName ?? "Community location",
          status,
          amount: {
            amountMinor:
              row.orderTotalMinor ??
              (row.status === "invited" ? row.costMinor : 0),
            currency: currency(row.orderCurrency ?? row.currency ?? "USD"),
          },
          participantNames: pickupNamesBySession.get(row.pickupSessionId) ?? [
            person.displayName,
          ],
          paymentStatus:
            row.status === "invited" && row.costMinor > 0
              ? "payment-required"
              : (row.orderTotalMinor ?? row.costMinor) === 0
                ? "free"
                : row.orderStatus === "paid" ||
                    row.orderStatus === "partially-refunded"
                  ? "paid"
                  : row.orderStatus === "refunded"
                    ? "refunded"
                    : "payment-required",
          canEdit: isCreator && row.startsAt.getTime() > now.getTime(),
          canCancel:
            row.startsAt.getTime() > now.getTime() && !paidByAnotherPlayer,
          cancellationDeadline: row.startsAt.toISOString(),
          pickup: {
            capacity: row.capacity,
            confirmedCount: (
              pickupNamesBySession.get(row.pickupSessionId) ?? []
            ).length,
            spotsRemaining,
            waitlistEnabled,
            approvalRequired: row.approvalRequired,
            visibility: row.visibility === "unlisted" ? "unlisted" : "public",
            ...(row.note ? { note: row.note } : {}),
            pricePerPerson: {
              amountMinor: row.costMinor,
              currency: currency(row.currency),
            },
            canAddPlayers:
              row.startsAt.getTime() > now.getTime() &&
              (isCreator || ["confirmed", "checked-in"].includes(row.status)) &&
              (spotsRemaining > 0 || waitlistEnabled),
            isCreator,
            ...(row.status === "invited"
              ? { invitationStatus: "invited" as const }
              : {}),
          },
          ...(row.addedByPersonId &&
          pickupAttributionById.has(row.addedByPersonId)
            ? {
                addedBy: {
                  personId: row.addedByPersonId,
                  displayName: pickupAttributionById.get(row.addedByPersonId)!,
                },
              }
            : {}),
          ...(row.paidByPersonId &&
          pickupAttributionById.has(row.paidByPersonId)
            ? {
                paidBy: {
                  personId: row.paidByPersonId,
                  displayName: pickupAttributionById.get(row.paidByPersonId)!,
                },
              }
            : {}),
          ...(pairedSpotCount && pairedSpotCount > 1
            ? {
                pairedSpotCount,
              }
            : {}),
        },
      ];
    }),
    ...courtRows.flatMap((row): BookingSummary[] => {
      const status = connectedBookingStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          source: "court",
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
          paymentStatus:
            (row.orderTotalMinor ?? 0) === 0
              ? "free"
              : row.orderStatus === "paid" ||
                  row.orderStatus === "partially-refunded"
                ? "paid"
                : row.orderStatus === "refunded"
                  ? "refunded"
                  : "payment-required",
          canEdit: row.startsAt.getTime() > now.getTime(),
          canCancel: row.startsAt.getTime() > now.getTime(),
          cancellationDeadline: row.startsAt.toISOString(),
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
  const participantPersonIds = [
    ...new Set(
      input.participantPersonIds.filter(
        (personId) => personId !== input.hostPersonId,
      ),
    ),
  ];
  if (
    participantPersonIds.length !== input.participantPersonIds.length ||
    participantPersonIds.length + 1 > input.capacity
  ) {
    throw new Error(
      "Added players must be distinct and fit within the hosted match.",
    );
  }
  const eligibleParticipants = participantPersonIds.length
    ? await database
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            inArray(people.id, participantPersonIds),
            eq(people.status, "active"),
            eq(people.profileVisibility, "public"),
            eq(people.isMinor, false),
          ),
        )
    : [];
  if (eligibleParticipants.length !== participantPersonIds.length) {
    throw new Error(
      "Every added player must have an active adult Duna profile.",
    );
  }
  const participantProfiles = await loadPeople([
    input.hostPersonId,
    ...participantPersonIds,
  ]);
  const linkedCourtBooking = input.courtBookingId
    ? await database.query.courtBookings.findFirst({
        where: and(
          eq(courtBookings.id, input.courtBookingId),
          eq(courtBookings.personId, input.hostPersonId),
          eq(courtBookings.status, "confirmed"),
        ),
      })
    : undefined;
  if (input.courtBookingId && !linkedCourtBooking) {
    throw new Error(
      "Choose a confirmed court reservation that belongs to your Duna account.",
    );
  }
  const matchingVenue = await database.query.venues.findFirst({
    where: linkedCourtBooking
      ? eq(venues.id, linkedCourtBooking.venueId)
      : input.venueId
        ? eq(venues.id, input.venueId)
        : input.organizationId
          ? and(
              eq(venues.organizationId, input.organizationId),
              eq(venues.name, input.venueName),
            )
          : eq(venues.name, input.venueName),
  });
  const pickupId = crypto.randomUUID();
  const startsAt = linkedCourtBooking?.startsAt ?? new Date(input.startsAt);
  const endsAt = linkedCourtBooking?.endsAt ?? new Date(input.endsAt);
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
      "Paid pickup requires an organization with payments enabled so Duna never holds host funds.",
    );
  }
  await database.batch([
    database.insert(pickupSessions).values({
      id: pickupId,
      hostPersonId: input.hostPersonId,
      organizationId,
      venueId: matchingVenue?.id,
      courtBookingId: linkedCourtBooking?.id,
      venueLabel: matchingVenue?.name ?? input.venueName,
      address:
        input.address ??
        ([
          matchingVenue?.addressLine1,
          matchingVenue?.addressLine2,
          matchingVenue?.locality,
          matchingVenue?.administrativeArea,
          matchingVenue?.postalCode,
          matchingVenue?.countryCode,
        ]
          .filter(Boolean)
          .join(", ") ||
          undefined),
      googlePlaceId: input.googlePlaceId ?? matchingVenue?.googlePlaceId,
      latitude: input.latitude ?? matchingVenue?.latitude,
      longitude: input.longitude ?? matchingVenue?.longitude,
      locationConfidence:
        input.googlePlaceId || matchingVenue?.googlePlaceId
          ? "confirmed"
          : (input.locationConfidence ?? "approximate"),
      title: input.title,
      matchType: input.matchType,
      genderPreference: input.genderPreference,
      format: input.format,
      note: input.note,
      recordMatches: input.recordMatches,
      startsAt,
      endsAt,
      capacity: input.capacity,
      ratingMinimum: input.ratingMinimum,
      ratingMaximum: input.ratingMaximum,
      visibility: input.visibility,
      approvalRequired: input.approvalRequired,
      smartRules: input.smartRules,
      costMinor: input.costMinor,
      currency: input.currency,
    }),
    database.insert(pickupParticipants).values([
      {
        pickupSessionId: pickupId,
        personId: input.hostPersonId,
        status: "confirmed",
      },
      ...participantPersonIds.map((personId) => ({
        pickupSessionId: pickupId,
        personId,
        addedByPersonId: input.hostPersonId,
        status: "invited" as const,
      })),
    ]),
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
    venueName: matchingVenue?.name ?? input.venueName,
    description: input.note,
    format: input.format,
    recordMatches: input.recordMatches,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: matchingVenue?.timezone ?? "America/New_York",
    price: { amountMinor: input.costMinor, currency: input.currency },
    spotsRemaining: Math.max(0, input.capacity - 1),
    capacity: input.capacity,
    attendees: participantProfiles
      .filter((participant) => participant.id === input.hostPersonId)
      .map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        handle: participant.handle,
        publicPath: participant.publicPath,
        initials: participant.initials,
        avatarUrl: participant.avatarUrl,
        homeMarket: participant.homeMarket,
        ratingDisplay: participant.rating.display,
      })),
    ratingRange:
      input.ratingMinimum !== undefined && input.ratingMaximum !== undefined
        ? [input.ratingMinimum, input.ratingMaximum]
        : undefined,
    tags: [
      "Pickup",
      input.matchType === "competitive" ? "Competitive" : "Casual",
      input.genderPreference === "open"
        ? "All players"
        : input.genderPreference,
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
            label: "Payments",
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
        sessionRows,
        policyAcceptanceRows,
        pendingTicketRows,
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
        database.select({ status: sessions.status }).from(sessions),
        database
          .select({ id: eventPolicyAcceptances.id })
          .from(eventPolicyAcceptances),
        database
          .select({ id: tickets.id })
          .from(tickets)
          .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
          .innerJoin(orders, eq(tickets.orderId, orders.id))
          .where(
            and(
              eq(tickets.status, "held"),
              eq(ticketTypes.approvalRequired, true),
              eq(orders.status, "paid"),
            ),
          ),
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
        {
          label: "Live event inventory",
          value: String(
            sessionRows.filter((session) =>
              publicSessionStatuses.includes(
                session.status as (typeof publicSessionStatuses)[number],
              ),
            ).length,
          ),
        },
        {
          label: "Ticket approvals",
          value: String(pendingTicketRows.length),
          tone: pendingTicketRows.length > 0 ? "warning" : "positive",
          change: `${policyAcceptanceRows.length} policy records`,
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
            service: "Payment webhooks",
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
            service: "Event safeguards",
            status: pendingTicketRows.length > 0 ? "attention" : "configured",
            detail:
              pendingTicketRows.length > 0
                ? `${pendingTicketRows.length} paid tickets await host approval`
                : `${policyAcceptanceRows.length} exact policy acceptances recorded`,
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
    organization: loadAdminOrganization,
    players: searchAdminPlayers,
    queues: loadAdminQueues,
    audit: loadAudit,
  },
} satisfies DunaRepository;
