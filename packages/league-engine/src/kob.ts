export type KobEntryMode = "individual" | "team";

export type KobStageFormat =
  | "partner-rotation"
  | "timed-elimination"
  | "pool-play"
  | "single-elimination"
  | "double-elimination-true"
  | "double-elimination-crossover";

export type KobScoringMode = "rally-points" | "timed-total";

export interface KobStageConfig {
  readonly id: string;
  readonly name: string;
  readonly format: KobStageFormat;
  readonly scoringMode: KobScoringMode;
  readonly durationMinutes?: number;
  readonly setsToWin: number;
  readonly pointsToWin: number;
  readonly winBy: number;
  readonly pointCap?: number;
  readonly poolSize: number;
  readonly advanceCount: number;
  readonly eliminationCount: number;
  readonly guaranteedGames: number;
  readonly carryPoints: boolean;
}

export interface KobCompetitionConfig {
  readonly entryMode: KobEntryMode;
  readonly balanceByRating: boolean;
  readonly avoidRepeatOpponents: boolean;
  readonly stages: readonly KobStageConfig[];
}

export interface KobRotationPlayer {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly rating?: number;
}

export interface KobRotationMatchup {
  readonly id: string;
  readonly poolKey: string;
  readonly round: number;
  readonly court: number;
  readonly teamA: readonly [KobRotationPlayer, KobRotationPlayer];
  readonly teamB: readonly [KobRotationPlayer, KobRotationPlayer];
  readonly ratingDifference?: number;
}

export interface KobRotationPool {
  readonly key: string;
  readonly players: readonly KobRotationPlayer[];
  readonly matchups: readonly KobRotationMatchup[];
}

function pairKey(left: KobRotationPlayer, right: KobRotationPlayer): string {
  return [left.id, right.id].sort().join(":");
}

function teamRating(team: readonly KobRotationPlayer[]): number | undefined {
  const values = team.flatMap((player) =>
    player.rating === undefined ? [] : [player.rating],
  );
  return values.length === team.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : undefined;
}

function poolPlayers(
  players: readonly KobRotationPlayer[],
  requestedPoolSize: number,
): readonly KobRotationPlayer[][] {
  const sorted = [...players].sort(
    (left, right) =>
      left.seed - right.seed ||
      (right.rating ?? Number.NEGATIVE_INFINITY) -
        (left.rating ?? Number.NEGATIVE_INFINITY) ||
      left.name.localeCompare(right.name),
  );
  // Honor the requested size without ever creating an unplayable pool of
  // fewer than four athletes (for example, five athletes requested in pools
  // of four must remain one five-person pool, not split 3/2).
  const poolCount = Math.max(
    1,
    Math.min(
      Math.ceil(sorted.length / requestedPoolSize),
      Math.floor(sorted.length / 4),
    ),
  );
  const pools = Array.from(
    { length: poolCount },
    () => [] as KobRotationPlayer[],
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const cycle = Math.floor(index / poolCount);
    const offset = index % poolCount;
    const poolIndex = cycle % 2 === 0 ? offset : poolCount - 1 - offset;
    pools[poolIndex]!.push(sorted[index]!);
  }
  return pools;
}

interface CandidateMatchup {
  readonly teamA: readonly [KobRotationPlayer, KobRotationPlayer];
  readonly teamB: readonly [KobRotationPlayer, KobRotationPlayer];
}

function candidates(
  players: readonly KobRotationPlayer[],
): readonly CandidateMatchup[] {
  const result: CandidateMatchup[] = [];
  for (let a = 0; a < players.length - 3; a += 1) {
    for (let b = a + 1; b < players.length - 2; b += 1) {
      for (let c = b + 1; c < players.length - 1; c += 1) {
        for (let d = c + 1; d < players.length; d += 1) {
          const one = players[a]!;
          const two = players[b]!;
          const three = players[c]!;
          const four = players[d]!;
          result.push(
            { teamA: [one, two], teamB: [three, four] },
            { teamA: [one, three], teamB: [two, four] },
            { teamA: [one, four], teamB: [two, three] },
          );
        }
      }
    }
  }
  return result;
}

