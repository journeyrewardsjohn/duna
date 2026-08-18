import {
  auditLog,
  brackets,
  courts,
  demoDataRecords,
  demoDataSets,
  divisions,
  eventBlueprints,
  eventTypes,
  getDatabase,
  getTransactionalDatabase,
  matches,
  organizations,
  people,
  programs,
  registrations,
  sessions,
  teamEntries,
  teamMembers,
  teams,
  venues,
  waitlistEntries,
} from "@duna/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";

export const BEACH_ELITE_DEMO_DATA_KEY = "beach-elite-academy.live-demo";

const beachEliteNames = new Set(["beach elite academy", "demo"]);
const beachEliteSlugs = new Set(["beach-elite-academy", "demo"]);

type DemoEntityType =
  | "person"
  | "venue"
  | "court"
  | "program"
  | "event-type"
  | "session"
  | "event-blueprint"
  | "division"
  | "registration"
  | "waitlist-entry"
  | "team"
  | "team-entry"
  | "bracket"
  | "match";

export class DemoDataError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "SUPER_ADMIN_REQUIRED"
      | "BEACH_ELITE_ACCOUNT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "DemoDataError";
  }
}

export interface DemoDataControlResult {
  readonly target?: {
    readonly id: string;
    readonly name: string;
  };
  readonly enabled: boolean;
  readonly recordCount: number;
  readonly updatedAt?: string;
  readonly canManage: boolean;
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new DemoDataError(
      "DATABASE_REQUIRED",
      "Demo data controls require the connected Duna database.",
    );
  }
}

function requireSuperAdmin(actor: ApiActor): void {
  if (!actor.roles.includes("super-admin")) {
    throw new DemoDataError(
      "SUPER_ADMIN_REQUIRED",
      "Only a verified Duna super administrator can change demo data.",
    );
  }
}

export function isBeachEliteDemoOrganization(input: {
  readonly name: string;
  readonly slug: string;
}): boolean {
  return (
    beachEliteNames.has(input.name.trim().toLowerCase()) ||
    beachEliteSlugs.has(input.slug.trim().toLowerCase())
  );
}

async function loadTarget() {
  const database = getDatabase();
  const rows = await database
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .orderBy(asc(organizations.name));
  return rows.find(isBeachEliteDemoOrganization);
}

async function loadControl(actor: ApiActor): Promise<DemoDataControlResult> {
  if (!process.env.DATABASE_URL) {
    return {
      enabled: false,
      recordCount: 0,
      canManage: actor.roles.includes("super-admin"),
    };
  }
  const target = await loadTarget();
  if (!target) {
    return {
      enabled: false,
      recordCount: 0,
      canManage: actor.roles.includes("super-admin"),
    };
  }
  const database = getDatabase();
  const [dataSet] = await database
    .select({
      id: demoDataSets.id,
      enabled: demoDataSets.enabled,
      updatedAt: demoDataSets.updatedAt,
    })
    .from(demoDataSets)
    .where(
      and(
        eq(demoDataSets.organizationId, target.id),
        eq(demoDataSets.key, BEACH_ELITE_DEMO_DATA_KEY),
      ),
    )
    .limit(1);
  const recordCount = dataSet
    ? await database
        .select({ id: demoDataRecords.id })
        .from(demoDataRecords)
        .where(eq(demoDataRecords.dataSetId, dataSet.id))
        .then((rows) => rows.length)
    : 0;
  return {
    target: { id: target.id, name: target.name },
    enabled: dataSet?.enabled ?? false,
    recordCount,
    updatedAt: dataSet?.updatedAt.toISOString(),
    canManage: actor.roles.includes("super-admin"),
  };
}

export async function loadBeachEliteDemoDataControl(
  actor: ApiActor,
): Promise<DemoDataControlResult> {
  return loadControl(actor);
}

function demoPlayer(index: number) {
  const firstNames = [
    "Avery",
    "Blake",
    "Cameron",
    "Drew",
    "Emerson",
    "Finley",
    "Gray",
    "Harper",
    "Indigo",
    "Jordan",
    "Kai",
    "Logan",
    "Morgan",
    "Noel",
    "Parker",
    "Quinn",
    "Reese",
    "Sawyer",
    "Taylor",
    "Val",
  ];
  const lastNames = [
    "Adams",
    "Bennett",
    "Carter",
    "Diaz",
    "Ellis",
    "Foster",
    "Garcia",
    "Hayes",
    "Irwin",
    "James",
    "Kim",
    "Lopez",
    "Mitchell",
    "Nguyen",
    "Owens",
    "Patel",
    "Quincy",
    "Reed",
    "Santos",
    "Turner",
  ];
  const givenName = firstNames[index % firstNames.length]!;
  const familyName = lastNames[Math.floor(index / firstNames.length)]!;
  const number = String(index + 1).padStart(3, "0");
  return {
    id: crypto.randomUUID(),
    givenName,
    familyName,
    displayName: `${givenName} ${familyName} (Demo)`,
    handle: `bea-demo-${number}`,
    email: `bea-demo-${number}@example.invalid`,
    homeMarket: "Beach Elite Academy Demo",
    profileVisibility: "public" as const,
    profileClaimStatus: "unclaimed" as const,
    ageBand: "adult" as const,
  };
}

