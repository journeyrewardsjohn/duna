import { loadEnvFile } from "node:process";
import { eq, inArray, or } from "drizzle-orm";
import {
  auditLog,
  getDatabase,
  matchConfirmations,
  matches,
  people,
  rallyEvents,
  ratingEvents,
  ratings,
  teamMembers,
  teams,
} from "../packages/db/src";
import {
  appendMatchEvents,
  confirmMatchResult,
  loadPublicMatchScoringState,
  recordCompletedMatch,
  scopesForRoles,
  startSelfReportedMatch,
  type ApiActor,
  type ScoreEventEnvelope,
} from "../packages/api/src";
import { databaseRepository } from "../packages/api/src/database-repository";

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
  const now = new Date();
  const suffix = crypto.randomUUID();
  const personIds = Array.from({ length: 6 }, () => crypto.randomUUID());
  const deviceId = `verify-device-${suffix}`;
  let matchId: string | undefined;
  let recordedMatchId: string | undefined;
  let teamIds: string[] = [];
  const actor = (personId: string, displayName: string): ApiActor => ({
    personId,
    displayName,
    roles: ["player"],
    scopes: scopesForRoles(["player"]),
    ageBand: "adult",
    isDemo: true,
  });
  const actors = personIds.map((id, index) =>
    actor(id, `Match Verification ${index + 1}`),
  );

  try {
    await database.insert(people).values(
      personIds.map((id, index) => ({
        id,
        email: `match-${index + 1}-${suffix}@example.invalid`,
        displayName: actors[index]!.displayName,
        handle: `match-${index + 1}-${suffix}`.slice(0, 48),
        ageBand: "adult" as const,
        isMinor: false,
        profileVisibility: "public",
      })),
    );
    const started = await startSelfReportedMatch({
      actor: actors[0]!,
      teamAIds: [personIds[0]!, personIds[1]!],
      teamBIds: [personIds[2]!, personIds[3]!],
      scoringSystem: "rally",
      matchType: "competitive",
      allPlayersAgreedToRecord: true,
      serviceOrder: {
        A: [personIds[0]!, personIds[1]!],
        B: [personIds[2]!, personIds[3]!],
      },
      initialServerPersonId: personIds[0]!,
      deviceId,
      requestId: crypto.randomUUID(),
      now,
    });
    matchId = started.matchId;
    teamIds = [started.teamA.id, started.teamB.id];
    assert(
      started.status === "live" &&
        started.score.status === "live" &&
        started.nextSequence === 2,
      "Connected match did not start with a server-owned scoring event",
    );

    const firstEvent: ScoreEventEnvelope = {
      sequence: 2,
      monotonicCounter: 2,
      event: {
        id: crypto.randomUUID(),
        type: "rally-won",
        winner: "A",
        occurredAt: new Date(now.getTime() + 1_000).toISOString(),
      },
    };
    const firstUpload = await appendMatchEvents({
      actor: actors[0]!,
      matchId,
      deviceId,
      events: [firstEvent],
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 1_000),
    });
    const exactReplay = await appendMatchEvents({
      actor: actors[0]!,
      matchId,
      deviceId,
      events: [firstEvent],
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 2_000),
    });
    assert(
      firstUpload.accepted === 1 && exactReplay.accepted === 0,
      "Score-event replay was not idempotent",
    );

    const remaining: ScoreEventEnvelope[] = [];
    for (let sequence = 3; sequence <= 43; sequence += 1) {
      remaining.push({
        sequence,
        monotonicCounter: sequence,
        event: {
          id: crypto.randomUUID(),
          type: "rally-won",
          winner: "A",
          occurredAt: new Date(now.getTime() + sequence * 1_000).toISOString(),
        },
      });
    }
    const completed = await appendMatchEvents({
      actor: actors[0]!,
      matchId,
      deviceId,
      events: remaining,
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 45_000),
    });
    assert(
      completed.scoring.status === "pending-verification" &&
        completed.scoring.score.status === "complete" &&
        completed.scoring.score.winner === "A",
      "Completed score did not enter participant verification",
    );

    const verified = await confirmMatchResult({
      actor: actors[2]!,
      matchId,
      decision: "confirmed",
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 46_000),
    });
    assert(
      verified.status === "verified" && verified.ratingApplied,
      "Opponent confirmation did not verify and rate the match",
    );
    const repeatedConfirmation = await confirmMatchResult({
      actor: actors[2]!,
      matchId,
      decision: "confirmed",
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 47_000),
    });
    assert(
      repeatedConfirmation.status === "verified" &&
        repeatedConfirmation.ratingApplied,
      "Verified confirmation replay was not stable",
    );

    const [storedMatch, ratingRows, eventRows, history, publicState] =
      await Promise.all([
        database.query.matches.findFirst({ where: eq(matches.id, matchId) }),
        database
          .select()
          .from(ratings)
          .where(inArray(ratings.personId, personIds)),
        database
          .select()
          .from(ratingEvents)
          .where(eq(ratingEvents.matchId, matchId)),
        databaseRepository.player.matchHistory(personIds[0]!),
        loadPublicMatchScoringState(matchId),
      ]);
    assert(
      storedMatch?.status === "verified" && storedMatch.ratingAppliedAt,
      "Verified match was not persisted",
    );
    assert(
      ratingRows.length === 4 &&
        eventRows.length === 4 &&
        ratingRows.some((rating) => rating.display > 3) &&
        ratingRows.some((rating) => rating.display < 3),
      "Deterministic rating updates were not persisted for all four players",
    );
    assert(
      history.some(
        (match) =>
          match.id === matchId &&
          match.status === "verified" &&
          match.score.length === 2,
      ),
      "Connected match history did not project the verified result",
    );
    assert(
      publicState.status === "verified" && publicState.events.length === 43,
      "Public live state did not replay the connected event stream",
    );

    const recorded = await recordCompletedMatch({
      actor: actors[0]!,
      teamAIds: [personIds[0]!, personIds[1]!, personIds[4]!],
      teamBIds: [personIds[2]!, personIds[3]!, personIds[5]!],
      playedAt: new Date(now.getTime() - 86_400_000),
      setScores: [
        { a: 21, b: 18 },
        { a: 17, b: 21 },
        { a: 15, b: 12 },
      ],
      matchType: "friendly",
      allPlayersAgreedToRecord: true,
      deviceId: `${deviceId}-recorded`,
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 48_000),
    });
    recordedMatchId = recorded.matchId;
    teamIds.push(recorded.teamA.id, recorded.teamB.id);
    assert(
      recorded.status === "pending-verification" &&
        recorded.score.status === "complete" &&
        recorded.format.recordingMode === "completed" &&
        recorded.format.teamSize === 3,
      "Completed 3v3 result did not enter participant verification",
    );
    const recordedVerified = await confirmMatchResult({
      actor: actors[2]!,
      matchId: recorded.matchId,
      decision: "confirmed",
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 49_000),
    });
    assert(
      recordedVerified.status === "verified" && !recordedVerified.ratingApplied,
      "Friendly 3v3 result did not verify as history-only",
    );
    const [recordedStored, recordedRatingEvents, recordedHistory] =
      await Promise.all([
        database.query.matches.findFirst({
          where: eq(matches.id, recorded.matchId),
        }),
        database
          .select()
          .from(ratingEvents)
          .where(eq(ratingEvents.matchId, recorded.matchId)),
        databaseRepository.player.matchHistory(personIds[0]!),
      ]);
    assert(
      recordedStored?.status === "verified" &&
        recordedRatingEvents.length === 0 &&
        recordedHistory.some(
          (match) =>
            match.id === recorded.matchId &&
            match.status === "verified" &&
            match.recordingMode === "completed" &&
            match.ratingImpact === "history-only",
        ),
      "Completed match did not project to history without rating movement",
    );

    console.log(
      JSON.stringify(
        {
          scoreReplayStable: exactReplay.accepted === 0,
          scoreEventCount: publicState.events.length,
          submittedStatus: completed.scoring.status,
          verifiedStatus: storedMatch.status,
          ratingEvents: eventRows.length,
          historyProjected: true,
          publicReplayProjected: true,
          completedThreeVsThreeProjected: true,
          completedThreeVsThreeRated: false,
        },
        null,
        2,
      ),
    );
  } finally {
    const matchIds = [matchId, recordedMatchId].filter((id): id is string =>
      Boolean(id),
    );
    if (matchIds.length > 0) {
      await database
        .delete(auditLog)
        .where(
          or(
            inArray(auditLog.entityId, matchIds),
            inArray(auditLog.actorPersonId, personIds),
          ),
        );
      await database
        .delete(ratingEvents)
        .where(inArray(ratingEvents.matchId, matchIds));
      await database
        .delete(matchConfirmations)
        .where(inArray(matchConfirmations.matchId, matchIds));
      await database
        .delete(rallyEvents)
        .where(inArray(rallyEvents.matchId, matchIds));
      await database.delete(matches).where(inArray(matches.id, matchIds));
    }
    await database.delete(ratings).where(inArray(ratings.personId, personIds));
    if (teamIds.length > 0) {
      await database
        .delete(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds));
      await database.delete(teams).where(inArray(teams.id, teamIds));
    }
    await database.delete(people).where(inArray(people.id, personIds));
  }
}

void main();
