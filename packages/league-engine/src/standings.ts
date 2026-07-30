export interface StandingMatch {
  readonly id: string;
  readonly teamAId: string;
  readonly teamBId: string;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly forfeitBy?: string;
  readonly byeFor?: string;
}

export interface PointAwards {
  readonly win: number;
  readonly loss: number;
  readonly decidingSetWin: number;
  readonly decidingSetLoss: number;
  readonly forfeitPenalty: number;
  readonly bye: number;
}

export type Tiebreaker =
  | "head-to-head"
  | "set-ratio"
  | "point-ratio"
  | "points-for"
  | "fewest-forfeits"
  | "coin-flip";

export interface StandingRow {
  readonly teamId: string;
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly setsFor: number;
  readonly setsAgainst: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly forfeits: number;
  readonly tablePoints: number;
  readonly rank: number;
  readonly tiebreakExplanation: readonly string[];
}

export const standardPointAwards: PointAwards = {
  win: 3,
  loss: 0,
  decidingSetWin: 0,
  decidingSetLoss: 1,
  forfeitPenalty: -1,
  bye: 3,
};

type MutableStanding = {
  -readonly [
    Key in keyof Omit<StandingRow, "rank" | "tiebreakExplanation">
  ]: StandingRow[Key];
};

function ratio(forValue: number, againstValue: number): number {
  if (againstValue === 0) return forValue === 0 ? 0 : Number.POSITIVE_INFINITY;
  return forValue / againstValue;
}

function deterministicCoin(teamId: string, seed: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${teamId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function computeStandings(input: {
  readonly teamIds: readonly string[];
  readonly matches: readonly StandingMatch[];
  readonly awards?: PointAwards;
  readonly tiebreakers: readonly Tiebreaker[];
  readonly coinFlipSeed: string;
}): readonly StandingRow[] {
  const awards = input.awards ?? standardPointAwards;
  const rows = new Map<string, MutableStanding>();
  for (const teamId of input.teamIds) {
    rows.set(teamId, {
      teamId,
      played: 0,
      wins: 0,
      losses: 0,
      setsFor: 0,
      setsAgainst: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      forfeits: 0,
      tablePoints: 0,
    });
  }
  const headToHead = new Map<string, string>();
  for (const match of input.matches) {
    if (match.byeFor) {
      const row = rows.get(match.byeFor);
      if (row) row.tablePoints += awards.bye;
      continue;
    }
    const a = rows.get(match.teamAId);
    const b = rows.get(match.teamBId);
    if (!a || !b) throw new Error("Match references an unknown team");
    let setsA = 0;
    let setsB = 0;
    for (const set of match.sets) {
      if (set.a > set.b) setsA += 1;
      else if (set.b > set.a) setsB += 1;
      a.pointsFor += set.a;
      a.pointsAgainst += set.b;
      b.pointsFor += set.b;
      b.pointsAgainst += set.a;
    }
    a.played += 1;
    b.played += 1;
    a.setsFor += setsA;
    a.setsAgainst += setsB;
    b.setsFor += setsB;
    b.setsAgainst += setsA;
    const aWon = setsA > setsB;
    const winner = aWon ? a : b;
    const loser = aWon ? b : a;
    winner.wins += 1;
    loser.losses += 1;
    winner.tablePoints += awards.win;
    loser.tablePoints += awards.loss;
    if (match.sets.length >= 3) {
      winner.tablePoints += awards.decidingSetWin;
      loser.tablePoints += awards.decidingSetLoss;
    }
    if (match.forfeitBy) {
      const forfeiting = rows.get(match.forfeitBy);
      if (forfeiting) {
        forfeiting.forfeits += 1;
        forfeiting.tablePoints += awards.forfeitPenalty;
      }
    }
    headToHead.set(
      [match.teamAId, match.teamBId].sort().join(":"),
      winner.teamId,
    );
  }

  const explanation = new Map<string, string[]>(
    input.teamIds.map((teamId) => [teamId, []]),
  );
  const sorted = [...rows.values()].sort((left, right) => {
    if (right.tablePoints !== left.tablePoints) {
      return right.tablePoints - left.tablePoints;
    }
    for (const tiebreaker of input.tiebreakers) {
      let comparison = 0;
      switch (tiebreaker) {
        case "head-to-head": {
          const winner = headToHead.get(
            [left.teamId, right.teamId].sort().join(":"),
          );
          comparison =
            winner === left.teamId ? -1 : winner === right.teamId ? 1 : 0;
          break;
        }
        case "set-ratio":
          comparison =
            ratio(right.setsFor, right.setsAgainst) -
            ratio(left.setsFor, left.setsAgainst);
          break;
        case "point-ratio":
          comparison =
            ratio(right.pointsFor, right.pointsAgainst) -
            ratio(left.pointsFor, left.pointsAgainst);
          break;
        case "points-for":
          comparison = right.pointsFor - left.pointsFor;
          break;
        case "fewest-forfeits":
          comparison = left.forfeits - right.forfeits;
          break;
        case "coin-flip":
          comparison =
            deterministicCoin(left.teamId, input.coinFlipSeed) -
            deterministicCoin(right.teamId, input.coinFlipSeed);
          break;
      }
      if (comparison !== 0) {
        explanation
          .get(left.teamId)
          ?.push(`Ranked by ${tiebreaker.replaceAll("-", " ")}`);
        explanation
          .get(right.teamId)
          ?.push(`Ranked by ${tiebreaker.replaceAll("-", " ")}`);
        return comparison;
      }
    }
    return left.teamId.localeCompare(right.teamId);
  });
  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
    tiebreakExplanation: explanation.get(row.teamId) ?? [],
  }));
}

export function assignWorkTeams(input: {
  readonly completedMatchIds: readonly string[];
  readonly nextMatchIds: readonly string[];
  readonly losingTeamByMatch: Readonly<Record<string, string>>;
}): readonly { readonly matchId: string; readonly assignedTeamId: string }[] {
  const assignments: Array<{ matchId: string; assignedTeamId: string }> = [];
  const counts = new Map<string, number>();
  const available = input.completedMatchIds
    .map((matchId) => input.losingTeamByMatch[matchId])
    .filter((teamId): teamId is string => Boolean(teamId));
  for (const matchId of input.nextMatchIds) {
    const ranked = [...available].sort(
      (a, b) =>
        (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b),
    );
    const assignedTeamId = ranked[0];
    if (!assignedTeamId) break;
    assignments.push({ matchId, assignedTeamId });
    counts.set(assignedTeamId, (counts.get(assignedTeamId) ?? 0) + 1);
  }
  return assignments;
}
