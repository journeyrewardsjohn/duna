"use client";

import type {
  CommunityCommentSummary,
  PredictionMarketView,
  PredictionWallet,
} from "@duna/api";
import { predictionMarketLiquidityQuote } from "@duna/core";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Coins,
  FileText,
  LockKeyhole,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  placePredictionSellOrderAction,
  placeEventTeamPredictionOrderAction,
  placeMatchPredictionOrderAction,
  placeProEventTeamPredictionOrderAction,
  placeProMatchPredictionOrderAction,
} from "@/app/predictions/actions";
import { CommunityThread } from "@/components/community-thread";
import { ViewerPredictionPosition } from "@/components/viewer-prediction-position";
import {
  buildViewerPredictionSummary,
  formatPredictionAmount,
} from "@/lib/prediction-position";
import { tradablePredictionPriceBps } from "@/lib/prediction-market-pricing";

type OrderTarget =
  | {
      readonly kind: "pro-match";
      readonly eventSlug: string;
      readonly matchId: string;
    }
  | {
      readonly kind: "pro-event-team";
      readonly eventSlug: string;
      readonly externalTeamId: string;
    }
  | {
      readonly kind: "event-team";
      readonly eventSlug: string;
      readonly externalTeamId: string;
    }
  | { readonly kind: "match"; readonly matchId: string };

type ChartRange = "1H" | "6H" | "1D" | "1W" | "ALL";

