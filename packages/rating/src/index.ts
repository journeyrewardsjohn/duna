export type RatingConfidence =
  "Provisional" | "Developing" | "Reliable" | "Locked";

export interface RatingState {
  readonly playerId: string;
  readonly mu: number;
  readonly phi: number;
  readonly sigma: number;
  readonly display: number;
  readonly confidence: RatingConfidence;
  readonly ratedMatches: number;
  readonly weeklyPositiveDisplayGain: number;
}

export interface SetScore {
  readonly a: number;
  readonly b: number;
}

export interface RatingPlayerInput {
  readonly state: RatingState;
  readonly partnershipSynergyMu?: number;
}

export interface RatingExplanation {
  readonly expectedWinProbability: number;
  readonly actualResult: number;
  readonly pointShare: number;
  readonly marginMultiplier: number;
  readonly responsibilityWeight: number;
  readonly verificationWeight: number;
  readonly repeatOpponentWeight: number;
  readonly preMatchPhi: number;
  readonly rawMuDelta: number;
  readonly appliedMuDelta: number;
  readonly displayDelta: number;
  readonly cappedByWeeklyGain: boolean;
}

export interface RatingUpdate {
  readonly playerId: string;
  readonly before: RatingState;
  readonly after: RatingState;
  readonly explanation: RatingExplanation;
}

export interface MatchRatingResult {
  readonly expectedTeamA: number;
  readonly teamStrengthA: number;
  readonly teamStrengthB: number;
  readonly updates: readonly RatingUpdate[];
}

export interface RatingConfig {
  readonly weakLinkAlpha: number;
  readonly baseK: number;
  readonly weeklyDisplayGainCap: number;
  readonly repeatOpponentWindowDays: number;
}

export const defaultRatingConfig: RatingConfig = {
  weakLinkAlpha: 0.62,
  baseK: 42,
  weeklyDisplayGainCap: 0.35,
  repeatOpponentWindowDays: 30,
};

const DISPLAY_MIN = 1;
const DISPLAY_MAX = 8;
const RECREATIONAL_ANCHOR_MU = 1500;
const RECREATIONAL_ANCHOR_DISPLAY = 3;
const MU_PER_DISPLAY_POINT = 400;

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function displayFromMu(mu: number): number {
  if (!Number.isFinite(mu)) {
    throw new Error("mu must be finite");
  }
  return round(
    clamp(
      RECREATIONAL_ANCHOR_DISPLAY +
        (mu - RECREATIONAL_ANCHOR_MU) / MU_PER_DISPLAY_POINT,
      DISPLAY_MIN,
      DISPLAY_MAX,
    ),
    2,
  );
}

export function confidenceFromPhi(phi: number): RatingConfidence {
  if (phi > 220) return "Provisional";
  if (phi > 130) return "Developing";
  if (phi > 65) return "Reliable";
  return "Locked";
}

export function createInitialRating(input: {
  readonly playerId: string;
  readonly mu?: number;
  readonly phi?: number;
  readonly sigma?: number;
}): RatingState {
  const mu = input.mu ?? RECREATIONAL_ANCHOR_MU;
  const phi = input.phi ?? 350;
  return {
    playerId: input.playerId,
    mu,
    phi,
    sigma: input.sigma ?? 0.06,
    display: displayFromMu(mu),
    confidence: confidenceFromPhi(phi),
    ratedMatches: 0,
    weeklyPositiveDisplayGain: 0,
  };
}

function teamStrength(
  team: readonly [RatingPlayerInput, RatingPlayerInput],
  weakLinkAlpha: number,
): {
  readonly mu: number;
  readonly phi: number;
  readonly responsibility: readonly [number, number];
} {
  if (weakLinkAlpha <= 0.5 || weakLinkAlpha >= 1) {
    throw new Error("weakLinkAlpha must be greater than 0.5 and below 1");
  }
  const [first, second] = team;
  const firstIsWeaker = first.state.mu <= second.state.mu;
  const weak = firstIsWeaker ? first : second;
  const strong = firstIsWeaker ? second : first;
  const synergy =
    ((first.partnershipSynergyMu ?? 0) + (second.partnershipSynergyMu ?? 0)) /
    2;
  const mu =
    weak.state.mu * weakLinkAlpha +
    strong.state.mu * (1 - weakLinkAlpha) +
    synergy;
  const phi = Math.sqrt(
    weak.state.phi ** 2 * weakLinkAlpha ** 2 +
      strong.state.phi ** 2 * (1 - weakLinkAlpha) ** 2,
  );
  return {
    mu: round(mu),
    phi: round(phi),
    responsibility: firstIsWeaker
      ? [weakLinkAlpha, 1 - weakLinkAlpha]
      : [1 - weakLinkAlpha, weakLinkAlpha],
  };
}

