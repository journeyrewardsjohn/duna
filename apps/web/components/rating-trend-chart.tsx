import type { MatchSummary } from "@duna/core";

const WIDTH = 760;
const HEIGHT = 244;
const PADDING = { top: 28, right: 22, bottom: 40, left: 50 };

export interface RatingTrendPoint {
  readonly id: string;
  readonly occurredAt: string;
  readonly rating: number;
  readonly before?: number;
  readonly delta?: number;
  readonly result?: "win" | "loss" | "unknown";
}

function formatRating(value: number) {
  return value.toFixed(2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function RatingTrendChart({
  matches = [],
  points: suppliedPoints,
}: {
  readonly matches?: readonly MatchSummary[];
  readonly points?: readonly RatingTrendPoint[];
}) {
  const matchPoints: RatingTrendPoint[] = matches
    .filter(
      (
        match,
      ): match is MatchSummary & {
        readonly ratingAfter: number;
        readonly ratingBefore?: number;
      } => typeof match.ratingAfter === "number",
    )
    .map((match) => ({
      id: match.id,
      occurredAt: match.playedAt,
      rating: match.ratingAfter,
      before: match.ratingBefore,
      delta:
        typeof match.ratingBefore === "number"
          ? match.ratingAfter - match.ratingBefore
          : undefined,
    }));
  const history = (suppliedPoints ?? matchPoints)
    .map((point) => ({
      ...point,
      timestamp: new Date(point.occurredAt).getTime(),
    }))
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (history.length === 0) {
    return (
      <div className="rating-trend-chart rating-trend-chart--empty">
        <strong>Your rating story starts with a verified match.</strong>
        <span>
          Once a rated result is connected, its played date and movement will
          appear here.
        </span>
      </div>
    );
  }

  const first = history[0]!;
  const last = history.at(-1)!;
  const minimumTime = first.timestamp;
  const maximumTime = last.timestamp;
  const rawRatings = history.flatMap((point) =>
    typeof point.before === "number"
      ? [point.before, point.rating]
      : [point.rating],
  );
  const rawMinimum = Math.min(...rawRatings);
  const rawMaximum = Math.max(...rawRatings);
  const ratingPadding = Math.max((rawMaximum - rawMinimum) * 0.18, 0.04);
  const minimumRating = rawMinimum - ratingPadding;
  const maximumRating = rawMaximum + ratingPadding;
  const ratingSpan = Math.max(maximumRating - minimumRating, 0.01);
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (timestamp: number, index: number) => {
    if (history.length === 1) {
      return PADDING.left + chartWidth / 2;
    }
    if (maximumTime === minimumTime) {
      return PADDING.left + (index / (history.length - 1)) * chartWidth;
    }
    return (
      PADDING.left +
      ((timestamp - minimumTime) / (maximumTime - minimumTime)) * chartWidth
    );
  };
  const y = (rating: number) =>
    PADDING.top +
    chartHeight -
    ((rating - minimumRating) / ratingSpan) * chartHeight;
  const points = history.map((point, index) => ({
    ...point,
    x: x(point.timestamp, index),
    y: y(point.rating),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${path} L ${points.at(-1)!.x} ${
    PADDING.top + chartHeight
  } L ${points[0]!.x} ${PADDING.top + chartHeight} Z`;
  const gridRatings = [
    maximumRating,
    (maximumRating + minimumRating) / 2,
    minimumRating,
  ];
  const startingRating = first.before ?? first.rating;
  const change = last.rating - startingRating;
  const high = Math.max(...rawRatings);
  const low = Math.min(...rawRatings);
  const largestMovement = Math.max(
    ...history.map((point) => Math.abs(point.delta ?? 0)),
    0.01,
  );
  const gradientId = `rating-area-${first.id.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="rating-trend-chart">
      <div className="rating-trend-chart__summary">
        <span>
          <small>Starting</small>
          <strong>{formatRating(startingRating)}</strong>
        </span>
        <span>
          <small>Current</small>
          <strong>{formatRating(last.rating)}</strong>
        </span>
        <span data-direction={change >= 0 ? "up" : "down"}>
          <small>Net movement</small>
          <strong>
            {change >= 0 ? "+" : ""}
            {formatRating(change)}
          </strong>
        </span>
        <span>
          <small>Range</small>
          <strong>
            {formatRating(low)}–{formatRating(high)}
          </strong>
        </span>
      </div>
      <svg
        aria-labelledby="rating-trend-title rating-trend-description"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title id="rating-trend-title">Sand Rating over time</title>
        <desc id="rating-trend-description">
          Sand Rating movement ordered by the date each match was played.
        </desc>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-aqua)"
              stopOpacity="0.28"
            />
            <stop offset="100%" stopColor="var(--color-aqua)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridRatings.map((rating) => {
          const lineY = y(rating);
          return (
            <g key={rating}>
              <line
                className="rating-trend-chart__grid"
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={lineY}
                y2={lineY}
              />
              <text
                className="rating-trend-chart__axis"
                textAnchor="end"
                x={PADDING.left - 10}
                y={lineY + 4}
              >
                {formatRating(rating)}
              </text>
            </g>
          );
        })}
        <path
          className="rating-trend-chart__area"
          d={areaPath}
          style={{ fill: `url(#${gradientId})` }}
        />
        <path className="rating-trend-chart__line" d={path} />
        {points.map((point) => (
          <g key={point.id}>
            <circle
              aria-label={`${formatDate(point.occurredAt)}: ${formatRating(point.rating)}`}
              className="rating-trend-chart__point"
              cx={point.x}
              cy={point.y}
              r="4.5"
              role="img"
            />
          </g>
        ))}
        <text
          className="rating-trend-chart__axis"
          textAnchor="start"
          x={PADDING.left}
          y={HEIGHT - 12}
        >
          {formatDate(first.occurredAt)}
        </text>
        <text
          className="rating-trend-chart__axis"
          textAnchor="end"
          x={WIDTH - PADDING.right}
          y={HEIGHT - 12}
        >
          {formatDate(last.occurredAt)}
        </text>
      </svg>
      <div
        aria-label="Rating movement by match"
        className="rating-trend-chart__momentum"
      >
        {history.map((point) => {
          const delta = point.delta ?? 0;
          return (
            <span
              data-result={point.result ?? "unknown"}
              key={`${point.id}-movement`}
              style={{
                height: `${Math.max(14, (Math.abs(delta) / largestMovement) * 100)}%`,
              }}
              title={`${formatDate(point.occurredAt)}: ${delta >= 0 ? "+" : ""}${formatRating(delta)}`}
            />
          );
        })}
      </div>
      <p>
        {formatDate(first.occurredAt)}–{formatDate(last.occurredAt)} ·{" "}
        {history.length} rated results
      </p>
    </div>
  );
}
