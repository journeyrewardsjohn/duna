import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Coins,
  Fingerprint,
  History,
  LockKeyhole,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { PredictionDiscoverySection } from "@/components/prediction-discovery";
import { WalletSectionNav } from "@/components/wallet-section-nav";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Predictions | Wallet" };

function amount(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function signed(value: number) {
  return (value > 0 ? "+" : "") + amount(value);
}

export default async function PredictionPortfolioPage() {
  const caller = await getServerCaller();
  const [wallet, discovery] = await Promise.all([
    caller.player.predictionWallet(),
    caller.public.predictionDiscovery({ limit: 3 }),
  ]);
  const openPositions = wallet.positions.filter(
    (position) => position.status === "open",
  );
  const determinedPositions = wallet.positions.filter(
    (position) => position.status !== "open",
  );

  return (
    <main
      className="standard-page prediction-portfolio-page"
      data-zone="athletic"
    >
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Wallet · Predictions</span>
          <h1>Your calls. Your track record.</h1>
          <p>
            Explore markets, manage open positions, and see every credit won or
            lost after a result is Determined.
          </p>
        </div>
        <Badge tone="positive">
          <Coins aria-hidden size={13} /> Free-play credits
        </Badge>
      </section>

      <WalletSectionNav active="predictions" />

      <section className="prediction-portfolio-hero">
        <article>
          <span>Available to predict</span>
          <Numeric tier="hero">{amount(wallet.availableCredits)}</Numeric>
          <strong>credits</strong>
          <p>
            Next monthly allocation: {amount(wallet.nextMonthlyGrantCredits)} ·{" "}
            {wallet.membershipPlan.replace("-", " ")}
          </p>
        </article>
        <div>
          <article>
            <span>Open value</span>
            <Numeric tier="block">
              {amount(wallet.portfolio.currentValueCredits)}
            </Numeric>
            <small>{signed(wallet.portfolio.unrealizedCredits)} vs cost</small>
          </article>
          <article>
            <span>Determined return</span>
            <Numeric tier="block">
              {signed(wallet.portfolio.netSettledCredits)}
            </Numeric>
            <small>
              {wallet.portfolio.wins} won · {wallet.portfolio.losses} lost
            </small>
          </article>
          <article>
            <span>Order book</span>
            <Numeric tier="block">{wallet.portfolio.openOrders}</Numeric>
            <small>{wallet.portfolio.openPositions} open positions</small>
          </article>
        </div>
      </section>

      <PredictionDiscoverySection
        description="Markets from your matches, followed players and events, AVP League, and the live pro tour."
        discovery={discovery}
        title="Markets for you"
      />

      <section className="prediction-portfolio-grid">
        <div className="prediction-portfolio-list">
          <header>
            <div>
              <span className="page-eyebrow">Portfolio</span>
              <h2>Open positions</h2>
            </div>
            <Badge>{openPositions.length}</Badge>
          </header>
          {openPositions.length ? (
            openPositions.map((position) => (
              <Link href={position.marketPath} key={position.id}>
                <span className="prediction-portfolio-list__state">
                  <TrendingUp aria-hidden size={16} /> Open
                </span>
                <div>
                  <strong>{position.title}</strong>
                  <span>{position.selectedLabel}</span>
                  <small>
                    {amount(position.shares)} shares ·{" "}
                    {(position.currentPriceBps / 100).toFixed(1)}%
                    {position.listedShares > 0
                      ? " · " + amount(position.listedShares) + " listed"
                      : ""}
                  </small>
                </div>
                <p>
                  <small>Current value</small>
                  <Numeric>{amount(position.currentValueCredits)}</Numeric>
                  <span
                    data-tone={
                      position.netCredits >= 0 ? "positive" : "negative"
                    }
                  >
                    {signed(position.netCredits)}
                  </span>
                </p>
                <ArrowRight aria-hidden size={16} />
              </Link>
            ))
          ) : (
            <div className="prediction-portfolio-empty">
              <Coins aria-hidden size={20} />
              <span>
                <strong>No open positions.</strong>
                Your next matched prediction will appear here.
              </span>
            </div>
          )}
        </div>

        <div className="prediction-portfolio-list">
          <header>
            <div>
              <span className="page-eyebrow">Settled history</span>
              <h2>Determined</h2>
            </div>
            <Badge>{determinedPositions.length}</Badge>
          </header>
          {determinedPositions.length ? (
            determinedPositions.map((position) => (
              <Link href={position.marketPath} key={position.id}>
                <span className="prediction-portfolio-list__state">
                  <BadgeCheck aria-hidden size={16} /> Determined
                </span>
                <div>
                  <strong>{position.title}</strong>
                  <span>Picked: {position.selectedLabel}</span>
                  <small>
                    {position.resolvedLabel
                      ? `Final outcome: ${position.resolvedLabel}`
                      : "Final outcome recorded"}
                    {position.determinedAt
                      ? ` · ${new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date(position.determinedAt))}`
                      : ""}
                  </small>
                </div>
                <p>
                  <Badge
                    tone={position.status === "won" ? "positive" : "neutral"}
                  >
                    {position.status === "won"
                      ? "Won"
                      : position.status === "lost"
                        ? "Lost"
                        : "Voided"}
                  </Badge>
                  <Numeric>{amount(position.payoutCredits)} returned</Numeric>
                  <span
                    data-tone={
                      position.netCredits >= 0 ? "positive" : "negative"
                    }
                  >
                    {signed(position.netCredits)}
                  </span>
                </p>
                <ArrowRight aria-hidden size={16} />
              </Link>
            ))
          ) : (
            <div className="prediction-portfolio-empty">
              <History aria-hidden size={20} />
              <span>
                <strong>No determined markets yet.</strong>
                Results and final credit returns will stay here.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="prediction-orders-activity">
        <div className="prediction-portfolio-list">
          <header>
            <div>
              <span className="page-eyebrow">Orders</span>
              <h2>Still in the book</h2>
            </div>
            <Badge>{wallet.openOrders.length}</Badge>
          </header>
          {wallet.openOrders.map((order) => (
            <Link href={order.marketPath} key={order.id}>
              <span className="prediction-portfolio-list__state">
                <LockKeyhole aria-hidden size={15} />{" "}
                {order.intent === "sell" ? "Sell" : "Buy"}
              </span>
              <div>
                <strong>{order.title}</strong>
                <span>{order.selectedLabel}</span>
                <small>
                  {(order.limitPriceBps / 100).toFixed(1)}% ·{" "}
                  {order.status.replace("-", " ")}
                </small>
              </div>
              <p>
                <Numeric>
                  {amount(
                    order.intent === "sell"
                      ? order.openShares
                      : order.reservedCredits,
                  )}
                </Numeric>
                <small>
                  {order.intent === "sell" ? "shares listed" : "credits held"}
                </small>
              </p>
              <ArrowRight aria-hidden size={16} />
            </Link>
          ))}
          {!wallet.openOrders.length && (
            <div className="prediction-portfolio-empty">
              <BookOpenCheck aria-hidden size={20} />
              <span>
                <strong>No unmatched orders.</strong>
                Your order book is clear.
              </span>
            </div>
          )}
        </div>

        <div className="prediction-credit-activity">
          <header>
            <div>
              <span className="page-eyebrow">Credit ledger</span>
              <h2>Recent activity</h2>
            </div>
            <Fingerprint aria-hidden size={20} />
          </header>
          <div>
            {wallet.activity.slice(0, 12).map((entry) => {
              const content = (
                <>
                  <span>
                    <strong>{entry.note}</strong>
                    <small>
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(entry.occurredAt))}
                    </small>
                  </span>
                  <Numeric
                    className={entry.deltaCredits > 0 ? "positive" : undefined}
                  >
                    {signed(entry.deltaCredits)}
                  </Numeric>
                </>
              );
              return entry.marketPath ? (
                <Link href={entry.marketPath} key={entry.id}>
                  {content}
                </Link>
              ) : (
                <article key={entry.id}>{content}</article>
              );
            })}
          </div>
          <footer>
            <Fingerprint aria-hidden size={15} />
            {wallet.integrity.verified ? "Verified" : "Needs review"} ·{" "}
            {wallet.integrity.entryCount.toLocaleString("en-US")} append-only
            entries · SHA-256
          </footer>
        </div>
      </section>

      <section className="prediction-credit-rules">
        <Coins aria-hidden size={23} />
        <div>
          <strong>Playful by design. Never money.</strong>
          <p>
            Prediction credits cannot be purchased, transferred, redeemed, or
            exchanged for cash or prizes. Correct shares settle at one credit.
            Orders are final and your handle is public after matching.
          </p>
        </div>
      </section>
    </main>
  );
}
