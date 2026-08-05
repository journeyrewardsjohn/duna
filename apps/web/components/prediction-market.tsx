"use client";

import type { PredictionMarketView, PredictionWallet } from "@duna/api";
import {
  ArrowRight,
  Check,
  Coins,
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
  placeEventTeamPredictionOrderAction,
  placeMatchPredictionOrderAction,
  placeProEventTeamPredictionOrderAction,
  placeProMatchPredictionOrderAction,
} from "@/app/predictions/actions";

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
            {compactCredits(market.volumeCredits)} credits matched
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
      <footer>
        <span>
          <Users aria-hidden size={12} /> {market.participantCount}
        </span>
        <span>{compactCredits(market.volumeCredits)} credit volume</span>
        <ArrowRight aria-hidden size={13} />
      </footer>
    </Link>
  );
}

export function PredictionOrderTicket({
  market,
  returnTo,
  target,
  wallet,
}: {
  readonly market: PredictionMarketView;
  readonly returnTo: string;
  readonly target: OrderTarget;
  readonly wallet?: PredictionWallet;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [credits, setCredits] = useState(1);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedLabel = side === "yes" ? market.yesLabel : market.noLabel;
  const priceBps = side === "yes" ? market.yesPriceBps : market.noPriceBps;
  const available = Math.floor(wallet?.availableCredits ?? 0);
  const estimatedShares = credits / (priceBps / 10_000);
  const place = () => {
    setMessage("");
    startTransition(async () => {
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
      setMessage(
        result.result.status === "filled"
          ? "Position matched and recorded."
          : "Position recorded in the order book.",
      );
      router.refresh();
    });
  };

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
      <div className="prediction-ticket__sides">
        {(["yes", "no"] as const).map((option) => (
          <button
            aria-pressed={side === option}
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
          </button>
        ))}
      </div>
      <label>
        <span>Credits to allocate</span>
        <input
          max={Math.max(1, available)}
          min={1}
          onChange={(event) =>
            setCredits(
              Math.max(1, Math.min(available, Number(event.target.value) || 1)),
            )
          }
          type="number"
          value={credits}
        />
      </label>
      <div className="prediction-ticket__quick">
        {[1, 5, 10].map((amount) => (
          <button
            key={amount}
            onClick={() => setCredits(Math.min(available, credits + amount))}
            type="button"
          >
            +{amount}
          </button>
        ))}
        <button
          onClick={() => setCredits(Math.max(1, available))}
          type="button"
        >
          Max
        </button>
      </div>
      <div className="prediction-ticket__estimate">
        <span>Estimated position</span>
        <strong>
          {estimatedShares.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}{" "}
          shares
        </strong>
        <small>Each correct share settles at 1 prediction credit.</small>
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
            <strong>Final position</strong>
            <span>
              {credits} credits · {selectedLabel}
            </span>
            <small>
              This order is immutable and cannot be sold, edited, transferred,
              or redeemed.
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
            market.status !== "open" || credits < 1 || credits > available
          }
          onClick={() => setReviewing(true)}
          type="button"
        >
          {market.status === "open"
            ? `Review ${credits}-credit position`
            : "Market closed"}
        </button>
      )}
      <small className="prediction-ticket__rule">
        <LockKeyhole aria-hidden size={12} /> Free play credits only · no
        purchase, cash value, prizes, transfer, or redemption.
      </small>
      {message && (
        <p className="prediction-ticket__message" role="status">
          {message}
        </p>
      )}
    </aside>
  );
}

export function PredictionMarketDetail({
  market,
  returnTo,
  target,
  wallet,
}: {
  readonly market: PredictionMarketView;
  readonly returnTo: string;
  readonly target: OrderTarget;
  readonly wallet?: PredictionWallet;
}) {
  return (
    <section className="prediction-market-detail">
      <div className="prediction-market-detail__chart">
        <header>
          <div>
            <span className="page-eyebrow">Crowd signal over time</span>
            <h2>Winner probability</h2>
          </div>
          <span>
            <Sparkles aria-hidden size={15} /> Order-book price
          </span>
        </header>
        <PredictionMarketChart market={market} />
      </div>
      <PredictionOrderTicket
        market={market}
        returnTo={returnTo}
        target={target}
        wallet={wallet}
      />
    </section>
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
  const [selectedId, setSelectedId] = useState(markets[0]?.id);
  const selected =
    markets.find((market) => market.id === selectedId) ?? markets[0];
  if (!selected) return null;
  const externalTeamId = entries.find((entry) =>
    selected.subjectId.endsWith(`:${entry.externalTeamId}`),
  )?.externalTeamId;
  if (!externalTeamId) return null;
  return (
    <section className="pro-event-section tournament-markets">
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
        <div className="tournament-markets__teams">
          {markets.map((market) => {
            const entry = entries.find((candidate) =>
              market.subjectId.endsWith(`:${candidate.externalTeamId}`),
            );
            const first = market.history[0]?.yesPriceBps ?? market.yesPriceBps;
            const trend = market.yesPriceBps - first;
            return (
              <button
                aria-pressed={market.id === selected.id}
                key={market.id}
                onClick={() => setSelectedId(market.id)}
                type="button"
              >
                <span>{entry?.countryCode ?? "◌"}</span>
                <strong>
                  {entry?.label ?? market.yesLabel.replace(/ wins$/, "")}
                </strong>
                <small>
                  {trend === 0
                    ? "Steady"
                    : `${trend > 0 ? "+" : ""}${(trend / 100).toFixed(1)} pts`}
                </small>
                <b>{percentage(market.yesPriceBps)}</b>
              </button>
            );
          })}
        </div>
        <div className="tournament-markets__focus">
          <header>
            <div>
              <span>Selected team</span>
              <h3>{selected.yesLabel.replace(/ wins$/, "")}</h3>
            </div>
            <strong>{percentage(selected.yesPriceBps)}</strong>
          </header>
          <PredictionMarketChart market={selected} />
        </div>
        <PredictionOrderTicket
          market={selected}
          returnTo={returnTo}
          target={{ kind: targetKind, eventSlug, externalTeamId }}
          wallet={wallet}
        />
      </div>
    </section>
  );
}