function demoSessions(now: Date) {
  const hour = 60 * 60 * 1_000;
  const day = 24 * hour;
  return [
    {
      title: "Demo — Beach Elite Academy Championship Weekend",
      slug: "demo-beach-elite-championship-weekend",
      kind: "tournament" as const,
      status: "registration-open" as const,
      startsAt: new Date(now.getTime() + 21 * day),
      endsAt: new Date(now.getTime() + 23 * day),
      venueIndex: 0,
      divisions: [
        "Girls 12U",
        "Girls 14U",
        "Girls 16U",
        "Girls 18U",
        "Boys 16U",
        "Open AA",
      ],
      teamsPerDivision: 10,
      waitlistedPerDivision: 2,
      phase: "registration",
    },
    {
      title: "Demo — Carolina Sand League: Week 6",
      slug: "demo-carolina-sand-league-week-6",
      kind: "league" as const,
      status: "live" as const,
      startsAt: new Date(now.getTime() - 90 * 60 * 1_000),
      endsAt: new Date(now.getTime() + 4 * hour),
      venueIndex: 0,
      divisions: ["Girls 14U Premier", "Girls 16U Premier", "Boys 16U"],
      teamsPerDivision: 8,
      waitlistedPerDivision: 0,
      phase: "pool-play",
    },
    {
      title: "Demo — South Carolina Sand Series Finals",
      slug: "demo-south-carolina-sand-series-finals",
      kind: "league" as const,
      status: "completed" as const,
      startsAt: new Date(now.getTime() - 12 * day),
      endsAt: new Date(now.getTime() - 11 * day),
      venueIndex: 1,
      divisions: ["Girls 15U", "Girls 17U", "Open Club"],
      teamsPerDivision: 8,
      waitlistedPerDivision: 0,
      phase: "tournament",
    },
    {
      title: "Demo — Georgia Fall Sand League: Opening Week",
      slug: "demo-georgia-fall-sand-league-opening-week",
      kind: "league" as const,
      status: "registration-open" as const,
      startsAt: new Date(now.getTime() + 35 * day),
      endsAt: new Date(now.getTime() + 36 * day),
      venueIndex: 2,
      divisions: ["Girls 14U", "Girls 16U", "Girls 18U", "Open Club"],
      teamsPerDivision: 6,
      waitlistedPerDivision: 0,
      phase: "registration",
    },
    {
      title: "Demo — Florida Winter League Championship",
      slug: "demo-florida-winter-league-championship",
      kind: "league" as const,
      status: "completed" as const,
      startsAt: new Date(now.getTime() - 42 * day),
      endsAt: new Date(now.getTime() - 41 * day),
      venueIndex: 3,
      divisions: ["Girls 13U", "Girls 15U", "Girls 17U"],
      teamsPerDivision: 8,
      waitlistedPerDivision: 0,
      phase: "tournament",
    },
  ] as const;
}

