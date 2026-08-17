/**
 * Shared, model-neutral primitives for Duna Vision reports.
 *
 * These functions deliberately operate only on court points that are known to
 * be visible in the calibrated court. A tracker may report an edge or an
 * out-of-frame state, but neither is allowed to become a misleading landing
 * point on a heatmap.
 */
export const MAX_SESSION_TIME_US = 12 * 60 * 60 * 1_000_000;

export type AnalysisConfidenceBand =
  "verified" | "high" | "medium" | "low" | "unavailable";

export type CourtObservationState = "visible" | "edge" | "out-of-frame";

export type VolleyballSide = "a" | "b" | "unknown";

export type VolleyballContactKind =
  "serve" | "reception" | "set" | "attack" | "block" | "dig" | "free-ball";

export type VolleyballContactOutcome =
  "in-play" | "ace" | "kill" | "error" | "blocked" | "positive" | "negative";

export interface CourtDimensions {
  readonly widthMeters: number;
  readonly lengthMeters: number;
}

export interface CourtObservation {
  readonly xMeters: number;
  readonly yMeters: number;
  readonly observed: CourtObservationState;
  readonly confidence?: number;
}

export interface CourtHeatmapCell {
  readonly column: number;
  readonly row: number;
  readonly count: number;
  readonly confidence: AnalysisConfidenceBand;
}

export interface CourtHeatmap {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly CourtHeatmapCell[];
  readonly observedCount: number;
  readonly summary: string;
}

export interface VolleyballAnalysisEvent {
  readonly eventType:
    | "rally-started"
    | "rally-ended"
    | "ball-contact"
    | "ball-landing"
    | "player-position"
    | "highlight"
    | "review-marker";
  readonly sessionTimeUs: number;
  readonly durationUs?: number;
  readonly confidence?: number;
  readonly source?: "human" | "model" | "watch" | "system";
  readonly payload: {
    readonly rallyId?: string;
    readonly contactKind?: VolleyballContactKind;
    readonly outcome?: VolleyballContactOutcome;
    readonly side?: VolleyballSide;
    readonly playerId?: string;
    readonly speedKph?: number;
  };
}

export interface VolleyballSidePerformance {
  readonly side: VolleyballSide;
  readonly serves: number;
  readonly aces: number;
  readonly serviceErrors: number;
  readonly receptions: number;
  readonly sets: number;
  readonly attacks: number;
  readonly kills: number;
  readonly attackErrors: number;
  readonly blocks: number;
  readonly digs: number;
  readonly attackEfficiency?: number;
  readonly aceRate?: number;
}

export interface VolleyballPerformanceReport {
  readonly summary: string;
  readonly rallyCount: number;
  readonly averageRallySeconds?: number;
  readonly longestRallySeconds?: number;
  readonly averageContactsPerRally?: number;
  readonly contactObservations: number;
  readonly attributedContacts: number;
  readonly verifiedObservations: number;
  readonly needsReview: number;
  readonly maxServeSpeedKph?: number;
  readonly maxAttackSpeedKph?: number;
  readonly sides: readonly VolleyballSidePerformance[];
}

export const STANDARD_BEACH_COURT: CourtDimensions = {
  widthMeters: 8,
  lengthMeters: 16,
};

export function isSessionTimeUs(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_SESSION_TIME_US
  );
}

