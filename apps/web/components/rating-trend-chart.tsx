"use client";

import type { MatchSummary } from "@duna/core";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

const WIDTH = 900;
const HEIGHT = 330;
const PADDING = { top: 30, right: 24, bottom: 44, left: 62 };

export interface RatingTrendPoint {
  readonly id: string;
  readonly occurredAt: string;
  readonly rating: number;
  readonly before?: number;
  readonly delta?: number;
  readonly result?: "win" | "loss" | "unknown";
  readonly matchTitle?: string;
  readonly partner?: string;
  readonly opponents?: string;
  readonly score?: string;
  readonly matchHref?: string;
}

function formatRating(value: number) {
  return value.toFixed(2);
}

function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(value));
}

function signed(value: number) {
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function resultLabel(result: RatingTrendPoint["result"]) {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  return "Result";
}

function stepAfterPath(
  points: readonly { readonly x: number; readonly y: number }[],
) {
  if (points.length === 0) return "";
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (const point of points.slice(1)) {
    path += ` H ${point.x} V ${point.y}`;
  }
  return path;
}

function matchScore(match: MatchSummary) {
  return match.score.map(([teamA, teamB]) => `${teamA}–${teamB}`).join(" · ");
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
      matchTitle: match.eventName ?? match.venueName,
      opponents: [...match.teamA, ...match.teamB]
        .map((player) => player.displayName)
        .join(" / "),
      score: matchScore(match),
      matchHref: `/app/matches/${match.id}`,
    }));
  const history = useMemo(
    () =>
      (suppliedPoints ?? matchPoints)
        .map((point) => ({
          ...point,
          timestamp: new Date(point.occurredAt).getTime(),
        }))
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp),
    [matchPoints, suppliedPoints],
  );
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(history.length - 1, 0),
  );
  const [hoveredIndex, setHoveredIndex] = useState<number>();
  const [compactChart, setCompactChart] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompactChart(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const safeSelectedIndex = Math.min(
    selectedIndex,
    Math.max(history.length - 1, 0),
  );
  const activeIndex = hoveredIndex ?? safeSelectedIndex;
  const activePoint = history[activeIndex];
  const gradientId = useId().replaceAll(":", "");

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
  const width = compactChart ? 300 : WIDTH;
  const height = compactChart ? 240 : HEIGHT;
  const padding = compactChart
    ? { top: 24, right: 10, bottom: 36, left: 40 }
    : PADDING;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const y = (rating: number) =>
    padding.top +
    chartHeight -
    ((rating - minimumRating) / ratingSpan) * chartHeight;
  const chartPoints = history.map((point, index) => ({
    ...point,
    x:
      history.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (history.length - 1)) * chartWidth,
    y: y(point.rating),
  }));
  const path = stepAfterPath(chartPoints);
  const areaPath = `${path} L ${chartPoints.at(-1)!.x} ${
    padding.top + chartHeight
  } L ${chartPoints[0]!.x} ${padding.top + chartHeight} Z`;
  const gridRatings = [
    maximumRating,
    (maximumRating + minimumRating) / 2,
    minimumRating,
  ];
  const startingRating = first.before ?? first.rating;
  const change = last.rating - startingRating;
  const high = Math.max(...rawRatings);
  const low = Math.min(...rawRatings);
  const activeChartPoint = chartPoints[activeIndex];

  function revealPoint(index: number) {
    setSelectedIndex(index);
    setHoveredIndex(index);
  }

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
          <strong>{signed(change)}</strong>
        </span>
        <span>
          <small>Range</small>
          <strong>
            {formatRating(low)}–{formatRating(high)}
          </strong>
        </span>
      </div>

      <div className="rating-trend-chart__body">
        <aside
          className="rating-trend-chart__detail"
          data-result={activePoint?.result ?? "unknown"}
        >
          {activePoint ? (
            <>
              <div className="rating-trend-chart__detail-topline">
                <span>{resultLabel(activePoint.result)}</span>
                <time dateTime={activePoint.occurredAt}>
                  {formatDate(activePoint.occurredAt, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              </div>
              <strong className="rating-trend-chart__selected-value">
                {formatRating(activePoint.rating)}
                <small
                  data-direction={(activePoint.delta ?? 0) >= 0 ? "up" : "down"}
                >
                  {signed(activePoint.delta ?? 0)}
                </small>
              </strong>
              <p>{activePoint.matchTitle ?? "Duna rated match"}</p>
              <div className="rating-trend-chart__matchup">
                <strong>
                  {activePoint.partner
                    ? `Player / ${activePoint.partner}`
                    : "Player"}
                </strong>
                <span>vs</span>
                <strong>{activePoint.opponents ?? "Opponent pending"}</strong>
              </div>
              <dl>
                <div>
                  <dt>Before</dt>
                  <dd>
                    {formatRating(activePoint.before ?? activePoint.rating)}
                  </dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{formatRating(activePoint.rating)}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{activePoint.score || "Pending"}</dd>
                </div>
              </dl>
              {activePoint.matchHref && (
                <Link href={activePoint.matchHref}>
                  Match details <ArrowRight aria-hidden size={15} />
                </Link>
              )}
            </>
          ) : null}
        </aside>

        <div className="rating-trend-chart__visual">
          <header>
            <div>
              <strong>Match-by-match trajectory</strong>
              <span>Hover or focus any step to inspect the result.</span>
            </div>
            <b>{history.length} results</b>
          </header>
          <div className="rating-trend-chart__plot">
            <svg
              aria-label="Sand Rating movement ordered by the date each match was played"
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-aqua)"
                    stopOpacity="0.25"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-aqua)"
                    stopOpacity="0.01"
                  />
                </linearGradient>
              </defs>
              {gridRatings.map((rating) => {
                const lineY = y(rating);
                return (
                  <g key={rating}>
                    <line
                      className="rating-trend-chart__grid"
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={lineY}
                      y2={lineY}
                    />
                    <text
                      className="rating-trend-chart__axis"
                      textAnchor="end"
                      x={padding.left - (compactChart ? 7 : 12)}
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
              {activeChartPoint && (
                <line
                  aria-hidden
                  className="rating-trend-chart__guide"
                  x1={activeChartPoint.x}
                  x2={activeChartPoint.x}
                  y1={padding.top}
                  y2={padding.top + chartHeight}
                />
              )}
              {chartPoints.map((point, index) => {
                const previousX = chartPoints[index - 1]?.x ?? padding.left;
                const nextX =
                  chartPoints[index + 1]?.x ?? width - padding.right;
                const startX =
                  index === 0 ? padding.left : (previousX + point.x) / 2;
                const endX =
                  index === chartPoints.length - 1
                    ? width - padding.right
                    : (point.x + nextX) / 2;
                return (
                  <rect
                    aria-label={`${formatDate(point.occurredAt)}: ${resultLabel(point.result)}, Sand Rating ${formatRating(point.rating)}, movement ${signed(point.delta ?? 0)}`}
                    className="rating-trend-chart__hit-area"
                    fill="transparent"
                    height={chartHeight}
                    key={`${point.id}-hit-area`}
                    onBlur={() => setHoveredIndex(undefined)}
                    onClick={() => revealPoint(index)}
                    onFocus={() => revealPoint(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        revealPoint(index);
                      }
                    }}
                    onMouseEnter={() => revealPoint(index)}
                    onMouseLeave={() => setHoveredIndex(undefined)}
                    role="button"
                    tabIndex={0}
                    width={Math.max(endX - startX, 1)}
                    x={startX}
                    y={padding.top}
                  />
                );
              })}
              {chartPoints.map((point, index) => (
                <circle
                  aria-hidden
                  className="rating-trend-chart__point"
                  cx={point.x}
                  cy={point.y}
                  data-active={activeIndex === index ? "true" : undefined}
                  data-result={point.result ?? "unknown"}
                  key={point.id}
                  r={activeIndex === index ? 3.4 : 2.5}
                />
              ))}
              <text
                className="rating-trend-chart__axis"
                x={padding.left}
                y={height - 10}
              >
                {formatDate(first.occurredAt, {
                  month: "short",
                  year: "numeric",
                })}
              </text>
              <text
                className="rating-trend-chart__axis"
                textAnchor="end"
                x={width - padding.right}
                y={height - 10}
              >
                {formatDate(last.occurredAt, {
                  month: "short",
                  year: "numeric",
                })}
              </text>
            </svg>

            {hoveredIndex !== undefined && activePoint && activeChartPoint && (
              <div
                aria-live="polite"
                className={`rating-trend-chart__tooltip rating-trend-chart__tooltip--${activePoint.result ?? "unknown"} ${
                  activeChartPoint.x / width < 0.3
                    ? "is-right"
                    : activeChartPoint.x / width > 0.7
                      ? "is-left"
                      : "is-center"
                }`}
                style={{ left: `${(activeChartPoint.x / width) * 100}%` }}
              >
                <div>
                  <span>{resultLabel(activePoint.result)}</span>
                  <time dateTime={activePoint.occurredAt}>
                    {formatDate(activePoint.occurredAt)}
                  </time>
                </div>
                <small>{activePoint.matchTitle ?? "Duna rated match"}</small>
                <strong>
                  {activePoint.partner
                    ? `Player / ${activePoint.partner}`
                    : "Player"}
                  <em>vs</em>
                  {activePoint.opponents ?? "Opponent pending"}
                </strong>
                <p>{activePoint.score || "Score pending"}</p>
                <dl>
                  <div>
                    <dt>Movement</dt>
                    <dd
                      data-direction={
                        (activePoint.delta ?? 0) >= 0 ? "up" : "down"
                      }
                    >
                      {signed(activePoint.delta ?? 0)}
                    </dd>
                  </div>
                  <div>
                    <dt>Rating after</dt>
                    <dd>{formatRating(activePoint.rating)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
          <div
            aria-label="Select a rated match"
            className="rating-trend-chart__momentum"
          >
            {history.map((point, index) => (
              <button
                aria-label={`${formatDate(point.occurredAt)} ${resultLabel(point.result)}`}
                aria-pressed={safeSelectedIndex === index}
                data-result={point.result ?? "unknown"}
                key={`${point.id}-movement`}
                onClick={() => setSelectedIndex(index)}
                type="button"
              />
            ))}
          </div>
          <p>
            {formatDate(first.occurredAt)}–{formatDate(last.occurredAt)} ·{" "}
            {history.length} rated results
          </p>
        </div>
      </div>
    </div>
  );
}
