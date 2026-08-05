import {
  createInitialRating,
  performanceEvidenceFromSetScores,
  rateDoublesPerformance,
  resetWeeklyGain,
  type RatingState,
  type SetScore,
} from "./index";

export const ratingBacktestMethodologyVersion = "walk-forward-1.0";

export const ratingBacktestModelIds = [
  "even-prior",
  "elo-team-average",
  "elo-weak-link",
  "duna-win-only",
  "duna-score-aware",
  "adaptive-ensemble",
] as const;

export type RatingBacktestModelId = (typeof ratingBacktestModelIds)[number];

export interface RatingBacktestMatch {
  readonly id: string;
  readonly occurredAt: string | Date;
  readonly teamA: readonly [string, string];
  readonly teamB: readonly [string, string];
  readonly setScores: readonly SetScore[];
  readonly verificationWeight?: number;
}

export interface BacktestCalibrationBucket {
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly predictions: number;
  readonly averageExpected: number;
  readonly observedWinRate: number;
}

export interface BacktestCurvePoint {
  readonly matches: number;
  readonly brierScore: number;
  readonly logLoss: number;
}

export interface BacktestModelEvaluation {
  readonly modelId: RatingBacktestModelId;
  readonly label: string;
  readonly family: "baseline" | "elo" | "duna" | "online-ensemble";
  readonly sampleSize: number;
  readonly accuracy: number;
  readonly accuracyInterval95: readonly [number, number];
  readonly brierScore: number;
  readonly logLoss: number;
  readonly expectedCalibrationError: number;
  readonly areaUnderRocCurve: number;
  readonly calibration: readonly BacktestCalibrationBucket[];
  readonly curve: readonly BacktestCurvePoint[];
}

export interface BacktestPrediction {
  readonly matchId: string;
  readonly occurredAt: string;
  readonly actualTeamA: 0 | 1;
  readonly probabilities: Readonly<Record<RatingBacktestModelId, number>>;
  readonly ensembleWeights: Readonly<
    Record<Exclude<RatingBacktestModelId, "adaptive-ensemble">, number>
  >;
  readonly dunaPreMatchRatings: {
    readonly teamA: readonly [number, number];
    readonly teamB: readonly [number, number];
    readonly players: Readonly<Record<string, number>>;
  };
}

export interface RatingBacktestReport {
  readonly methodologyVersion: string;
  readonly generatedAt: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly matches: number;
  readonly players: number;
  readonly championModelId?: RatingBacktestModelId;
  readonly models: readonly BacktestModelEvaluation[];
  readonly predictions: readonly BacktestPrediction[];
}

const modelMetadata: Readonly<
  Record<
    RatingBacktestModelId,
    {
      readonly label: string;
      readonly family: BacktestModelEvaluation["family"];
    }
  >
> = {
  "even-prior": { label: "50% even prior", family: "baseline" },
  "elo-team-average": {
    label: "Elo team average",
    family: "elo",
  },
  "elo-weak-link": { label: "Elo weak-link", family: "elo" },
  "duna-win-only": { label: "Duna win-only ablation", family: "duna" },
  "duna-score-aware": {
    label: "Duna score-aware",
    family: "duna",
  },
  "adaptive-ensemble": {
    label: "Adaptive online ensemble",
    family: "online-ensemble",
  },
};

const componentModelIds = ratingBacktestModelIds.filter(
  (modelId): modelId is Exclude<RatingBacktestModelId, "adaptive-ensemble"> =>
    modelId !== "adaptive-ensemble",
);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function probabilityFromDifference(difference: number): number {
  return 1 / (1 + 10 ** (-difference / 400));
}

function teamAverage(
  ratings: Map<string, number>,
  team: readonly [string, string],
): number {
  return (getElo(ratings, team[0]) + getElo(ratings, team[1])) / 2;
}

