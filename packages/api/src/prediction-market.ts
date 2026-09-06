import {
  PREDICTION_PRICE_SCALE,
  predictionCreditsToMicros,
  predictionDisplayPriceBps,
  predictionExecutionPrices,
  predictionMicrosToCredits,
  predictionMarketLiquidityQuote,
  predictionOrderCostMicros,
  predictionOrderSharesMicros,
  predictionOrdersCross,
  predictionSaleCostBasisMicros,
  predictionShareOrdersCross,
  predictionSideCostMicros,
  predictionSharesToMicros,
  predictionSettlementPayoutMicros,
  validatePredictionPrice,
  type PredictionSide,
} from "@duna/core";
import {
  auditLog,
  follows,
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
  predictionMarketRuleVersions,
  predictionOrders,
  predictionPositions,
  predictionPriceSnapshots,
  predictionShareTrades,
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
import { stableHash } from "./canonical";
import { loadPublicProCoverage } from "./sand-data/service";

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
      | "INSUFFICIENT_SHARES"
      | "INVALID_ORDER"
      | "ALREADY_SETTLED",
    message: string,
  ) {
    super(message);
  }
}

export function comparePredictionMakerPriority(
  left: {
    readonly sidePriceBps: number;
    readonly createdAt: Date;
    readonly id: string;
  },
  right: {
    readonly sidePriceBps: number;
    readonly createdAt: Date;
    readonly id: string;
  },
) {
  return (
    left.sidePriceBps - right.sidePriceBps ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
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
  readonly rules?: PredictionMarketRuleDefinition;
}

export interface PredictionMarketRuleDefinition {
  readonly resolutionCriteria: string;
  readonly resolutionSource: string;
  readonly closePolicy: string;
  readonly publicNote?: string;
}

function predictionParticipantLabelKey(label: string): string {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv"]);
  const names = label.split(/\s*\/\s*/);
  const tokensByName = names.map((name) => {
    return (
      name
        .normalize("NFKD")
        .replaceAll(/\p{M}/gu, "")
        .toLocaleLowerCase("en-US")
        .match(/[\p{L}\p{N}]+/gu) ?? []
    );
  });
  if (tokensByName.length === 1) return tokensByName[0]?.join("|") ?? "";
  return tokensByName
    .map((tokens) => {
      const last = tokens.at(-1);
      return last && suffixes.has(last) && tokens.length > 1
        ? (tokens.at(-2) ?? "")
        : (last ?? "");
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

// Participant changes alter the meaning of a market side. Closed market rules
// stay immutable, so callers must withhold a stale contract instead of
// displaying or settling it against a different pairing.
export function predictionMarketLabelsMatchDefinition(input: {
  readonly market: Pick<PredictionMarketDefinition, "yesLabel" | "noLabel">;
  readonly definition: Pick<PredictionMarketDefinition, "yesLabel" | "noLabel">;
}): boolean {
  return (
    predictionParticipantLabelKey(input.market.yesLabel) ===
      predictionParticipantLabelKey(input.definition.yesLabel) &&
    predictionParticipantLabelKey(input.market.noLabel) ===
      predictionParticipantLabelKey(input.definition.noLabel)
  );
}

export function defaultPredictionMarketRules(
  definition: Pick<
    PredictionMarketDefinition,
    "subjectType" | "yesLabel" | "noLabel"
  >,
): PredictionMarketRuleDefinition {
  const professional = definition.subjectType.startsWith("pro-");
  const tournament = definition.subjectType.endsWith("event-team");
  return {
    resolutionCriteria: tournament
      ? `Resolves Yes if ${definition.yesLabel}. Resolves No if ${definition.noLabel}. The market is determined only after the tournament result is final.`
      : `Resolves Yes if ${definition.yesLabel} wins the governing match. Resolves No if ${definition.noLabel} wins. The market is determined only after the result is verified or final.`,
    resolutionSource: professional
      ? "The official AVP or Volleyball World result stored by Duna."
      : "The verified Duna score and final match record.",
    closePolicy: tournament
      ? "Orders close at the posted close time or when the tournament result becomes final, whichever happens first. Unmatched orders are released when the market is determined."
      : "Orders close when the match begins or at the posted close time, whichever happens first. Unmatched orders are released when the market is determined.",
    publicNote:
      "Prediction credits are free-play only. They cannot be purchased, transferred, redeemed, or exchanged for cash or prizes.",
  };
}

export function isDeterminedMatchStatus(status: string): boolean {
  return status === "verified" || status === "complete" || status === "forfeit";
}

export function nextPredictionMarketLocksAt(input: {
  readonly currentRuleVersion: number;
  readonly currentLocksAt: Date | null;
  readonly definitionLocksAt?: Date;
  readonly now: Date;
}): Date | null | undefined {
  if (input.currentRuleVersion > 1) return input.currentLocksAt;
  return !input.currentLocksAt || input.currentLocksAt > input.now
    ? input.definitionLocksAt
    : input.currentLocksAt;
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
    resolvedSide: isDeterminedMatchStatus(row.match.status)
      ? row.match.winnerTeamId === row.match.teamAId
        ? "yes"
        : row.match.winnerTeamId === row.match.teamBId
          ? "no"
          : undefined
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
          locksAt: nextPredictionMarketLocksAt({
            currentRuleVersion: market.currentRuleVersion,
            currentLocksAt: market.locksAt,
            definitionLocksAt: definition.locksAt,
            now,
          }),
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
    const existingRules =
      await transaction.query.predictionMarketRuleVersions.findFirst({
        where: and(
          eq(predictionMarketRuleVersions.marketId, market.id),
          eq(predictionMarketRuleVersions.version, market.currentRuleVersion),
        ),
      });
    if (!existingRules) {
      const rules =
        definition.rules ?? defaultPredictionMarketRules(definition);
      await transaction
        .insert(predictionMarketRuleVersions)
        .values({
          marketId: market.id,
          version: market.currentRuleVersion,
          resolutionCriteria: rules.resolutionCriteria,
          resolutionSource: rules.resolutionSource,
          closePolicy: rules.closePolicy,
          publicNote: rules.publicNote,
          locksAt: market.locksAt,
          changeReason: "Initial market rules",
          createdAt: market.createdAt,
        })
        .onConflictDoNothing();
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
  const [
    snapshots,
    openOrders,
    positions,
    viewerPositions,
    viewerOrders,
    currentRules,
  ] = await Promise.all([
    database
      .select()
      .from(predictionPriceSnapshots)
      .where(eq(predictionPriceSnapshots.marketId, market.id))
      .orderBy(asc(predictionPriceSnapshots.recordedAt))
      .limit(600),
    database
      .select({
        intent: predictionOrders.intent,
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
      .select({
        personId: predictionPositions.personId,
        handle: people.handle,
        side: predictionPositions.side,
        sharesMicros: predictionPositions.sharesMicros,
        status: predictionPositions.status,
        updatedAt: predictionPositions.updatedAt,
      })
      .from(predictionPositions)
      .innerJoin(people, eq(predictionPositions.personId, people.id))
      .where(
        and(
          eq(predictionPositions.marketId, market.id),
          gte(predictionPositions.sharesMicros, 1),
        ),
      )
      .orderBy(desc(predictionPositions.updatedAt)),
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
    database.query.predictionMarketRuleVersions.findFirst({
      where: and(
        eq(predictionMarketRuleVersions.marketId, market.id),
        eq(predictionMarketRuleVersions.version, market.currentRuleVersion),
      ),
    }),
  ]);
  const yesBids = openOrders
    .filter((order) => order.intent === "buy" && order.side === "yes")
    .map((order) => order.limitPriceBps);
  const noBids = openOrders
    .filter((order) => order.intent === "buy" && order.side === "no")
    .map((order) => order.limitPriceBps);
  const yesDirectAsks = openOrders
    .filter((order) => order.intent === "sell" && order.side === "yes")
    .map((order) => order.limitPriceBps);
  const noDirectAsks = openOrders
    .filter((order) => order.intent === "sell" && order.side === "no")
    .map((order) => order.limitPriceBps);
  const bestYesBid = yesBids.length ? Math.max(...yesBids) : undefined;
  const bestNoBid = noBids.length ? Math.max(...noBids) : undefined;
  const yesAsks = [
    ...yesDirectAsks,
    ...(bestNoBid === undefined ? [] : [PREDICTION_PRICE_SCALE - bestNoBid]),
  ];
  const noAsks = [
    ...noDirectAsks,
    ...(bestYesBid === undefined ? [] : [PREDICTION_PRICE_SCALE - bestYesBid]),
  ];
  const yesAsk = yesAsks.length ? Math.min(...yesAsks) : undefined;
  const noAsk = noAsks.length ? Math.min(...noAsks) : undefined;
  const displayYesPriceBps = predictionDisplayPriceBps({
    bestBidBps: bestYesBid,
    bestAskBps: yesAsk,
    lastTradeBps: market.lastYesPriceBps,
  });
  const uniqueParticipants = new Set(positions.map((row) => row.personId)).size;
  const fallbackRules = defaultPredictionMarketRules({
    subjectType:
      market.subjectType as PredictionMarketDefinition["subjectType"],
    yesLabel: market.yesLabel,
    noLabel: market.noLabel,
  });
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
    bestNoBidBps: bestNoBid,
    noAskBps: noAsk,
    volumeCredits: predictionMicrosToCredits(market.volumeMicros),
    participantCount: uniqueParticipants,
    opensAt: market.opensAt.toISOString(),
    locksAt: market.locksAt?.toISOString(),
    determinedAt: market.settledAt?.toISOString(),
    resolvedSide:
      market.resolvedSide === "yes" || market.resolvedSide === "no"
        ? (market.resolvedSide as PredictionSide)
        : undefined,
    rules: {
      version: currentRules?.version ?? market.currentRuleVersion,
      resolutionCriteria:
        currentRules?.resolutionCriteria ?? fallbackRules.resolutionCriteria,
      resolutionSource:
        currentRules?.resolutionSource ?? fallbackRules.resolutionSource,
      closePolicy: currentRules?.closePolicy ?? fallbackRules.closePolicy,
      publicNote: currentRules?.publicNote ?? fallbackRules.publicNote,
      effectiveAt: (currentRules?.createdAt ?? market.createdAt).toISOString(),
    },
    predictors: positions.map((position) => ({
      handle: position.handle,
      side: position.side as PredictionSide,
      shares: predictionMicrosToCredits(position.sharesMicros),
      status: predictionPositionStatus(position.status),
      updatedAt: position.updatedAt.toISOString(),
    })),
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
            availableShares: predictionMicrosToCredits(
              position.sharesMicros - position.reservedSharesMicros,
            ),
            listedShares: predictionMicrosToCredits(
              position.reservedSharesMicros,
            ),
            costCredits: predictionMicrosToCredits(position.costMicros),
            payoutCredits: predictionMicrosToCredits(position.payoutMicros),
            status: position.status,
          })),
          orders: viewerOrders.map((order) => ({
            id: order.id,
            intent: order.intent as "buy" | "sell",
            side: order.side as PredictionSide,
            limitPriceBps: order.limitPriceBps,
            allocatedCredits: predictionMicrosToCredits(
              order.spentMicros + order.reservedMicros,
            ),
            filledCredits: predictionMicrosToCredits(order.spentMicros),
            openCredits:
              order.intent === "buy"
                ? predictionMicrosToCredits(order.reservedMicros)
                : 0,
            openShares: predictionMicrosToCredits(order.remainingSharesMicros),
            filledShares: predictionMicrosToCredits(
              order.sharesMicros - order.remainingSharesMicros,
            ),
            proceedsCredits: predictionMicrosToCredits(order.proceedsMicros),
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

    let remaining = sharesMicros;
    let spent = 0;
    let filledShares = 0;
    let latestYesPriceBps = lockedMarket.lastYesPriceBps;
    let addedVolumeMicros = 0;
    const addPosition = async (position: {
      readonly accountId: string;
      readonly personId: string;
      readonly side: PredictionSide;
      readonly sharesMicros: number;
      readonly costMicros: number;
    }) => {
      await transaction
        .insert(predictionPositions)
        .values({
          marketId: market.id,
          accountId: position.accountId,
          personId: position.personId,
          side: position.side,
          sharesMicros: position.sharesMicros,
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
            sharesMicros: sql`${predictionPositions.sharesMicros} + ${position.sharesMicros}`,
            costMicros: sql`${predictionPositions.costMicros} + ${position.costMicros}`,
            updatedAt: now,
          },
        });
    };

    // A buy first takes any same-side shares offered at or below its limit.
    // This transfers an existing fully collateralized claim without minting a
    // second claim or changing the total prediction-credit supply.
    const directSellOrders = await transaction
      .select()
      .from(predictionOrders)
      .where(
        and(
          eq(predictionOrders.marketId, market.id),
          eq(predictionOrders.intent, "sell"),
          eq(predictionOrders.side, input.side),
          inArray(predictionOrders.status, ["open", "partially-filled"]),
          ne(predictionOrders.personId, input.personId),
        ),
      )
      .orderBy(
        asc(predictionOrders.limitPriceBps),
        asc(predictionOrders.createdAt),
      );
    const fillDirectSellOrder = async (
      maker: (typeof directSellOrders)[number],
    ) => {
      if (remaining <= 0) return;
      if (
        !predictionShareOrdersCross({
          buyLimitPriceBps: input.limitPriceBps,
          sellLimitPriceBps: maker.limitPriceBps,
        })
      ) {
        return;
      }
      const sellerPosition =
        await transaction.query.predictionPositions.findFirst({
          where: and(
            eq(predictionPositions.marketId, market.id),
            eq(predictionPositions.personId, maker.personId),
            eq(predictionPositions.side, input.side),
            eq(predictionPositions.status, "open"),
          ),
        });
      if (!sellerPosition) {
        throw new Error("A listed prediction position could not be found.");
      }
      const fillShares = Math.min(
        remaining,
        maker.remainingSharesMicros,
        sellerPosition.reservedSharesMicros,
      );
      if (fillShares <= 0) return;
      const saleCreditsMicros = predictionSideCostMicros({
        sharesMicros: fillShares,
        side: input.side,
        sidePriceBps: maker.limitPriceBps,
      });
      const costBasisReduction = predictionSaleCostBasisMicros({
        positionSharesMicros: sellerPosition.sharesMicros,
        positionCostMicros: sellerPosition.costMicros,
        soldSharesMicros: fillShares,
      });
      const [trade] = await transaction
        .insert(predictionShareTrades)
        .values({
          marketId: market.id,
          side: input.side,
          buyOrderId: order.id,
          sellOrderId: maker.id,
          sellerPositionId: sellerPosition.id,
          makerOrderId: maker.id,
          sharesMicros: fillShares,
          priceBps: maker.limitPriceBps,
          costMicros: saleCreditsMicros,
          executedAt: now,
          createdAt: now,
        })
        .returning({ id: predictionShareTrades.id });
      if (!trade) throw new Error("Prediction share trade was not recorded.");
      await addPosition({
        accountId: account.id,
        personId: input.personId,
        side: input.side,
        sharesMicros: fillShares,
        costMicros: saleCreditsMicros,
      });
      await transaction
        .update(predictionPositions)
        .set({
          sharesMicros: sellerPosition.sharesMicros - fillShares,
          reservedSharesMicros:
            sellerPosition.reservedSharesMicros - fillShares,
          costMicros: sellerPosition.costMicros - costBasisReduction,
          updatedAt: now,
        })
        .where(eq(predictionPositions.id, sellerPosition.id));
      const makerRemaining = maker.remainingSharesMicros - fillShares;
      await transaction
        .update(predictionOrders)
        .set({
          remainingSharesMicros: makerRemaining,
          reservedSharesMicros: makerRemaining,
          proceedsMicros: maker.proceedsMicros + saleCreditsMicros,
          status: makerRemaining === 0 ? "filled" : "partially-filled",
          filledAt: makerRemaining === 0 ? now : undefined,
          updatedAt: now,
        })
        .where(eq(predictionOrders.id, maker.id));
      await transaction
        .update(predictionCreditAccounts)
        .set({
          cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${saleCreditsMicros}`,
          updatedAt: now,
        })
        .where(eq(predictionCreditAccounts.id, maker.accountId));
      await transaction.insert(predictionCreditLedger).values({
        accountId: maker.accountId,
        personId: maker.personId,
        deltaMicros: saleCreditsMicros,
        kind: "sale-proceeds",
        marketId: market.id,
        orderId: maker.id,
        positionId: sellerPosition.id,
        idempotencyKey: `prediction-share-trade:${trade.id}:seller-proceeds`,
        note: `Sold ${predictionMicrosToCredits(fillShares)} shares of ${input.side === "yes" ? market.yesLabel : market.noLabel}`,
        metadata: {
          tradeId: trade.id,
          sharesMicros: fillShares,
          priceBps: maker.limitPriceBps,
          nonCash: true,
        },
        occurredAt: now,
        createdAt: now,
      });
      remaining -= fillShares;
      filledShares += fillShares;
      spent += saleCreditsMicros;
      latestYesPriceBps =
        input.side === "yes"
          ? maker.limitPriceBps
          : PREDICTION_PRICE_SCALE - maker.limitPriceBps;
      addedVolumeMicros += fillShares;
      await transaction.insert(predictionPriceSnapshots).values({
        marketId: market.id,
        yesPriceBps: latestYesPriceBps,
        source: "trade",
        volumeMicros: lockedMarket.volumeMicros + addedVolumeMicros,
        recordedAt: now,
        createdAt: now,
      });
    };

    const oppositeSide: PredictionSide = input.side === "yes" ? "no" : "yes";
    const oppositeOrders = await transaction
      .select()
      .from(predictionOrders)
      .where(
        and(
          eq(predictionOrders.marketId, market.id),
          eq(predictionOrders.intent, "buy"),
          eq(predictionOrders.side, oppositeSide),
          inArray(predictionOrders.status, ["open", "partially-filled"]),
          ne(predictionOrders.personId, input.personId),
        ),
      )
      .orderBy(
        desc(predictionOrders.limitPriceBps),
        asc(predictionOrders.createdAt),
      );
    const fillOppositeBuyOrder = async (
      maker: (typeof oppositeOrders)[number],
    ) => {
      if (remaining <= 0) return;
      const yesLimitPriceBps =
        input.side === "yes" ? input.limitPriceBps : maker.limitPriceBps;
      const noLimitPriceBps =
        input.side === "no" ? input.limitPriceBps : maker.limitPriceBps;
      if (!predictionOrdersCross({ yesLimitPriceBps, noLimitPriceBps })) {
        return;
      }
      const fillShares = Math.min(remaining, maker.remainingSharesMicros);
      if (fillShares <= 0) return;
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

      await addPosition({
        accountId: account.id,
        personId: input.personId,
        side: input.side,
        sharesMicros: fillShares,
        costMicros: takerCost,
      });
      await addPosition({
        accountId: maker.accountId,
        personId: maker.personId,
        side: maker.side as PredictionSide,
        sharesMicros: fillShares,
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
    };

    // Existing same-side shares and newly paired opposite-side contracts
    // compete in one price-time queue. This guarantees that a taker receives
    // the best available execution regardless of how the claim was sourced.
    const prioritizedMakers = [
      ...directSellOrders.map((maker) => ({
        kind: "share-sale" as const,
        maker,
        sidePriceBps: maker.limitPriceBps,
      })),
      ...oppositeOrders.map((maker) => ({
        kind: "paired-buy" as const,
        maker,
        sidePriceBps: PREDICTION_PRICE_SCALE - maker.limitPriceBps,
      })),
    ].sort((left, right) =>
      comparePredictionMakerPriority(
        {
          sidePriceBps: left.sidePriceBps,
          createdAt: left.maker.createdAt,
          id: left.maker.id,
        },
        {
          sidePriceBps: right.sidePriceBps,
          createdAt: right.maker.createdAt,
          id: right.maker.id,
        },
      ),
    );
    for (const candidate of prioritizedMakers) {
      if (remaining <= 0) break;
      if (candidate.kind === "share-sale") {
        await fillDirectSellOrder(candidate.maker);
      } else {
        await fillOppositeBuyOrder(candidate.maker);
      }
    }

    // Community orders always receive priority. Any unfilled amount then uses
    // bounded Duna free-play liquidity, so a submitted prediction immediately
    // becomes a position and moves the market instead of silently resting in
    // an empty book.
    if (remaining > 0 && stakeMicros > spent) {
      const liquidityBudgetMicros = Math.max(0, stakeMicros - spent);
      const quote = predictionMarketLiquidityQuote({
        currentYesPriceBps: latestYesPriceBps,
        side: input.side,
        credits: predictionMicrosToCredits(liquidityBudgetMicros),
      });
      if (input.limitPriceBps >= quote.executionSidePriceBps) {
        const liquidityShares = predictionOrderSharesMicros({
          stakeMicros: liquidityBudgetMicros,
          limitPriceBps: quote.executionSidePriceBps,
        });
        const liquidityCostMicros = predictionSideCostMicros({
          sharesMicros: liquidityShares,
          side: input.side,
          sidePriceBps: quote.executionSidePriceBps,
        });
        await addPosition({
          accountId: account.id,
          personId: input.personId,
          side: input.side,
          sharesMicros: liquidityShares,
          costMicros: liquidityCostMicros,
        });
        remaining = 0;
        filledShares += liquidityShares;
        spent += liquidityCostMicros;
        latestYesPriceBps = quote.nextYesPriceBps;
        addedVolumeMicros += liquidityCostMicros;
        await transaction.insert(predictionPriceSnapshots).values({
          marketId: market.id,
          yesPriceBps: quote.nextYesPriceBps,
          source: "trade",
          volumeMicros: lockedMarket.volumeMicros + addedVolumeMicros,
          recordedAt: now,
          createdAt: now,
        });
      }
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
        sharesMicros: filledShares + remaining,
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

export async function placePredictionSellOrder(input: {
  readonly personId: string;
  readonly marketId: string;
  readonly side: PredictionSide;
  readonly shares: number;
  readonly limitPriceBps: number;
  readonly now?: Date;
}) {
  requireDatabase();
  validatePredictionPrice(input.limitPriceBps);
  let sharesMicros: number;
  try {
    sharesMicros = predictionSharesToMicros(input.shares);
  } catch (error) {
    throw new PredictionMarketError(
      "INVALID_ORDER",
      error instanceof Error ? error.message : "Enter a valid share quantity.",
    );
  }
  const now = input.now ?? new Date();
  const { account } = await ensurePredictionCreditAccount({
    personId: input.personId,
    now,
  });
  const database = getTransactionalDatabase();
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
    if (marketStatusForTime(market, now) !== "open") {
      throw new PredictionMarketError(
        "MARKET_CLOSED",
        "This prediction market is no longer accepting orders.",
      );
    }
    const position = await transaction.query.predictionPositions.findFirst({
      where: and(
        eq(predictionPositions.marketId, market.id),
        eq(predictionPositions.personId, input.personId),
        eq(predictionPositions.side, input.side),
        eq(predictionPositions.status, "open"),
      ),
    });
    if (
      !position ||
      position.sharesMicros - position.reservedSharesMicros < sharesMicros
    ) {
      throw new PredictionMarketError(
        "INSUFFICIENT_SHARES",
        "You do not have enough available shares to place this sell order.",
      );
    }
    const [reservedPosition] = await transaction
      .update(predictionPositions)
      .set({
        reservedSharesMicros: sql`${predictionPositions.reservedSharesMicros} + ${sharesMicros}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(predictionPositions.id, position.id),
          gte(
            sql`${predictionPositions.sharesMicros} - ${predictionPositions.reservedSharesMicros}`,
            sharesMicros,
          ),
        ),
      )
      .returning();
    if (!reservedPosition) {
      throw new PredictionMarketError(
        "INSUFFICIENT_SHARES",
        "Those shares are already committed to another sell order.",
      );
    }
    const [order] = await transaction
      .insert(predictionOrders)
      .values({
        marketId: market.id,
        accountId: account.id,
        personId: input.personId,
        intent: "sell",
        side: input.side,
        limitPriceBps: input.limitPriceBps,
        sharesMicros,
        remainingSharesMicros: sharesMicros,
        reservedMicros: 0,
        reservedSharesMicros: sharesMicros,
        spentMicros: 0,
        proceedsMicros: 0,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!order) throw new Error("Prediction sell order was not created.");
    await transaction.insert(predictionCreditLedger).values({
      accountId: account.id,
      personId: input.personId,
      deltaMicros: 0,
      kind: "sell-order",
      marketId: market.id,
      orderId: order.id,
      positionId: position.id,
      idempotencyKey: `prediction-order:${order.id}:sell-listing`,
      note: `Listed ${input.shares} shares of ${input.side === "yes" ? market.yesLabel : market.noLabel}`,
      metadata: {
        sharesMicros,
        limitPriceBps: input.limitPriceBps,
        nonCash: true,
        immutable: true,
      },
      occurredAt: now,
      createdAt: now,
    });

    const buyOrders = await transaction
      .select()
      .from(predictionOrders)
      .where(
        and(
          eq(predictionOrders.marketId, market.id),
          eq(predictionOrders.intent, "buy"),
          eq(predictionOrders.side, input.side),
          inArray(predictionOrders.status, ["open", "partially-filled"]),
          ne(predictionOrders.personId, input.personId),
        ),
      )
      .orderBy(
        desc(predictionOrders.limitPriceBps),
        asc(predictionOrders.createdAt),
      );
    let remaining = sharesMicros;
    let filledShares = 0;
    let proceedsMicros = 0;
    let positionShares = reservedPosition.sharesMicros;
    let positionReserved = reservedPosition.reservedSharesMicros;
    let positionCost = reservedPosition.costMicros;
    let latestYesPriceBps = market.lastYesPriceBps;
    let addedVolumeMicros = 0;
    for (const maker of buyOrders) {
      if (remaining <= 0) break;
      if (
        !predictionShareOrdersCross({
          buyLimitPriceBps: maker.limitPriceBps,
          sellLimitPriceBps: input.limitPriceBps,
        })
      ) {
        break;
      }
      const fillShares = Math.min(remaining, maker.remainingSharesMicros);
      if (fillShares <= 0) continue;
      const saleCreditsMicros = predictionSideCostMicros({
        sharesMicros: fillShares,
        side: input.side,
        sidePriceBps: maker.limitPriceBps,
      });
      const costBasisReduction = predictionSaleCostBasisMicros({
        positionSharesMicros: positionShares,
        positionCostMicros: positionCost,
        soldSharesMicros: fillShares,
      });
      const [trade] = await transaction
        .insert(predictionShareTrades)
        .values({
          marketId: market.id,
          side: input.side,
          buyOrderId: maker.id,
          sellOrderId: order.id,
          sellerPositionId: position.id,
          makerOrderId: maker.id,
          sharesMicros: fillShares,
          priceBps: maker.limitPriceBps,
          costMicros: saleCreditsMicros,
          executedAt: now,
          createdAt: now,
        })
        .returning({ id: predictionShareTrades.id });
      if (!trade) throw new Error("Prediction share trade was not recorded.");
      await transaction
        .insert(predictionPositions)
        .values({
          marketId: market.id,
          accountId: maker.accountId,
          personId: maker.personId,
          side: input.side,
          sharesMicros: fillShares,
          costMicros: saleCreditsMicros,
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
            costMicros: sql`${predictionPositions.costMicros} + ${saleCreditsMicros}`,
            updatedAt: now,
          },
        });
      positionShares -= fillShares;
      positionReserved -= fillShares;
      positionCost -= costBasisReduction;
      await transaction
        .update(predictionPositions)
        .set({
          sharesMicros: positionShares,
          reservedSharesMicros: positionReserved,
          costMicros: positionCost,
          updatedAt: now,
        })
        .where(eq(predictionPositions.id, position.id));
      const makerRemaining = maker.remainingSharesMicros - fillShares;
      const makerReserve = predictionSideCostMicros({
        sharesMicros: makerRemaining,
        side: input.side,
        sidePriceBps: maker.limitPriceBps,
      });
      const makerRefund = Math.max(
        0,
        maker.reservedMicros - saleCreditsMicros - makerReserve,
      );
      await transaction
        .update(predictionOrders)
        .set({
          remainingSharesMicros: makerRemaining,
          reservedMicros: makerReserve,
          spentMicros: maker.spentMicros + saleCreditsMicros,
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
          idempotencyKey: `prediction-share-trade:${trade.id}:buyer-refund`,
          note: "Returned unused prediction credits after a share purchase",
          metadata: { tradeId: trade.id, nonCash: true },
          occurredAt: now,
          createdAt: now,
        });
      }
      await transaction
        .update(predictionCreditAccounts)
        .set({
          cachedAvailableMicros: sql`${predictionCreditAccounts.cachedAvailableMicros} + ${saleCreditsMicros}`,
          updatedAt: now,
        })
        .where(eq(predictionCreditAccounts.id, account.id));
      await transaction.insert(predictionCreditLedger).values({
        accountId: account.id,
        personId: input.personId,
        deltaMicros: saleCreditsMicros,
        kind: "sale-proceeds",
        marketId: market.id,
        orderId: order.id,
        positionId: position.id,
        idempotencyKey: `prediction-share-trade:${trade.id}:seller-proceeds`,
        note: `Sold ${predictionMicrosToCredits(fillShares)} shares of ${input.side === "yes" ? market.yesLabel : market.noLabel}`,
        metadata: {
          tradeId: trade.id,
          sharesMicros: fillShares,
          priceBps: maker.limitPriceBps,
          nonCash: true,
        },
        occurredAt: now,
        createdAt: now,
      });
      remaining -= fillShares;
      filledShares += fillShares;
      proceedsMicros += saleCreditsMicros;
      latestYesPriceBps =
        input.side === "yes"
          ? maker.limitPriceBps
          : PREDICTION_PRICE_SCALE - maker.limitPriceBps;
      addedVolumeMicros += fillShares;
      await transaction.insert(predictionPriceSnapshots).values({
        marketId: market.id,
        yesPriceBps: latestYesPriceBps,
        source: "trade",
        volumeMicros: market.volumeMicros + addedVolumeMicros,
        recordedAt: now,
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
        reservedSharesMicros: remaining,
        proceedsMicros,
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
      proceedsCredits: predictionMicrosToCredits(proceedsMicros),
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
  readonly actorPersonId?: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
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
        .where(
          and(
            eq(predictionPositions.marketId, market.id),
            eq(predictionPositions.status, "open"),
            gte(predictionPositions.sharesMicros, 1),
          ),
        ),
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
      if (order.intent === "sell" && order.reservedSharesMicros > 0) {
        const position = await transaction.query.predictionPositions.findFirst({
          where: and(
            eq(predictionPositions.marketId, market.id),
            eq(predictionPositions.personId, order.personId),
            eq(predictionPositions.side, order.side),
            eq(predictionPositions.status, "open"),
          ),
        });
        if (position) {
          await transaction
            .update(predictionPositions)
            .set({
              reservedSharesMicros: Math.max(
                0,
                position.reservedSharesMicros - order.reservedSharesMicros,
              ),
              updatedAt: now,
            })
            .where(eq(predictionPositions.id, position.id));
        }
        await transaction.insert(predictionCreditLedger).values({
          accountId: order.accountId,
          personId: order.personId,
          deltaMicros: 0,
          kind: "sell-release",
          marketId: market.id,
          orderId: order.id,
          positionId: position?.id,
          idempotencyKey: `prediction-market:${market.id}:release-sell-order:${order.id}`,
          note: "Released unsold shares when the prediction market closed",
          metadata: {
            sharesMicros: order.reservedSharesMicros,
            nonCash: true,
          },
          occurredAt: now,
          createdAt: now,
        });
      } else if (order.reservedMicros > 0) {
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
        .set({
          status: "void",
          reservedMicros: 0,
          reservedSharesMicros: 0,
          updatedAt: now,
        })
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
    await transaction.insert(auditLog).values({
      actorPersonId: input.actorPersonId,
      actorType: input.actorPersonId ? "person" : "system",
      action: "prediction-market.determined",
      entityType: "prediction-market",
      entityId: market.id,
      beforeHash: stableHash({
        status: market.status,
        resolvedSide: market.resolvedSide,
        settledAt: market.settledAt,
      }),
      afterHash: stableHash({
        status: "settled",
        resolvedSide: input.resolvedSide,
        settledAt: now,
      }),
      reason:
        input.reason ??
        "Verified source result determined the credits-only prediction market.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: now,
    });
    return { marketId: market.id, settled: true as const };
  });
}

function validatedManualScore(input: {
  readonly winnerSide: "A" | "B";
  readonly sets: readonly { readonly a: number; readonly b: number }[];
}) {
  if (input.sets.length < 2 || input.sets.length > 5) {
    throw new PredictionMarketError(
      "INVALID_ORDER",
      "Enter the completed set scores (between two and five sets).",
    );
  }
  const setWins = input.sets.reduce(
    (wins, set) => {
      if (
        !Number.isInteger(set.a) ||
        !Number.isInteger(set.b) ||
        set.a < 0 ||
        set.b < 0 ||
        set.a === set.b
      ) {
        throw new PredictionMarketError(
          "INVALID_ORDER",
          "Every set needs two non-negative, non-tied scores.",
        );
      }
      return set.a > set.b
        ? { ...wins, A: wins.A + 1 }
        : { ...wins, B: wins.B + 1 };
    },
    { A: 0, B: 0 },
  );
  const scoreWinner = setWins.A > setWins.B ? "A" : "B";
  if (scoreWinner !== input.winnerSide) {
    throw new PredictionMarketError(
      "INVALID_ORDER",
      "The declared winner must have won more submitted sets.",
    );
  }
  return input.sets.map((set) => ({ a: set.a, b: set.b }));
}

/**
 * Records a SuperAdmin-verified professional result when an upstream scorer is
 * incomplete. The manual evidence stays attached to the source payload so a
 * later partial scrape cannot make the public result disappear.
 */
export async function recordManualProMatchResult(input: {
  readonly matchId: string;
  readonly winnerSide: "A" | "B";
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly actorPersonId: string;
  readonly reason: string;
  readonly sourceUrl?: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const sets = validatedManualScore(input);
  const database = getTransactionalDatabase();
  const result = await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.matchId}))`,
    );
    const match = await transaction.query.importedMatches.findFirst({
      where: eq(importedMatches.id, input.matchId),
    });
    if (!match) {
      throw new PredictionMarketError("MARKET_NOT_FOUND", "Match not found.");
    }
    const previousPayload =
      match.rawPayload &&
      typeof match.rawPayload === "object" &&
      !Array.isArray(match.rawPayload)
        ? match.rawPayload
        : {};
    const manualResult = {
      winnerSide: input.winnerSide,
      sets,
      reason: input.reason,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      submittedByPersonId: input.actorPersonId,
      submittedAt: now.toISOString(),
    };
    await transaction
      .update(importedMatches)
      .set({
        sets,
        winnerSide: input.winnerSide,
        rawPayload: { ...previousPayload, dunaManualResult: manualResult },
        updatedAt: now,
      })
      .where(eq(importedMatches.id, match.id));
    await transaction.insert(auditLog).values({
      actorPersonId: input.actorPersonId,
      actorType: "person",
      action: "professional-match.result.recorded",
      entityType: "imported-match",
      entityId: match.id,
      beforeHash: stableHash({
        sets: match.sets,
        winnerSide: match.winnerSide,
        manualResult: (previousPayload as Record<string, unknown>)
          .dunaManualResult,
      }),
      afterHash: stableHash({
        sets,
        winnerSide: input.winnerSide,
        manualResult,
      }),
      reason: input.reason,
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: now,
    });
    const markets = await transaction
      .select({ id: predictionMarkets.id })
      .from(predictionMarkets)
      .where(
        and(
          eq(predictionMarkets.subjectType, "pro-match"),
          eq(predictionMarkets.subjectId, match.id),
          inArray(predictionMarkets.status, ["open", "locked"]),
        ),
      );
    return { marketIds: markets.map((market) => market.id), manualResult };
  });
  let settledMarkets = 0;
  for (const marketId of result.marketIds) {
    const settlement = await settlePredictionMarket({
      marketId,
      resolvedSide: input.winnerSide === "A" ? "yes" : "no",
      actorPersonId: input.actorPersonId,
      reason: `Manual score result: ${input.reason}`,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      now,
    });
    if (settlement.settled) settledMarkets += 1;
  }
  return {
    matchId: input.matchId,
    winnerSide: input.winnerSide,
    settledMarkets,
    manualResult: result.manualResult,
  };
}

export async function settleResolvedPredictionMarkets(input?: {
  readonly limit?: number;
  readonly now?: Date;
  readonly actorPersonId?: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
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
          and(
            inArray(matches.status, ["verified", "complete", "forfeit"]),
            sql`${matches.winnerTeamId} is not null`,
          ),
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
      actorPersonId: input?.actorPersonId,
      reason: input?.reason,
      requestId: input?.requestId,
      ipAddress: input?.ipAddress,
      now,
    });
    if (result.settled) settled += 1;
  }
  return { settled };
}

export async function settleDeterminedMatchPredictionMarket(input: {
  readonly matchId: string;
  readonly now?: Date;
}) {
  const definition = await loadPublicMatchPredictionDefinition(input.matchId);
  if (!definition?.resolvedSide) return { settled: false as const };
  const market = await ensurePredictionMarket(definition);
  return settlePredictionMarket({
    marketId: market.id,
    resolvedSide: definition.resolvedSide,
    now: input.now,
  });
}

export function predictionMarketPath(
  market: Pick<
    typeof predictionMarkets.$inferSelect,
    "sourceSnapshot" | "subjectId" | "subjectType"
  >,
) {
  const snapshot = market.sourceSnapshot as Record<string, unknown>;
  const canonicalPath = snapshot.canonicalPath;
  if (typeof canonicalPath === "string" && canonicalPath.startsWith("/")) {
    return canonicalPath;
  }
  if (market.subjectType === "match") {
    return `/app/matches/${market.subjectId}`;
  }
  const eventSlug = snapshot.eventSlug;
  if (typeof eventSlug === "string" && eventSlug.length > 0) {
    if (market.subjectType === "pro-match") {
      return `/events/${eventSlug}`;
    }
    return `/events/${eventSlug}#prediction-markets`;
  }
  return "/app/wallet";
}

type PredictionDiscoveryCandidate = {
  readonly definition: PredictionMarketDefinition;
  readonly competition: string;
  readonly scheduledAt?: Date;
  readonly relevance:
    | "your-match"
    | "following-player"
    | "following-event"
    | "live-pro"
    | "upcoming-pro";
  readonly reason: string;
  readonly source: "duna" | "avp" | "fivb";
  readonly score: number;
};

function inferredYesPriceBps(input: {
  readonly teamARating?: number;
  readonly teamBRating?: number;
}) {
  const chance =
    input.teamARating === undefined || input.teamBRating === undefined
      ? 50
      : (1 / (1 + 10 ** ((input.teamBRating - input.teamARating) / 2))) * 100;
  return Math.max(100, Math.min(9_900, Math.round(chance * 100)));
}

export async function loadPredictionDiscovery(input?: {
  readonly viewerPersonId?: string;
  readonly limit?: number;
  readonly now?: Date;
}) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(input?.limit ?? 8, 20));
  if (!isDatabaseConfigured()) {
    return {
      items: [],
      personalizationApplied: Boolean(input?.viewerPersonId),
      updatedAt: now.toISOString(),
    };
  }
  const database = getDatabase();
  const [followRows, genericMatches, proCoverage] = await Promise.all([
    input?.viewerPersonId
      ? database
          .select({
            entityType: follows.entityType,
            entityId: follows.entityId,
          })
          .from(follows)
          .where(eq(follows.followerPersonId, input.viewerPersonId))
      : Promise.resolve([]),
    input?.viewerPersonId
      ? database
          .select({
            matchId: matches.id,
            teamAId: matches.teamAId,
            teamBId: matches.teamBId,
            createdByPersonId: matches.createdByPersonId,
            status: matches.status,
            scheduledAt: matches.scheduledAt,
            sessionTitle: sessions.title,
          })
          .from(matches)
          .innerJoin(divisions, eq(matches.divisionId, divisions.id))
          .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
          .where(
            and(
              inArray(matches.status, ["scheduled", "warmup", "live"]),
              inArray(sessions.status, [
                "published",
                "registration-open",
                "live",
                "weather-hold",
              ]),
            ),
          )
          .orderBy(asc(matches.scheduledAt))
          .limit(120)
      : Promise.resolve([]),
    loadPublicProCoverage(now),
  ]);
  const followedPeople = new Set(
    followRows
      .filter((follow) => follow.entityType === "person")
      .map((follow) => follow.entityId),
  );
  const followedEvents = new Set(
    followRows
      .filter((follow) => follow.entityType === "professional-event")
      .map((follow) => follow.entityId),
  );
  const teamIds = [
    ...new Set(
      genericMatches.flatMap((match) =>
        [match.teamAId, match.teamBId].filter((teamId): teamId is string =>
          Boolean(teamId),
        ),
      ),
    ),
  ];
  const genericMembers = teamIds.length
    ? await database
        .select({ teamId: teamMembers.teamId, personId: teamMembers.personId })
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds))
    : [];
  const candidates: PredictionDiscoveryCandidate[] = [];
  for (const match of genericMatches) {
    if (!match.teamAId || !match.teamBId) continue;
    if (
      match.status === "scheduled" &&
      match.scheduledAt &&
      match.scheduledAt.getTime() < now.getTime() - 6 * 60 * 60_000
    ) {
      continue;
    }
    const memberIds = genericMembers
      .filter(
        (member) =>
          member.teamId === match.teamAId || member.teamId === match.teamBId,
      )
      .map((member) => member.personId);
    const isOwn =
      memberIds.includes(input?.viewerPersonId ?? "") ||
      match.createdByPersonId === input?.viewerPersonId;
    const followed = memberIds.some((personId) => followedPeople.has(personId));
    if (!isOwn && !followed) continue;
    const definition = await loadPublicMatchPredictionDefinition(match.matchId);
    if (!definition) continue;
    candidates.push({
      definition,
      competition: match.sessionTitle,
      scheduledAt: match.scheduledAt ?? undefined,
      relevance: isOwn ? "your-match" : "following-player",
      reason: isOwn
        ? "Your upcoming match"
        : "A player you follow is on the court",
      source: "duna",
      score: isOwn ? 500 : 400,
    });
  }
  const eventsByExternalId = new Map(
    proCoverage.events.map((event) => [
      `${event.source}:${event.externalEventId}`,
      event,
    ]),
  );
  for (const match of proCoverage.matches) {
    if (
      (match.status !== "live" && match.status !== "scheduled") ||
      (match.source !== "avp" && match.source !== "fivb") ||
      !match.canonicalPath ||
      match.teamA.label === "TBD" ||
      match.teamB.label === "TBD"
    ) {
      continue;
    }
    const event = eventsByExternalId.get(
      `${match.source}:${match.externalEventId ?? ""}`,
    );
    if (!event) continue;
    const playerIds = [...match.teamA.players, ...match.teamB.players].flatMap(
      (player) => (player.personId ? [player.personId] : []),
    );
    const followsPlayer = playerIds.some((personId) =>
      followedPeople.has(personId),
    );
    const followsEvent = followedEvents.has(event.id);
    const relevance = followsEvent
      ? ("following-event" as const)
      : followsPlayer
        ? ("following-player" as const)
        : match.status === "live"
          ? ("live-pro" as const)
          : ("upcoming-pro" as const);
    const scheduledAt = match.scheduledAt
      ? new Date(match.scheduledAt)
      : undefined;
    if (
      match.status === "scheduled" &&
      scheduledAt &&
      scheduledAt.getTime() < now.getTime() - 6 * 60 * 60_000
    ) {
      continue;
    }
    candidates.push({
      definition: {
        subjectType: "pro-match",
        subjectId: match.id,
        groupKey: `pro-event:${event.id}`,
        title: `${match.teamA.label} vs ${match.teamB.label}`,
        yesLabel: match.teamA.label,
        noLabel: match.teamB.label,
        initialYesPriceBps: inferredYesPriceBps({
          teamARating: match.teamA.averageRating,
          teamBRating: match.teamB.averageRating,
        }),
        locksAt: scheduledAt,
        sourceSnapshot: {
          eventId: event.id,
          eventSlug: event.slug,
          canonicalPath: match.canonicalPath,
          roundLabel: match.roundLabel,
          source: event.source,
          modelBasis:
            match.teamA.averageRating !== undefined &&
            match.teamB.averageRating !== undefined
              ? "SandRating"
              : "Even prior",
        },
      },
      competition: event.name,
      scheduledAt,
      relevance,
      reason: followsEvent
        ? "From a pro event you follow"
        : followsPlayer
          ? "A player you follow is in this match"
          : match.status === "live"
            ? "Live pro match"
            : event.source === "avp"
              ? "Upcoming AVP League match"
              : "Upcoming pro match",
      source: event.source,
      score:
        (followsEvent ? 350 : 0) +
        (followsPlayer ? 325 : 0) +
        (match.status === "live" ? 300 : 100),
    });
  }
  const sortedCandidates = candidates.sort(
    (left, right) =>
      right.score - left.score ||
      (left.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );
  const selectedByMarket = new Map<string, (typeof sortedCandidates)[number]>();
  for (const candidate of sortedCandidates) {
    const key = `${candidate.definition.subjectType}:${candidate.definition.subjectId}`;
    if (!selectedByMarket.has(key)) selectedByMarket.set(key, candidate);
  }
  const selected = [...selectedByMarket.values()].slice(0, limit * 2);
  const loaded = await Promise.all(
    selected.map(async (candidate) => {
      try {
        const stored = await ensurePredictionMarket(candidate.definition);
        if (
          !predictionMarketLabelsMatchDefinition({
            market: stored,
            definition: candidate.definition,
          })
        ) {
          return undefined;
        }
        const market = await loadPredictionMarket({
          subjectType: candidate.definition.subjectType,
          subjectId: candidate.definition.subjectId,
          viewerPersonId: input?.viewerPersonId,
          now,
        });
        return market
          ? {
              market,
              marketPath: predictionMarketPath(stored),
              competition: candidate.competition,
              scheduledAt: candidate.scheduledAt?.toISOString(),
              relevance: candidate.relevance,
              reason: candidate.reason,
              source: candidate.source,
            }
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return {
    items: loaded
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, limit),
    personalizationApplied: Boolean(input?.viewerPersonId),
    updatedAt: now.toISOString(),
  };
}

function ruleView(
  market: typeof predictionMarkets.$inferSelect,
  row?: typeof predictionMarketRuleVersions.$inferSelect,
) {
  const fallback = defaultPredictionMarketRules({
    subjectType:
      market.subjectType as PredictionMarketDefinition["subjectType"],
    yesLabel: market.yesLabel,
    noLabel: market.noLabel,
  });
  return {
    version: row?.version ?? market.currentRuleVersion,
    resolutionCriteria: row?.resolutionCriteria ?? fallback.resolutionCriteria,
    resolutionSource: row?.resolutionSource ?? fallback.resolutionSource,
    closePolicy: row?.closePolicy ?? fallback.closePolicy,
    publicNote: row?.publicNote ?? fallback.publicNote,
    effectiveAt: (row?.createdAt ?? market.createdAt).toISOString(),
  };
}

export async function loadAdminPredictionOverview(input?: {
  readonly canManage?: boolean;
  readonly now?: Date;
}) {
  const now = input?.now ?? new Date();
  if (!isDatabaseConfigured()) {
    return {
      metrics: {
        totalMarkets: 0,
        openMarkets: 0,
        lockedMarkets: 0,
        determinedMarkets: 0,
        predictorCount: 0,
        volumeCredits: 0,
      },
      markets: [],
      manualResultMatches: [],
      canManage: Boolean(input?.canManage),
      updatedAt: now.toISOString(),
    };
  }
  const database = getDatabase();
  const marketRows = await database
    .select()
    .from(predictionMarkets)
    .orderBy(desc(predictionMarkets.updatedAt))
    .limit(250);
  const marketIds = marketRows.map((market) => market.id);
  const proMatchIds = marketRows
    .filter(
      (market) =>
        market.subjectType === "pro-match" &&
        (market.status === "open" || market.status === "locked"),
    )
    .map((market) => market.subjectId);
  const [
    ruleRows,
    positionRows,
    orderRows,
    manualResultRows,
    marketMetrics,
    predictorMetrics,
  ] = await Promise.all([
    marketIds.length
      ? database
          .select({
            rule: predictionMarketRuleVersions,
            createdByHandle: people.handle,
          })
          .from(predictionMarketRuleVersions)
          .leftJoin(
            people,
            eq(predictionMarketRuleVersions.createdByPersonId, people.id),
          )
          .where(inArray(predictionMarketRuleVersions.marketId, marketIds))
          .orderBy(desc(predictionMarketRuleVersions.version))
      : Promise.resolve([]),
    marketIds.length
      ? database
          .select({
            marketId: predictionPositions.marketId,
            personId: predictionPositions.personId,
            handle: people.handle,
            side: predictionPositions.side,
            sharesMicros: predictionPositions.sharesMicros,
            status: predictionPositions.status,
            updatedAt: predictionPositions.updatedAt,
          })
          .from(predictionPositions)
          .innerJoin(people, eq(predictionPositions.personId, people.id))
          .where(
            and(
              inArray(predictionPositions.marketId, marketIds),
              gte(predictionPositions.sharesMicros, 1),
            ),
          )
      : Promise.resolve([]),
    marketIds.length
      ? database
          .select({ marketId: predictionOrders.marketId })
          .from(predictionOrders)
          .where(
            and(
              inArray(predictionOrders.marketId, marketIds),
              inArray(predictionOrders.status, ["open", "partially-filled"]),
            ),
          )
      : Promise.resolve([]),
    proMatchIds.length
      ? database
          .select({
            id: importedMatches.id,
            title: importedMatches.title,
            playedAt: importedMatches.playedAt,
            sets: importedMatches.sets,
            winnerSide: importedMatches.winnerSide,
          })
          .from(importedMatches)
          .where(inArray(importedMatches.id, proMatchIds))
      : Promise.resolve([]),
    database
      .select({
        totalMarkets: sql<number>`count(*)::int`,
        openMarkets: sql<number>`count(*) filter (where ${predictionMarkets.status} = 'open')::int`,
        lockedMarkets: sql<number>`count(*) filter (where ${predictionMarkets.status} = 'locked')::int`,
        determinedMarkets: sql<number>`count(*) filter (where ${predictionMarkets.status} = 'settled')::int`,
        volumeMicros: sql<number>`coalesce(sum(${predictionMarkets.volumeMicros}), 0)`,
      })
      .from(predictionMarkets),
    database
      .select({
        predictorCount: sql<number>`count(distinct ${predictionPositions.personId})::int`,
      })
      .from(predictionPositions),
  ]);
  const metrics = marketMetrics[0];
  const predictorMetric = predictorMetrics[0];
  return {
    metrics: {
      totalMarkets: Number(metrics?.totalMarkets ?? 0),
      openMarkets: Number(metrics?.openMarkets ?? 0),
      lockedMarkets: Number(metrics?.lockedMarkets ?? 0),
      determinedMarkets: Number(metrics?.determinedMarkets ?? 0),
      predictorCount: Number(predictorMetric?.predictorCount ?? 0),
      volumeCredits: predictionMicrosToCredits(
        Number(metrics?.volumeMicros ?? 0),
      ),
    },
    markets: marketRows.map((market) => {
      const marketRules = ruleRows.filter(
        ({ rule }) => rule.marketId === market.id,
      );
      const currentRule = marketRules.find(
        ({ rule }) => rule.version === market.currentRuleVersion,
      )?.rule;
      const marketPositions = positionRows.filter(
        (position) => position.marketId === market.id,
      );
      return {
        id: market.id,
        subjectType: market.subjectType,
        subjectId: market.subjectId,
        title: market.title,
        yesLabel: market.yesLabel,
        noLabel: market.noLabel,
        status: marketStatusForTime(market, now),
        resolvedSide:
          market.resolvedSide === "yes" || market.resolvedSide === "no"
            ? (market.resolvedSide as PredictionSide)
            : undefined,
        opensAt: market.opensAt.toISOString(),
        locksAt: market.locksAt?.toISOString(),
        determinedAt: market.settledAt?.toISOString(),
        marketPath: predictionMarketPath(market),
        participantCount: new Set(
          marketPositions.map((position) => position.personId),
        ).size,
        openOrderCount: orderRows.filter(
          (order) => order.marketId === market.id,
        ).length,
        volumeCredits: predictionMicrosToCredits(market.volumeMicros),
        rules: ruleView(market, currentRule),
        ruleHistory: marketRules.map(({ rule, createdByHandle }) => ({
          ...ruleView(market, rule),
          changeReason: rule.changeReason,
          createdByHandle: createdByHandle ?? undefined,
        })),
        predictors: marketPositions.map((position) => ({
          handle: position.handle,
          side: position.side as PredictionSide,
          shares: predictionMicrosToCredits(position.sharesMicros),
          status: predictionPositionStatus(position.status),
          updatedAt: position.updatedAt.toISOString(),
        })),
      };
    }),
    manualResultMatches: manualResultRows.map((match) => {
      const linkedMarkets = marketRows.filter(
        (market) =>
          market.subjectType === "pro-match" &&
          market.subjectId === match.id &&
          (market.status === "open" || market.status === "locked"),
      );
      const primary = linkedMarkets[0];
      return {
        id: match.id,
        title: match.title,
        yesLabel: primary?.yesLabel ?? "Team A",
        noLabel: primary?.noLabel ?? "Team B",
        playedAt: match.playedAt?.toISOString(),
        sets: match.sets,
        winnerSide:
          match.winnerSide === "A" || match.winnerSide === "B"
            ? (match.winnerSide as "A" | "B")
            : undefined,
        marketCount: linkedMarkets.length,
      };
    }),
    canManage: Boolean(input?.canManage),
    updatedAt: now.toISOString(),
  };
}

export async function updatePredictionMarketRules(input: {
  readonly marketId: string;
  readonly actorPersonId: string;
  readonly resolutionCriteria: string;
  readonly resolutionSource: string;
  readonly closePolicy: string;
  readonly publicNote?: string;
  readonly locksAt?: Date | null;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getTransactionalDatabase();
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
    if (market.status === "settled" || market.status === "void") {
      throw new PredictionMarketError(
        "MARKET_CLOSED",
        "Determined or void markets keep their historical rules unchanged.",
      );
    }
    let currentRule =
      await transaction.query.predictionMarketRuleVersions.findFirst({
        where: and(
          eq(predictionMarketRuleVersions.marketId, market.id),
          eq(predictionMarketRuleVersions.version, market.currentRuleVersion),
        ),
      });
    if (!currentRule) {
      const fallback = defaultPredictionMarketRules({
        subjectType:
          market.subjectType as PredictionMarketDefinition["subjectType"],
        yesLabel: market.yesLabel,
        noLabel: market.noLabel,
      });
      [currentRule] = await transaction
        .insert(predictionMarketRuleVersions)
        .values({
          marketId: market.id,
          version: market.currentRuleVersion,
          ...fallback,
          locksAt: market.locksAt,
          changeReason: "Initial market rules",
          createdAt: market.createdAt,
        })
        .onConflictDoNothing()
        .returning();
      currentRule ??=
        await transaction.query.predictionMarketRuleVersions.findFirst({
          where: and(
            eq(predictionMarketRuleVersions.marketId, market.id),
            eq(predictionMarketRuleVersions.version, market.currentRuleVersion),
          ),
        });
    }
    const version = market.currentRuleVersion + 1;
    const locksAt =
      input.locksAt === undefined ? market.locksAt : input.locksAt;
    const [saved] = await transaction
      .insert(predictionMarketRuleVersions)
      .values({
        marketId: market.id,
        version,
        resolutionCriteria: input.resolutionCriteria.trim(),
        resolutionSource: input.resolutionSource.trim(),
        closePolicy: input.closePolicy.trim(),
        publicNote: input.publicNote?.trim() || undefined,
        locksAt,
        changeReason: input.reason.trim(),
        createdByPersonId: input.actorPersonId,
        createdAt: now,
      })
      .returning();
    if (!saved) throw new Error("Prediction market rules were not saved.");
    await transaction
      .update(predictionMarkets)
      .set({ currentRuleVersion: version, locksAt, updatedAt: now })
      .where(eq(predictionMarkets.id, market.id));
    await transaction.insert(auditLog).values({
      actorPersonId: input.actorPersonId,
      actorType: "person",
      action: "prediction-market.rules.updated",
      entityType: "prediction-market",
      entityId: market.id,
      beforeHash: stableHash(
        currentRule ? ruleView(market, currentRule) : null,
      ),
      afterHash: stableHash(
        ruleView({ ...market, currentRuleVersion: version }, saved),
      ),
      reason: input.reason.trim(),
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: now,
    });
    return { marketId: market.id, version };
  });
}

export async function setPredictionMarketTradingStatus(input: {
  readonly marketId: string;
  readonly action: "lock" | "reopen";
  readonly actorPersonId: string;
  readonly reason: string;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly now?: Date;
}) {
  requireDatabase();
  const now = input.now ?? new Date();
  const database = getTransactionalDatabase();
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
    if (market.status === "settled" || market.status === "void") {
      throw new PredictionMarketError(
        "MARKET_CLOSED",
        "Determined or void markets cannot reopen.",
      );
    }
    const status: "open" | "locked" =
      input.action === "lock" ? "locked" : "open";
    const locksAt =
      input.action === "reopen" && market.locksAt && market.locksAt <= now
        ? null
        : market.locksAt;
    await transaction
      .update(predictionMarkets)
      .set({ status, locksAt, updatedAt: now })
      .where(eq(predictionMarkets.id, market.id));
    await transaction.insert(auditLog).values({
      actorPersonId: input.actorPersonId,
      actorType: "person",
      action: `prediction-market.${input.action}`,
      entityType: "prediction-market",
      entityId: market.id,
      beforeHash: stableHash({
        status: market.status,
        locksAt: market.locksAt,
      }),
      afterHash: stableHash({ status, locksAt }),
      reason: input.reason.trim(),
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: now,
    });
    return { marketId: market.id, status };
  });
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
      portfolio: {
        openPositions: 0,
        openOrders: 0,
        determinedPositions: 0,
        wins: 0,
        losses: 0,
        voids: 0,
        openCostCredits: 0,
        currentValueCredits: 0,
        unrealizedCredits: 0,
        settledCostCredits: 0,
        settledPayoutCredits: 0,
        netSettledCredits: 0,
      },
      positions: [],
      openOrders: [],
      activity: [],
      integrity: {
        algorithm: "SHA-256" as const,
        chainVersion: 1 as const,
        entryCount: 0,
        verified: true,
      },
      rules: predictionCreditRules,
    };
  }
  const now = input.now ?? new Date();
  const ensured = await ensurePredictionCreditAccount({
    personId: input.personId,
    now,
  });
  const database = getDatabase();
  const [positions, orders, ledger, integrityResult] = await Promise.all([
    database
      .select({ position: predictionPositions, market: predictionMarkets })
      .from(predictionPositions)
      .innerJoin(
        predictionMarkets,
        eq(predictionPositions.marketId, predictionMarkets.id),
      )
      .where(
        and(
          eq(predictionPositions.personId, input.personId),
          or(
            gte(predictionPositions.sharesMicros, 1),
            ne(predictionPositions.status, "open"),
          ),
        ),
      )
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
      .select({ entry: predictionCreditLedger, market: predictionMarkets })
      .from(predictionCreditLedger)
      .leftJoin(
        predictionMarkets,
        eq(predictionCreditLedger.marketId, predictionMarkets.id),
      )
      .where(eq(predictionCreditLedger.accountId, ensured.account.id))
      .orderBy(desc(predictionCreditLedger.occurredAt))
      .limit(100),
    database.execute(sql`
      select entry_count, head_hash, verified
      from prediction_credit_ledger_integrity(${ensured.account.id}::uuid)
    `),
  ]);
  const integrity = integrityResult.rows[0] as
    | {
        entry_count?: number | string;
        head_hash?: string | null;
        verified?: boolean;
      }
    | undefined;
  const positionViews = positions.map(({ position, market }) => {
    const side = position.side as PredictionSide;
    const currentPriceBps =
      side === "yes"
        ? market.lastYesPriceBps
        : PREDICTION_PRICE_SCALE - market.lastYesPriceBps;
    const currentValueMicros =
      position.status === "open"
        ? predictionSideCostMicros({
            sharesMicros: position.sharesMicros,
            side,
            sidePriceBps: currentPriceBps,
          })
        : position.payoutMicros;
    return {
      id: position.id,
      marketId: market.id,
      title: market.title,
      selectedLabel: side === "yes" ? market.yesLabel : market.noLabel,
      resolvedLabel:
        market.resolvedSide === "yes"
          ? market.yesLabel
          : market.resolvedSide === "no"
            ? market.noLabel
            : undefined,
      side,
      shares: predictionMicrosToCredits(position.sharesMicros),
      availableShares: predictionMicrosToCredits(
        position.sharesMicros - position.reservedSharesMicros,
      ),
      listedShares: predictionMicrosToCredits(position.reservedSharesMicros),
      costCredits: predictionMicrosToCredits(position.costMicros),
      payoutCredits: predictionMicrosToCredits(position.payoutMicros),
      currentValueCredits: predictionMicrosToCredits(currentValueMicros),
      netCredits: predictionMicrosToCredits(
        currentValueMicros - position.costMicros,
      ),
      currentPriceBps,
      status: predictionPositionStatus(position.status),
      marketStatus: marketStatusForTime(market, now),
      subjectType: market.subjectType,
      subjectId: market.subjectId,
      marketPath: predictionMarketPath(market),
      determinedAt: market.settledAt?.toISOString(),
      updatedAt: position.updatedAt.toISOString(),
    };
  });
  const openPositions = positionViews.filter(
    (position) => position.status === "open",
  );
  const determinedPositions = positionViews.filter(
    (position) => position.status !== "open",
  );
  const sumCredits = (
    rows: readonly (typeof positionViews)[number][],
    select: (row: (typeof positionViews)[number]) => number,
  ) => rows.reduce((total, row) => total + select(row), 0);
  return {
    availableCredits: predictionMicrosToCredits(
      ensured.account.cachedAvailableMicros,
    ),
    lifetimeGrantedCredits: predictionMicrosToCredits(
      ensured.account.lifetimeGrantedMicros,
    ),
    nextMonthlyGrantCredits: ensured.nextMonthlyGrantCredits,
    membershipPlan: ensured.membershipPlan,
    portfolio: {
      openPositions: openPositions.length,
      openOrders: orders.length,
      determinedPositions: determinedPositions.length,
      wins: determinedPositions.filter((position) => position.status === "won")
        .length,
      losses: determinedPositions.filter(
        (position) => position.status === "lost",
      ).length,
      voids: determinedPositions.filter(
        (position) => position.status === "void",
      ).length,
      openCostCredits: sumCredits(
        openPositions,
        (position) => position.costCredits,
      ),
      currentValueCredits: sumCredits(
        openPositions,
        (position) => position.currentValueCredits,
      ),
      unrealizedCredits: sumCredits(
        openPositions,
        (position) => position.netCredits,
      ),
      settledCostCredits: sumCredits(
        determinedPositions,
        (position) => position.costCredits,
      ),
      settledPayoutCredits: sumCredits(
        determinedPositions,
        (position) => position.payoutCredits,
      ),
      netSettledCredits: sumCredits(
        determinedPositions,
        (position) => position.netCredits,
      ),
    },
    positions: positionViews,
    openOrders: orders.map(({ order, market }) => ({
      id: order.id,
      marketId: market.id,
      intent: order.intent as "buy" | "sell",
      title: market.title,
      selectedLabel: order.side === "yes" ? market.yesLabel : market.noLabel,
      side: order.side as PredictionSide,
      limitPriceBps: order.limitPriceBps,
      reservedCredits: predictionMicrosToCredits(order.reservedMicros),
      filledCredits: predictionMicrosToCredits(order.spentMicros),
      openShares: predictionMicrosToCredits(order.remainingSharesMicros),
      filledShares: predictionMicrosToCredits(
        order.sharesMicros - order.remainingSharesMicros,
      ),
      proceedsCredits: predictionMicrosToCredits(order.proceedsMicros),
      status:
        order.status === "partially-filled"
          ? ("partially-filled" as const)
          : ("open" as const),
      marketPath: predictionMarketPath(market),
      createdAt: order.createdAt.toISOString(),
    })),
    activity: ledger.map(({ entry, market }) => ({
      id: entry.id,
      deltaCredits: predictionMicrosToCredits(entry.deltaMicros),
      kind: entry.kind,
      note: entry.note,
      marketId: entry.marketId ?? undefined,
      marketPath: market ? predictionMarketPath(market) : undefined,
      occurredAt: entry.occurredAt.toISOString(),
    })),
    integrity: {
      algorithm: "SHA-256" as const,
      chainVersion: 1 as const,
      entryCount: Number(integrity?.entry_count ?? 0),
      headHash: integrity?.head_hash ?? undefined,
      verified: integrity?.verified === true,
    },
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
  ordersImmutable: true,
  positionsTradable: true,
  ledgerHashAlgorithm: "SHA-256",
  contractPayoutCredits: 1,
} as const;

export type PredictionMarketView = z.infer<typeof predictionMarketSchema>;
export type PredictionWallet = z.infer<typeof predictionWalletSchema>;
