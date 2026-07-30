export interface SeededTeam {
  readonly id: string;
  readonly seed: number;
  readonly name: string;
}

export type BracketSource =
  | { readonly kind: "seed"; readonly seed: number }
  | { readonly kind: "winner"; readonly matchId: string }
  | { readonly kind: "loser"; readonly matchId: string }
  | { readonly kind: "bye" };

export interface BracketMatch {
  readonly id: string;
  readonly bracket: "winners" | "losers" | "final" | "pool" | "consolation";
  readonly round: number;
  readonly position: number;
  readonly sideA: BracketSource;
  readonly sideB: BracketSource;
  readonly ifNecessary?: boolean;
  readonly label?: string;
}

export interface Bracket {
  readonly id: string;
  readonly version: number;
  readonly format:
    | "single-elimination"
    | "double-elimination-true-reset"
    | "double-elimination-modified"
    | "double-elimination-crossover"
    | "round-robin"
    | "pool-play";
  readonly teams: readonly SeededTeam[];
  readonly matches: readonly BracketMatch[];
  readonly rounds: number;
}

function validateTeams(teams: readonly SeededTeam[]): readonly SeededTeam[] {
  if (teams.length < 2) throw new Error("At least two teams are required");
  const ids = new Set<string>();
  const seeds = new Set<number>();
  for (const team of teams) {
    if (ids.has(team.id)) throw new Error(`Duplicate team id: ${team.id}`);
    if (seeds.has(team.seed)) throw new Error(`Duplicate seed: ${team.seed}`);
    ids.add(team.id);
    seeds.add(team.seed);
  }
  return [...teams].sort((a, b) => a.seed - b.seed);
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function bracketSeedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const nextSize = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, nextSize - seed]);
  }
  return order;
}

export function generateSingleElimination(input: {
  readonly id: string;
  readonly teams: readonly SeededTeam[];
  readonly version?: number;
  readonly thirdPlace?: boolean;
  readonly consolation?: boolean;
}): Bracket {
  const teams = validateTeams(input.teams);
  const size = nextPowerOfTwo(teams.length);
  const rounds = Math.log2(size);
  const seeded = new Set(teams.map((team) => team.seed));
  const order = bracketSeedOrder(size);
  const firstRound: BracketMatch[] = [];
  for (let index = 0; index < size; index += 2) {
    const seedA = order[index] ?? 0;
    const seedB = order[index + 1] ?? 0;
    firstRound.push({
      id: `${input.id}-w-r1-m${index / 2 + 1}`,
      bracket: "winners",
      round: 1,
      position: index / 2 + 1,
      sideA: seeded.has(seedA)
        ? { kind: "seed", seed: seedA }
        : { kind: "bye" },
      sideB: seeded.has(seedB)
        ? { kind: "seed", seed: seedB }
        : { kind: "bye" },
    });
  }
  const matches: BracketMatch[] = [...firstRound];
  let previous = firstRound;
  for (let round = 2; round <= rounds; round += 1) {
    const current: BracketMatch[] = [];
    for (let index = 0; index < previous.length; index += 2) {
      const left = previous[index];
      const right = previous[index + 1];
      if (!left || !right) throw new Error("Invalid bracket topology");
      current.push({
        id: `${input.id}-w-r${round}-m${index / 2 + 1}`,
        bracket: "winners",
        round,
        position: index / 2 + 1,
        sideA: { kind: "winner", matchId: left.id },
        sideB: { kind: "winner", matchId: right.id },
        label: round === rounds ? "Championship" : undefined,
      });
    }
    matches.push(...current);
    previous = current;
  }
  if (input.thirdPlace && rounds > 1) {
    const semifinals = matches.filter(
      (match) => match.bracket === "winners" && match.round === rounds - 1,
    );
    if (semifinals.length === 2) {
      matches.push({
        id: `${input.id}-third-place`,
        bracket: "consolation",
        round: rounds,
        position: 1,
        sideA: { kind: "loser", matchId: semifinals[0]?.id ?? "" },
        sideB: { kind: "loser", matchId: semifinals[1]?.id ?? "" },
        label: "Third place",
      });
    }
  }
  if (input.consolation) {
    for (const match of firstRound) {
      matches.push({
        id: `${match.id}-consolation`,
        bracket: "consolation",
        round: 1,
        position: match.position,
        sideA: { kind: "loser", matchId: match.id },
        sideB: { kind: "bye" },
        label: "Consolation",
      });
    }
  }
  return {
    id: input.id,
    version: input.version ?? 1,
    format: "single-elimination",
    teams,
    matches,
    rounds,
  };
}

