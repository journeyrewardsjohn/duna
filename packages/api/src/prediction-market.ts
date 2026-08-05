import {
  PREDICTION_PRICE_SCALE,
  predictionCreditsToMicros,
  predictionDisplayPriceBps,
  predictionExecutionPrices,
  predictionMicrosToCredits,
  predictionOrderCostMicros,
  predictionOrderSharesMicros,
  predictionOrdersCross,
  predictionSideCostMicros,
  predictionSettlementPayoutMicros,
  validatePredictionPrice,
  type PredictionSide,
} from "@duna/core";
import {
  getDatabase,
  getTransactionalDatabase,
  isDatabaseConfigured,
  divisions,
  importedMatches,
  matches,
  people,
  predictionCreditAccounts,
  predictionCreditLedger,
  predictionMarkets,
  predictionOrders,
  predictionPositions,
  predictionPriceSnapshots,
  predictionTrades,
  ratings,
  sessions,
  teamMembers,
  teams,
} from "@duna/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDunaPlusEntitlement } from "./membership";
import type { z } from "zod";
import { predictionMarketSchema, predictionWalletSchema } from "./contracts";

const INITIAL_GRANT_CREDITS = 1_000;
const MEMBER_MONTHLY_GRANT_CREDITS = 100;
const PREMIUM_MONTHLY_GRANT_CREDITS = 1_000;

export class PredictionMarketError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "MARKET_NOT_FOUND"
      | "MARKET_CLOSED"
      | "INSUFFICIENT_CREDITS"
      | "INVALID_ORDER"
      | "ALREADY_SETTLED",
    message: string,
  ) {
    super(message);
  }
}

function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function beforeCurrentMonth(value: Date, now: Date): boolean {
  return monthKey(value) < monthKey(now);
}

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new PredictionMarketError(
      "DATABASE_REQUIRED",
      "Prediction credits require the connected Duna database.",
    );
  }
}

export interface PredictionMarketDefinition {
  readonly subjectType: "match" | "event-team" | "pro-match" | "pro-event-team";
  readonly subjectId: string;
  readonly groupKey?: string;
  readonly title: string;
  readonly yesLabel: string;
  readonly noLabel: string;
  readonly initialYesPriceBps: number;
  readonly opensAt?: Date;
  readonly locksAt?: Date;
  readonly resolvedSide?: PredictionSide;
  readonly sourceSnapshot?: Readonly<Record<string, unknown>>;
}

