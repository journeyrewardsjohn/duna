import type { PredictionDiscovery } from "@duna/api";
import {
  ArrowRight,
  BadgeCheck,
  Coins,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";

function probability(priceBps: number) {
  return (priceBps / 100).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
}

function statusLabel(
  status: PredictionDiscovery["items"][number]["market"]["status"],
) {
  return status === "settled"
    ? "Determined"
    : status === "locked"
      ? "Closed"
      : status === "void"
        ? "Void"
        : "Open";
}

export function PredictionDiscoverySection({
  discovery,
  title = "Predictions for you",
  description = "Live and upcoming matches shaped by who you follow, the events you care about, and the biggest pro moments.",
  allHref = "/app/wallet/predictions",
  publicMode = false,
}: {
  readonly discovery: PredictionDiscovery;
  readonly title?: string;
  readonly description?: string;
  readonly allHref?: string;
  readonly publicMode?: boolean;
}) {
  return (
    <section
      className={
        publicMode
          ? "prediction-discovery prediction-discovery--public"
          : "prediction-discovery"
      }
      data-zone="athletic"
    >
      <header>
        <div>
          <span className="page-eyebrow">
            <Sparkles aria-hidden size={14} /> Play the next point
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={allHref}>
          {publicMode ? "Explore predictions" : "Open portfolio"}{" "}
          <ArrowRight aria-hidden size={15} />
        </Link>
      </header>
      {discovery.items.length ? (
        <div className="prediction-discovery__grid">
          {discovery.items.map((item) => {
            const market = item.market;
            const yesProbability = probability(market.yesPriceBps);
            const noProbability = probability(market.noPriceBps);
            const winner =
              market.resolvedSide === "yes"
                ? market.yesLabel
                : market.resolvedSide === "no"
                  ? market.noLabel
                  : undefined;
            return (
              <Link
                className="prediction-discovery-card"
                href={item.marketPath}
                key={market.id}
              >
                <header>
                  <span>
                    {item.source === "avp"
                      ? "AVP"
                      : item.source === "fivb"
                        ? "Pro tour"
                        : "Duna match"}
                  </span>
                  <small data-status={market.status}>
                    {market.status === "settled" ? (
                      <BadgeCheck aria-hidden size={13} />
                    ) : item.relevance === "live-pro" ? (
                      <Radio aria-hidden size={13} />
                    ) : (
                      <Coins aria-hidden size={13} />
                    )}
                    {statusLabel(market.status)}
                  </small>
                </header>
                <p>{item.reason}</p>
                <span className="prediction-discovery-card__competition">
                  {item.competition}
                  {item.scheduledAt
                    ? " · " +
                      new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(item.scheduledAt))
                    : ""}
                </span>
                {winner ? (
                  <div className="prediction-discovery-card__determined">
                    <h3>{market.title}</h3>
                    <span>Determined winner</span>
                    <strong>{winner}</strong>
                  </div>
                ) : (
                  <div className="prediction-discovery-card__sides">
                    <h3>{market.title}</h3>
                    <span>
                      <b>{market.yesLabel}</b>
                      <strong>{yesProbability}%</strong>
                    </span>
                    <i aria-hidden>
                      <b style={{ width: yesProbability + "%" }} />
                    </i>
                    <span>
                      <b>{market.noLabel}</b>
                      <strong>{noProbability}%</strong>
                    </span>
                  </div>
                )}
                <footer>
                  <span>
                    <Users aria-hidden size={13} /> {market.participantCount}
                  </span>
                  {market.predictors.slice(0, 3).map((predictor) => (
                    <span key={[predictor.handle, predictor.side].join(":")}>
                      @{predictor.handle}
                    </span>
                  ))}
                  <ArrowRight aria-hidden size={14} />
                </footer>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="prediction-discovery__empty">
          <Coins aria-hidden size={22} />
          <div>
            <strong>Your next markets are being assembled.</strong>
            <span>
              Follow players and pro events, or schedule a match, to shape this
              section.
            </span>
          </div>
        </div>
      )}
      <footer>
        Free prediction credits only. No purchase, cash value, prizes, transfer,
        or redemption.
      </footer>
    </section>
  );
}