export function confidenceBand(
  confidence: number | undefined,
  source: "human" | "model" | "watch" | "system" = "model",
): AnalysisConfidenceBand {
  if (source === "human") return "verified";
  if (confidence === undefined || !Number.isFinite(confidence)) {
    return "unavailable";
  }
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

export function isCourtObservationVisible(
  point: CourtObservation,
  court: CourtDimensions,
): boolean {
  return (
    point.observed === "visible" &&
    Number.isFinite(point.xMeters) &&
    Number.isFinite(point.yMeters) &&
    point.xMeters >= 0 &&
    point.xMeters <= court.widthMeters &&
    point.yMeters >= 0 &&
    point.yMeters <= court.lengthMeters
  );
}

function courtZone(column: number, row: number, columns: number, rows: number) {
  const horizontal =
    column < columns / 3
      ? "left"
      : column >= (columns * 2) / 3
        ? "right"
        : "middle";
  const vertical =
    row < rows / 3
      ? "near court"
      : row >= (rows * 2) / 3
        ? "deep court"
        : "middle court";
  return `${vertical}, ${horizontal}`;
}

export function buildCourtHeatmap(input: {
  readonly court: CourtDimensions;
  readonly observations: readonly (CourtObservation & {
    readonly source?: "human" | "model" | "watch" | "system";
  })[];
  readonly columns?: number;
  readonly rows?: number;
}): CourtHeatmap {
  const columns = Math.max(2, Math.min(12, Math.floor(input.columns ?? 4)));
  const rows = Math.max(2, Math.min(16, Math.floor(input.rows ?? 8)));
  const counts = new Map<
    string,
    {
      readonly column: number;
      readonly row: number;
      count: number;
      confidenceTotal: number;
      confidenceSamples: number;
      verified: boolean;
    }
  >();

  for (const observation of input.observations) {
    if (!isCourtObservationVisible(observation, input.court)) continue;
    const column = Math.min(
      columns - 1,
      Math.floor((observation.xMeters / input.court.widthMeters) * columns),
    );
    const row = Math.min(
      rows - 1,
      Math.floor((observation.yMeters / input.court.lengthMeters) * rows),
    );
    const key = `${column}:${row}`;
    const cell = counts.get(key) ?? {
      column,
      row,
      count: 0,
      confidenceTotal: 0,
      confidenceSamples: 0,
      verified: false,
    };
    cell.count += 1;
    if (observation.source === "human") cell.verified = true;
    if (
      observation.confidence !== undefined &&
      Number.isFinite(observation.confidence)
    ) {
      cell.confidenceTotal += observation.confidence;
      cell.confidenceSamples += 1;
    }
    counts.set(key, cell);
  }

  const cells = [...counts.values()]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.row - right.row || left.column - right.column;
    })
    .map((cell) => ({
      column: cell.column,
      row: cell.row,
      count: cell.count,
      confidence: cell.verified
        ? "verified"
        : confidenceBand(
            cell.confidenceSamples > 0
              ? cell.confidenceTotal / cell.confidenceSamples
              : undefined,
          ),
    }));
  const observedCount = cells.reduce((total, cell) => total + cell.count, 0);
  const primary = cells[0];
  const summary = primary
    ? `${observedCount} visible ball landing${observedCount === 1 ? "" : "s"}. Most often ${courtZone(primary.column, primary.row, columns, rows)}.`
    : "No verified or visible ball landings are available yet.";

  return { columns, rows, cells, observedCount, summary };
}