export async function setBeachEliteDemoData(input: {
  readonly actor: ApiActor;
  readonly enabled: boolean;
  readonly reason: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<DemoDataControlResult> {
  requireSuperAdmin(input.actor);
  requireDatabase();
  const target = await loadTarget();
  if (!target) {
    throw new DemoDataError(
      "BEACH_ELITE_ACCOUNT_NOT_FOUND",
      "Beach Elite Academy (Demo) is not available in the connected database.",
    );
  }
  const database = getTransactionalDatabase();
  await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(demoDataSets)
      .where(
        and(
          eq(demoDataSets.organizationId, target.id),
          eq(demoDataSets.key, BEACH_ELITE_DEMO_DATA_KEY),
        ),
      )
      .limit(1);
    const dataSetId = existing?.id ?? crypto.randomUUID();
    const trackedRows = existing
      ? await transaction
          .select({
            entityType: demoDataRecords.entityType,
            entityId: demoDataRecords.entityId,
          })
          .from(demoDataRecords)
          .where(eq(demoDataRecords.dataSetId, dataSetId))
      : [];
    if (!existing) {
      await transaction.insert(demoDataSets).values({
        id: dataSetId,
        organizationId: target.id,
        key: BEACH_ELITE_DEMO_DATA_KEY,
        label: "Beach Elite Academy live Demo data",
        enabled: input.enabled,
        createdByPersonId: input.actor.personId,
        updatedByPersonId: input.actor.personId,
        enabledAt: input.enabled ? input.now : undefined,
        disabledAt: input.enabled ? undefined : input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
    }

    if (input.enabled && (!existing?.enabled || trackedRows.length === 0)) {
      const record = async (entityType: DemoEntityType, entityId: string) => {
        await transaction.insert(demoDataRecords).values({
          id: crypto.randomUUID(),
          dataSetId,
          entityType,
          entityId,
          createdAt: input.now,
        });
      };
      const demoVenues = [
        {
          name: "Demo — Beach Elite Academy Charlotte",
          slug: "demo-bea-charlotte",
          locality: "Charlotte",
          administrativeArea: "NC",
        },
        {
          name: "Demo — Beach Elite Academy Myrtle Beach",
          slug: "demo-bea-myrtle-beach",
          locality: "Myrtle Beach",
          administrativeArea: "SC",
        },
        {
          name: "Demo — Beach Elite Academy Atlanta",
          slug: "demo-bea-atlanta",
          locality: "Atlanta",
          administrativeArea: "GA",
        },
        {
          name: "Demo — Beach Elite Academy Tampa",
          slug: "demo-bea-tampa",
          locality: "Tampa",
          administrativeArea: "FL",
        },
      ].map((venue) => ({ ...venue, id: crypto.randomUUID() }));
      const players = Array.from({ length: 120 }, (_, index) =>
        demoPlayer(index),
      );
      await transaction.insert(people).values(players);
      for (const player of players) await record("person", player.id);
      await transaction.insert(venues).values(
        demoVenues.map((venue) => ({
          ...venue,
          organizationId: target.id,
          description: "Demo venue created for Beach Elite Academy QA.",
          status: "active" as const,
          capacity: 120,
          timezone: "America/New_York",
          countryCode: "US",
          createdAt: input.now,
          updatedAt: input.now,
        })),
      );
      for (const venue of demoVenues) {
        await record("venue", venue.id);
        const courtId = crypto.randomUUID();
        await transaction.insert(courts).values({
          id: courtId,
          venueId: venue.id,
          name: "Demo Stadium Court",
          status: "active",
          surface: "sand",
          capacity: 12,
          qrToken: `demo-${venue.slug}`,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await record("court", courtId);
      }

      let playerCursor = 0;
      for (const definition of demoSessions(input.now)) {
        const programId = crypto.randomUUID();
        const eventTypeId = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        const venue = demoVenues[definition.venueIndex]!;
        await transaction.insert(programs).values({
          id: programId,
          organizationId: target.id,
          slug: definition.slug,
          title: definition.title,
          description: "Clearly labelled live Demo data for end-to-end QA.",
          kind: definition.kind,
          status: definition.status,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await transaction.insert(eventTypes).values({
          id: eventTypeId,
          organizationId: target.id,
          title: definition.title,
          kind: definition.kind,
          durationMinutes: Math.round(
            (definition.endsAt.getTime() - definition.startsAt.getTime()) /
              60_000,
          ),
          capacity:
            definition.divisions.length * definition.teamsPerDivision * 2,
          minimumCapacity: 8,
          priceMinor: 8_500,
          currency: "USD",
          createdAt: input.now,
          updatedAt: input.now,
        });
        await transaction.insert(sessions).values({
          id: sessionId,
          programId,
          eventTypeId,
          venueId: venue.id,
          title: definition.title,
          slug: definition.slug,
          startsAt: definition.startsAt,
          endsAt: definition.endsAt,
          timezone: "America/New_York",
          status: definition.status,
          capacity:
            definition.divisions.length * definition.teamsPerDivision * 2,
          minimumCapacity: 8,
          publishedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await transaction.insert(eventBlueprints).values({
          sessionId,
          shortSummary:
            "Demo data — teams, divisions, pool play, brackets, and waitlists are safe to remove together.",
          description: `${definition.title} is generated Demo data for Beach Elite Academy QA.`,
          location: { mode: "venue", venueName: venue.name, demo: true },
          registrationSettings: { waitlistEnabled: true, demo: true },
          createdAt: input.now,
          updatedAt: input.now,
        });
        await record("program", programId);
        await record("event-type", eventTypeId);
        await record("session", sessionId);
        await record("event-blueprint", sessionId);

        for (const [
          divisionIndex,
          divisionName,
        ] of definition.divisions.entries()) {
          const divisionId = crypto.randomUUID();
          await transaction.insert(divisions).values({
            id: divisionId,
            sessionId,
            name: `${divisionName} — Demo`,
            description: `Demo ${definition.phase} division.`,
            discipline: "beach-2s",
            ratingBasis: "anti-sandbag",
            capacity: definition.teamsPerDivision,
            minimumTeams: 4,
            maximumTeams: definition.teamsPerDivision,
            teamSize: 2,
            priceBasis: "per-team",
            settings: {
              teamFormat: "doubles",
              surface: "sand",
              gender: "open",
              tournamentFormat:
                definition.phase === "tournament"
                  ? "single-elimination"
                  : undefined,
              poolPlay:
                definition.phase === "registration"
                  ? undefined
                  : {
                      enabled: true,
                      teamsPerPool: 4,
                      format: "full",
                      teamsAdvancing: 4,
                    },
              demo: true,
            },
            entryFeeMinor: 8_500,
            currency: "USD",
            createdAt: input.now,
            updatedAt: input.now,
          });
          await record("division", divisionId);
          const divisionTeams: string[] = [];
          for (
            let teamIndex = 0;
            teamIndex <
            definition.teamsPerDivision + definition.waitlistedPerDivision;
            teamIndex += 1
          ) {
            const captain = players[playerCursor % players.length]!;
            const partner = players[(playerCursor + 1) % players.length]!;
            playerCursor += 2;
            const waiting = teamIndex >= definition.teamsPerDivision;
            const teamId = crypto.randomUUID();
            const registrationId = crypto.randomUUID();
            const teamEntryId = crypto.randomUUID();
            await transaction.insert(registrations).values({
              id: registrationId,
              sessionId,
              divisionId,
              personId: captain.id,
              status: waiting ? "waitlisted" : "confirmed",
              eligibilityDecision: { eligible: true, source: "demo-data" },
              createdAt: input.now,
              updatedAt: input.now,
            });
            await transaction.insert(teams).values({
              id: teamId,
              divisionId,
              name: `Demo ${divisionIndex + 1}-${teamIndex + 1}: ${captain.familyName}/${partner.familyName}`,
              seed: teamIndex + 1,
              status: waiting ? "waitlisted" : "active",
              createdAt: input.now,
              updatedAt: input.now,
            });
            await transaction.insert(teamMembers).values([
              {
                teamId,
                personId: captain.id,
                role: "player",
                joinedAt: input.now,
              },
              {
                teamId,
                personId: partner.id,
                role: "player",
                joinedAt: input.now,
              },
            ]);
            await transaction.insert(teamEntries).values({
              id: teamEntryId,
              registrationId,
              teamId,
              payingPersonId: captain.id,
              partnerPersonId: partner.id,
              expectedTeamSize: 2,
              paymentMode: "team",
              roster: [
                {
                  personId: captain.id,
                  displayName: captain.displayName,
                  status: "claimed",
                },
                {
                  personId: partner.id,
                  displayName: partner.displayName,
                  status: "claimed",
                },
              ],
              status: waiting ? "ready" : "confirmed",
              claimToken: crypto.randomUUID(),
              claimExpiresAt: new Date(
                input.now.getTime() + 30 * 24 * 60 * 60 * 1_000,
              ),
              claimedAt: input.now,
              rosterLockedAt: input.now,
              seed: teamIndex + 1,
              selectionStatus: waiting ? "waitlisted" : "confirmed",
              selectionReason: waiting
                ? "Demo waitlist"
                : "Demo confirmed field",
              selectionLocked: !waiting,
              selectedAt: waiting ? undefined : input.now,
              createdAt: input.now,
              updatedAt: input.now,
            });
            await record("registration", registrationId);
            await record("team", teamId);
            await record("team-entry", teamEntryId);
            if (waiting) {
              const waitlistId = crypto.randomUUID();
              await transaction.insert(waitlistEntries).values({
                id: waitlistId,
                sessionId,
                personId: captain.id,
                position: teamIndex - definition.teamsPerDivision + 1,
                status: "waiting",
                createdAt: input.now,
                updatedAt: input.now,
              });
              await record("waitlist-entry", waitlistId);
            } else {
              divisionTeams.push(teamId);
            }
          }
          if (definition.phase !== "registration") {
            const bracketId = crypto.randomUUID();
            await transaction.insert(brackets).values({
              id: bracketId,
              divisionId,
              version: 1,
              format:
                definition.phase === "pool-play"
                  ? "pool-play"
                  : "single-elimination",
              structure: {
                demo: true,
                phase: definition.phase,
                teams: divisionTeams.map((id) => ({ id })),
              },
              liveAt: definition.status === "live" ? input.now : undefined,
              changeReason: "Demo data",
              createdAt: input.now,
            });
            await record("bracket", bracketId);
            for (
              let matchIndex = 0;
              matchIndex < Math.min(3, divisionTeams.length / 2);
              matchIndex += 1
            ) {
              const matchId = crypto.randomUUID();
              const isComplete =
                definition.status === "completed" || matchIndex === 0;
              await transaction.insert(matches).values({
                id: matchId,
                divisionId,
                bracketId,
                teamAId: divisionTeams[matchIndex * 2],
                teamBId: divisionTeams[matchIndex * 2 + 1],
                venueId: venue.id,
                status: isComplete ? "complete" : "live",
                scheduledAt: new Date(
                  definition.startsAt.getTime() + matchIndex * 45 * 60 * 1_000,
                ),
                startedAt: isComplete
                  ? new Date(
                      definition.startsAt.getTime() +
                        matchIndex * 45 * 60 * 1_000,
                    )
                  : input.now,
                completedAt: isComplete
                  ? new Date(
                      definition.startsAt.getTime() +
                        (matchIndex + 1) * 45 * 60 * 1_000,
                    )
                  : undefined,
                format: { bestOf: 3, pointsToWin: 21, demo: true },
                verification: "desk",
                winnerTeamId: isComplete
                  ? divisionTeams[matchIndex * 2]
                  : undefined,
                ratingEligible: false,
                createdAt: input.now,
                updatedAt: input.now,
              });
              await record("match", matchId);
            }
          }
        }
      }
      await transaction
        .update(demoDataSets)
        .set({
          enabled: true,
          enabledAt: input.now,
          disabledAt: null,
          updatedByPersonId: input.actor.personId,
          updatedAt: input.now,
        })
        .where(eq(demoDataSets.id, dataSetId));
    }

    if (!input.enabled && existing) {
      const idsFor = (entityType: DemoEntityType) =>
        trackedRows
          .filter((row) => row.entityType === entityType)
          .map((row) => row.entityId);
      const deleteWhereTracked = async (
        entityType: DemoEntityType,
        table:
          | typeof matches
          | typeof brackets
          | typeof teamEntries
          | typeof teamMembers
          | typeof teams
          | typeof waitlistEntries
          | typeof registrations
          | typeof eventBlueprints
          | typeof divisions
          | typeof sessions
          | typeof eventTypes
          | typeof programs
          | typeof courts
          | typeof venues
          | typeof people,
        column: { readonly name: string },
      ) => {
        const ids = idsFor(entityType);
        if (ids.length === 0) return;
        await transaction.delete(table).where(inArray(column as never, ids));
      };
      await deleteWhereTracked("match", matches, matches.id);
      await deleteWhereTracked("bracket", brackets, brackets.id);
      await deleteWhereTracked("team-entry", teamEntries, teamEntries.id);
      const teamIds = idsFor("team");
      if (teamIds.length > 0)
        await transaction
          .delete(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds));
      await deleteWhereTracked("team", teams, teams.id);
      await deleteWhereTracked(
        "waitlist-entry",
        waitlistEntries,
        waitlistEntries.id,
      );
      await deleteWhereTracked("registration", registrations, registrations.id);
      await deleteWhereTracked(
        "event-blueprint",
        eventBlueprints,
        eventBlueprints.sessionId,
      );
      await deleteWhereTracked("division", divisions, divisions.id);
      await deleteWhereTracked("session", sessions, sessions.id);
      await deleteWhereTracked("event-type", eventTypes, eventTypes.id);
      await deleteWhereTracked("program", programs, programs.id);
      await deleteWhereTracked("court", courts, courts.id);
      await deleteWhereTracked("venue", venues, venues.id);
      await deleteWhereTracked("person", people, people.id);
      await transaction
        .delete(demoDataRecords)
        .where(eq(demoDataRecords.dataSetId, dataSetId));
      await transaction
        .update(demoDataSets)
        .set({
          enabled: false,
          disabledAt: input.now,
          updatedByPersonId: input.actor.personId,
          updatedAt: input.now,
        })
        .where(eq(demoDataSets.id, dataSetId));
    }

    await transaction.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: input.enabled ? "demo-data.enabled" : "demo-data.disabled",
      entityType: "demo-data-set",
      entityId: dataSetId,
      afterHash: stableHash({
        enabled: input.enabled,
        organizationId: target.id,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return loadControl(input.actor);
}