export function generateDoubleElimination(input: {
  readonly id: string;
  readonly teams: readonly SeededTeam[];
  readonly variant: "true-reset" | "modified" | "crossover";
  readonly version?: number;
}): Bracket {
  const winners = generateSingleElimination({
    id: input.id,
    teams: input.teams,
    version: input.version,
  });
  const winnerMatches = winners.matches.filter(
    (match) => match.bracket === "winners",
  );
  const matches: BracketMatch[] = [...winnerMatches];
  let losersRound = 1;
  let previousLosers: BracketMatch[] = [];
  for (let winnerRound = 1; winnerRound < winners.rounds; winnerRound += 1) {
    const dropped = winnerMatches.filter(
      (match) => match.round === winnerRound,
    );
    const sources: BracketSource[] = [
      ...previousLosers.map((match): BracketSource => ({
        kind: "winner",
        matchId: match.id,
      })),
      ...dropped.map((match): BracketSource => ({
        kind: "loser",
        matchId: match.id,
      })),
    ];
    const current: BracketMatch[] = [];
    for (let index = 0; index < sources.length; index += 2) {
      const sideA = sources[index];
      if (!sideA) continue;
      current.push({
        id: `${input.id}-l-r${losersRound}-m${index / 2 + 1}`,
        bracket: "losers",
        round: losersRound,
        position: index / 2 + 1,
        sideA,
        sideB: sources[index + 1] ?? { kind: "bye" },
      });
    }
    matches.push(...current);
    previousLosers = current;
    losersRound += 1;
  }
  while (previousLosers.length > 1) {
    const current: BracketMatch[] = [];
    for (let index = 0; index < previousLosers.length; index += 2) {
      const left = previousLosers[index];
      if (!left) continue;
      const right = previousLosers[index + 1];
      current.push({
        id: `${input.id}-l-r${losersRound}-m${index / 2 + 1}`,
        bracket: "losers",
        round: losersRound,
        position: index / 2 + 1,
        sideA: { kind: "winner", matchId: left.id },
        sideB: right ? { kind: "winner", matchId: right.id } : { kind: "bye" },
      });
    }
    matches.push(...current);
    previousLosers = current;
    losersRound += 1;
  }
  const winnersFinal = winnerMatches.find(
    (match) => match.round === winners.rounds,
  );
  const losersFinal = previousLosers[0];
  if (!winnersFinal || !losersFinal) {
    throw new Error("Unable to construct finals");
  }
  const championship: BracketMatch = {
    id: `${input.id}-championship`,
    bracket: "final",
    round: winners.rounds + 1,
    position: 1,
    sideA: { kind: "winner", matchId: winnersFinal.id },
    sideB: { kind: "winner", matchId: losersFinal.id },
    label:
      input.variant === "crossover" ? "Crossover championship" : "Championship",
  };
  matches.push(championship);
  if (input.variant === "true-reset") {
    matches.push({
      id: `${input.id}-championship-reset`,
      bracket: "final",
      round: winners.rounds + 2,
      position: 1,
      sideA: { kind: "winner", matchId: championship.id },
      sideB: { kind: "loser", matchId: championship.id },
      ifNecessary: true,
      label: "Championship reset",
    });
  }
  return {
    id: input.id,
    version: input.version ?? 1,
    format: `double-elimination-${input.variant}`,
    teams: winners.teams,
    matches,
    rounds: winners.rounds + (input.variant === "true-reset" ? 2 : 1),
  };
}

export function generateRoundRobin(input: {
  readonly id: string;
  readonly teams: readonly SeededTeam[];
  readonly version?: number;
}): Bracket {
  const teams = [...validateTeams(input.teams)];
  if (teams.length % 2 === 1) {
    teams.push({ id: "__bye__", seed: Number.MAX_SAFE_INTEGER, name: "Bye" });
  }
  const rotating = [...teams];
  const matches: BracketMatch[] = [];
  const rounds = rotating.length - 1;
  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < rotating.length / 2; index += 1) {
      const a = rotating[index];
      const b = rotating[rotating.length - 1 - index];
      if (a && b && a.id !== "__bye__" && b.id !== "__bye__") {
        matches.push({
          id: `${input.id}-rr-r${round}-m${index + 1}`,
          bracket: "pool",
          round,
          position: index + 1,
          sideA: { kind: "seed", seed: a.seed },
          sideB: { kind: "seed", seed: b.seed },
        });
      }
    }
    const fixed = rotating[0];
    const rest = rotating.slice(1);
    const last = rest.pop();
    if (!fixed || !last) throw new Error("Invalid round-robin rotation");
    rotating.splice(0, rotating.length, fixed, last, ...rest);
  }
  return {
    id: input.id,
    version: input.version ?? 1,
    format: "round-robin",
    teams: validateTeams(input.teams),
    matches,
    rounds,
  };
}

export function generatePoolPlay(input: {
  readonly id: string;
  readonly teams: readonly SeededTeam[];
  readonly poolCount: number;
  readonly version?: number;
}): Bracket & { readonly pools: Readonly<Record<string, readonly string[]>> } {
  const teams = validateTeams(input.teams);
  if (
    !Number.isSafeInteger(input.poolCount) ||
    input.poolCount < 1 ||
    input.poolCount > teams.length
  ) {
    throw new Error("poolCount must be a valid positive integer");
  }
  const pools: Record<string, SeededTeam[]> = {};
  for (let index = 0; index < teams.length; index += 1) {
    const cycle = Math.floor(index / input.poolCount);
    const offset = index % input.poolCount;
    const poolIndex = cycle % 2 === 0 ? offset : input.poolCount - 1 - offset;
    const key = String.fromCharCode(65 + poolIndex);
    (pools[key] ??= []).push(teams[index] as SeededTeam);
  }
  const matches: BracketMatch[] = [];
  let rounds = 0;
  for (const [key, poolTeams] of Object.entries(pools)) {
    if (poolTeams.length < 2) continue;
    const poolBracket = generateRoundRobin({
      id: `${input.id}-pool-${key}`,
      teams: poolTeams,
    });
    matches.push(...poolBracket.matches);
    rounds = Math.max(rounds, poolBracket.rounds);
  }
  return {
    id: input.id,
    version: input.version ?? 1,
    format: "pool-play",
    teams,
    matches,
    rounds,
    pools: Object.fromEntries(
      Object.entries(pools).map(([key, value]) => [
        key,
        value.map((team) => team.id),
      ]),
    ),
  };
}
