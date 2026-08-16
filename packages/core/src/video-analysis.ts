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