function teamWeakLink(
  ratings: Map<string, number>,
  team: readonly [string, string],
): number {
  const values = [getElo(ratings, team[0]), getElo(ratings, team[1])].sort(
    (a, b) => a - b,
  );
  return values[0]! * 0.62 + values[1]! * 0.38;
}

function getElo(ratings: Map<string, number>, playerId: string): number {
  const existing = ratings.get(playerId);
  if (existing !== undefined) return existing;
  ratings.set(playerId, 1500);
  return 1500;
}

function updateElo(input: {
  readonly ratings: Map<string, number>;
  readonly teamA: readonly [string, string];
  readonly teamB: readonly [string, string];
  readonly expectedTeamA: number;
  readonly actualTeamA: 0 | 1;
  readonly k: number;
}) {
  const delta = input.k * (input.actualTeamA - input.expectedTeamA);
  for (const playerId of input.teamA) {
    input.ratings.set(playerId, getElo(input.ratings, playerId) + delta);
  }
  for (const playerId of input.teamB) {
    input.ratings.set(playerId, getElo(input.ratings, playerId) - delta);
  }
}

function getDunaState(
  ratings: Map<string, RatingState>,
  playerId: string,
): RatingState {
  const existing = ratings.get(playerId);
  if (existing) return existing;
  const created = createInitialRating({ playerId });
  ratings.set(playerId, created);
  return created;
}

function isoWeekKey(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function resetDunaWeekIfNeeded(input: {
  readonly states: Map<string, RatingState>;
  readonly weekByPlayer: Map<string, string>;
  readonly playerIds: readonly string[];
  readonly week: string;
}) {
  for (const playerId of input.playerIds) {
    const previousWeek = input.weekByPlayer.get(playerId);
    if (previousWeek && previousWeek !== input.week) {
      input.states.set(
        playerId,
        resetWeeklyGain(getDunaState(input.states, playerId)),
      );
    }
    input.weekByPlayer.set(playerId, input.week);
  }
}

function binaryWinner(setScores: readonly SetScore[]): 0 | 1 {
  let setsA = 0;
  let setsB = 0;
  for (const set of setScores) {
    if (set.a > set.b) setsA += 1;
    else if (set.b > set.a) setsB += 1;
  }
  if (setsA === setsB) throw new Error("Backtest match must have a set winner");
  return setsA > setsB ? 1 : 0;
}

function matchupKey(input: RatingBacktestMatch): string {
  const teamA = [...input.teamA].sort().join(":");
  const teamB = [...input.teamB].sort().join(":");
  return [teamA, teamB].sort().join("|");
}

function previousMeetingsInWindow(
  history: Map<string, number[]>,
  match: RatingBacktestMatch,
  occurredAt: Date,
): number {
  const key = matchupKey(match);
  const cutoff = occurredAt.getTime() - 30 * 86_400_000;
  const recent = (history.get(key) ?? []).filter((time) => time >= cutoff);
  history.set(key, [...recent, occurredAt.getTime()]);
  return recent.length;
}

function dunaPrediction(input: {
  readonly states: Map<string, RatingState>;
  readonly match: RatingBacktestMatch;
  readonly actualTeamA: number;
  readonly pointShareTeamA: number;
  readonly marginMultiplier: number;
  readonly previousPairMeetingsInWindow: number;
}) {
  const result = rateDoublesPerformance({
    teamA: input.match.teamA.map((playerId) => ({
      state: getDunaState(input.states, playerId),
    })) as unknown as readonly [
      { readonly state: RatingState },
      { readonly state: RatingState },
    ],
    teamB: input.match.teamB.map((playerId) => ({
      state: getDunaState(input.states, playerId),
    })) as unknown as readonly [
      { readonly state: RatingState },
      { readonly state: RatingState },
    ],
    actualTeamA: input.actualTeamA,
    pointShareTeamA: input.pointShareTeamA,
    marginMultiplier: input.marginMultiplier,
    verificationWeight: clamp(input.match.verificationWeight ?? 1, 0, 1),
    previousPairMeetingsInWindow: input.previousPairMeetingsInWindow,
  });
  for (const update of result.updates) {
    input.states.set(update.playerId, update.after);
  }
  return result;
}

function normalizedWeights(
  logWeights: ReadonlyMap<
    Exclude<RatingBacktestModelId, "adaptive-ensemble">,
    number
  >,
): Record<Exclude<RatingBacktestModelId, "adaptive-ensemble">, number> {
  const maximum = Math.max(
    ...componentModelIds.map((id) => logWeights.get(id)!),
  );
  const exponentials = Object.fromEntries(
    componentModelIds.map((id) => [
      id,
      Math.exp(logWeights.get(id)! - maximum),
    ]),
  ) as Record<Exclude<RatingBacktestModelId, "adaptive-ensemble">, number>;
  const total = componentModelIds.reduce(
    (sum, id) => sum + exponentials[id],
    0,
  );
  return Object.fromEntries(
    componentModelIds.map((id) => [id, round(exponentials[id] / total, 8)]),
  ) as Record<Exclude<RatingBacktestModelId, "adaptive-ensemble">, number>;
}

function logLoss(probability: number, actual: 0 | 1): number {
  const safe = clamp(probability, 0.000_001, 0.999_999);
  return -(actual * Math.log(safe) + (1 - actual) * Math.log(1 - safe));
}

function areaUnderRocCurve(
  predictions: readonly {
    readonly probability: number;
    readonly actual: 0 | 1;
  }[],
): number {
  const positives = predictions.filter((row) => row.actual === 1);
  const negatives = predictions.filter((row) => row.actual === 0);
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  const ranked = [...predictions].sort(
    (left, right) => left.probability - right.probability,
  );
  let positiveRankSum = 0;
  let index = 0;
  while (index < ranked.length) {
    let end = index + 1;
    while (
      end < ranked.length &&
      ranked[end]!.probability === ranked[index]!.probability
    ) {
      end += 1;
    }
    const averageRank = (index + 1 + end) / 2;
    for (let tied = index; tied < end; tied += 1) {
      if (ranked[tied]!.actual === 1) positiveRankSum += averageRank;
    }
    index = end;
  }
  return (
    (positiveRankSum - (positives.length * (positives.length + 1)) / 2) /
    (positives.length * negatives.length)
  );
}

function wilsonInterval(
  successes: number,
  total: number,
): readonly [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.959_963_984_540_054;
  const proportion = successes / total;
  const denominator = 1 + z ** 2 / total;
  const centre = (proportion + z ** 2 / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * total)) / total);
  return [
    round(Math.max(0, centre - margin)),
    round(Math.min(1, centre + margin)),
  ];
}

