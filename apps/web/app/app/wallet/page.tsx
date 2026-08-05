import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Coins,
  Fingerprint,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const caller = await getServerCaller();
  const [wallet, organizationWallets, predictionWallet] = await Promise.all([
    caller.player.wallet(),
    caller.player.organizationWallets(),
    caller.player.predictionWallet(),
  ]);
  return (
    <main className="standard-page wallet-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Securely managed balance</span>
          <h1>Money, club credits + predictions.</h1>
          <p>
            Keep cash, prize earnings, memberships, and each organization’s
            credits clear and separate.
          </p>
        </div>
        <Badge
          tone={wallet.taxFormStatus === "pending" ? "warning" : "positive"}
        >
          <ShieldCheck aria-hidden size={13} />{" "}
          {wallet.taxFormStatus === "pending"
            ? "Tax details needed"
            : "Ledger connected"}
        </Badge>
      </section>

      <section className="wallet-grid">
        <article className="wallet-balance-card">
          <div className="wallet-balance-card__mark">
            <span>DUNA</span>
            <CircleDollarSign aria-hidden size={25} />
          </div>
          <span>Available balance</span>
          <Numeric>
            {formatMoney(wallet.availableMinor, wallet.currency)}
          </Numeric>
          <div className="wallet-balance-card__actions">
            <button disabled title="Available after production wallet approval">
              <Plus aria-hidden size={17} /> Add money
            </button>
            <button disabled title="Available after production wallet approval">
              <ArrowDownToLine aria-hidden size={17} /> Withdraw
            </button>
          </div>
          <small>
            Funds are held and moved by the payment provider. Duna never takes
            custody.
          </small>
        </article>

        <div className="wallet-side-cards">
          <article>
            <span className="wallet-side-cards__icon">
              <ReceiptText aria-hidden size={20} />
            </span>
            <div>
              <small>Pending balance</small>
              <Numeric>
                {formatMoney(wallet.pendingMinor, wallet.currency)}
              </Numeric>
              <span>Tax status: {wallet.taxFormStatus}</span>
            </div>
            <ArrowUpRight aria-hidden size={17} />
          </article>
          <article>
            <span className="wallet-side-cards__icon">
              <Building2 aria-hidden size={20} />
            </span>
            <div>
              <small>Wallet rail</small>
              <strong>Connected payout account</strong>
              <span>Bank details never live in Duna</span>
            </div>
            <ArrowUpRight aria-hidden size={17} />
          </article>
        </div>
      </section>

      <section className="dashboard-section prediction-wallet-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Wisdom of the crowd</span>
            <h2>Prediction credits</h2>
          </div>
          <p>
            Free play credits with no cash value, purchase, prizes, external
            transfer, or redemption.
          </p>
        </div>
        <div className="prediction-wallet-summary">
          <article>
            <span className="prediction-wallet-summary__icon">
              <Coins aria-hidden size={24} />
            </span>
            <small>Available</small>
            <Numeric>
              {Math.floor(predictionWallet.availableCredits).toLocaleString(
                "en-US",
              )}
            </Numeric>
            <strong>prediction credits</strong>
            <p>
              Next monthly allocation:{" "}
              {predictionWallet.nextMonthlyGrantCredits.toLocaleString("en-US")}{" "}
              credits
              {predictionWallet.membershipPlan !== "free"
                ? " with Premium"
                : ""}
              .
            </p>
          </article>
          <article>
            <span className="prediction-wallet-summary__icon">
              <TrendingUp aria-hidden size={24} />
            </span>
            <small>Positions</small>
            <Numeric>{predictionWallet.positions.length}</Numeric>
            <strong>open or settled</strong>
            <p>
              {predictionWallet.openOrders.length} unmatched or partially
              matched order{predictionWallet.openOrders.length === 1 ? "" : "s"}
              .
            </p>
          </article>
          <article className="prediction-wallet-summary__rules">
            <span className="prediction-wallet-summary__icon">
              <Fingerprint aria-hidden size={24} />
            </span>
            <small>SHA-256 hash chain</small>
            <strong>
              {predictionWallet.integrity.verified
                ? "Ledger integrity verified."
                : "Integrity check needs attention."}
            </strong>
            <p>
              {predictionWallet.integrity.entryCount.toLocaleString("en-US")}{" "}
              append-only entries
              {predictionWallet.integrity.headHash && (
                <> · head {predictionWallet.integrity.headHash.slice(0, 12)}…</>
              )}
              . Orders, trades, refunds, and settlements remain independently
              auditable.
            </p>
          </article>
        </div>

        <div className="prediction-wallet-positions">
          <section>
            <header>
              <h3>Your positions</h3>
              <Badge>{predictionWallet.positions.length}</Badge>
            </header>
            {predictionWallet.positions.length ? (
              predictionWallet.positions.map((position) => (
                <Link
                  className="prediction-wallet-position-row"
                  href={position.marketPath}
                  key={position.id}
                >
                  <div>
                    <small>
                      {position.status === "open"
                        ? "Open position"
                        : "Settled position"}
                    </small>
                    <strong>{position.title}</strong>
                    <span>{position.selectedLabel}</span>
                  </div>
                  <div>
                    <Numeric>
                      {position.shares.toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}
                    </Numeric>
                    <small>
                      shares{position.listedShares > 0 ? " · listed" : ""}
                    </small>
                  </div>
                  <Badge
                    tone={
                      position.status === "won"
                        ? "positive"
                        : position.status === "lost"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {position.status}
                  </Badge>
                  <ArrowUpRight aria-hidden size={17} />
                </Link>
              ))
            ) : (
              <p className="profile-empty">
                Your first matched prediction will appear here.
              </p>
            )}
          </section>
          <section>
            <header>
              <h3>Open order book</h3>
              <Badge>{predictionWallet.openOrders.length}</Badge>
            </header>
            {predictionWallet.openOrders.length ? (
              predictionWallet.openOrders.map((order) => (
                <Link
                  className="prediction-wallet-position-row"
                  href={order.marketPath}
                  key={order.id}
                >
                  <div>
                    <small>
                      {order.intent === "sell" ? "Sell" : "Buy"} ·{" "}
                      {order.status.replace("-", " ")}
                    </small>
                    <strong>{order.title}</strong>
                    <span>
                      {order.selectedLabel} ·{" "}
                      {(order.limitPriceBps / 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <Numeric>
                      {(order.intent === "sell"
                        ? order.openShares
                        : order.reservedCredits
                      ).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </Numeric>
                    <small>
                      {order.intent === "sell"
                        ? "shares listed"
                        : "credits reserved"}
                    </small>
                  </div>
                  <Badge tone="warning">Open</Badge>
                  <ArrowUpRight aria-hidden size={17} />
                </Link>
              ))
            ) : (
              <p className="profile-empty">No unmatched orders.</p>
            )}
          </section>
        </div>
      </section>

      <section className="dashboard-section organization-credit-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Closed-loop benefits</span>
            <h2>Organization credits</h2>
          </div>
          <p>Credits stay with the organization that issued them.</p>
        </div>
        <div className="organization-credit-grid">
          {organizationWallets.map((organizationWallet) => (
            <article key={organizationWallet.organizationId}>
              <div className="organization-credit-card__top">
                <span className="wallet-side-cards__icon">
                  <WalletCards aria-hidden size={20} />
                </span>
                <Badge
                  tone={
                    organizationWallet.status === "active"
                      ? "positive"
                      : "warning"
                  }
                >
                  {organizationWallet.status}
                </Badge>
              </div>
              <small>{organizationWallet.organizationName}</small>
              <Numeric>{organizationWallet.credits}</Numeric>
              <span>credits available</span>
              {organizationWallet.membershipName && (
                <p>
                  <strong>{organizationWallet.membershipName}</strong>
                  <span>
                    {organizationWallet.membershipStatus ?? "membership"}
                  </span>
                </p>
              )}
              {organizationWallet.nextExpirationAt && (
                <p>
                  <strong>
                    {organizationWallet.nextExpiringCredits} expiring
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(organizationWallet.nextExpirationAt))}
                  </span>
                </p>
              )}
              <Link href={`/clubs/${organizationWallet.organizationSlug}`}>
                Shop and book <ArrowUpRight aria-hidden size={15} />
              </Link>
            </article>
          ))}
          {organizationWallets.length === 0 && (
            <article className="organization-credit-card--empty">
              <WalletCards aria-hidden size={22} />
              <strong>No organization credits yet</strong>
              <span>
                Memberships and credit packs you purchase will appear here.
              </span>
            </article>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Your money on sand</span>
            <h2>Activity</h2>
          </div>
          <button className="secondary-action">
            <ArrowDownToLine aria-hidden size={16} /> Export
          </button>
        </div>
        <div className="wallet-activity">
          {wallet.entries.map((entry) => (
            <article key={entry.id}>
              <span
                className={`wallet-activity__icon wallet-activity__icon--${entry.kind}`}
              >
                {entry.kind === "prize" ? (
                  <CircleDollarSign aria-hidden size={20} />
                ) : entry.kind === "booking" ? (
                  <ArrowUpRight aria-hidden size={20} />
                ) : (
                  <ArrowDownToLine aria-hidden size={20} />
                )}
              </span>
              <span>
                <strong>{entry.description}</strong>
                <small>
                  {formatVenueTime(
                    entry.occurredAt,
                    "America/Los_Angeles",
                    "en-US",
                    { year: "numeric" },
                  )}
                </small>
              </span>
              <Badge
                tone={entry.status === "available" ? "positive" : "neutral"}
              >
                {entry.status}
              </Badge>
              <Numeric
                className={
                  entry.amount.amountMinor > 0 ? "positive" : undefined
                }
              >
                {entry.amount.amountMinor > 0 ? "+" : ""}
                {formatMoney(entry.amount.amountMinor, entry.amount.currency)}
              </Numeric>
            </article>
          ))}
          {wallet.entries.length === 0 && (
            <article className="wallet-activity__empty">
              <span className="wallet-activity__icon">
                <ReceiptText aria-hidden size={20} />
              </span>
              <span>
                <strong>No wallet activity yet</strong>
                <small>Completed money movement will appear here.</small>
              </span>
            </article>
          )}
        </div>
      </section>

      <section className="wallet-note">
        <ShieldCheck aria-hidden size={23} />
        <div>
          <strong>Your money stays on regulated rails.</strong>
          <p>
            Duna displays your ledger; the payment provider holds the balance,
            verifies identity, and moves funds. No peer-to-peer transfers and no
            hidden custody.
          </p>
        </div>
      </section>
    </main>
  );
}
