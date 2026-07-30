import { demoWalletEntries, demoWalletBalanceMinor } from "@duna/core/demo";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Plus,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

export const metadata = { title: "Wallet" };

export default function WalletPage() {
  const balance = demoWalletBalanceMinor();
  return (
    <main className="standard-page wallet-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Stripe-managed balance</span>
          <h1>Duna Wallet.</h1>
          <p>Load, earn, play, and get paid—all without chasing a transfer.</p>
        </div>
        <Badge tone="positive">
          <ShieldCheck aria-hidden size={13} /> Identity verified
        </Badge>
      </section>

      <section className="wallet-grid">
        <article className="wallet-balance-card">
          <div className="wallet-balance-card__mark">
            <span>DUNA</span>
            <CircleDollarSign aria-hidden size={25} />
          </div>
          <span>Available balance</span>
          <Numeric>{formatMoney(balance, "USD")}</Numeric>
          <div className="wallet-balance-card__actions">
            <button>
              <Plus aria-hidden size={17} /> Add money
            </button>
            <button>
              <ArrowDownToLine aria-hidden size={17} /> Withdraw
            </button>
          </div>
          <small>
            Funds are held and moved by Stripe. Duna never takes custody.
          </small>
        </article>

        <div className="wallet-side-cards">
          <article>
            <span className="wallet-side-cards__icon">
              <ReceiptText aria-hidden size={20} />
            </span>
            <div>
              <small>2026 winnings</small>
              <Numeric>$184.00</Numeric>
              <span>W-9 required at $400</span>
            </div>
            <ArrowUpRight aria-hidden size={17} />
          </article>
          <article>
            <span className="wallet-side-cards__icon">
              <Building2 aria-hidden size={20} />
            </span>
            <div>
              <small>Payout account</small>
              <strong>Chase •••• 4821</strong>
              <span>Standard payouts are free</span>
            </div>
            <ArrowUpRight aria-hidden size={17} />
          </article>
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
          {demoWalletEntries.map((entry) => (
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
        </div>
      </section>

      <section className="wallet-note">
        <ShieldCheck aria-hidden size={23} />
        <div>
          <strong>Your money stays on regulated rails.</strong>
          <p>
            Duna displays your ledger; Stripe holds the balance, verifies
            identity, and moves funds. No peer-to-peer transfers and no hidden
            custody.
          </p>
        </div>
      </section>
    </main>
  );
}