function modelEvaluation(
  modelId: RatingBacktestModelId,
  predictions: readonly BacktestPrediction[],
  bucketCount = 10,
): BacktestModelEvaluation {
  const rows = predictions.map((prediction) => ({
    probability: prediction.probabilities[modelId],
    actual: prediction.actualTeamA,
  }));
  const correct = rows.reduce((sum, row) => {
    if (Math.abs(row.probability - 0.5) < 0.000_000_1) return sum + 0.5;
    return sum + ((row.probability > 0.5 ? 1 : 0) === row.actual ? 1 : 0);
  }, 0);
  const brierValues = rows.map((row) => (row.probability - row.actual) ** 2);
  const lossValues = rows.map((row) => logLoss(row.probability, row.actual));
  const calibration = Array.from({ length: bucketCount }, (_, index) => {
    const bucketRows = rows.filter(
      (row) =>
        Math.min(bucketCount - 1, Math.floor(row.probability * bucketCount)) ===
        index,
    );
    return {
      lowerBound: index / bucketCount,
      upperBound: (index + 1) / bucketCount,
      predictions: bucketRows.length,
      averageExpected:
        bucketRows.length === 0
          ? 0
          : round(
              bucketRows.reduce((sum, row) => sum + row.probability, 0) /
                bucketRows.length,
            ),
      observedWinRate:
        bucketRows.length === 0
          ? 0
          : round(
              bucketRows.reduce((sum, row) => sum + row.actual, 0) /
                bucketRows.length,
            ),
    };
  });
  const expectedCalibrationError = calibration.reduce(
    (sum, bucket) =>
      sum +
      (bucket.predictions / Math.max(1, rows.length)) *
        Math.abs(bucket.averageExpected - bucket.observedWinRate),
    0,
  );
  const curveStride = Math.max(1, Math.ceil(rows.length / 120));
  const curve: BacktestCurvePoint[] = [];
  let cumulativeBrier = 0;
  let cumulativeLoss = 0;
  for (const index of rows.keys()) {
    cumulativeBrier += brierValues[index]!;
    cumulativeLoss += lossValues[index]!;
    const count = index + 1;
    if (count === rows.length || count % curveStride === 0) {
      curve.push({
        matches: count,
        brierScore: round(cumulativeBrier / count),
        logLoss: round(cumulativeLoss / count),
      });
    }
  }
  return {
    modelId,
    ...modelMetadata[modelId],
    sampleSize: rows.length,
    accuracy: rows.length === 0 ? 0 : round(correct / rows.length),
    accuracyInterval95: wilsonInterval(correct, rows.length),
    brierScore:
      rows.length === 0
        ? 0
        : round(
            brierValues.reduce((sum, value) => sum + value, 0) / rows.length,
          ),
    logLoss:
      rows.length === 0
        ? 0
        : round(
            lossValues.reduce((sum, value) => sum + value, 0) / rows.length,
          ),
    expectedCalibrationError: round(expectedCalibrationError),
    areaUnderRocCurve: round(areaUnderRocCurve(rows)),
    calibration,
    curve,
  };
}