function g(phi: number): number {
  const scaled = phi / 173.7178;
  return 1 / Math.sqrt(1 + (3 * scaled ** 2) / Math.PI ** 2);
}

function expectedScore(
  teamMu: number,
  opponentMu: number,
  opponentPhi: number,
) {
  return 1 / (1 + 10 ** ((-g(opponentPhi) * (teamMu - opponentMu)) / 400));
}

function deriveResult(setScores: readonly SetScore[]): {
  readonly winnerA: boolean;
  readonly actualA: number;
  readonly pointShareA: number;
  readonly marginMultiplier: number;
} {
  if (setScores.length === 0) {
    throw new Error("At least one set score is required");
  }
  let setsA = 0;
  let setsB = 0;
  let pointsA = 0;
  let pointsB = 0;
  for (const set of setScores) {
    if (
      !Number.isSafeInteger(set.a) ||
      !Number.isSafeInteger(set.b) ||
      set.a < 0 ||
      set.b < 0 ||
      set.a === set.b
    ) {
      throw new Error("Set scores must be non-negative integer decisions");
    }
    if (set.a > set.b) setsA += 1;
    else setsB += 1;
    pointsA += set.a;
    pointsB += set.b;
  }
  if (setsA === setsB) {
    throw new Error("Match must have a set winner");
  }
  const totalPoints = pointsA + pointsB;
  const pointShareA = totalPoints === 0 ? 0.5 : pointsA / totalPoints;
  const winnerA = setsA > setsB;
  const binary = winnerA ? 1 : 0;
  const marginSignal = clamp((pointShareA - 0.5) * 2, -1, 1);
  const actualA = clamp(binary * 0.8 + (0.5 + marginSignal / 2) * 0.2, 0, 1);
  const marginMultiplier = 1 + Math.min(0.35, Math.abs(marginSignal) * 0.35);
  return {
    winnerA,
    actualA: round(actualA),
    pointShareA: round(pointShareA),
    marginMultiplier: round(marginMultiplier),
  };
}

function nextPhi(phi: number, ratedMatches: number): number {
  const contraction =
    ratedMatches < 10 ? 0.9 : ratedMatches < 30 ? 0.94 : 0.975;
  return round(clamp(phi * contraction, 35, 350), 4);
}

function applyPlayerUpdate(input: {
  readonly player: RatingPlayerInput;
  readonly responsibilityWeight: number;
  readonly teamDeltaMu: number;
  readonly expectedWinProbability: number;
  readonly actualResult: number;
  readonly pointShare: number;
  readonly marginMultiplier: number;
  readonly verificationWeight: number;
  readonly repeatOpponentWeight: number;
  readonly config: RatingConfig;
}): RatingUpdate {
  const before = input.player.state;
  const normalizedResponsibility = input.responsibilityWeight * 2;
  const rawMuDelta = input.teamDeltaMu * normalizedResponsibility;
  const rawDisplayDelta = rawMuDelta / MU_PER_DISPLAY_POINT;
  const remainingPositiveGain = Math.max(
    0,
    input.config.weeklyDisplayGainCap - before.weeklyPositiveDisplayGain,
  );
  const appliedDisplayDelta =
    rawDisplayDelta > 0
      ? Math.min(rawDisplayDelta, remainingPositiveGain)
      : rawDisplayDelta;
  const appliedMuDelta = appliedDisplayDelta * MU_PER_DISPLAY_POINT;
  const mu = round(before.mu + appliedMuDelta, 5);
  const phi = nextPhi(before.phi, before.ratedMatches);
  const display = displayFromMu(mu);
  const displayDelta = round(display - before.display, 2);
  const after: RatingState = {
    ...before,
    mu,
    phi,
    display,
    confidence: confidenceFromPhi(phi),
    ratedMatches: before.ratedMatches + 1,
    weeklyPositiveDisplayGain: round(
      before.weeklyPositiveDisplayGain + Math.max(0, appliedDisplayDelta),
      4,
    ),
  };
  return {
    playerId: before.playerId,
    before,
    after,
    explanation: {
      expectedWinProbability: round(input.expectedWinProbability, 5),
      actualResult: round(input.actualResult, 5),
      pointShare: round(input.pointShare, 5),
      marginMultiplier: round(input.marginMultiplier, 5),
      responsibilityWeight: round(input.responsibilityWeight, 5),
      verificationWeight: round(input.verificationWeight, 5),
      repeatOpponentWeight: round(input.repeatOpponentWeight, 5),
      preMatchPhi: before.phi,
      rawMuDelta: round(rawMuDelta, 5),
      appliedMuDelta: round(appliedMuDelta, 5),
      displayDelta,
      cappedByWeeklyGain:
        rawDisplayDelta > 0 && appliedDisplayDelta < rawDisplayDelta,
    },
  };
}