export async function loadPublicMatchPredictionDefinition(
  matchId: string,
): Promise<PredictionMarketDefinition | undefined> {
  if (!isDatabaseConfigured()) return undefined;
  const database = getDatabase();
  const row = (
    await database
      .select({
        match: matches,
        divisionName: divisions.name,
        sessionId: sessions.id,
        sessionTitle: sessions.title,
        sessionSlug: sessions.slug,
        sessionStatus: sessions.status,
        teamAName: sql<string | null>`team_a.name`,
        teamBName: sql<string | null>`team_b.name`,
      })
      .from(matches)
      .innerJoin(divisions, eq(matches.divisionId, divisions.id))
      .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
      .leftJoin(sql`${teams} AS team_a`, sql`${matches.teamAId} = team_a.id`)
      .leftJoin(sql`${teams} AS team_b`, sql`${matches.teamBId} = team_b.id`)
      .where(
        and(
          eq(matches.id, matchId),
          inArray(sessions.status, [
            "published",
            "registration-open",
            "live",
            "weather-hold",
            "completed",
          ]),
        ),
      )
      .limit(1)
  )[0];
  if (!row?.match.teamAId || !row.match.teamBId) return undefined;
  const memberRows = await database
    .select({
      teamId: teamMembers.teamId,
      displayName: people.displayName,
      rating: ratings.display,
    })
    .from(teamMembers)
    .innerJoin(people, eq(teamMembers.personId, people.id))
    .leftJoin(
      ratings,
      and(
        eq(ratings.personId, teamMembers.personId),
        eq(ratings.discipline, "beach-2s"),
      ),
    )
    .where(inArray(teamMembers.teamId, [row.match.teamAId, row.match.teamBId]));
  const teamLabel = (teamId: string, fallback?: string | null) => {
    const names = memberRows
      .filter((member) => member.teamId === teamId)
      .map((member) => member.displayName);
    return names.length ? names.join(" / ") : fallback || "Team pending";
  };
  const averageRating = (teamId: string) => {
    const values = memberRows.flatMap((member) =>
      member.teamId === teamId && member.rating !== null ? [member.rating] : [],
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  };
  const ratingA = averageRating(row.match.teamAId);
  const ratingB = averageRating(row.match.teamBId);
  const teamAChance =
    ratingA === undefined || ratingB === undefined
      ? 50
      : (1 / (1 + 10 ** ((ratingB - ratingA) / 2))) * 100;
  const initialYesPriceBps = Math.max(
    100,
    Math.min(9_900, Math.round(teamAChance * 100)),
  );
  return {
    subjectType: "match",
    subjectId: row.match.id,
    groupKey: `event:${row.sessionId}`,
    title: `${teamLabel(row.match.teamAId, row.teamAName)} vs ${teamLabel(row.match.teamBId, row.teamBName)}`,
    yesLabel: teamLabel(row.match.teamAId, row.teamAName),
    noLabel: teamLabel(row.match.teamBId, row.teamBName),
    initialYesPriceBps,
    resolvedSide:
      row.match.winnerTeamId === row.match.teamAId
        ? "yes"
        : row.match.winnerTeamId === row.match.teamBId
          ? "no"
          : undefined,
    locksAt:
      row.match.startedAt ??
      row.match.scheduledAt ??
      (row.match.status === "scheduled" || row.match.status === "warmup"
        ? undefined
        : (row.match.completedAt ?? new Date(0))),
    sourceSnapshot: {
      sessionId: row.sessionId,
      sessionSlug: row.sessionSlug,
      sessionTitle: row.sessionTitle,
      divisionName: row.divisionName,
      modelTeamA: teamAChance,
      modelTeamB: 100 - teamAChance,
    },
  };
}

export async function loadPublicEventTeamPredictionDefinitions(
  eventSlug: string,
) {
  if (!isDatabaseConfigured()) return undefined;
  const database = getDatabase();
  const event = (
    await database
      .select({
        id: sessions.id,
        title: sessions.title,
        slug: sessions.slug,
        status: sessions.status,
        endsAt: sessions.endsAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.slug, eventSlug),
          inArray(sessions.status, [
            "published",
            "registration-open",
            "live",
            "weather-hold",
            "completed",
          ]),
        ),
      )
      .limit(1)
  )[0];
  if (!event) return undefined;
  const matchRows = await database
    .select({ teamAId: matches.teamAId, teamBId: matches.teamBId })
    .from(matches)
    .innerJoin(divisions, eq(matches.divisionId, divisions.id))
    .where(eq(divisions.sessionId, event.id));
  const teamIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  if (!teamIds.length) return { event, entries: [] };
  const [teamRows, memberRows] = await Promise.all([
    database
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds)),
    database
      .select({
        teamId: teamMembers.teamId,
        displayName: people.displayName,
        rating: ratings.display,
      })
      .from(teamMembers)
      .innerJoin(people, eq(teamMembers.personId, people.id))
      .leftJoin(
        ratings,
        and(
          eq(ratings.personId, teamMembers.personId),
          eq(ratings.discipline, "beach-2s"),
        ),
      )
      .where(inArray(teamMembers.teamId, teamIds)),
  ]);
  const candidates = teamRows.map((team) => {
    const members = memberRows.filter((member) => member.teamId === team.id);
    const label =
      members.map((member) => member.displayName).join(" / ") ||
      team.name ||
      "Team pending";
    const rated = members.flatMap((member) =>
      member.rating === null ? [] : [member.rating],
    );
    return {
      externalTeamId: team.id,
      label,
      averageRating:
        rated.length > 0
          ? rated.reduce((sum, value) => sum + value, 0) / rated.length
          : undefined,
    };
  });
  const ratedValues = candidates.flatMap((candidate) =>
    candidate.averageRating === undefined ? [] : [candidate.averageRating],
  );
  const baseline = ratedValues.length
    ? ratedValues.reduce((sum, value) => sum + value, 0) / ratedValues.length
    : 4;
  const maxRating = Math.max(
    ...candidates.map((candidate) => candidate.averageRating ?? baseline),
  );
  const weights = candidates.map(
    (candidate) =>
      10 ** (((candidate.averageRating ?? baseline) - maxRating) / 1.5),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return {
    event,
    entries: candidates.map((candidate, index) => ({
      ...candidate,
      definition: {
        subjectType: "event-team" as const,
        subjectId: `${event.id}:${candidate.externalTeamId}`,
        groupKey: `event:${event.id}`,
        title: `Will ${candidate.label} win ${event.title}?`,
        yesLabel: `${candidate.label} wins`,
        noLabel: `${candidate.label} does not win`,
        initialYesPriceBps: Math.max(
          100,
          Math.min(
            9_900,
            Math.round(((weights[index] ?? 1) / totalWeight) * 10_000),
          ),
        ),
        locksAt: event.endsAt,
        sourceSnapshot: {
          eventId: event.id,
          eventSlug: event.slug,
          averageRating: candidate.averageRating,
        },
      } satisfies PredictionMarketDefinition,
    })),
  };
}

