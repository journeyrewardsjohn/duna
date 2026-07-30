export type TeamSide = "A" | "B";
export type ScoringSystem = "rally" | "sideout";

export interface MatchFormat {
  readonly setsToWin: number;
  readonly maximumSets: number;
  readonly pointTargets: readonly number[];
  readonly winBy: 1 | 2;
  readonly hardCaps: readonly (number | null)[];
  readonly scoringSystem: ScoringSystem;
  readonly sideSwitchIntervals: readonly number[];
  readonly timeoutsPerTeamPerSet: number;
  readonly technicalTimeoutAt?: number;
  readonly lockedServeOrder: boolean;
}

export const standardBeachFormat: MatchFormat = {
  setsToWin: 2,
  maximumSets: 3,
  pointTargets: [21, 21, 15],
  winBy: 2,
  hardCaps: [null, null, null],
  scoringSystem: "rally",
  sideSwitchIntervals: [7, 7, 5],
  timeoutsPerTeamPerSet: 1,
  technicalTimeoutAt: 21,
  lockedServeOrder: false,
};

export type ScoreEvent =
  | {
      readonly id: string;
      readonly type: "match-started";
      readonly initialServer: TeamSide;
      readonly occurredAt: string;
    }
  | {
      readonly id: string;
      readonly type: "rally-won";
      readonly winner: TeamSide;
      readonly occurredAt: string;
    }
  | {
      readonly id: string;
      readonly type: "timeout";
      readonly team: TeamSide;
      readonly occurredAt: string;
    }
  | {
      readonly id: string;
      readonly type: "technical-timeout-completed";
      readonly setIndex: number;
      readonly occurredAt: string;
    }
  | {
      readonly id: string;
      readonly type: "undo";
      readonly targetEventId: string;
      readonly occurredAt: string;
    }
  | {
      readonly id: string;
      readonly type: "match-forfeited";
      readonly winner: TeamSide;
      readonly occurredAt: string;
    };

export interface FoldedSet {
  readonly a: number;
  readonly b: number;
  readonly winner?: TeamSide;
}

export interface ScoreState {
  readonly status: "not-started" | "live" | "complete" | "forfeit";
  readonly sets: readonly FoldedSet[];
  readonly setIndex: number;
  readonly setsWon: Readonly<Record<TeamSide, number>>;
  readonly serving: TeamSide;
  readonly timeouts: Readonly<Record<TeamSide, number>>;
  readonly sideSwitchDue: boolean;
  readonly technicalTimeoutDue: boolean;
  readonly winner?: TeamSide;
  readonly activeEventCount: number;
}

function opposite(team: TeamSide): TeamSide {
  return team === "A" ? "B" : "A";
}

function setIsComplete(
  a: number,
  b: number,
  target: number,
  winBy: number,
  hardCap: number | null,
): TeamSide | undefined {
  if (hardCap !== null && Math.max(a, b) >= hardCap && a !== b) {
    return a > b ? "A" : "B";
  }
  if (a >= target || b >= target) {
    if (Math.abs(a - b) >= winBy) return a > b ? "A" : "B";
  }
  return undefined;
}

function activeEvents(events: readonly ScoreEvent[]): readonly ScoreEvent[] {
  const undone = new Set(
    events
      .filter((event) => event.type === "undo")
      .map((event) => event.targetEventId),
  );
  return events.filter(
    (event) => event.type !== "undo" && !undone.has(event.id),
  );
}

export function foldScore(
  events: readonly ScoreEvent[],
  format: MatchFormat = standardBeachFormat,
): ScoreState {
  if (
    format.setsToWin < 1 ||
    format.maximumSets < format.setsToWin ||
    format.pointTargets.length < format.maximumSets
  ) {
    throw new Error("Invalid match format");
  }
  const applied = activeEvents(events);
  const started = applied.find((event) => event.type === "match-started");
  let serving: TeamSide =
    started?.type === "match-started" ? started.initialServer : "A";
  let status: ScoreState["status"] = started ? "live" : "not-started";
  const sets: Array<{ a: number; b: number; winner?: TeamSide }> = [
    { a: 0, b: 0 },
  ];
  const setsWon: Record<TeamSide, number> = { A: 0, B: 0 };
  const timeouts: Record<TeamSide, number> = { A: 0, B: 0 };
  let setIndex = 0;
  let winner: TeamSide | undefined;
  const completedTechnicalTimeouts = new Set<number>();

  for (const event of applied) {
    if (event.type === "match-started" || winner) continue;
    if (event.type === "technical-timeout-completed") {
      completedTechnicalTimeouts.add(event.setIndex);
      continue;
    }
    if (event.type === "match-forfeited") {
      winner = event.winner;
      status = "forfeit";
      break;
    }
    if (event.type === "timeout") {
      if (timeouts[event.team] >= format.timeoutsPerTeamPerSet) {
        continue;
      }
      timeouts[event.team] += 1;
      continue;
    }
    if (event.type !== "rally-won") continue;
    const current = sets[setIndex];
    if (!current) throw new Error("Missing current set");

    if (format.scoringSystem === "rally") {
      if (event.winner === "A") current.a += 1;
      else current.b += 1;
      serving = event.winner;
    } else if (event.winner === serving) {
      if (event.winner === "A") current.a += 1;
      else current.b += 1;
    } else {
      serving = opposite(serving);
    }

    const setWinner = setIsComplete(
      current.a,
      current.b,
      format.pointTargets[setIndex] ?? 21,
      format.winBy,
      format.hardCaps[setIndex] ?? null,
    );
    if (setWinner) {
      current.winner = setWinner;
      setsWon[setWinner] += 1;
      if (setsWon[setWinner] >= format.setsToWin) {
        winner = setWinner;
        status = "complete";
      } else if (setIndex + 1 < format.maximumSets) {
        setIndex += 1;
        sets.push({ a: 0, b: 0 });
        timeouts.A = 0;
        timeouts.B = 0;
        serving = opposite(serving);
      }
    }
  }

  const current = sets[setIndex] ?? { a: 0, b: 0 };
  const totalPoints = current.a + current.b;
  const switchInterval = format.sideSwitchIntervals[setIndex] ?? 0;
  const sideSwitchDue =
    status === "live" &&
    switchInterval > 0 &&
    totalPoints > 0 &&
    totalPoints % switchInterval === 0;
  const technicalTimeoutDue =
    status === "live" &&
    format.technicalTimeoutAt !== undefined &&
    totalPoints >= format.technicalTimeoutAt &&
    !completedTechnicalTimeouts.has(setIndex);

  return {
    status,
    sets,
    setIndex,
    setsWon,
    serving,
    timeouts,
    sideSwitchDue,
    technicalTimeoutDue,
    winner,
    activeEventCount: applied.length,
  };
}

export function createUndoEvent(
  events: readonly ScoreEvent[],
  input: { readonly id: string; readonly occurredAt: string },
): ScoreEvent | undefined {
  const applied = activeEvents(events);
  const target = [...applied]
    .reverse()
    .find(
      (event) =>
        event.type === "rally-won" ||
        event.type === "timeout" ||
        event.type === "match-forfeited",
    );
  if (!target) return undefined;
  return {
    id: input.id,
    type: "undo",
    targetEventId: target.id,
    occurredAt: input.occurredAt,
  };
}