/**
 * Replays matches in event-time order. Every probability is emitted before the
 * corresponding result updates any model state, so the report is a true
 * walk-forward backtest rather than an in-sample fit.
 */
export function runRatingBacktest(
  matches: readonly RatingBacktestMatch[],
  generatedAt = new Date(),
): RatingBacktestReport {
  const chronological = matches
    .map((match) => ({ match, date: new Date(match.occurredAt) }))
    .filter((entry) => Number.isFinite(entry.date.getTime()))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.match.id.localeCompare(b.match.id),
    );
  const averageElo = new Map<string, number>();
  const weakLinkElo = new Map<string, number>();
  const scoreAwareDuna = new Map<string, RatingState>();
  const winOnlyDuna = new Map<string, RatingState>();
  const scoreAwareWeeks = new Map<string, string>();
  const winOnlyWeeks = new Map<string, string>();
  const matchupHistory = new Map<string, number[]>();
  const logWeights = new Map<
    Exclude<RatingBacktestModelId, "adaptive-ensemble">,
    number
  >(componentModelIds.map((modelId) => [modelId, 0] as const));
  const predictions: BacktestPrediction[] = [];
  const playerIds = new Set<string>();

  for (const { match, date } of chronological) {
    const uniquePlayers = new Set([...match.teamA, ...match.teamB]);
    if (uniquePlayers.size !== 4 || match.setScores.length === 0) continue;
    for (const playerId of uniquePlayers) playerIds.add(playerId);
    const actualTeamA = binaryWinner(match.setScores);
    const performance = performanceEvidenceFromSetScores(match.setScores);
    const week = isoWeekKey(date);
    const allPlayers = [...match.teamA, ...match.teamB];
    resetDunaWeekIfNeeded({
      states: scoreAwareDuna,
      weekByPlayer: scoreAwareWeeks,
      playerIds: allPlayers,
      week,
    });
    resetDunaWeekIfNeeded({
      states: winOnlyDuna,
      weekByPlayer: winOnlyWeeks,
      playerIds: allPlayers,
      week,
    });

    const averageProbability = probabilityFromDifference(
      teamAverage(averageElo, match.teamA) -
        teamAverage(averageElo, match.teamB),
    );
    const weakLinkProbability = probabilityFromDifference(
      teamWeakLink(weakLinkElo, match.teamA) -
        teamWeakLink(weakLinkElo, match.teamB),
    );
    const previousMeetings = previousMeetingsInWindow(
      matchupHistory,
      match,
      date,
    );
    const dunaPreMatchRatings = {
      teamA: match.teamA.map(
        (playerId) => getDunaState(scoreAwareDuna, playerId).display,
      ) as unknown as readonly [number, number],
      teamB: match.teamB.map(
        (playerId) => getDunaState(scoreAwareDuna, playerId).display,
      ) as unknown as readonly [number, number],
      players: Object.fromEntries(
        allPlayers.map((playerId) => [
          playerId,
          getDunaState(scoreAwareDuna, playerId).display,
        ]),
      ),
    };
    const scoreAwareResult = dunaPrediction({
      states: scoreAwareDuna,
      match,
      actualTeamA: performance.actualTeamA,
      pointShareTeamA: performance.pointShareTeamA,
      marginMultiplier: performance.marginMultiplier,
      previousPairMeetingsInWindow: previousMeetings,
    });
    const winOnlyResult = dunaPrediction({
      states: winOnlyDuna,
      match,
      actualTeamA,
      pointShareTeamA: actualTeamA,
      marginMultiplier: 1,
      previousPairMeetingsInWindow: previousMeetings,
    });
    const componentProbabilities = {
      "even-prior": 0.5,
      "elo-team-average": averageProbability,
      "elo-weak-link": weakLinkProbability,
      "duna-win-only": winOnlyResult.expectedTeamA,
      "duna-score-aware": scoreAwareResult.expectedTeamA,
    } satisfies Record<
      Exclude<RatingBacktestModelId, "adaptive-ensemble">,
      number
    >;
    const ensembleWeights = normalizedWeights(logWeights);
    const ensembleProbability = componentModelIds.reduce(
      (sum, modelId) =>
        sum + ensembleWeights[modelId] * componentProbabilities[modelId],
      0,
    );
    const probabilities = {
      ...componentProbabilities,
      "adaptive-ensemble": round(ensembleProbability),
    } satisfies Record<RatingBacktestModelId, number>;
    predictions.push({
      matchId: match.id,
      occurredAt: date.toISOString(),
      actualTeamA,
      probabilities,
      ensembleWeights,
      dunaPreMatchRatings,
    });

    updateElo({
      ratings: averageElo,
      teamA: match.teamA,
      teamB: match.teamB,
      expectedTeamA: averageProbability,
      actualTeamA,
      k: 28,
    });
    updateElo({
      ratings: weakLinkElo,
      teamA: match.teamA,
      teamB: match.teamB,
      expectedTeamA: weakLinkProbability,
      actualTeamA,
      k: 34,
    });
    for (const modelId of componentModelIds) {
      const learningRate = 0.12;
      logWeights.set(
        modelId,
        logWeights.get(modelId)! -
          learningRate * logLoss(componentProbabilities[modelId], actualTeamA),
      );
    }
  }

  const models = ratingBacktestModelIds.map((modelId) =>
    modelEvaluation(modelId, predictions),
  );
  const champion = models
    .filter((model) => model.modelId !== "even-prior")
    .sort(
      (a, b) =>
        a.brierScore - b.brierScore ||
        a.logLoss - b.logLoss ||
        a.modelId.localeCompare(b.modelId),
    )[0];
  return {
    methodologyVersion: ratingBacktestMethodologyVersion,
    generatedAt: generatedAt.toISOString(),
    ...(predictions[0] ? { dateFrom: predictions[0].occurredAt } : {}),
    ...(predictions.at(-1) ? { dateTo: predictions.at(-1)!.occurredAt } : {}),
    matches: predictions.length,
    players: playerIds.size,
    ...(champion ? { championModelId: champion.modelId } : {}),
    models,
    predictions,
  };
}
