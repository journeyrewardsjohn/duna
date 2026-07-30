import { loadEnvFile } from "node:process";
import { eq, inArray, or } from "drizzle-orm";
import { standardBeachFormat } from "../packages/league-engine/src";
import {
  auditLog,
  getDatabase,
  matches,
  organizations,
  people,
  rallyEvents,
  teamMembers,
  teams,
  venues,
} from "../packages/db/src";
import {
  appendOperatorMatchEvents,
  loadOperatorScorableMatches,
  MatchServiceError,
  scopesForRoles,
  startOperatorMatchScoring,
  type ApiActor,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const suffix = crypto.randomUUID();
  const now = new Date();
  const organizationIds = [crypto.randomUUID(), crypto.randomUUID()];
  const venueId = crypto.randomUUID();
  const personIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  const teamIds = [crypto.randomUUID(), crypto.randomUUID()];
  const matchId = crypto.randomUUID();
  const deviceId = `operator-device-${suffix}`;
  const actor = (organizationId: string): ApiActor => ({
    personId: personIds[0]!,
    displayName: "Operator Scoring Verification",
    roles: ["owner"],
    organizationId,
    scopes: scopesForRoles(["owner"]),
    ageBand: "adult",
    isDemo: false,
  });
  const primaryActor = actor(organizationIds[0]!);
  const crossTenantActor = actor(organizationIds[1]!);

  try {
    await database.insert(organizations).values([
      {
        id: organizationIds[0]!,
        slug: `operator-score-a-${suffix}`.slice(0, 64),
        name: "Operator Score Verification A",
      },
      {
        id: organizationIds[1]!,
        slug: `operator-score-b-${suffix}`.slice(0, 64),
        name: "Operator Score Verification B",
      },
    ]);
    await database.insert(people).values(
      personIds.map((id, index) => ({
        id,
        email: `operator-score-${index}-${suffix}@example.invalid`,
        displayName:
          index === 0
            ? "Operator Scoring Verification"
            : `Scoring Player ${index}`,
        handle: `operator-score-${index}-${suffix}`.slice(0, 48),
        ageBand: "adult" as const,
        isMinor: false,
        profileVisibility: "private",
      })),
    );
    await database.insert(venues).values({
      id: venueId,
      organizationId: organizationIds[0]!,
      slug: `operator-score-${suffix}`.slice(0, 64),
      name: "Verification Court",
      status: "active",
      timezone: "America/New_York",
    });
    await database.insert(teams).values([
      {
        id: teamIds[0]!,
        name: "Verification Team A",
        status: "active",
      },
      {
        id: teamIds[1]!,
        name: "Verification Team B",
        status: "active",
      },
    ]);
    await database.insert(teamMembers).values([
      { teamId: teamIds[0]!, personId: personIds[1]! },
      { teamId: teamIds[0]!, personId: personIds[2]! },
      { teamId: teamIds[1]!, personId: personIds[3]! },
      { teamId: teamIds[1]!, personId: personIds[4]! },
    ]);
    await database.insert(matches).values({
      id: matchId,
      teamAId: teamIds[0]!,
      teamBId: teamIds[1]!,
      venueId,
      status: "scheduled",
      scheduledAt: new Date(now.getTime() + 60_000),
      format: standardBeachFormat as unknown as Record<string, unknown>,
      ratingEligible: false,
    });

    const [visible, hidden] = await Promise.all([
      loadOperatorScorableMatches(primaryActor),
      loadOperatorScorableMatches(crossTenantActor),
    ]);
    assert(
      visible.some((match) => match.id === matchId) &&
        !hidden.some((match) => match.id === matchId),
      "Organization-scoped match discovery leaked or omitted a fixture",
    );

    let crossTenantBlocked = false;
    try {
      await startOperatorMatchScoring({
        actor: crossTenantActor,
        matchId,
        deviceId: `cross-${deviceId}`,
        initialServer: "A",
        requestId: crypto.randomUUID(),
        now,
      });
    } catch (error) {
      crossTenantBlocked =
        error instanceof MatchServiceError && error.code === "MATCH_NOT_FOUND";
    }
    assert(crossTenantBlocked, "Cross-tenant scoring was not blocked");

    const started = await startOperatorMatchScoring({
      actor: primaryActor,
      matchId,
      deviceId,
      initialServer: "A",
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      started.status === "live" &&
        started.deviceId === deviceId &&
        started.nextSequence === 2,
      "Operator match did not establish a server-owned first event",
    );

    let secondDeviceBlocked = false;
    try {
      await startOperatorMatchScoring({
        actor: primaryActor,
        matchId,
        deviceId: `second-${deviceId}`,
        initialServer: "A",
        requestId: crypto.randomUUID(),
        now: new Date(now.getTime() + 500),
      });
    } catch (error) {
      secondDeviceBlocked =
        error instanceof MatchServiceError && error.code === "DEVICE_MISMATCH";
    }
    assert(secondDeviceBlocked, "A second device claimed a live match");

    const envelope = {
      sequence: 2,
      monotonicCounter: 2,
      event: {
        id: crypto.randomUUID(),
        type: "rally-won" as const,
        winner: "A" as const,
        occurredAt: new Date(now.getTime() + 1_000).toISOString(),
      },
    };
    const uploaded = await appendOperatorMatchEvents({
      actor: primaryActor,
      matchId,
      deviceId,
      events: [envelope],
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 1_000),
    });
    const replayed = await appendOperatorMatchEvents({
      actor: primaryActor,
      matchId,
      deviceId,
      events: [envelope],
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 2_000),
    });
    assert(
      uploaded.accepted === 1 &&
        replayed.accepted === 0 &&
        uploaded.scoring.score.sets[0]?.a === 1,
      "Operator score upload or exact replay was not stable",
    );

    let uniqueSequenceEnforced = false;
    try {
      await database.insert(rallyEvents).values({
        matchId,
        sequence: 2,
        deviceId: `conflict-${deviceId}`,
        monotonicCounter: 2,
        eventType: "rally-won",
        payload: {
          ...envelope.event,
          id: crypto.randomUUID(),
          winner: "B",
        },
        wallClockAt: new Date(now.getTime() + 3_000),
        receivedAt: new Date(now.getTime() + 3_000),
      });
    } catch {
      uniqueSequenceEnforced = true;
    }
    assert(
      uniqueSequenceEnforced,
      "Database accepted two owners for the same match sequence",
    );

    console.log(
      JSON.stringify(
        {
          organizationScoped: true,
          crossTenantBlocked,
          authoritativeDevice: true,
          secondDeviceBlocked,
          exactReplayStable: replayed.accepted === 0,
          uniqueSequenceEnforced,
          score: uploaded.scoring.score.sets[0],
        },
        null,
        2,
      ),
    );
  } finally {
    await database
      .delete(auditLog)
      .where(
        or(
          eq(auditLog.entityId, matchId),
          inArray(auditLog.actorPersonId, personIds),
          inArray(auditLog.organizationId, organizationIds),
        ),
      );
    await database.delete(rallyEvents).where(eq(rallyEvents.matchId, matchId));
    await database.delete(matches).where(eq(matches.id, matchId));
    await database
      .delete(teamMembers)
      .where(inArray(teamMembers.teamId, teamIds));
    await database.delete(teams).where(inArray(teams.id, teamIds));
    await database.delete(venues).where(eq(venues.id, venueId));
    await database.delete(people).where(inArray(people.id, personIds));
    await database
      .delete(organizations)
      .where(inArray(organizations.id, organizationIds));
  }
}

void main();