export function rateDoublesMatch(input: {
  readonly teamA: readonly [RatingPlayerInput, RatingPlayerInput];
  readonly teamB: readonly [RatingPlayerInput, RatingPlayerInput];
  readonly setScores: readonly SetScore[];
  readonly verificationWeight: number;
  readonly previousPairMeetingsInWindow?: number;
  readonly config?: Partial<RatingConfig>;
}): MatchRatingResult {
  if (input.verificationWeight < 0 || input.verificationWeight > 1) {
    throw new Error("verificationWeight must be between 0 and 1");
  }
  const config = { ...defaultRatingConfig, ...input.config };
  const strengthA = teamStrength(input.teamA, config.weakLinkAlpha);
  const strengthB = teamStrength(input.teamB, config.weakLinkAlpha);
  const expectedA = expectedScore(strengthA.mu, strengthB.mu, strengthB.phi);
  const result = deriveResult(input.setScores);
  const meetingNumber = (input.previousPairMeetingsInWindow ?? 0) + 1;
  const repeatOpponentWeight = 1 / Math.sqrt(meetingNumber);
  const uncertaintyMultiplier = clamp(
    (strengthA.phi + strengthB.phi) / 300,
    0.55,
    1.75,
  );
  const teamDeltaMu =
    config.baseK *
    uncertaintyMultiplier *
    (result.actualA - expectedA) *
    result.marginMultiplier *
    input.verificationWeight *
    repeatOpponentWeight;

  const commonA = {
    expectedWinProbability: expectedA,
    actualResult: result.actualA,
    pointShare: result.pointShareA,
    marginMultiplier: result.marginMultiplier,
    verificationWeight: input.verificationWeight,
    repeatOpponentWeight,
    config,
  };
  const commonB = {
    expectedWinProbability: 1 - expectedA,
    actualResult: 1 - result.actualA,
    pointShare: 1 - result.pointShareA,
    marginMultiplier: result.marginMultiplier,
    verificationWeight: input.verificationWeight,
    repeatOpponentWeight,
    config,
  };
  return {
    expectedTeamA: round(expectedA, 5),
    teamStrengthA: strengthA.mu,
    teamStrengthB: strengthB.mu,
    updates: [
      applyPlayerUpdate({
        player: input.teamA[0],
        responsibilityWeight: strengthA.responsibility[0],
        teamDeltaMu,
        ...commonA,
      }),
      applyPlayerUpdate({
        player: input.teamA[1],
        responsibilityWeight: strengthA.responsibility[1],
        teamDeltaMu,
        ...commonA,
      }),
      applyPlayerUpdate({
        player: input.teamB[0],
        responsibilityWeight: strengthB.responsibility[0],
        teamDeltaMu: -teamDeltaMu,
        ...commonB,
      }),
      applyPlayerUpdate({
        player: input.teamB[1],
        responsibilityWeight: strengthB.responsibility[1],
        teamDeltaMu: -teamDeltaMu,
        ...commonB,
      }),
    ],
  };
}

export function resetWeeklyGain(state: RatingState): RatingState {
  return { ...state, weeklyPositiveDisplayGain: 0 };
}

export function warmStartFromDiscipline(input: {
  readonly playerId: string;
  readonly source: RatingState;
  readonly correlation: number;
}): RatingState {
  const correlation = clamp(input.correlation, 0, 1);
  const mu =
    RECREATIONAL_ANCHOR_MU +
    (input.source.mu - RECREATIONAL_ANCHOR_MU) * correlation;
  const phi = clamp(
    input.source.phi + (1 - correlation) * 160,
    input.source.phi,
    350,
  );
  return createInitialRating({ playerId: input.playerId, mu, phi });
}