export function formatSessionTimeUs(value: number): string {
  const wholeSeconds = Math.max(0, Math.floor(value / 1_000_000));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const seconds = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function rounded(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function rate(numerator: number, denominator: number): number | undefined {
  return denominator > 0 ? rounded(numerator / denominator, 3) : undefined;
}

function emptySidePerformance(side: VolleyballSide): VolleyballSidePerformance {
  return {
    side,
    serves: 0,
    aces: 0,
    serviceErrors: 0,
    receptions: 0,
    sets: 0,
    attacks: 0,
    kills: 0,
    attackErrors: 0,
    blocks: 0,
    digs: 0,
  };
}

/**
 * Produces conservative volleyball statistics from typed observations. Model
 * events below 0.5 confidence are retained for review but never promoted into
 * performance totals. Human observations always qualify.
 */
export function buildVolleyballPerformance(
  events: readonly VolleyballAnalysisEvent[],
): VolleyballPerformanceReport {
  const usable = events.filter(
    (event) =>
      event.source === "human" ||
      event.source === "watch" ||
      (event.confidence !== undefined && event.confidence >= 0.5),
  );
  const contacts = usable.filter(
    (event) => event.eventType === "ball-contact" && event.payload.contactKind,
  );
  const sides = new Map<VolleyballSide, VolleyballSidePerformance>([
    ["a", emptySidePerformance("a")],
    ["b", emptySidePerformance("b")],
    ["unknown", emptySidePerformance("unknown")],
  ]);

  for (const contact of contacts) {
    const side = contact.payload.side ?? "unknown";
    const current = sides.get(side) ?? emptySidePerformance(side);
    const next = { ...current };
    switch (contact.payload.contactKind) {
      case "serve":
        next.serves += 1;
        if (contact.payload.outcome === "ace") next.aces += 1;
        if (contact.payload.outcome === "error") next.serviceErrors += 1;
        break;
      case "reception":
        next.receptions += 1;
        break;
      case "set":
        next.sets += 1;
        break;
      case "attack":
        next.attacks += 1;
        if (contact.payload.outcome === "kill") next.kills += 1;
        if (contact.payload.outcome === "error") next.attackErrors += 1;
        break;
      case "block":
        next.blocks += 1;
        break;
      case "dig":
        next.digs += 1;
        break;
      case "free-ball":
        break;
    }
    sides.set(side, next);
  }

  const finalizedSides = [...sides.values()]
    .map((side) => ({
      ...side,
      attackEfficiency: rate(side.kills - side.attackErrors, side.attacks),
      aceRate: rate(side.aces, side.serves),
    }))
    .filter(
      (side) =>
        side.side !== "unknown" ||
        Object.entries(side).some(
          ([key, value]) =>
            key !== "side" && typeof value === "number" && value > 0,
        ),
    );

  const rallyDurations = usable
    .filter(
      (event) =>
        event.eventType === "rally-ended" &&
        event.durationUs !== undefined &&
        isSessionTimeUs(event.durationUs),
    )
    .map((event) => event.durationUs! / 1_000_000);
  const rallyIds = new Set(
    usable
      .map((event) => event.payload.rallyId)
      .filter((id): id is string => Boolean(id)),
  );
  const rallyCount = Math.max(rallyDurations.length, rallyIds.size);
  const totalDuration = rallyDurations.reduce(
    (total, value) => total + value,
    0,
  );
  const contactRallyIds = new Set(
    contacts
      .map((event) => event.payload.rallyId)
      .filter((id): id is string => Boolean(id)),
  );
  const maxServeSpeedKph = contacts
    .filter(
      (event) =>
        event.payload.contactKind === "serve" &&
        event.payload.speedKph !== undefined &&
        Number.isFinite(event.payload.speedKph),
    )
    .reduce<number | undefined>(
      (maximum, event) => Math.max(maximum ?? 0, event.payload.speedKph ?? 0),
      undefined,
    );
  const maxAttackSpeedKph = contacts
    .filter(
      (event) =>
        event.payload.contactKind === "attack" &&
        event.payload.speedKph !== undefined &&
        Number.isFinite(event.payload.speedKph),
    )
    .reduce<number | undefined>(
      (maximum, event) => Math.max(maximum ?? 0, event.payload.speedKph ?? 0),
      undefined,
    );
  const summary =
    contacts.length > 0
      ? `${contacts.length} confidence-qualified volleyball contacts across ${rallyCount || "unsegmented"} ${rallyCount === 1 ? "rally" : "rallies"}.`
      : "Volleyball contacts are not available yet; no performance rate is inferred from missing evidence.";

  return {
    summary,
    rallyCount,
    averageRallySeconds:
      rallyDurations.length > 0
        ? rounded(totalDuration / rallyDurations.length)
        : undefined,
    longestRallySeconds:
      rallyDurations.length > 0
        ? rounded(Math.max(...rallyDurations))
        : undefined,
    averageContactsPerRally:
      contactRallyIds.size > 0
        ? rounded(contacts.length / contactRallyIds.size)
        : undefined,
    contactObservations: contacts.length,
    attributedContacts: contacts.filter(
      (event) => event.payload.side && event.payload.side !== "unknown",
    ).length,
    verifiedObservations: events.filter((event) => event.source === "human")
      .length,
    needsReview: events.filter(
      (event) =>
        event.source === "model" &&
        (event.confidence === undefined || event.confidence < 0.7),
    ).length,
    maxServeSpeedKph:
      maxServeSpeedKph === undefined ? undefined : rounded(maxServeSpeedKph),
    maxAttackSpeedKph:
      maxAttackSpeedKph === undefined ? undefined : rounded(maxAttackSpeedKph),
    sides: finalizedSides,
  };
}