export async function ensurePredictionCreditAccount(input: {
  readonly personId: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getTransactionalDatabase();
  const now = input.now ?? new Date();
  const entitlement = await getDunaPlusEntitlement(input.personId, now);
  const monthlyCredits = entitlement.active
    ? PREMIUM_MONTHLY_GRANT_CREDITS
    : MEMBER_MONTHLY_GRANT_CREDITS;

  return database.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(predictionCreditAccounts)
      .values({ personId: input.personId, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .returning();
    let account =
      inserted[0] ??
      (await transaction.query.predictionCreditAccounts.findFirst({
        where: eq(predictionCreditAccounts.personId, input.personId),
      }));
    if (!account) throw new Error("Prediction credit account was not created.");
    const accountId = account.id;

    const applyGrant = async (grant: {
      readonly credits: number;
      readonly kind: "initial-grant" | "monthly-grant";
      readonly key: string;
      readonly note: string;
      readonly periodKey?: string;
    }) => {
      const micros = predictionCreditsToMicros(grant.credits);
      const saved = await transaction
        .insert(predictionCreditLedger)
        .values({
          accountId,
          personId: input.personId,
          deltaMicros: micros,
          kind: grant.kind,
          periodKey: grant.periodKey,
          idempotencyKey: grant.key,
          note: grant.note,
          metadata: {
            credits: grant.credits,
            membershipPlan: entitlement.plan,
            nonCash: true,
          },
          occurredAt: now,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: predictionCreditLedger.id });
      if (!saved[0]) return;
      await transaction
        .update(predictionCreditAccounts)
        .set({
          cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${micros}`,
          lifetimeGrantedMicros: sql`${predictionCreditAccounts.lifetimeGrantedMicros} + ${micros}`,
          updatedAt: now,
        })
        .where(eq(predictionCreditAccounts.id, accountId));
    };

    await applyGrant({
      credits: INITIAL_GRANT_CREDITS,
      kind: "initial-grant",
      key: `prediction-account:${accountId}:initial`,
      note: "Welcome allocation of non-cash Duna prediction credits",
    });
    if (beforeCurrentMonth(account.createdAt, now)) {
      const period = monthKey(now);
      await applyGrant({
        credits: monthlyCredits,
        kind: "monthly-grant",
        key: `prediction-account:${accountId}:monthly:${period}`,
        note: entitlement.active
          ? "Monthly Premium prediction-credit allocation"
          : "Monthly member prediction-credit allocation",
        periodKey: period,
      });
    }
    account =
      (await transaction.query.predictionCreditAccounts.findFirst({
        where: eq(predictionCreditAccounts.id, accountId),
      })) ?? account;
    return {
      account,
      membershipPlan: entitlement.plan,
      nextMonthlyGrantCredits: monthlyCredits,
    };
  });
}

export async function grantDueMonthlyPredictionCredits(input?: {
  readonly now?: Date;
  readonly limit?: number;
}) {
  if (!isDatabaseConfigured()) {
    return {
      granted: 0,
      periodKey: monthKey(input?.now ?? new Date()),
      provisioned: 0,
    };
  }
  const database = getDatabase();
  const now = input?.now ?? new Date();
  const period = monthKey(now);
  const limit = Math.max(1, Math.min(input?.limit ?? 500, 2_000));
  const missingPeople = await database
    .select({ personId: people.id })
    .from(people)
    .leftJoin(
      predictionCreditAccounts,
      eq(predictionCreditAccounts.personId, people.id),
    )
    .where(
      and(isNotNull(people.workosUserId), isNull(predictionCreditAccounts.id)),
    )
    .orderBy(asc(people.createdAt))
    .limit(limit);
  let provisioned = 0;
  for (let index = 0; index < missingPeople.length; index += 20) {
    const batch = missingPeople.slice(index, index + 20);
    const results = await Promise.allSettled(
      batch.map((person) =>
        ensurePredictionCreditAccount({ personId: person.personId, now }),
      ),
    );
    provisioned += results.filter(
      (result) => result.status === "fulfilled",
    ).length;
  }
  const dueAccounts = await database
    .select({ personId: predictionCreditAccounts.personId })
    .from(predictionCreditAccounts)
    .innerJoin(people, eq(predictionCreditAccounts.personId, people.id))
    .where(
      and(
        eq(predictionCreditAccounts.status, "active"),
        eq(people.status, "active"),
        isNotNull(people.workosUserId),
        sql`${predictionCreditAccounts.createdAt} < date_trunc('month', ${now.toISOString()}::timestamptz)`,
        sql`not exists (
          select 1
          from ${predictionCreditLedger}
          where ${predictionCreditLedger.accountId} = ${predictionCreditAccounts.id}
            and ${predictionCreditLedger.kind} = 'monthly-grant'
            and ${predictionCreditLedger.periodKey} = ${period}
        )`,
      ),
    )
    .orderBy(asc(predictionCreditAccounts.createdAt))
    .limit(limit);

  let granted = 0;
  for (let index = 0; index < dueAccounts.length; index += 20) {
    const batch = dueAccounts.slice(index, index + 20);
    const results = await Promise.allSettled(
      batch.map((account) =>
        ensurePredictionCreditAccount({ personId: account.personId, now }),
      ),
    );
    granted += results.filter((result) => result.status === "fulfilled").length;
  }
  return { granted, periodKey: period, provisioned };
}

export async function ensurePredictionMarket(
  definition: PredictionMarketDefinition,
) {
  requireDatabase();
  const database = getTransactionalDatabase();
  const initialYesPriceBps = validatePredictionPrice(
    definition.initialYesPriceBps,
  );
  const now = new Date();
  return database.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(predictionMarkets)
      .values({
        subjectType: definition.subjectType,
        subjectId: definition.subjectId,
        groupKey: definition.groupKey,
        title: definition.title,
        yesLabel: definition.yesLabel,
        noLabel: definition.noLabel,
        initialYesPriceBps,
        lastYesPriceBps: initialYesPriceBps,
        opensAt: definition.opensAt ?? now,
        locksAt: definition.locksAt,
        sourceSnapshot: { ...definition.sourceSnapshot },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    let market =
      inserted[0] ??
      (await transaction.query.predictionMarkets.findFirst({
        where: and(
          eq(predictionMarkets.subjectType, definition.subjectType),
          eq(predictionMarkets.subjectId, definition.subjectId),
        ),
      }));
    if (!market) throw new Error("Prediction market was not created.");
    if (!inserted[0] && market.status === "open") {
      const [updatedMarket] = await transaction
        .update(predictionMarkets)
        .set({
          groupKey: definition.groupKey,
          title: definition.title,
          yesLabel: definition.yesLabel,
          noLabel: definition.noLabel,
          locksAt:
            !market.locksAt || market.locksAt > now
              ? definition.locksAt
              : market.locksAt,
          sourceSnapshot: { ...definition.sourceSnapshot },
          updatedAt: now,
        })
        .where(eq(predictionMarkets.id, market.id))
        .returning();
      market = updatedMarket ?? market;
    }
    if (inserted[0]) {
      await transaction.insert(predictionPriceSnapshots).values({
        marketId: market.id,
        yesPriceBps: initialYesPriceBps,
        source: "model",
        volumeMicros: 0,
        recordedAt: market.opensAt,
        createdAt: now,
      });
    }
    return market;
  });
}

function marketStatusForTime(
  market: typeof predictionMarkets.$inferSelect,
  now: Date,
): "open" | "locked" | "settled" | "void" {
  return market.status === "open" && market.locksAt && market.locksAt <= now
    ? "locked"
    : market.status === "locked" ||
        market.status === "settled" ||
        market.status === "void"
      ? market.status
      : "open";
}

function predictionPositionStatus(
  value: string,
): "open" | "won" | "lost" | "void" {
  return value === "won" || value === "lost" || value === "void"
    ? value
    : "open";
}

export async function loadPredictionMarket(input: {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly viewerPersonId?: string;
  readonly now?: Date;
}) {
  if (!isDatabaseConfigured()) return undefined;
  const database = getDatabase();
  const market = await database.query.predictionMarkets.findFirst({
    where: and(
      eq(predictionMarkets.subjectType, input.subjectType),
      eq(predictionMarkets.subjectId, input.subjectId),
    ),
  });
  if (!market) return undefined;
  const [snapshots, openOrders, positions, viewerPositions, viewerOrders] =
    await Promise.all([
      database
        .select()
        .from(predictionPriceSnapshots)
        .where(eq(predictionPriceSnapshots.marketId, market.id))
        .orderBy(asc(predictionPriceSnapshots.recordedAt))
        .limit(600),
      database
        .select({
          side: predictionOrders.side,
          limitPriceBps: predictionOrders.limitPriceBps,
          remainingSharesMicros: predictionOrders.remainingSharesMicros,
        })
        .from(predictionOrders)
        .where(
          and(
            eq(predictionOrders.marketId, market.id),
            inArray(predictionOrders.status, ["open", "partially-filled"]),
          ),
        ),
      database
        .select({ personId: predictionPositions.personId })
        .from(predictionPositions)
        .where(eq(predictionPositions.marketId, market.id)),
      input.viewerPersonId
        ? database
            .select()
            .from(predictionPositions)
            .where(
              and(
                eq(predictionPositions.marketId, market.id),
                eq(predictionPositions.personId, input.viewerPersonId),
              ),
            )
        : Promise.resolve([]),
      input.viewerPersonId
        ? database
            .select()
            .from(predictionOrders)
            .where(
              and(
                eq(predictionOrders.marketId, market.id),
                eq(predictionOrders.personId, input.viewerPersonId),
              ),
            )
            .orderBy(desc(predictionOrders.createdAt))
        : Promise.resolve([]),
    ]);
  const yesBids = openOrders
    .filter((order) => order.side === "yes")
    .map((order) => order.limitPriceBps);
  const noBids = openOrders
    .filter((order) => order.side === "no")
    .map((order) => order.limitPriceBps);
  const bestYesBid = yesBids.length ? Math.max(...yesBids) : undefined;
  const bestNoBid = noBids.length ? Math.max(...noBids) : undefined;
  const yesAsk =
    bestNoBid === undefined ? undefined : PREDICTION_PRICE_SCALE - bestNoBid;
  const displayYesPriceBps = predictionDisplayPriceBps({
    bestBidBps: bestYesBid,
    bestAskBps: yesAsk,
    lastTradeBps: market.lastYesPriceBps,
  });
  const uniqueParticipants = new Set(positions.map((row) => row.personId)).size;
  return {
    id: market.id,
    subjectType: market.subjectType,
    subjectId: market.subjectId,
    groupKey: market.groupKey ?? undefined,
    title: market.title,
    yesLabel: market.yesLabel,
    noLabel: market.noLabel,
    status: marketStatusForTime(market, input.now ?? new Date()),
    yesPriceBps: displayYesPriceBps,
    noPriceBps: PREDICTION_PRICE_SCALE - displayYesPriceBps,
    lastYesPriceBps: market.lastYesPriceBps,
    bestYesBidBps: bestYesBid,
    yesAskBps: yesAsk,
    volumeCredits: predictionMicrosToCredits(market.volumeMicros),
    participantCount: uniqueParticipants,
    locksAt: market.locksAt?.toISOString(),
    resolvedSide:
      market.resolvedSide === "yes" || market.resolvedSide === "no"
        ? (market.resolvedSide as PredictionSide)
        : undefined,
    history: snapshots.map((snapshot) => ({
      recordedAt: snapshot.recordedAt.toISOString(),
      yesPriceBps: snapshot.yesPriceBps,
      volumeCredits: predictionMicrosToCredits(snapshot.volumeMicros),
      source: snapshot.source as "model" | "trade" | "settlement",
    })),
    viewer: input.viewerPersonId
      ? {
          authenticated: true as const,
          positions: viewerPositions.map((position) => ({
            id: position.id,
            side: position.side as PredictionSide,
            shares: predictionMicrosToCredits(position.sharesMicros),
            costCredits: predictionMicrosToCredits(position.costMicros),
            payoutCredits: predictionMicrosToCredits(position.payoutMicros),
            status: position.status,
          })),
          orders: viewerOrders.map((order) => ({
            id: order.id,
            side: order.side as PredictionSide,
            limitPriceBps: order.limitPriceBps,
            allocatedCredits: predictionMicrosToCredits(
              order.spentMicros + order.reservedMicros,
            ),
            status: order.status,
            createdAt: order.createdAt.toISOString(),
          })),
        }
      : { authenticated: false as const, positions: [], orders: [] },
  };
}

export async function placePredictionOrder(input: {
  readonly personId: string;
  readonly market: PredictionMarketDefinition;
  readonly side: PredictionSide;
  readonly credits: number;
  readonly limitPriceBps: number;
  readonly now?: Date;
}) {
  requireDatabase();
  if (!Number.isInteger(input.credits) || input.credits < 1) {
    throw new PredictionMarketError(
      "INVALID_ORDER",
      "Allocate at least one prediction credit.",
    );
  }
  validatePredictionPrice(input.limitPriceBps);
  const now = input.now ?? new Date();
  const [{ account }, market] = await Promise.all([
    ensurePredictionCreditAccount({ personId: input.personId, now }),
    ensurePredictionMarket(input.market),
  ]);
  if (marketStatusForTime(market, now) !== "open") {
    throw new PredictionMarketError(
      "MARKET_CLOSED",
      "This prediction market is no longer accepting positions.",
    );
  }
  const stakeMicros = predictionCreditsToMicros(input.credits);
  const sharesMicros = predictionOrderSharesMicros({
    stakeMicros,
    limitPriceBps: input.limitPriceBps,
  });
  const database = getTransactionalDatabase();
  return database.transaction(async (transaction) => {
    // A market is one matching domain. Serializing writes per market prevents
    // two takers from consuming the same resting shares at the same time.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${market.id}))`,
    );
    const lockedMarket = await transaction.query.predictionMarkets.findFirst({
      where: eq(predictionMarkets.id, market.id),
    });
    if (!lockedMarket) {
      throw new PredictionMarketError("MARKET_NOT_FOUND", "Market not found.");
    }
    if (marketStatusForTime(lockedMarket, now) !== "open") {
      throw new PredictionMarketError(
        "MARKET_CLOSED",
        "This prediction market is no longer accepting positions.",
      );
    }
    const debited = await transaction
      .update(predictionCreditAccounts)
      .set({
        cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} - ${stakeMicros}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(predictionCreditAccounts.id, account.id),
          eq(predictionCreditAccounts.status, "active"),
          gte(predictionCreditAccounts.cachedAvailableMicros, stakeMicros),
        ),
      )
      .returning({ balance: predictionCreditAccounts.cachedAvailableMicros });
    if (!debited[0]) {
      throw new PredictionMarketError(
        "INSUFFICIENT_CREDITS",
        "You do not have enough prediction credits for this position.",
      );
    }
    const [order] = await transaction
      .insert(predictionOrders)
      .values({
        marketId: market.id,
        accountId: account.id,
        personId: input.personId,
        side: input.side,
        limitPriceBps: input.limitPriceBps,
        sharesMicros,
        remainingSharesMicros: sharesMicros,
        reservedMicros: stakeMicros,
        spentMicros: 0,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!order) throw new Error("Prediction order was not created.");
    await transaction.insert(predictionCreditLedger).values({
      accountId: account.id,
      personId: input.personId,
      deltaMicros: -stakeMicros,
      kind: "order-reserve",
      marketId: market.id,
      orderId: order.id,
      idempotencyKey: `prediction-order:${order.id}:reserve`,
      note: `Allocated ${input.credits} prediction credits to ${input.side === "yes" ? market.yesLabel : market.noLabel}`,
      metadata: {
        limitPriceBps: input.limitPriceBps,
        nonCash: true,
        immutable: true,
      },
      occurredAt: now,
      createdAt: now,
    });

    const oppositeSide: PredictionSide = input.side === "yes" ? "no" : "yes";
    const oppositeOrders = await transaction
      .select()
      .from(predictionOrders)
      .where(
        and(
          eq(predictionOrders.marketId, market.id),
          eq(predictionOrders.side, oppositeSide),
          inArray(predictionOrders.status, ["open", "partially-filled"]),
          ne(predictionOrders.personId, input.personId),
        ),
      )
      .orderBy(
        desc(predictionOrders.limitPriceBps),
        asc(predictionOrders.createdAt),
      );

    let remaining = sharesMicros;
    let spent = 0;
    let filledShares = 0;
    let latestYesPriceBps = lockedMarket.lastYesPriceBps;
    let addedVolumeMicros = 0;
    for (const maker of oppositeOrders) {
      if (remaining <= 0) break;
      const yesLimitPriceBps =
        input.side === "yes" ? input.limitPriceBps : maker.limitPriceBps;
      const noLimitPriceBps =
        input.side === "no" ? input.limitPriceBps : maker.limitPriceBps;
      if (!predictionOrdersCross({ yesLimitPriceBps, noLimitPriceBps })) {
        continue;
      }
      const fillShares = Math.min(remaining, maker.remainingSharesMicros);
      if (fillShares <= 0) continue;
      const prices = predictionExecutionPrices({
        makerSide: maker.side as PredictionSide,
        makerLimitPriceBps: maker.limitPriceBps,
      });
      const yesCostMicros = predictionOrderCostMicros({
        sharesMicros: fillShares,
        priceBps: prices.yesPriceBps,
      });
      const noCostMicros = fillShares - yesCostMicros;
      const takerCost = input.side === "yes" ? yesCostMicros : noCostMicros;
      const makerCost = input.side === "yes" ? noCostMicros : yesCostMicros;
      const makerRemaining = maker.remainingSharesMicros - fillShares;
      const makerReserved = predictionSideCostMicros({
        sharesMicros: makerRemaining,
        side: maker.side as PredictionSide,
        sidePriceBps: maker.limitPriceBps,
      });
      const makerRefund = Math.max(
        0,
        maker.reservedMicros - makerCost - makerReserved,
      );
      const [trade] = await transaction
        .insert(predictionTrades)
        .values({
          marketId: market.id,
          yesOrderId: input.side === "yes" ? order.id : maker.id,
          noOrderId: input.side === "no" ? order.id : maker.id,
          makerOrderId: maker.id,
          sharesMicros: fillShares,
          yesPriceBps: prices.yesPriceBps,
          yesCostMicros,
          noCostMicros,
          executedAt: now,
          createdAt: now,
        })
        .returning({ id: predictionTrades.id });
      if (!trade) throw new Error("Prediction trade was not recorded.");

      const addPosition = async (position: {
        readonly accountId: string;
        readonly personId: string;
        readonly side: PredictionSide;
        readonly costMicros: number;
      }) => {
        await transaction
          .insert(predictionPositions)
          .values({
            marketId: market.id,
            accountId: position.accountId,
            personId: position.personId,
            side: position.side,
            sharesMicros: fillShares,
            costMicros: position.costMicros,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              predictionPositions.marketId,
              predictionPositions.personId,
              predictionPositions.side,
            ],
            set: {
              sharesMicros: sql`${predictionPositions.sharesMicros} + ${fillShares}`,
              costMicros: sql`${predictionPositions.costMicros} + ${position.costMicros}`,
              updatedAt: now,
            },
          });
      };
      await addPosition({
        accountId: account.id,
        personId: input.personId,
        side: input.side,
        costMicros: takerCost,
      });
      await addPosition({
        accountId: maker.accountId,
        personId: maker.personId,
        side: maker.side as PredictionSide,
        costMicros: makerCost,
      });
      await transaction
        .update(predictionOrders)
        .set({
          remainingSharesMicros: makerRemaining,
          reservedMicros: makerReserved,
          spentMicros: maker.spentMicros + makerCost,
          status: makerRemaining === 0 ? "filled" : "partially-filled",
          filledAt: makerRemaining === 0 ? now : undefined,
          updatedAt: now,
        })
        .where(eq(predictionOrders.id, maker.id));
      if (makerRefund > 0) {
        await transaction
          .update(predictionCreditAccounts)
          .set({
            cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${makerRefund}`,
            updatedAt: now,
          })
          .where(eq(predictionCreditAccounts.id, maker.accountId));
        await transaction.insert(predictionCreditLedger).values({
          accountId: maker.accountId,
          personId: maker.personId,
          deltaMicros: makerRefund,
          kind: "price-improvement-refund",
          marketId: market.id,
          orderId: maker.id,
          idempotencyKey: `prediction-trade:${trade.id}:maker-refund`,
          note: "Returned unused prediction credits after an order-book fill",
          metadata: { tradeId: trade.id, nonCash: true },
          occurredAt: now,
          createdAt: now,
        });
      }
      remaining -= fillShares;
      filledShares += fillShares;
      spent += takerCost;
      latestYesPriceBps = prices.yesPriceBps;
      addedVolumeMicros += fillShares;
      await transaction.insert(predictionPriceSnapshots).values({
        marketId: market.id,
        yesPriceBps: prices.yesPriceBps,
        source: "trade",
        volumeMicros: lockedMarket.volumeMicros + addedVolumeMicros,
        recordedAt: now,
        createdAt: now,
      });
    }

    const remainingReserve = predictionSideCostMicros({
      sharesMicros: remaining,
      side: input.side,
      sidePriceBps: input.limitPriceBps,
    });
    const refund = Math.max(0, stakeMicros - spent - remainingReserve);
    if (refund > 0) {
      await transaction
        .update(predictionCreditAccounts)
        .set({
          cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${refund}`,
          updatedAt: now,
        })
        .where(eq(predictionCreditAccounts.id, account.id));
      await transaction.insert(predictionCreditLedger).values({
        accountId: account.id,
        personId: input.personId,
        deltaMicros: refund,
        kind: "price-improvement-refund",
        marketId: market.id,
        orderId: order.id,
        idempotencyKey: `prediction-order:${order.id}:unused-refund`,
        note: "Returned unused prediction credits after order-book matching",
        metadata: { nonCash: true },
        occurredAt: now,
        createdAt: now,
      });
    }
    const status: "open" | "partially-filled" | "filled" =
      remaining === 0
        ? "filled"
        : filledShares > 0
          ? "partially-filled"
          : "open";
    await transaction
      .update(predictionOrders)
      .set({
        remainingSharesMicros: remaining,
        reservedMicros: remainingReserve,
        spentMicros: spent,
        status,
        filledAt: remaining === 0 ? now : undefined,
        updatedAt: now,
      })
      .where(eq(predictionOrders.id, order.id));
    if (addedVolumeMicros > 0) {
      await transaction
        .update(predictionMarkets)
        .set({
          lastYesPriceBps: latestYesPriceBps,
          volumeMicros: sql`${predictionMarkets.volumeMicros} + ${addedVolumeMicros}`,
          updatedAt: now,
        })
        .where(eq(predictionMarkets.id, market.id));
    }
    const refreshedAccount =
      await transaction.query.predictionCreditAccounts.findFirst({
        where: eq(predictionCreditAccounts.id, account.id),
      });
    return {
      orderId: order.id,
      marketId: market.id,
      status,
      filledShares: predictionMicrosToCredits(filledShares),
      openShares: predictionMicrosToCredits(remaining),
      allocatedCredits: input.credits,
      availableCredits: predictionMicrosToCredits(
        refreshedAccount?.cachedAvailableMicros ?? 0,
      ),
      immutable: true as const,
    };
  });
}

export async function settlePredictionMarket(input: {
  readonly marketId: string;
  readonly resolvedSide: PredictionSide;
  readonly now?: Date;
}) {
  requireDatabase();
  const database = getTransactionalDatabase();
  const now = input.now ?? new Date();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.marketId}))`,
    );
    const market = await transaction.query.predictionMarkets.findFirst({
      where: eq(predictionMarkets.id, input.marketId),
    });
    if (!market) {
      throw new PredictionMarketError("MARKET_NOT_FOUND", "Market not found.");
    }
    if (market.status === "settled") {
      if (market.resolvedSide === input.resolvedSide) {
        return { marketId: market.id, settled: false as const };
      }
      throw new PredictionMarketError(
        "ALREADY_SETTLED",
        "This market is already settled to a different result.",
      );
    }
    const [positions, openOrders] = await Promise.all([
      transaction
        .select()
        .from(predictionPositions)
        .where(eq(predictionPositions.marketId, market.id)),
      transaction
        .select()
        .from(predictionOrders)
        .where(
          and(
            eq(predictionOrders.marketId, market.id),
            or(
              eq(predictionOrders.status, "open"),
              eq(predictionOrders.status, "partially-filled"),
            ),
          ),
        ),
    ]);
    for (const order of openOrders) {
      if (order.reservedMicros > 0) {
        await transaction
          .update(predictionCreditAccounts)
          .set({
            cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${order.reservedMicros}`,
            updatedAt: now,
          })
          .where(eq(predictionCreditAccounts.id, order.accountId));
        await transaction
          .insert(predictionCreditLedger)
          .values({
            accountId: order.accountId,
            personId: order.personId,
            deltaMicros: order.reservedMicros,
            kind: "void-refund",
            marketId: market.id,
            orderId: order.id,
            idempotencyKey: `prediction-market:${market.id}:close-order:${order.id}`,
            note: "Returned unmatched prediction credits when the market closed",
            metadata: { nonCash: true },
            occurredAt: now,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      await transaction
        .update(predictionOrders)
        .set({ status: "void", reservedMicros: 0, updatedAt: now })
        .where(eq(predictionOrders.id, order.id));
    }
    for (const position of positions) {
      const side = position.side as PredictionSide;
      const payoutMicros = predictionSettlementPayoutMicros({
        positionSide: side,
        resolvedSide: input.resolvedSide,
        sharesMicros: position.sharesMicros,
      });
      if (payoutMicros > 0) {
        const inserted = await transaction
          .insert(predictionCreditLedger)
          .values({
            accountId: position.accountId,
            personId: position.personId,
            deltaMicros: payoutMicros,
            kind: "settlement",
            marketId: market.id,
            positionId: position.id,
            idempotencyKey: `prediction-market:${market.id}:settlement:${position.id}`,
            note: `Settled winning position in ${market.title}`,
            metadata: { resolvedSide: input.resolvedSide, nonCash: true },
            occurredAt: now,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: predictionCreditLedger.id });
        if (inserted[0]) {
          await transaction
            .update(predictionCreditAccounts)
            .set({
              cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${payoutMicros}`,
              updatedAt: now,
            })
            .where(eq(predictionCreditAccounts.id, position.accountId));
        }
      }
      await transaction
        .update(predictionPositions)
        .set({
          payoutMicros,
          status: payoutMicros > 0 ? "won" : "lost",
          updatedAt: now,
        })
        .where(eq(predictionPositions.id, position.id));
    }
    const finalPrice =
      input.resolvedSide === "yes" ? PREDICTION_PRICE_SCALE : 0;
    await transaction
      .update(predictionMarkets)
      .set({
        status: "settled",
        resolvedSide: input.resolvedSide,
        settledAt: now,
        lastYesPriceBps: finalPrice,
        updatedAt: now,
      })
      .where(eq(predictionMarkets.id, market.id));
    await transaction.insert(predictionPriceSnapshots).values({
      marketId: market.id,
      yesPriceBps: finalPrice,
      source: "settlement",
      volumeMicros: market.volumeMicros,
      recordedAt: now,
      createdAt: now,
    });
    await transaction
      .update(predictionOrders)
      .set({ status: "settled", updatedAt: now })
      .where(
        and(
          eq(predictionOrders.marketId, market.id),
          eq(predictionOrders.status, "filled"),
        ),
      );
    return { marketId: market.id, settled: true as const };
  });
}

export async function settleResolvedPredictionMarkets(input?: {
  readonly limit?: number;
  readonly now?: Date;
}) {
  if (!isDatabaseConfigured()) return { settled: 0 };
  const database = getDatabase();
  const limit = Math.max(1, Math.min(input?.limit ?? 200, 1_000));
  const now = input?.now ?? new Date();
  const rows = await database
    .select({
      marketId: predictionMarkets.id,
      subjectType: predictionMarkets.subjectType,
      genericTeamAId: matches.teamAId,
      genericTeamBId: matches.teamBId,
      genericWinnerTeamId: matches.winnerTeamId,
      professionalWinnerSide: importedMatches.winnerSide,
    })
    .from(predictionMarkets)
    .leftJoin(
      matches,
      and(
        eq(predictionMarkets.subjectType, "match"),
        sql`${predictionMarkets.subjectId} = ${matches.id}::text`,
      ),
    )
    .leftJoin(
      importedMatches,
      and(
        eq(predictionMarkets.subjectType, "pro-match"),
        sql`${predictionMarkets.subjectId} = ${importedMatches.id}::text`,
      ),
    )
    .where(
      and(
        inArray(predictionMarkets.status, ["open", "locked"]),
        inArray(predictionMarkets.subjectType, ["match", "pro-match"]),
        or(
          sql`${matches.winnerTeamId} is not null`,
          inArray(importedMatches.winnerSide, ["A", "B"]),
        ),
      ),
    )
    .limit(limit);
  let settled = 0;
  for (const row of rows) {
    const resolvedSide: PredictionSide | undefined =
      row.subjectType === "match"
        ? row.genericWinnerTeamId === row.genericTeamAId
          ? "yes"
          : row.genericWinnerTeamId === row.genericTeamBId
            ? "no"
            : undefined
        : row.professionalWinnerSide === "A"
          ? "yes"
          : row.professionalWinnerSide === "B"
            ? "no"
            : undefined;
    if (!resolvedSide) continue;
    const result = await settlePredictionMarket({
      marketId: row.marketId,
      resolvedSide,
      now,
    });
    if (result.settled) settled += 1;
  }
  return { settled };
}

export async function loadPredictionWallet(input: {
  readonly personId: string;
  readonly now?: Date;
}) {
  if (!isDatabaseConfigured()) {
    return {
      availableCredits: INITIAL_GRANT_CREDITS,
      lifetimeGrantedCredits: INITIAL_GRANT_CREDITS,
      nextMonthlyGrantCredits: MEMBER_MONTHLY_GRANT_CREDITS,
      membershipPlan: "free" as const,
      positions: [],
      openOrders: [],
      activity: [],
      rules: predictionCreditRules,
    };
  }
  const now = input.now ?? new Date();
  const ensured = await ensurePredictionCreditAccount({
    personId: input.personId,
    now,
  });
  const database = getDatabase();
  const [positions, orders, ledger] = await Promise.all([
    database
      .select({ position: predictionPositions, market: predictionMarkets })
      .from(predictionPositions)
      .innerJoin(
        predictionMarkets,
        eq(predictionPositions.marketId, predictionMarkets.id),
      )
      .where(eq(predictionPositions.personId, input.personId))
      .orderBy(desc(predictionPositions.updatedAt))
      .limit(100),
    database
      .select({ order: predictionOrders, market: predictionMarkets })
      .from(predictionOrders)
      .innerJoin(
        predictionMarkets,
        eq(predictionOrders.marketId, predictionMarkets.id),
      )
      .where(
        and(
          eq(predictionOrders.personId, input.personId),
          inArray(predictionOrders.status, ["open", "partially-filled"]),
        ),
      )
      .orderBy(desc(predictionOrders.createdAt))
      .limit(100),
    database
      .select()
      .from(predictionCreditLedger)
      .where(eq(predictionCreditLedger.accountId, ensured.account.id))
      .orderBy(desc(predictionCreditLedger.occurredAt))
      .limit(100),
  ]);
  return {
    availableCredits: predictionMicrosToCredits(
      ensured.account.cachedAvailableMicros,
    ),
    lifetimeGrantedCredits: predictionMicrosToCredits(
      ensured.account.lifetimeGrantedMicros,
    ),
    nextMonthlyGrantCredits: ensured.nextMonthlyGrantCredits,
    membershipPlan: ensured.membershipPlan,
    positions: positions.map(({ position, market }) => ({
      id: position.id,
      marketId: market.id,
      title: market.title,
      selectedLabel: position.side === "yes" ? market.yesLabel : market.noLabel,
      side: position.side as PredictionSide,
      shares: predictionMicrosToCredits(position.sharesMicros),
      costCredits: predictionMicrosToCredits(position.costMicros),
      payoutCredits: predictionMicrosToCredits(position.payoutMicros),
      currentPriceBps:
        position.side === "yes"
          ? market.lastYesPriceBps
          : PREDICTION_PRICE_SCALE - market.lastYesPriceBps,
      status: predictionPositionStatus(position.status),
      subjectType: market.subjectType,
      subjectId: market.subjectId,
      updatedAt: position.updatedAt.toISOString(),
    })),
    openOrders: orders.map(({ order, market }) => ({
      id: order.id,
      marketId: market.id,
      title: market.title,
      selectedLabel: order.side === "yes" ? market.yesLabel : market.noLabel,
      side: order.side as PredictionSide,
      limitPriceBps: order.limitPriceBps,
      reservedCredits: predictionMicrosToCredits(order.reservedMicros),
      filledCredits: predictionMicrosToCredits(order.spentMicros),
      status:
        order.status === "partially-filled"
          ? ("partially-filled" as const)
          : ("open" as const),
      createdAt: order.createdAt.toISOString(),
    })),
    activity: ledger.map((entry) => ({
      id: entry.id,
      deltaCredits: predictionMicrosToCredits(entry.deltaMicros),
      kind: entry.kind,
      note: entry.note,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    rules: predictionCreditRules,
  };
}

export const predictionCreditRules = {
  initialGrantCredits: INITIAL_GRANT_CREDITS,
  memberMonthlyGrantCredits: MEMBER_MONTHLY_GRANT_CREDITS,
  premiumMonthlyGrantCredits: PREMIUM_MONTHLY_GRANT_CREDITS,
  purchasable: false,
  transferable: false,
  redeemable: false,
  cashValue: false,
  prizes: false,
  positionsImmutable: true,
  contractPayoutCredits: 1,
} as const;

export type PredictionMarketView = z.infer<typeof predictionMarketSchema>;
export type PredictionWallet = z.infer<typeof predictionWalletSchema>;
