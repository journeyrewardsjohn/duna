"use client";

import { Numeric } from "@duna/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./pro-stat-trend-chart.module.css";

export interface ProStatTrendPoint {
  readonly matchId: string;
  readonly occurredAt: string;
  readonly eventName: string;
  readonly opponent: string;
  readonly result: "win" | "loss" | "unknown";
  readonly canonicalPath?: string;
  readonly hittingEfficiency?: number;
  readonly acesPerSet: number;
  readonly blocksPerSet: number;
  readonly digsPerSet: number;
}

const metrics = [
  { key: "hittingEfficiency", label: "Hitting efficiency", suffix: "%" },
  { key: "acesPerSet", label: "Aces / set", suffix: "" },
  { key: "blocksPerSet", label: "Blocks / set", suffix: "" },
  { key: "digsPerSet", label: "Digs / set", suffix: "" },
] as const;

type Metric = (typeof metrics)[number]["key"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ProStatTrendChart({
  points,
}: {
  readonly points: readonly ProStatTrendPoint[];
}) {
  const [metric, setMetric] = useState<Metric>("hittingEfficiency");
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
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const selected =
    plotted.find(({ point }) => point.matchId === selectedMatchId) ??
    plotted.at(-1);
  if (points.length === 0) return null;

  const width = 1_000;
  const height = 300;
  const left = 46;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const values = plotted.map(({ value }) => value);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const padding = Math.max(
    (rawMaximum - rawMinimum) * 0.18,
    metric === "hittingEfficiency" ? 3 : 0.2,
  );
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const x = (index: number) =>
    left + (index / Math.max(1, plotted.length - 1)) * (width - left - right);
  const y = (value: number) =>
    top +
    ((maximum - value) / Math.max(0.001, maximum - minimum)) *
      (height - top - bottom);
  const path = plotted
    .map(({ value }, index) =>
      index === 0 ? `M ${x(index)} ${y(value)}` : `H ${x(index)} V ${y(value)}`,
    )
    .join(" ");
  const activeMetric = metrics.find((candidate) => candidate.key === metric)!;

  return (
    <div className={styles.chart}>
      <div className={styles.metrics} role="tablist" aria-label="Stat trend">
        {metrics.map((candidate) => {
          const latest = [...points]
            .reverse()
            .find((point) => point[candidate.key] !== undefined)?.[
            candidate.key
          ];
          return (
            <button
              aria-selected={metric === candidate.key}
              className={metric === candidate.key ? styles.active : undefined}
              key={candidate.key}
              onClick={() => setMetric(candidate.key)}
              role="tab"
              type="button"
            >
              <span>{candidate.label}</span>
              <strong>
                <Numeric tier="block">
                  {latest === undefined
                    ? "—"
                    : `${latest.toFixed(candidate.key === "hittingEfficiency" ? 1 : 2)}${candidate.suffix}`}
                </Numeric>
              </strong>
            </button>
          );
        })}
      </div>
      {plotted.length > 0 ? (
        <div className={styles.body}>
          <aside>
            <span>{activeMetric.label}</span>
            <strong>
              <Numeric tier="hero">
                {selected?.value.toFixed(
                  metric === "hittingEfficiency" ? 1 : 2,
                )}
                {activeMetric.suffix}
              </Numeric>
            </strong>
            {selected && (
              <>
                <small>{formatDate(selected.point.occurredAt)}</small>
                <b>
                  {selected.point.result === "win"
                    ? "Win"
                    : selected.point.result === "loss"
                      ? "Loss"
                      : "Result pending"}{" "}
                  vs. {selected.point.opponent}
                </b>
                <p>{selected.point.eventName}</p>
                {selected.point.canonicalPath && (
                  <Link href={selected.point.canonicalPath}>
                    Match details →
                  </Link>
                )}
              </>
            )}
          </aside>
          <div className={styles.plot}>
            <svg
              aria-label={`${activeMetric.label} by completed match`}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              {[0, 0.5, 1].map((position) => {
                const gridY = top + position * (height - top - bottom);
                const value = maximum - position * (maximum - minimum);
                return (
                  <g key={position}>
                    <line
                      className={styles.grid}
                      x1={left}
                      x2={width - right}
                      y1={gridY}
                      y2={gridY}
                    />
                    <text className={styles.axisValue} x={0} y={gridY + 5}>
                      {value.toFixed(metric === "hittingEfficiency" ? 0 : 1)}
                    </text>
                  </g>
                );
              })}
              <path className={styles.line} d={path} pathLength={1} />
              {plotted.map(({ point, value }, index) => (
                <g key={point.matchId}>
                  <circle
                    className={`${styles.point} ${
                      point.result === "win"
                        ? styles.win
                        : point.result === "loss"
                          ? styles.loss
                          : styles.unknown
                    }`}
                    cx={x(index)}
                    cy={y(value)}
                    r={3.5}
                  />
                  <circle
                    className={styles.target}
                    cx={x(index)}
                    cy={y(value)}
                    onFocus={() => setSelectedMatchId(point.matchId)}
                    onMouseEnter={() => setSelectedMatchId(point.matchId)}
                    r={14}
                    tabIndex={0}
                  />
                </g>
              ))}
              <text className={styles.date} x={left} y={height - 10}>
                {formatDate(plotted[0]!.point.occurredAt)}
              </text>
              <text
                className={styles.date}
                textAnchor="end"
                x={width - right}
                y={height - 10}
              >
                {formatDate(plotted.at(-1)!.point.occurredAt)}
              </text>
            </svg>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>
          This metric is not available in the connected box scores yet.
        </p>
      )}
    </div>
  );
}
