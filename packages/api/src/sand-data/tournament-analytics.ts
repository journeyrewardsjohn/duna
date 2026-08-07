import type { VolleyballWorldMatchStatistics } from "./volleyball-world-live";

export interface TournamentAnalyticsMatch {
  readonly id: string;
  readonly winnerSide?: "A" | "B";
  readonly setCount: number;
  readonly teamA: {
    readonly key: string;
    readonly name: string;
    readonly teamNo?: number;
    readonly countryCode?: string;
  };
  readonly teamB: {
    readonly key: string;
    readonly name: string;
    readonly teamNo?: number;
    readonly countryCode?: string;
  };
  readonly statistics?: VolleyballWorldMatchStatistics;
}

export interface TournamentRateMetrics {
  readonly hittingEfficiency?: number;
  readonly acesPerSet: number;
  readonly blocksPerSet: number;
  readonly digsPerSet: number;
}

export interface TournamentTeamAnalytics extends TournamentRateMetrics {
  readonly key: string;
  readonly teamNo?: number;
  readonly name: string;
  readonly countryCode?: string;
  readonly matches: number;
  readonly wins: number;
  readonly sets: number;
  readonly attackPoints: number;
  readonly attackErrors: number;
  readonly attackAttempts: number;
  readonly aces: number;
  readonly blocks: number;
  readonly digs: number;
}

export interface TournamentPlayerAnalytics extends TournamentRateMetrics {
  readonly externalPlayerId: string;
  readonly name: string;
  readonly teamNames: readonly string[];
  readonly matches: number;
  readonly sets: number;
  readonly points: number;
  readonly attackPoints: number;
  readonly attackErrors: number;
  readonly attackAttempts: number;
  readonly aces: number;
  readonly blocks: number;
  readonly digs: number;
}

export interface TournamentStatistics {
  readonly coverage: {
    readonly matchesWithStatistics: number;
    readonly totalMatches: number;
    readonly setsWithStatistics: number;
  };
  readonly averages: TournamentRateMetrics;
  readonly teams: readonly TournamentTeamAnalytics[];
  readonly players: readonly TournamentPlayerAnalytics[];
  readonly standouts: readonly {
    readonly metric:
      "hittingEfficiency" | "acesPerSet" | "blocksPerSet" | "digsPerSet";
    readonly label: string;
    readonly teamKey: string;
    readonly teamName: string;
    readonly value: number;
    readonly tournamentAverage: number;
    readonly delta: number;
    readonly matches: number;
    readonly sets: number;
  }[];
  readonly correlations: {
    readonly digsPerSetVsOpponentHittingEfficiency?: {
      readonly coefficient: number;
      readonly sampleSize: number;
      readonly direction: "positive" | "negative" | "neutral";
    };
  };
}

type TeamAccumulator = {
  key: string;
  teamNo?: number;
  name: string;
  countryCode?: string;
  matches: number;
  wins: number;
  sets: number;
  attackPoints: number;
  attackErrors: number;
  attackAttempts: number;
  aces: number;
  blocks: number;
  digs: number;
};

type PlayerAccumulator = {
  externalPlayerId: string;
  name: string;
  teamNames: Set<string>;
  matches: number;
  sets: number;
  points: number;
  attackPoints: number;
  attackErrors: number;
  attackAttempts: number;
  aces: number;
  blocks: number;
  digs: number;
};