function rotationMatchups(input: {
  readonly poolKey: string;
  readonly players: readonly KobRotationPlayer[];
  readonly guaranteedGames: number;
  readonly balanceByRating: boolean;
  readonly avoidRepeatOpponents: boolean;
}): readonly KobRotationMatchup[] {
  if (input.players.length < 4) return [];
  const possible = candidates(input.players);
  const partnershipCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const appearanceCount = new Map(
    input.players.map((player) => [player.id, 0]),
  );
  const allPartnerships =
    (input.players.length * (input.players.length - 1)) / 2;
  const coverageGames = Math.ceil(allPartnerships / 2);
  const targetGames = Math.max(input.guaranteedGames, coverageGames);
  const selected: KobRotationMatchup[] = [];

  for (let round = 1; round <= targetGames; round += 1) {
    const ranked = possible
      .map((candidate, index) => {
        const partnershipKeys = [
          pairKey(candidate.teamA[0], candidate.teamA[1]),
          pairKey(candidate.teamB[0], candidate.teamB[1]),
        ];
        const opponentKeys = candidate.teamA.flatMap((left) =>
          candidate.teamB.map((right) => pairKey(left, right)),
        );
        const partnershipRepeats = partnershipKeys.reduce(
          (total, key) => total + (partnershipCount.get(key) ?? 0),
          0,
        );
        const opponentRepeats = opponentKeys.reduce(
          (total, key) => total + (opponentCount.get(key) ?? 0),
          0,
        );
        const participants = [...candidate.teamA, ...candidate.teamB];
        const nextAppearances = input.players.map(
          (player) =>
            (appearanceCount.get(player.id) ?? 0) +
            (participants.some(
              (candidatePlayer) => candidatePlayer.id === player.id,
            )
              ? 1
              : 0),
        );
        const appearanceSpread =
          Math.max(...nextAppearances) - Math.min(...nextAppearances);
        const leftRating = teamRating(candidate.teamA);
        const rightRating = teamRating(candidate.teamB);
        const ratingDifference =
          leftRating === undefined || rightRating === undefined
            ? 0
            : Math.abs(leftRating - rightRating);
        return {
          candidate,
          index,
          ratingDifference,
          score:
            partnershipRepeats * 10_000 +
            appearanceSpread * 1_000 +
            (input.avoidRepeatOpponents ? opponentRepeats * 100 : 0) +
            (input.balanceByRating ? ratingDifference * 10 : 0),
        };
      })
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.ratingDifference - right.ratingDifference ||
          left.index - right.index,
      );
    const best = ranked[0];
    if (!best) break;
    const participants = [...best.candidate.teamA, ...best.candidate.teamB];
    for (const player of participants) {
      appearanceCount.set(player.id, (appearanceCount.get(player.id) ?? 0) + 1);
    }
    for (const team of [best.candidate.teamA, best.candidate.teamB]) {
      const key = pairKey(team[0], team[1]);
      partnershipCount.set(key, (partnershipCount.get(key) ?? 0) + 1);
    }
    for (const left of best.candidate.teamA) {
      for (const right of best.candidate.teamB) {
        const key = pairKey(left, right);
        opponentCount.set(key, (opponentCount.get(key) ?? 0) + 1);
      }
    }
    const leftRating = teamRating(best.candidate.teamA);
    const rightRating = teamRating(best.candidate.teamB);
    selected.push({
      id: `${input.poolKey}-r${round}`,
      poolKey: input.poolKey,
      round,
      court: 1,
      teamA: best.candidate.teamA,
      teamB: best.candidate.teamB,
      ...(leftRating !== undefined && rightRating !== undefined
        ? { ratingDifference: Math.abs(leftRating - rightRating) }
        : {}),
    });
  }
  return selected;
}

/**
 * Builds deterministic KOB/QOB partner rotations. Four-player pools produce
 * the canonical three games; larger pools minimize repeated partners first,
 * then balance appearances, opponents, and team strength.
 */
export function generateKobPartnerRotation(input: {
  readonly players: readonly KobRotationPlayer[];
  readonly poolSize: number;
  readonly guaranteedGames: number;
  readonly balanceByRating?: boolean;
  readonly avoidRepeatOpponents?: boolean;
}): readonly KobRotationPool[] {
  if (input.players.length < 4) {
    throw new Error("KOB partner rotation requires at least four players.");
  }
  if (!Number.isSafeInteger(input.poolSize) || input.poolSize < 4) {
    throw new Error("KOB pools must contain at least four players.");
  }
  return poolPlayers(input.players, input.poolSize).map((players, index) => {
    const key = String.fromCharCode(65 + index);
    return {
      key,
      players,
      matchups: rotationMatchups({
        poolKey: key,
        players,
        guaranteedGames: input.guaranteedGames,
        balanceByRating: input.balanceByRating ?? true,
        avoidRepeatOpponents: input.avoidRepeatOpponents ?? true,
      }),
    };
  });
}
