import type { PublicRatingLab } from "@duna/api";

type Model = NonNullable<PublicRatingLab>["models"][number];

const colors = [
  "#71d8d0",
  "#ffb45d",
  "#b2a8ff",
  "#ed7391",
  "#6fa8ff",
  "#98c36e",
];

export function RatingBacktestChart({
  models,
}: {
  readonly models: readonly Model[];
}) {
  const plotted = models.filter((model) => model.curve.length > 1);
  const points = plotted.flatMap((model) => model.curve);
  if (points.length === 0) {
    return (
      <p className="rating-lab-empty">
        Run the first backtest to publish learning curves.
      </p>
    );
  }
  const maximumMatches = Math.max(...points.map((point) => point.matches), 1);
  const rawMinimum = Math.min(...points.map((point) => point.brierScore));
  const rawMaximum = Math.max(...points.map((point) => point.brierScore));
  const padding = Math.max(0.005, (rawMaximum - rawMinimum) * 0.12);
  const minimum = Math.max(0, rawMinimum - padding);
  const maximum = Math.min(1, rawMaximum + padding);
  const width = 960;
  const height = 360;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 44;
  const x = (matches: number) =>
    left + (matches / maximumMatches) * (width - left - right);
  const y = (score: number) =>
    top +
    ((maximum - score) / Math.max(0.000_001, maximum - minimum)) *
      (height - top - bottom);
  const grid = Array.from(
    { length: 5 },
    (_, index) => minimum + ((maximum - minimum) * index) / 4,
  );

  return (
    <figure className="rating-lab-chart">
      <svg
        aria-labelledby="backtest-chart-title backtest-chart-description"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title id="backtest-chart-title">
          Walk-forward Brier score by model
        </title>
        <desc id="backtest-chart-description">
          Cumulative prediction error as more historical matches are processed.
          Lower is better.
        </desc>
        {grid.map((value) => (
          <g key={value}>
            <line
              className="rating-lab-chart__grid"
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
            />
            <text x={left - 10} y={y(value) + 4} textAnchor="end">
              {value.toFixed(3)}
            </text>
          </g>
        ))}
        {plotted.map((model, index) => (
          <path
            className="rating-lab-chart__line"
            d={model.curve
              .map(
                (point, pointIndex) =>
                  `${pointIndex === 0 ? "M" : "L"}${x(point.matches).toFixed(2)},${y(point.brierScore).toFixed(2)}`,
              )
              .join(" ")}
            key={model.modelId}
            stroke={colors[index % colors.length]}
          />
        ))}
        <text
          className="rating-lab-chart__axis"
          x={width / 2}
          y={height - 9}
          textAnchor="middle"
        >
          Matches processed chronologically
        </text>
        <text
          className="rating-lab-chart__axis"
          textAnchor="middle"
          transform={`translate(14 ${height / 2}) rotate(-90)`}
        >
          Brier score · lower is better
        </text>
      </svg>
      <figcaption>
        {plotted.map((model, index) => (
          <span key={model.modelId}>
            <i style={{ background: colors[index % colors.length] }} />
            {model.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function RatingCalibrationChart({ model }: { readonly model: Model }) {
  const buckets = model.calibration.filter((bucket) => bucket.predictions > 0);
  if (buckets.length === 0) return null;
  return (
    <figure className="rating-calibration-chart">
      <div
        aria-label={`${model.label} calibration by probability bucket`}
        role="img"
      >
        {buckets.map((bucket) => (
          <span
            key={`${bucket.lowerBound}-${bucket.upperBound}`}
            style={{
              left: `${bucket.averageExpected * 100}%`,
              bottom: `${bucket.observedWinRate * 100}%`,
            }}
            title={`${Math.round(bucket.averageExpected * 100)}% predicted, ${Math.round(bucket.observedWinRate * 100)}% observed, ${bucket.predictions} matches`}
          >
            {bucket.predictions}
          </span>
        ))}
        <i aria-hidden />
      </div>
      <figcaption>
        <span>0%</span>
        <strong>{model.label} calibration</strong>
        <span>100%</span>
      </figcaption>
    </figure>
  );
}
