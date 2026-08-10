export type ScoreSetsToWin = 1 | 2 | 3;

export function scoreMaximumSets(setsToWin: ScoreSetsToWin) {
  return setsToWin * 2 - 1;
}

export function validateCompletedScore(
  setsToWin: ScoreSetsToWin,
  sets: readonly { readonly a: number; readonly b: number }[],
): string | undefined {
  const maximumSets = scoreMaximumSets(setsToWin);
  if (sets.length < setsToWin || sets.length > maximumSets) {
    return `Record ${setsToWin} to ${maximumSets} completed sets.`;
  }
  if (
    sets.some(
      (set) =>
        !Number.isSafeInteger(set.a) ||
        !Number.isSafeInteger(set.b) ||
        set.a < 0 ||
        set.b < 0 ||
        set.a === set.b ||
        Math.abs(set.a - set.b) < 2,
    )
  ) {
    return "Every set needs a winner by at least two points.";
  }
  let teamAWins = 0;
  let teamBWins = 0;
  for (const [index, set] of sets.entries()) {
    if (set.a > set.b) teamAWins += 1;
    else teamBWins += 1;
    if (
      index < sets.length - 1 &&
      (teamAWins === setsToWin || teamBWins === setsToWin)
    ) {
      return "Remove sets played after the match was already won.";
    }
  }
  if (Math.max(teamAWins, teamBWins) !== setsToWin) {
    return `One team must win ${setsToWin} ${setsToWin === 1 ? "set" : "sets"}.`;
  }
  return undefined;
}