function rounded(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function perSet(value: number, sets: number): number {
  return sets > 0 ? rounded(value / sets) : 0;
}

function hittingEfficiency(
  points: number,
  errors: number,
  attempts: number,
): number | undefined {
  if (attempts <= 0) return undefined;
  const value = ((points - errors) / attempts) * 100;
  // Partial box scores can report kills without every continuation attempt.
  // Suppress impossible values rather than presenting 200%+ efficiency.
  return value >= -100 && value <= 100 ? rounded(value) : undefined;
}

function pearson(
  observations: readonly { readonly x: number; readonly y: number }[],
): number | undefined {
  if (observations.length < 4) return undefined;
  const meanX =
    observations.reduce((sum, observation) => sum + observation.x, 0) /
    observations.length;
  const meanY =
    observations.reduce((sum, observation) => sum + observation.y, 0) /
    observations.length;
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (const observation of observations) {
    const x = observation.x - meanX;
    const y = observation.y - meanY;
    numerator += x * y;
    xVariance += x * x;
    yVariance += y * y;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator > 0 ? rounded(numerator / denominator, 3) : undefined;
}

function rateMetrics(input: {
  readonly sets: number;
  readonly attackPoints: number;
  readonly attackErrors: number;
  readonly attackAttempts: number;
  readonly aces: number;
  readonly blocks: number;
  readonly digs: number;
}): TournamentRateMetrics {
  const efficiency = hittingEfficiency(
    input.attackPoints,
    input.attackErrors,
    input.attackAttempts,
  );
  return {
    ...(efficiency !== undefined ? { hittingEfficiency: efficiency } : {}),
    acesPerSet: perSet(input.aces, input.sets),
    blocksPerSet: perSet(input.blocks, input.sets),
    digsPerSet: perSet(input.digs, input.sets),
  };
}

export function aggregateTournamentStatistics(
  matches: readonly TournamentAnalyticsMatch[],
): TournamentStatistics | undefined {
  const teamAccumulators = new Map<string, TeamAccumulator>();
  const playerAccumulators = new Map<string, PlayerAccumulator>();
  const teamMatchObservations: {
    readonly teamKey: string;
    readonly digsPerSet: number;
    readonly hittingEfficiency?: number;
    readonly opponentHittingEfficiency?: number;
  }[] = [];
  let matchesWithStatistics = 0;
  let setsWithStatistics = 0;

  for (const match of matches) {
    const statistics = match.statistics;
    if (!statistics || match.setCount < 1) continue;
    matchesWithStatistics += 1;
    setsWithStatistics += match.setCount;
    for (const side of ["A", "B"] as const) {
      const team = side === "A" ? match.teamA : match.teamB;
      const opposingSide = side === "A" ? "B" : "A";
      const teamStats = statistics.team;
      const playerStats = statistics.players.filter(
        (player) => player.side === side,
      );
      const opponentPlayers = statistics.players.filter(
        (player) => player.side === opposingSide,
      );
      const value = (key: string) =>
        teamStats.find((stat) => stat.key === key)?.[
          side === "A" ? "a" : "b"
        ] ?? 0;
      const attackPoints = playerStats.reduce(
        (sum, player) => sum + (player.attackPoints ?? player.attack),
        0,
      );
      const attackErrors = playerStats.reduce(
        (sum, player) => sum + (player.attackErrors ?? 0),
        0,
      );
      const attackAttempts = playerStats.reduce(
        (sum, player) => sum + (player.attackAttempts ?? 0),
        0,
      );
      const opponentAttackPoints = opponentPlayers.reduce(
        (sum, player) => sum + (player.attackPoints ?? player.attack),
        0,
      );
      const opponentAttackErrors = opponentPlayers.reduce(
        (sum, player) => sum + (player.attackErrors ?? 0),
        0,
      );
      const opponentAttackAttempts = opponentPlayers.reduce(
        (sum, player) => sum + (player.attackAttempts ?? 0),
        0,
      );
      const aces = value("serve");
      const blocks = value("block");
      const digs = value("dig");
      const existing = teamAccumulators.get(team.key) ?? {
        ...team,
        matches: 0,
        wins: 0,
        sets: 0,
        attackPoints: 0,
        attackErrors: 0,
        attackAttempts: 0,
        aces: 0,
        blocks: 0,
        digs: 0,
      };
      existing.matches += 1;
      existing.wins += match.winnerSide === side ? 1 : 0;
      existing.sets += match.setCount;
      existing.attackPoints += attackPoints;
      existing.attackErrors += attackErrors;
      existing.attackAttempts += attackAttempts;
      existing.aces += aces;
      existing.blocks += blocks;
      existing.digs += digs;
      teamAccumulators.set(team.key, existing);
      teamMatchObservations.push({
        teamKey: team.key,
        digsPerSet: perSet(digs, match.setCount),
        ...(hittingEfficiency(attackPoints, attackErrors, attackAttempts) !==
        undefined
          ? {
              hittingEfficiency: hittingEfficiency(
                attackPoints,
                attackErrors,
                attackAttempts,
              ),
            }
          : {}),
        ...(hittingEfficiency(
          opponentAttackPoints,
          opponentAttackErrors,
          opponentAttackAttempts,
        ) !== undefined
          ? {
              opponentHittingEfficiency: hittingEfficiency(
                opponentAttackPoints,
                opponentAttackErrors,
                opponentAttackAttempts,
              ),
            }
          : {}),
      });
      for (const player of playerStats) {
        const key = player.externalPlayerId;
        const accumulator = playerAccumulators.get(key) ?? {
          externalPlayerId: player.externalPlayerId,
          name: player.name,
          teamNames: new Set<string>(),
          matches: 0,
          sets: 0,
          points: 0,
          attackPoints: 0,
          attackErrors: 0,
          attackAttempts: 0,
          aces: 0,
          blocks: 0,
          digs: 0,
        };
        accumulator.teamNames.add(team.name);
        accumulator.matches += 1;
        accumulator.sets += match.setCount;
        accumulator.points += player.total;
        accumulator.attackPoints += player.attackPoints ?? player.attack;
        accumulator.attackErrors += player.attackErrors ?? 0;
        accumulator.attackAttempts += player.attackAttempts ?? 0;
        accumulator.aces += player.servePoints ?? player.serve;
        accumulator.blocks += player.blockPoints ?? player.block;
        accumulator.digs += player.digs ?? 0;
        playerAccumulators.set(key, accumulator);
      }
    }
  }
  if (matchesWithStatistics === 0) return undefined;

  const teams = [...teamAccumulators.values()]
    .map((team) => ({ ...team, ...rateMetrics(team) }))
    .sort(
      (left, right) =>
        right.wins - left.wins ||
        (right.hittingEfficiency ?? -Infinity) -
          (left.hittingEfficiency ?? -Infinity) ||
        left.name.localeCompare(right.name),
    );
  const players = [...playerAccumulators.values()]
    .map(({ teamNames, ...player }) => ({
      ...player,
      teamNames: [...teamNames],
      ...rateMetrics(player),
    }))
    .sort(
      (left, right) =>
        right.points - left.points || left.name.localeCompare(right.name),
    );
  const totals = teams.reduce(
    (sum, team) => ({
      sets: sum.sets + team.sets,
      attackPoints: sum.attackPoints + team.attackPoints,
      attackErrors: sum.attackErrors + team.attackErrors,
      attackAttempts: sum.attackAttempts + team.attackAttempts,
      aces: sum.aces + team.aces,
      blocks: sum.blocks + team.blocks,
      digs: sum.digs + team.digs,
    }),
    {
      sets: 0,
      attackPoints: 0,
      attackErrors: 0,
      attackAttempts: 0,
      aces: 0,
      blocks: 0,
      digs: 0,
    },
  );
  const averages = rateMetrics(totals);
  const metricDefinitions = [
    ["hittingEfficiency", "Hitting efficiency"],
    ["acesPerSet", "Aces / set"],
    ["blocksPerSet", "Blocks / set"],
    ["digsPerSet", "Digs / set"],
  ] as const;
  const standouts = metricDefinitions.flatMap(([metric, label]) => {
    const tournamentAverage = averages[metric];
    if (tournamentAverage === undefined) return [];
    const leader = [...teams]
      .filter((team) => team[metric] !== undefined)
      .sort(
        (left, right) =>
          (right[metric] ?? -Infinity) - (left[metric] ?? -Infinity),
      )[0];
    const value = leader?.[metric];
    return leader && value !== undefined
      ? [
          {
            metric,
            label,
            teamKey: leader.key,
            teamName: leader.name,
            value,
            tournamentAverage,
            delta: rounded(value - tournamentAverage),
            matches: leader.matches,
            sets: leader.sets,
          },
        ]
      : [];
  });
  const correlationObservations = teamMatchObservations.flatMap(
    (observation) =>
      observation.opponentHittingEfficiency !== undefined
        ? [
            {
              x: observation.opponentHittingEfficiency,
              y: observation.digsPerSet,
            },
          ]
        : [],
  );
  const coefficient = pearson(correlationObservations);
  return {
    coverage: {
      matchesWithStatistics,
      totalMatches: matches.length,
      setsWithStatistics,
    },
    averages,
    teams,
    players,
    standouts,
    correlations: {
      ...(coefficient !== undefined
        ? {
            digsPerSetVsOpponentHittingEfficiency: {
              coefficient,
              sampleSize: correlationObservations.length,
              direction:
                coefficient > 0.15
                  ? ("positive" as const)
                  : coefficient < -0.15
                    ? ("negative" as const)
                    : ("neutral" as const),
            },
          }
        : {}),
    },
  };
}
