"use client";

import type { MatchSummary } from "@duna/core";
import { useId, useMemo, useState } from "react";
import { getMatchResult } from "@/lib/match-insights";
import {
  buildMatchPerformance,
  type MatchPerformancePoint,
} from "@/lib/match-performance";
import { compactPlayerName } from "@/lib/player-name";

type MetricKey = "rating" | "results" | "sets" | "margin";

const MATCH_TIME_ZONE = "America/Los_Angeles";

interface MetricDefinition {
  readonly key: MetricKey;
  readonly eyebrow: string;
  readonly label: string;
  readonly description: string;
  readonly value: number;
  readonly points: readonly MatchPerformancePoint[];
  readonly stats: readonly { readonly label: string; readonly value: string }[];
}

function signed(value: number, digits = 2) {
  if (Math.abs(value) < 0.005) return (0).toFixed(digits);
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function metricValue(metric: MetricDefinition, value: number) {
  if (metric.key === "rating") return value.toFixed(2);
  if (metric.key === "margin") return signed(value, 1);
  return `${value.toFixed(0)}%`;
}

function formatMatchDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MATCH_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

function smoothPath(
  points: readonly { readonly x: number; readonly y: number }[],
) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;

  let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index] ?? points[0]!;
    const next = points[index + 1] ?? current;
    const before = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;
    const controlOneX = current.x + (next.x - before.x) / 6;
    const controlOneY = current.y + (next.y - before.y) / 6;
    const controlTwoX = next.x - (after.x - current.x) / 6;
    const controlTwoY = next.y - (after.y - current.y) / 6;
    path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`;
  }
  return path;
}

function selectedOpponent(match: MatchSummary | undefined, viewerId: string) {
  if (!match) return undefined;
  const viewerOnA = match.teamA.some((player) => player.id === viewerId);
  const opponents = viewerOnA ? match.teamB : match.teamA;
  return opponents
    .map((player) => compactPlayerName(player.displayName))
    .join(" / ");
}

function scoreline(match: MatchSummary | undefined) {
  if (!match || match.score.length === 0) return undefined;
  return match.score.map(([teamA, teamB]) => `${teamA}–${teamB}`).join(" · ");
}

export function MatchPerformanceAnalytics({
  matches,
  viewerId,
  currentRating,
  confidence,
  discipline,
}: {
  readonly matches: readonly MatchSummary[];
  readonly viewerId: string;
  readonly currentRating: number;
  readonly confidence: string;
  readonly discipline: string;
}) {
  const performance = useMemo(
    () => buildMatchPerformance(matches, viewerId, currentRating),
    [currentRating, matches, viewerId],
  );
  const metrics = useMemo<readonly MetricDefinition[]>(
    () => [
      {
        key: "rating",
        eyebrow: "Current rating",
        label: "Sand Rating",
        description:
          "Your rating after each rated result, ordered by the day played.",
        value: performance.rating.current,
        points: performance.rating.points,
        stats: [
          { label: "Peak", value: performance.rating.peak.toFixed(2) },
          {
            label: "Net movement",
            value: signed(performance.rating.netMovement),
          },
          {
            label: "Rated matches",
            value: String(performance.rating.points.length),
          },
        ],
      },
      {
        key: "results",
        eyebrow: "Match record",
        label: "Win Rate",
        description:
          "Your cumulative verified win rate as each result was played.",
        value:
          performance.results.points.at(-1)?.value ??
          (performance.results.wins + performance.results.losses > 0
            ? (performance.results.wins /
                (performance.results.wins + performance.results.losses)) *
              100
            : 0),
        points: performance.results.points,
        stats: [
          {
            label: "Record",
            value: `${performance.results.wins}–${performance.results.losses}`,
          },
          {
            label: "Last 10",
            value: `${performance.results.lastTenRate.toFixed(0)}%`,
          },
          {
            label: "Best streak",
            value: `${performance.results.bestStreak} W`,
          },
        ],
      },
      {
        key: "sets",
        eyebrow: "Set performance",
        label: "Set Win %",
        description: "The share of recorded sets won across verified matches.",
        value: performance.sets.points.at(-1)?.value ?? 0,
        points: performance.sets.points,
        stats: [
          {
            label: "Set record",
            value: `${performance.sets.won}–${performance.sets.lost}`,
          },
          {
            label: "Last 10 matches",
            value: `${performance.sets.lastTenRate.toFixed(0)}%`,
          },
          {
            label: "Sets tracked",
            value: String(performance.sets.won + performance.sets.lost),
          },
        ],
      },
      {
        key: "margin",
        eyebrow: "Scoring efficiency",
        label: "Point Margin",
        description:
          "Your running average point differential per scored match.",
        value: performance.margin.average,
        points: performance.margin.points,
        stats: [
          {
            label: "Average",
            value: signed(performance.margin.average, 1),
          },
          {
            label: "Positive margin",
            value: String(performance.margin.positiveMatches),
          },
          { label: "Best match", value: signed(performance.margin.best, 0) },
        ],
      },
    ],
    [performance],
  );
  const [metricKey, setMetricKey] = useState<MetricKey>("rating");
  const metric = metrics.find(({ key }) => key === metricKey) ?? metrics[0]!;
  const [selectedByMetric, setSelectedByMetric] = useState<
    Partial<Record<MetricKey, number>>
  >({});
  const selectedIndex = Math.min(
    selectedByMetric[metric.key] ?? Math.max(metric.points.length - 1, 0),
    Math.max(metric.points.length - 1, 0),
  );
  const selectedPoint = metric.points[selectedIndex];
  const matchById = useMemo(
    () => new Map(matches.map((match) => [match.id, match] as const)),
    [matches],
  );
  const selectedMatch = selectedPoint
    ? matchById.get(selectedPoint.id)
    : undefined;
  const result = selectedMatch
    ? getMatchResult(selectedMatch, viewerId)
    : "unknown";
  const gradientId = useId().replaceAll(":", "");

  const width = 920;
  const height = 350;
  const padding = { top: 28, right: 24, bottom: 44, left: 58 };
  const values = metric.points.map(({ value }) => value);
  let minimum = values.length > 0 ? Math.min(...values) : 0;
  let maximum = values.length > 0 ? Math.max(...values) : 1;
  if (metric.key === "results" || metric.key === "sets") {
    minimum = 0;
    maximum = 100;
  } else if (metric.key === "margin") {
    minimum = Math.min(minimum, 0);
    maximum = Math.max(maximum, 0);
  }
  const rawRange = maximum - minimum;
  const buffer =
    rawRange === 0 ? Math.max(Math.abs(maximum) * 0.12, 0.1) : rawRange * 0.14;
  if (metric.key !== "results" && metric.key !== "sets") {
    minimum -= buffer;
    maximum += buffer;
  }
  const range = maximum - minimum || 1;
  const chartPoints = metric.points.map((point, index) => ({
    point,
    x:
      metric.points.length === 1
        ? (padding.left + width - padding.right) / 2
        : padding.left +
          (index / (metric.points.length - 1)) *
            (width - padding.left - padding.right),
    y:
      padding.top +
      ((maximum - point.value) / range) *
        (height - padding.top - padding.bottom),
  }));
  const linePath = smoothPath(chartPoints);
  const areaPath =
    chartPoints.length > 0
      ? `${linePath} L ${chartPoints.at(-1)?.x ?? 0} ${height - padding.bottom} L ${chartPoints[0]?.x ?? 0} ${height - padding.bottom} Z`
      : "";
  const firstDate = metric.points[0]?.playedAt;
  const lastDate = metric.points.at(-1)?.playedAt;

  return (
    <section
      className="match-performance"
      aria-label="Match performance analytics"
    >
      <header className="match-performance__header">
        <div>
          <span className="page-eyebrow">Performance history</span>
          <h2>See what is changing your game.</h2>
          <p>Choose a metric, then move through every verified result.</p>
        </div>
        <span className="match-performance__mode">By played date</span>
      </header>

      <div
        className="match-performance__tabs"
        role="tablist"
        aria-label="Performance metric"
      >
        {metrics.map((item) => (
          <button
            aria-selected={item.key === metric.key}
            className={`match-performance__tab${item.key === metric.key ? " is-active" : ""}`}
            key={item.key}
            onClick={() => setMetricKey(item.key)}
            role="tab"
            type="button"
          >
            <span>{item.label}</span>
            <strong>{metricValue(item, item.value)}</strong>
            <small>{item.eyebrow}</small>
          </button>
        ))}
      </div>

      <div className="match-performance__body">
        <aside className="match-performance__detail">
          <span className="match-performance__detail-label">
            {metric.eyebrow}
          </span>
          <div className="match-performance__selected-value">
            <strong>
              {metricValue(metric, selectedPoint?.value ?? metric.value)}
            </strong>
            {selectedPoint && (
              <span
                className={`match-performance__change ${selectedPoint.change > 0 ? "is-positive" : selectedPoint.change < 0 ? "is-negative" : ""}`}
              >
                {selectedPoint.change > 0
                  ? "↑"
                  : selectedPoint.change < 0
                    ? "↓"
                    : "→"}{" "}
                {signed(selectedPoint.change, metric.key === "rating" ? 2 : 1)}
              </span>
            )}
          </div>
          {selectedPoint ? (
            <div className="match-performance__selected-match">
              <span>
                {formatMatchDate(selectedPoint.playedAt, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <strong>
                {result === "win"
                  ? "Win"
                  : result === "loss"
                    ? "Loss"
                    : "Result"}
                {selectedOpponent(selectedMatch, viewerId)
                  ? ` vs ${selectedOpponent(selectedMatch, viewerId)}`
                  : ""}
              </strong>
              <small>
                {[selectedPoint.venueName, scoreline(selectedMatch)]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
          ) : (
            <div className="match-performance__selected-match">
              <span>No tracked results yet.</span>
            </div>
          )}
          <dl className="match-performance__stats">
            {metric.stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          {metric.key === "rating" && (
            <small className="match-performance__model-note">
              {confidence} confidence · {discipline.replaceAll("-", " ")}
            </small>
          )}
        </aside>

        <div className="match-performance__visual">
          <div className="match-performance__chart-heading">
            <div>
              <h3>{metric.label} trajectory</h3>
              <p>{metric.description}</p>
            </div>
            <strong>{metric.points.length} results</strong>
          </div>
          {chartPoints.length === 0 ? (
            <div className="match-performance__empty">
              <strong>No {metric.label.toLowerCase()} history yet.</strong>
              <span>Verified, scored matches will build this view.</span>
            </div>
          ) : (
            <div className="match-performance__chart-wrap">
              <svg
                aria-label={`${metric.label} over time`}
                className="match-performance__chart"
                role="img"
                viewBox={`0 0 ${width} ${height}`}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-blue)"
                      stopOpacity="0.24"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-blue)"
                      stopOpacity="0.01"
                    />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((position) => {
                  const y =
                    padding.top +
                    position * (height - padding.top - padding.bottom);
                  const value = maximum - position * range;
                  return (
                    <g key={position}>
                      <line
                        className="match-performance__gridline"
                        x1={padding.left}
                        x2={width - padding.right}
                        y1={y}
                        y2={y}
                      />
                      <text
                        className="match-performance__axis-value"
                        x={padding.left - 12}
                        y={y + 4}
                      >
                        {metricValue(metric, value)}
                      </text>
                    </g>
                  );
                })}
                <path d={areaPath} fill={`url(#${gradientId})`} />
                <path className="match-performance__line" d={linePath} />
                {chartPoints.map(({ point, x, y }, index) => (
                  <circle
                    aria-label={`${formatMatchDate(point.playedAt, { month: "short", day: "numeric", year: "numeric" })}: ${metricValue(metric, point.value)}`}
                    className={
                      index === selectedIndex
                        ? "match-performance__point is-active"
                        : "match-performance__point"
                    }
                    cx={x}
                    cy={y}
                    key={point.id}
                    onClick={() =>
                      setSelectedByMetric((current) => ({
                        ...current,
                        [metric.key]: index,
                      }))
                    }
                    onFocus={() =>
                      setSelectedByMetric((current) => ({
                        ...current,
                        [metric.key]: index,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedByMetric((current) => ({
                          ...current,
                          [metric.key]: index,
                        }));
                      }
                    }}
                    onMouseEnter={() =>
                      setSelectedByMetric((current) => ({
                        ...current,
                        [metric.key]: index,
                      }))
                    }
                    r={index === selectedIndex ? 7 : 4.5}
                    role="button"
                    tabIndex={0}
                  />
                ))}
                {firstDate && (
                  <text
                    className="match-performance__axis-date"
                    x={padding.left}
                    y={height - 12}
                  >
                    {formatMatchDate(firstDate, {
                      month: "short",
                      year: "numeric",
                    })}
                  </text>
                )}
                {lastDate && (
                  <text
                    className="match-performance__axis-date"
                    textAnchor="end"
                    x={width - padding.right}
                    y={height - 12}
                  >
                    {formatMatchDate(lastDate, {
                      month: "short",
                      year: "numeric",
                    })}
                  </text>
                )}
              </svg>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
