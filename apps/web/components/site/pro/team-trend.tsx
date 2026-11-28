"use client";

import { Segmented } from "@duna/ui/tideline";
import { useMemo, useState } from "react";

export interface TeamTrendPoint {
  readonly matchId: string;
  readonly occurredAt: string;
  readonly eventName: string;
  readonly opponent: string;
  readonly result: "win" | "loss" | "unknown";
  readonly hittingEfficiency?: number;
  readonly acesPerSet: number;
  readonly blocksPerSet: number;
  readonly digsPerSet: number;
}

const METRICS = [
  { key: "hittingEfficiency", label: "Hitting", suffix: "%", digits: 1 },
  { key: "acesPerSet", label: "Aces / set", suffix: "", digits: 2 },
  { key: "blocksPerSet", label: "Blocks / set", suffix: "", digits: 2 },
  { key: "digsPerSet", label: "Digs / set", suffix: "", digits: 2 },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const W = 640;
const H = 180;
const PAD = 16;

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/**
 * The team's official box-score numbers over its matches, one metric at a
 * time. A line with a dot per match (filled for a win, hollow for a loss);
 * the summary under it says the first, last and best values in words, so
 * the chart is readable without colour or sight.
 */
export function TeamTrend({
  points,
}: {
  readonly points: readonly TeamTrendPoint[];
}) {
  const [metric, setMetric] = useState<MetricKey>("hittingEfficiency");
  const spec = METRICS.find((item) => item.key === metric)!;
  const plotted = useMemo(
    () =>
      points.flatMap((point) => {
        const value = point[metric];
        return value !== undefined && Number.isFinite(value)
          ? [{ point, value }]
          : [];
      }),
    [metric, points],
  );
  const format = (value: number) =>
    `${value.toFixed(spec.digits)}${spec.suffix}`;
  const values = plotted.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) =>
    plotted.length < 2
      ? W / 2
      : PAD + (index * (W - PAD * 2)) / (plotted.length - 1);
  const y = (value: number) => H - PAD - ((value - min) / span) * (H - PAD * 2);
  const best = plotted.reduce<(typeof plotted)[number] | undefined>(
    (top, item) => (!top || item.value > top.value ? item : top),
    undefined,
  );
  const first = plotted[0];
  const last = plotted.at(-1);
  return (
    <div className="site-trend">
      <Segmented
        aria-label="Statistic"
        onValueChange={(value) => setMetric(value as MetricKey)}
        options={METRICS.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        value={metric}
      />
      {plotted.length === 0 ? (
        <p className="site-empty">
          No {spec.label.toLowerCase()} recorded yet.
        </p>
      ) : (
        <>
          <svg
            aria-hidden="true"
            className="site-trend__chart"
            preserveAspectRatio="none"
            viewBox={`0 0 ${W} ${H}`}
          >
            <line
              className="site-trend__base"
              x1={PAD}
              x2={W - PAD}
              y1={H - PAD}
              y2={H - PAD}
            />
            <polyline
              className="site-trend__line"
              fill="none"
              points={plotted
                .map((item, index) => `${x(index)},${y(item.value)}`)
                .join(" ")}
              vectorEffect="non-scaling-stroke"
            />
            {plotted.map((item, index) => (
              <circle
                className="site-trend__dot"
                cx={x(index)}
                cy={y(item.value)}
                data-result={item.point.result}
                key={item.point.matchId}
                r={4}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <p className="site-meta site-trend__summary">
            {plotted.length} matches. First {format(first!.value)} (
            {shortDate(first!.point.occurredAt)}), latest {format(last!.value)}{" "}
            ({shortDate(last!.point.occurredAt)} against {last!.point.opponent}
            ), best {format(best!.value)} against {best!.point.opponent}. Filled
            dots are wins.
          </p>
        </>
      )}
    </div>
  );
}