function percentage(priceBps: number) {
  return `${(priceBps / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function compactCredits(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function rangeStart(range: ChartRange, now: number) {
  const hours =
    range === "1H" ? 1 : range === "6H" ? 6 : range === "1D" ? 24 : 168;
  return range === "ALL" ? 0 : now - hours * 60 * 60 * 1_000;
}

export function PredictionMarketChart({
  market,
  compact = false,
}: {
  readonly market: PredictionMarketView;
  readonly compact?: boolean;
}) {
  const [range, setRange] = useState<ChartRange>("ALL");
  const [hovered, setHovered] = useState<number>();
  const data = useMemo(() => {
    const cutoff = rangeStart(range, Date.now());
    const filtered = market.history.filter(
      (point) => Date.parse(point.recordedAt) >= cutoff,
    );
    const source = filtered.length ? filtered : market.history.slice(-1);
    const normalized = source.length
      ? source
      : [
          {
            recordedAt: new Date().toISOString(),
            yesPriceBps: market.yesPriceBps,
            volumeCredits: market.volumeCredits,
            source: "model" as const,
          },
        ];
    return normalized.length === 1
      ? [normalized[0]!, normalized[0]!]
      : normalized;
  }, [market, range]);
  const width = compact ? 520 : 840;
  const height = compact ? 116 : 290;
  const padX = compact ? 4 : 26;
  const padY = compact ? 8 : 24;
  const point = (index: number, priceBps: number) => ({
    x: padX + (index / Math.max(1, data.length - 1)) * (width - padX * 2),
    y: padY + ((10_000 - priceBps) / 10_000) * (height - padY * 2),
  });
  const pathFor = (side: "yes" | "no") =>
    data
      .map((entry, index) => {
        const value =
          side === "yes" ? entry.yesPriceBps : 10_000 - entry.yesPriceBps;
        const position = point(index, value);
        return `${index === 0 ? "M" : "L"}${position.x.toFixed(1)},${position.y.toFixed(1)}`;
      })
      .join(" ");
  const hoverPoint = hovered === undefined ? undefined : data[hovered];
  const hoverPosition = hoverPoint
    ? point(hovered ?? 0, hoverPoint.yesPriceBps)
    : undefined;

  return (
    <div
      className={`prediction-chart${compact ? " prediction-chart--compact" : ""}`}
    >
      {!compact && (
        <header>
          <div>
            <span>
              <i data-side="yes" /> {market.yesLabel}
            </span>
            <span>
              <i data-side="no" /> {market.noLabel}
            </span>
          </div>
          <strong>
            {percentage(market.yesPriceBps)} / {percentage(market.noPriceBps)}
          </strong>
        </header>
      )}
      <div className="prediction-chart__plot">
        <svg
          aria-label={`Crowd probability history for ${market.title}`}
          onPointerLeave={() => setHovered(undefined)}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - bounds.left) / bounds.width;
            setHovered(
              Math.max(
                0,
                Math.min(
                  data.length - 1,
                  Math.round(ratio * (data.length - 1)),
                ),
              ),
            );
          }}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {!compact &&
            [2_500, 5_000, 7_500].map((value) => {
              const y = point(0, value).y;
              return (
                <line
                  className="prediction-chart__grid"
                  key={value}
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                />
              );
            })}
          <path
            className="prediction-chart__line prediction-chart__line--yes"
            d={pathFor("yes")}
          />
          <path
            className="prediction-chart__line prediction-chart__line--no"
            d={pathFor("no")}
          />
          {hoverPosition && (
            <>
              <line
                className="prediction-chart__cursor"
                x1={hoverPosition.x}
                x2={hoverPosition.x}
                y1={padY}
                y2={height - padY}
              />
              <circle
                className="prediction-chart__dot prediction-chart__dot--yes"
                cx={hoverPosition.x}
                cy={hoverPosition.y}
                r={compact ? 3 : 5}
              />
              <circle
                className="prediction-chart__dot prediction-chart__dot--no"
                cx={hoverPosition.x}
                cy={
                  point(
                    hovered ?? 0,
                    10_000 - (hoverPoint?.yesPriceBps ?? 5_000),
                  ).y
                }
                r={compact ? 3 : 5}
              />
            </>
          )}
        </svg>
        {!compact && hoverPoint && hoverPosition && (
          <span
            className="prediction-chart__tooltip"
            style={{ left: `${(hoverPosition.x / width) * 100}%` }}
          >
            <strong>{percentage(hoverPoint.yesPriceBps)}</strong>
            <small>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(hoverPoint.recordedAt))}
            </small>
          </span>
        )}
      </div>
      {!compact && (
        <footer>
          <span>
            <TrendingUp aria-hidden size={14} />{" "}
            {compactCredits(market.volumeCredits)} credits positioned
          </span>
          <div>
            {(["1H", "6H", "1D", "1W", "ALL"] as const).map((option) => (
              <button
                aria-pressed={range === option}
                key={option}
                onClick={() => setRange(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

const tournamentSeriesColors = [
  "#087f6a",
  "#2167ad",
  "#d65a43",
  "#9a63c7",
  "#c58a18",
  "#1689a7",
  "#d04f83",
  "#577447",
  "#7958b4",
  "#a66030",
  "#4b78c5",
  "#b34e4e",
] as const;

function tournamentTeamLabel(market: PredictionMarketView) {
  return market.yesLabel.replace(/ wins$/, "");
}

function TournamentPredictionChart({
  markets,
  onSelect,
  selectedId,
}: {
  readonly markets: readonly PredictionMarketView[];
  readonly onSelect: (marketId: string) => void;
  readonly selectedId: string;
}) {
  const [range, setRange] = useState<ChartRange>("ALL");
  const series = useMemo(() => {
    const cutoff = rangeStart(range, Date.now());
    const normalized = markets.map((market) => {
      const filtered = market.history.filter(
        (point) => Date.parse(point.recordedAt) >= cutoff,
      );
      const source = filtered.length
        ? filtered
        : market.history.length
          ? market.history.slice(-1)
          : [
              {
                recordedAt: new Date().toISOString(),
                yesPriceBps: market.yesPriceBps,
                volumeCredits: market.volumeCredits,
                source: "model" as const,
              },
            ];
      return { market, points: source };
    });
    const timestamps = seriesTimes(normalized);
    const start = timestamps.length ? Math.min(...timestamps) : Date.now();
    const endValue = timestamps.length ? Math.max(...timestamps) : start;
    const end = endValue === start ? start + 1 : endValue;
    return normalized.map((entry, index) => {
      const coordinates = entry.points.map((point) => {
        const timestamp = Date.parse(point.recordedAt);
        const x = 28 + ((timestamp - start) / (end - start)) * (840 - 56);
        const y = 18 + ((10_000 - point.yesPriceBps) / 10_000) * (280 - 36);
        return { x, y };
      });
      const visibleCoordinates =
        coordinates.length === 1
          ? [
              { x: 28, y: coordinates[0]!.y },
              { x: 812, y: coordinates[0]!.y },
            ]
          : coordinates;
      return {
        ...entry,
        color: tournamentSeriesColors[index % tournamentSeriesColors.length]!,
        endpoint: visibleCoordinates.at(-1)!,
        path: visibleCoordinates
          .map(
            (point, pointIndex) =>
              `${pointIndex === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
          )
          .join(" "),
      };
    });
  }, [markets, range]);
  return (
    <div className="tournament-market-chart">
      <div className="tournament-market-chart__legend">
        {series.map(({ color, market }) => (
          <button
            aria-pressed={selectedId === market.id}
            key={market.id}
            onClick={() => onSelect(market.id)}
            type="button"
          >
            <i style={{ backgroundColor: color }} />
            <span>{tournamentTeamLabel(market)}</span>
            <strong>{percentage(market.yesPriceBps)}</strong>
          </button>
        ))}
      </div>
      <div className="tournament-market-chart__plot">
        <svg
          aria-label="Implied tournament win probability for every team"
          role="img"
          viewBox="0 0 840 280"
        >
          {[2_500, 5_000, 7_500].map((value) => {
            const y = 18 + ((10_000 - value) / 10_000) * (280 - 36);
            return (
              <g key={value}>
                <line
                  className="prediction-chart__grid"
                  x1="28"
                  x2="812"
                  y1={y}
                  y2={y}
                />
                <text x="0" y={y + 4}>
                  {value / 100}%
                </text>
              </g>
            );
          })}
          {series.map(({ color, endpoint, market, path }) => (
            <g key={market.id}>
              <path
                className={
                  market.id === selectedId
                    ? "tournament-market-chart__line is-selected"
                    : "tournament-market-chart__line"
                }
                d={path}
                style={{ stroke: color }}
              />
              <circle
                cx={endpoint.x}
                cy={endpoint.y}
                fill={color}
                r={market.id === selectedId ? 5 : 3}
              />
            </g>
          ))}
        </svg>
      </div>
      <footer>
        <span>{markets.length} tournament contracts</span>
        <div>
          {(["1H", "6H", "1D", "1W", "ALL"] as const).map((option) => (
            <button
              aria-pressed={range === option}
              key={option}
              onClick={() => setRange(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}

function seriesTimes(
  series: readonly {
    readonly points: readonly { readonly recordedAt: string }[];
  }[],
) {
  return series.flatMap((entry) =>
    entry.points.flatMap((point) => {
      const value = Date.parse(point.recordedAt);
      return Number.isFinite(value) ? [value] : [];
    }),
  );
}

export function CompactPredictionMarket({
  href,
  market,
}: {
  readonly href: string;
  readonly market: PredictionMarketView;
}) {
  return (
    <Link className="compact-prediction-market" href={href}>
      <div>
        <span>{market.yesLabel}</span>
        <strong>{percentage(market.yesPriceBps)}</strong>
        <i>
          <b style={{ width: `${market.yesPriceBps / 100}%` }} />
        </i>
      </div>
      <div>
        <span>{market.noLabel}</span>
        <strong>{percentage(market.noPriceBps)}</strong>
        <i>
          <b style={{ width: `${market.noPriceBps / 100}%` }} />
        </i>
      </div>
      <ViewerPredictionPosition market={market} variant="compact" />
      <footer>
        <span className="prediction-market-status" data-status={market.status}>
          {market.status === "settled"
            ? "Determined"
            : market.status === "locked"
              ? "Closed"
              : market.status === "void"
                ? "Void"
                : "Open"}
        </span>
        <span>
          <Users aria-hidden size={12} /> {market.participantCount}
        </span>
        <span>{compactCredits(market.volumeCredits)} credit volume</span>
        <ArrowRight aria-hidden size={13} />
      </footer>
    </Link>
  );
}

export function PredictionMarketLifecycle({
  market,
  compact = false,
}: {
  readonly market: PredictionMarketView;
  readonly compact?: boolean;
}) {
  const winner =
    market.resolvedSide === "yes"
      ? market.yesLabel
      : market.resolvedSide === "no"
        ? market.noLabel
        : undefined;
  const determined = market.status === "settled";
  const title = determined
    ? "Determined"
    : market.status === "locked"
      ? "Closed for predictions"
      : market.status === "void"
        ? "Market void"
        : "Market open";
  const detail = determined
    ? `Winning outcome: ${winner ?? "verified result"}. Open orders are closed and prediction credits are settled.`
    : market.status === "locked"
      ? "Orders are closed while the final result is verified."
      : market.status === "void"
        ? "This market did not determine an outcome. Eligible credits were returned."
        : "Orders remain open until the posted close time.";
  const statusTime = market.determinedAt ?? market.locksAt;
  return (
    <div
      className={[
        "prediction-market-lifecycle",
        compact ? "prediction-market-lifecycle--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-status={market.status}
    >
      {determined ? (
        <BadgeCheck aria-hidden size={compact ? 18 : 24} />
      ) : (
        <CalendarClock aria-hidden size={compact ? 18 : 24} />
      )}
      <div>
        <span>{title}</span>
        <strong>{winner ?? detail}</strong>
        {!compact && <small>{detail}</small>}
      </div>
      {statusTime && !compact && (
        <time dateTime={statusTime}>
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(statusTime))}
        </time>
      )}
    </div>
  );
}

export function PredictionMarketCommunity({
  market,
}: {
  readonly market: PredictionMarketView;
}) {
  return (
    <section className="prediction-market-community">
      <header>
        <div>
          <span className="page-eyebrow">Community positions</span>
          <h3>Who predicted what</h3>
        </div>
        <span>
          <Users aria-hidden size={15} /> {market.participantCount} predictors
        </span>
      </header>
      {market.predictors.length ? (
        <div>
          {market.predictors.map((predictor, index) => (
            <article key={[predictor.handle, predictor.side, index].join(":")}>
              <Link href={"/players/" + predictor.handle}>
                @{predictor.handle}
              </Link>
              <span>
                {predictor.side === "yes" ? market.yesLabel : market.noLabel}
              </span>
              <strong>{formatPredictionAmount(predictor.shares)} shares</strong>
              <small data-status={predictor.status}>
                {predictor.status === "open"
                  ? "Open"
                  : predictor.status === "won"
                    ? "Won"
                    : predictor.status === "lost"
                      ? "Lost"
                      : "Void"}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p>No positions yet. Be the first handle on the board.</p>
      )}
      <footer>
        Prediction activity is public by handle because credits have no cash
        value and cannot be purchased or redeemed.
      </footer>
    </section>
  );
}

export function PredictionMarketRulesPanel({
  market,
}: {
  readonly market: PredictionMarketView;
}) {
  return (
    <section className="prediction-market-rules" id="market-rules">
      <header>
        <div>
          <span className="page-eyebrow">Market rules</span>
          <h3>How this market resolves</h3>
        </div>
        <span>
          <FileText aria-hidden size={15} /> Version {market.rules.version}
        </span>
      </header>
      <dl>
        <div>
          <dt>Resolution</dt>
          <dd>{market.rules.resolutionCriteria}</dd>
        </div>
        <div>
          <dt>Verified from</dt>
          <dd>{market.rules.resolutionSource}</dd>
        </div>
        <div>
          <dt>Timeline + close</dt>
          <dd>{market.rules.closePolicy}</dd>
        </div>
      </dl>
      {market.rules.publicNote && <p>{market.rules.publicNote}</p>}
    </section>
  );
}

export function PredictionOrderTicket({
  market,
  returnTo,
  target,
  wallet,
  defaultSide = "yes",
}: {
  readonly market: PredictionMarketView;
  readonly returnTo: string;
  readonly target: OrderTarget;
  readonly wallet?: PredictionWallet;
  readonly defaultSide?: "yes" | "no";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [side, setSide] = useState<"yes" | "no">(defaultSide);
  const [credits, setCredits] = useState(1);
  const [shares, setShares] = useState(1);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState("");
  const [availableOverride, setAvailableOverride] = useState<number>();
  const [receipt, setReceipt] = useState<{
    readonly orderId: string;
    readonly title: string;
    readonly detail: string;
    readonly status: string;
  }>();
  const [pending, startTransition] = useTransition();
  const selectedLabel = side === "yes" ? market.yesLabel : market.noLabel;
  const currentPriceBps =
    side === "yes" ? market.yesPriceBps : market.noPriceBps;
  const liquidityQuote = predictionMarketLiquidityQuote({
    currentYesPriceBps: tradablePredictionPriceBps(market.yesPriceBps),
    side,
    credits,
  });
  const communityAskBps =
    side === "yes"
      ? (market.yesAskBps ?? currentPriceBps)
      : (market.noAskBps ?? currentPriceBps);
  const buyLimitPriceBps = Math.min(
    9_900,
    Math.max(communityAskBps, liquidityQuote.executionSidePriceBps + 25),
  );
  const priceBps =
    mode === "buy"
      ? buyLimitPriceBps
      : side === "yes"
        ? (market.bestYesBidBps ?? currentPriceBps)
        : (market.bestNoBidBps ?? currentPriceBps);
  const available = Math.floor(
    availableOverride ?? wallet?.availableCredits ?? 0,
  );
  const availableShares = (option: "yes" | "no") =>
    market.viewer.positions
      .filter(
        (position) => position.side === option && position.status === "open",
      )
      .reduce((sum, position) => sum + position.availableShares, 0);
  const selectedAvailableShares = availableShares(side);
  const totalAvailableShares = availableShares("yes") + availableShares("no");
  const estimatedShares =
    credits /
    ((mode === "buy" ? liquidityQuote.executionSidePriceBps : priceBps) /
      10_000);
  const estimatedProceeds = shares * (priceBps / 10_000);
  const chooseMode = (nextMode: "buy" | "sell") => {
    setMode(nextMode);
    setReviewing(false);
    setMessage("");
    if (nextMode === "sell") {
      const chosenAvailable = availableShares(side);
      const alternate: "yes" | "no" = side === "yes" ? "no" : "yes";
      const nextSide = chosenAvailable > 0 ? side : alternate;
      const nextAvailable = availableShares(nextSide);
      setSide(nextSide);
      setShares(Math.min(1, nextAvailable || 1));
    }
  };
  const place = () => {
    setMessage("");
    startTransition(async () => {
      if (mode === "sell") {
        const result = await placePredictionSellOrderAction({
          marketId: market.id,
          side,
          shares,
          limitPriceBps: priceBps,
          idempotencyKey: crypto.randomUUID(),
          returnTo,
        });
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        const detail = [
          result.result.proceedsCredits > 0
            ? `${formatPredictionAmount(result.result.proceedsCredits)} credits received`
            : undefined,
          result.result.openShares > 0
            ? `${formatPredictionAmount(result.result.openShares)} shares listed`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
        setReceipt({
          orderId: result.result.orderId,
          title: `${formatPredictionAmount(shares)} shares · ${selectedLabel}`,
          detail,
          status:
            result.result.status === "filled"
              ? "Sale completed"
              : result.result.status === "partially-filled"
                ? "Partially sold"
                : "Sell order open",
        });
        setAvailableOverride(result.result.availableCredits);
        setReviewing(false);
        router.refresh();
        return;
      }
      const shared = {
        credits,
        limitPriceBps: priceBps,
        idempotencyKey: crypto.randomUUID(),
      };
      const result =
        target.kind === "pro-match"
          ? await placeProMatchPredictionOrderAction({
              ...shared,
              eventSlug: target.eventSlug,
              matchId: target.matchId,
              side: side === "yes" ? "A" : "B",
            })
          : target.kind === "pro-event-team"
            ? await placeProEventTeamPredictionOrderAction({
                ...shared,
                eventSlug: target.eventSlug,
                externalTeamId: target.externalTeamId,
                side,
              })
            : target.kind === "event-team"
              ? await placeEventTeamPredictionOrderAction({
                  ...shared,
                  eventSlug: target.eventSlug,
                  externalTeamId: target.externalTeamId,
                  side,
                })
              : await placeMatchPredictionOrderAction({
                  ...shared,
                  matchId: target.matchId,
                  side: side === "yes" ? "A" : "B",
                });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setReviewing(false);
      setReceipt({
        orderId: result.result.orderId,
        title: `${credits} credits · ${selectedLabel}`,
        detail: [
          result.result.filledShares > 0
            ? `${formatPredictionAmount(result.result.filledShares)} shares positioned`
            : undefined,
          result.result.openShares > 0
            ? `${formatPredictionAmount(result.result.openShares)} shares open`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        status:
          result.result.status === "filled"
            ? "Position confirmed"
            : result.result.status === "partially-filled"
              ? "Position partially confirmed"
              : "Position open in order book",
      });
      setAvailableOverride(result.result.availableCredits);
      router.refresh();
    });
  };

  if (market.status !== "open") {
    return (
      <aside className="prediction-ticket prediction-ticket--closed">
        <PredictionMarketLifecycle market={market} />
        <p>
          {market.viewer.authenticated
            ? "Your final position and credit result are available in Predictions."
            : "Sign in to review your prediction history."}
        </p>
        <Link
          href={
            market.viewer.authenticated
              ? "/app/wallet/predictions"
              : "/sign-in?returnTo=" + encodeURIComponent(returnTo)
          }
        >
          {market.viewer.authenticated
            ? "Open predictions portfolio"
            : "Sign in to review"}{" "}
          <ArrowRight aria-hidden size={14} />
        </Link>
      </aside>
    );
  }

  if (!market.viewer.authenticated) {
    return (
      <aside className="prediction-ticket prediction-ticket--signed-out">
        <Coins aria-hidden size={24} />
        <h3>Use free prediction credits.</h3>
        <p>
          Every Duna account starts with 1,000. Credits have no cash value and
          cannot be purchased or redeemed.
        </p>
        <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in to predict <ArrowRight aria-hidden size={14} />
        </Link>
      </aside>
    );
  }

  return (
    <aside className="prediction-ticket">
      <header>
        <div>
          <span>Prediction credits</span>
          <strong>{available.toLocaleString("en-US")} available</strong>
        </div>
        <Coins aria-hidden size={20} />
      </header>
      <ViewerPredictionPosition market={market} />
      {receipt && (
        <div
          className="prediction-ticket__receipt"
          data-order-id={receipt.orderId}
          role="status"
        >
          <Check aria-hidden size={19} />
          <p>
            <small>{receipt.status}</small>
            <strong>Your order is recorded</strong>
            <span>{receipt.title}</span>
            {receipt.detail && <span>{receipt.detail}</span>}
          </p>
        </div>
      )}
      <div aria-label="Trade direction" className="prediction-ticket__mode">
        <button
          aria-pressed={mode === "buy"}
          onClick={() => chooseMode("buy")}
          type="button"
        >
          Buy
        </button>
        <button
          aria-pressed={mode === "sell"}
          disabled={totalAvailableShares <= 0}
          onClick={() => chooseMode("sell")}
          title={
            totalAvailableShares > 0
              ? "Sell matched prediction shares"
              : "You need matched shares before you can sell"
          }
          type="button"
        >
          Sell
        </button>
      </div>
      <div className="prediction-ticket__sides">
        {(["yes", "no"] as const).map((option) => (
          <button
            aria-pressed={side === option}
            disabled={mode === "sell" && availableShares(option) <= 0}
            key={option}
            onClick={() => {
              setSide(option);
              setReviewing(false);
            }}
            type="button"
          >
            <span>{option === "yes" ? market.yesLabel : market.noLabel}</span>
            <strong>
              {percentage(
                option === "yes" ? market.yesPriceBps : market.noPriceBps,
              )}
            </strong>
            {mode === "sell" && (
              <small>
                {formatPredictionAmount(availableShares(option))} available
              </small>
            )}
          </button>
        ))}
      </div>
      {mode === "buy" ? (
        <label>
          <span>Credits to allocate</span>
          <input
            max={Math.max(1, available)}
            min={1}
            onChange={(event) =>
              setCredits(
                Math.max(
                  1,
                  Math.min(available, Number(event.target.value) || 1),
                ),
              )
            }
            type="number"
            value={credits}
          />
        </label>
      ) : (
        <label>
          <span>Shares to sell</span>
          <input
            max={Math.max(0, selectedAvailableShares)}
            min={0.001}
            onChange={(event) =>
              setShares(
                Math.min(
                  selectedAvailableShares,
                  Math.max(0.001, Number(event.target.value) || 0.001),
                ),
              )
            }
            step={0.001}
            type="number"
            value={shares}
          />
        </label>
      )}
      <div className="prediction-ticket__quick">
        {[1, 5, 10].map((amount) => (
          <button
            key={amount}
            onClick={() =>
              mode === "buy"
                ? setCredits(Math.min(available, credits + amount))
                : setShares(Math.min(selectedAvailableShares, shares + amount))
            }
            type="button"
          >
            +{amount}
          </button>
        ))}
        <button
          onClick={() =>
            mode === "buy"
              ? setCredits(Math.max(1, available))
              : setShares(selectedAvailableShares)
          }
          type="button"
        >
          Max
        </button>
      </div>
      <div className="prediction-ticket__estimate">
        <span>
          {mode === "buy" ? "Estimated position" : "Estimated return"}
        </span>
        <strong>
          {mode === "buy"
            ? `${formatPredictionAmount(estimatedShares)} shares`
            : `${formatPredictionAmount(estimatedProceeds)} credits`}
        </strong>
        <small>
          {mode === "buy"
            ? `Estimated fill at ${percentage(liquidityQuote.executionSidePriceBps)}. Your ${side === "yes" ? "Yes" : "No"} position moves this market to ${percentage(side === "yes" ? liquidityQuote.nextYesPriceBps : 10_000 - liquidityQuote.nextYesPriceBps)}.`
            : "Proceeds depend on matching demand at this price."}
        </small>
      </div>
      {reviewing ? (
        <div className="prediction-ticket__review">
          <button
            aria-label="Back"
            onClick={() => setReviewing(false)}
            type="button"
          >
            <X aria-hidden size={16} />
          </button>
          <p>
            <strong>
              {mode === "buy" ? "Final position" : "Final sell order"}
            </strong>
            <span>
              {mode === "buy"
                ? `${credits} credits · ${selectedLabel}`
                : `${formatPredictionAmount(shares)} shares · ${selectedLabel}`}
            </span>
            <small>
              This order is final and enters Duna’s append-only prediction
              ledger. It cannot be edited or transferred.
            </small>
          </p>
          <button disabled={pending} onClick={place} type="button">
            <Check aria-hidden size={15} /> {pending ? "Recording…" : "Confirm"}
          </button>
        </div>
      ) : (
        <button
          className="prediction-ticket__submit"
          disabled={
            market.status !== "open" ||
            (mode === "buy"
              ? credits < 1 || credits > available
              : shares <= 0 || shares > selectedAvailableShares)
          }
          onClick={() => setReviewing(true)}
          type="button"
        >
          {market.status === "open"
            ? mode === "buy"
              ? `Review ${credits}-credit position`
              : `Review sale of ${formatPredictionAmount(shares)} shares`
            : "Market closed"}
        </button>
      )}
      <small className="prediction-ticket__rule">
        <LockKeyhole aria-hidden size={12} /> Free play credits only · no
        purchase, cash value, prizes, external transfer, or redemption. Your
        handle appears publicly after a position matches.
      </small>
      {message && (
        <p className="prediction-ticket__message" role="alert">
          {message}
        </p>
      )}
    </aside>
  );
}

export function PredictionMarketDetail({
  conversation,
  market,
  returnTo,
  target,
  wallet,
}: {
  readonly conversation?: {
    readonly access?: {
      readonly verified: boolean;
      readonly paidPremium: boolean;
      readonly canComment: boolean;
      readonly reason?: string;
    };
    readonly comments: readonly CommunityCommentSummary[];
  };
  readonly market: PredictionMarketView;
  readonly returnTo: string;
  readonly target: OrderTarget;
  readonly wallet?: PredictionWallet;
}) {
  return (
    <div className="prediction-market-experience">
      <section className="prediction-market-detail">
        <div className="prediction-market-detail__chart">
          <header>
            <div>
              <span className="page-eyebrow">Crowd signal over time</span>
              <h2>Winner probability</h2>
            </div>
            <span>
              <Sparkles aria-hidden size={15} /> Live market probability
            </span>
          </header>
          {market.status !== "open" && (
            <PredictionMarketLifecycle compact market={market} />
          )}
          <ViewerPredictionPosition market={market} variant="compact" />
          <PredictionMarketChart market={market} />
        </div>
        <PredictionOrderTicket
          market={market}
          returnTo={returnTo}
          target={target}
          wallet={wallet}
        />
      </section>
      <div className="prediction-market-experience__info">
        <PredictionMarketRulesPanel market={market} />
        <PredictionMarketCommunity market={market} />
      </div>
      {conversation ? (
        <CommunityThread
          access={conversation.access}
          comments={conversation.comments}
          returnTo={returnTo}
          subject={{ type: "prediction-market", id: market.id }}
          title="Prediction conversation"
        />
      ) : null}
    </div>
  );
}

export function TournamentPredictionMarkets({
  entries,
  eventSlug,
  markets,
  returnTo,
  targetKind = "pro-event-team",
  wallet,
}: {
  readonly entries: readonly {
    readonly externalTeamId: string;
    readonly label: string;
    readonly countryCode?: string;
  }[];
  readonly eventSlug: string;
  readonly markets: readonly PredictionMarketView[];
  readonly returnTo: string;
  readonly targetKind?: "pro-event-team" | "event-team";
  readonly wallet?: PredictionWallet;
}) {
  const initialMarket =
    markets.find((market) => buildViewerPredictionSummary(market)) ??
    markets[0];
  const initialSide = initialMarket
    ? (buildViewerPredictionSummary(initialMarket)?.sides[0]?.side ?? "yes")
    : "yes";
  const [selectedId, setSelectedId] = useState(initialMarket?.id);
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">(initialSide);
  const selected =
    markets.find((market) => market.id === selectedId) ?? markets[0];
  if (!selected) return null;
  const externalTeamId = entries.find((entry) =>
    selected.subjectId.endsWith(`:${entry.externalTeamId}`),
  )?.externalTeamId;
  if (!externalTeamId) return null;
  const selectContract = (marketId: string, side?: "yes" | "no") => {
    const ownedSide = buildViewerPredictionSummary(
      markets.find((market) => market.id === marketId) ?? selected,
    )?.sides[0]?.side;
    setSelectedId(marketId);
    setSelectedSide(side ?? ownedSide ?? "yes");
  };
  return (
    <section
      className="pro-event-section tournament-markets"
      id="prediction-markets"
    >
      <header>
        <div>
          <span className="page-eyebrow">Tournament market</span>
          <h2>Who wins it all?</h2>
        </div>
        <span>
          <Coins aria-hidden size={17} /> Free prediction credits
        </span>
      </header>
      <div className="tournament-markets__layout">
        <div className="tournament-markets__overview">
          <header>
            <div>
              <span>Selected contract</span>
              <h3>{tournamentTeamLabel(selected)}</h3>
            </div>
            <strong>{percentage(selected.yesPriceBps)}</strong>
          </header>
          <ViewerPredictionPosition market={selected} variant="compact" />
          <TournamentPredictionChart
            markets={markets}
            onSelect={(marketId) => selectContract(marketId)}
            selectedId={selected.id}
          />
        </div>
        <section className="tournament-markets__contracts">
          <header>
            <div>
              <span>Contracts + prices</span>
              <strong>Choose a team or the field</strong>
            </div>
            <span>{markets.length}</span>
          </header>
          {markets.map((market) => {
            const entry = entries.find((candidate) =>
              market.subjectId.endsWith(`:${candidate.externalTeamId}`),
            );
            const first = market.history[0]?.yesPriceBps ?? market.yesPriceBps;
            const trend = market.yesPriceBps - first;
            const viewerPosition = buildViewerPredictionSummary(market);
            return (
              <article
                className={
                  market.id === selected.id ? "is-selected" : undefined
                }
                key={market.id}
              >
                <button
                  aria-expanded={market.id === selected.id}
                  className="tournament-markets__contract-name"
                  onClick={() => selectContract(market.id)}
                  type="button"
                >
                  <span>{entry?.countryCode ?? "◌"}</span>
                  <strong>{entry?.label ?? tournamentTeamLabel(market)}</strong>
                  <small>
                    {trend === 0
                      ? "Steady"
                      : `${trend > 0 ? "+" : ""}${(trend / 100).toFixed(1)} pts`}
                  </small>
                  <b>{percentage(market.yesPriceBps)}</b>
                  <ChevronDown aria-hidden size={16} />
                </button>
                <div className="tournament-markets__quotes">
                  <button
                    aria-pressed={
                      market.id === selected.id && selectedSide === "yes"
                    }
                    onClick={() => selectContract(market.id, "yes")}
                    type="button"
                  >
                    Yes <strong>{percentage(market.yesPriceBps)}</strong>
                  </button>
                  <button
                    aria-pressed={
                      market.id === selected.id && selectedSide === "no"
                    }
                    onClick={() => selectContract(market.id, "no")}
                    type="button"
                  >
                    No <strong>{percentage(market.noPriceBps)}</strong>
                  </button>
                </div>
                {viewerPosition && (
                  <span className="tournament-markets__owned">
                    <Check aria-hidden size={14} /> Your position ·{" "}
                    {formatPredictionAmount(
                      viewerPosition.totalCommittedCredits,
                    )}{" "}
                    credits
                  </span>
                )}
                {market.id === selected.id && (
                  <div className="tournament-markets__contract-detail">
                    <span>{market.yesLabel}</span>
                    <span>{market.noLabel}</span>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        <PredictionOrderTicket
          defaultSide={selectedSide}
          key={`${selected.id}:${selectedSide}`}
          market={selected}
          returnTo={returnTo}
          target={{ kind: targetKind, eventSlug, externalTeamId }}
          wallet={wallet}
        />
      </div>
      <div className="prediction-market-experience__info">
        <PredictionMarketRulesPanel market={selected} />
        <PredictionMarketCommunity market={selected} />
      </div>
    </section>
  );
}
