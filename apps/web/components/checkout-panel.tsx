"use client";

import type { EventSummary } from "@duna/core";
import { formatMoney } from "@duna/core";
import { priceConsumerOrder } from "@duna/pricing";
import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";

export function CheckoutPanel({ event }: { readonly event: EventSummary }) {
  const [isDunaPlus, setIsDunaPlus] = useState(false);
  const [walletApplied, setWalletApplied] = useState(true);
  const [complete, setComplete] = useState(false);
  const pricing = useMemo(
    () =>
      priceConsumerOrder({
        currency: event.price.currency,
        isDunaPlus,
        items: [
          {
            id: event.id,
            kind: event.kind === "tournament" ? "registration" : "booking",
            description: event.title,
            quantity: 1,
            unitAmountMinor: event.price.amountMinor,
          },
        ],
      }),
    [event, isDunaPlus],
  );
  const walletBalance = 18400;
  const walletAmount = walletApplied
    ? Math.min(walletBalance, pricing.totalMinor)
    : 0;
  const cardAmount = Math.max(0, pricing.totalMinor - walletAmount);

  if (complete) {
    return (
      <section className="checkout-complete">
        <span>
          <Check aria-hidden size={29} />
        </span>
        <Badge tone="positive">Confirmed</Badge>
        <h1>You’re in.</h1>
        <p>
          {event.title} is on your Duna calendar and the group thread is open.
        </p>
        <a className="primary-action" href="/app/play">
          View your booking <ChevronRight aria-hidden size={17} />
        </a>
      </section>
    );
  }

  return (
    <div className="checkout-layout">
      <section className="checkout-main">
        <div>
          <span className="page-eyebrow">Secure checkout</span>
          <h1>Finish your spot.</h1>
          <p>Clear math, one Duna fee, and wallet-first by default.</p>
        </div>

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>1</Numeric>
            </span>
            <h2>Who’s playing</h2>
            <Badge tone="positive">Eligible</Badge>
          </div>
          <div className="checkout-player">
            <span className="avatar">ML</span>
            <span>
              <strong>Mara Lewis</strong>
              <small>Sand Rating 4.62 · requirement passed</small>
            </span>
            <Check aria-hidden size={18} />
          </div>
        </article>

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>2</Numeric>
            </span>
            <h2>Pay your way</h2>
          </div>
          <label
            className={
              walletApplied ? "payment-choice selected" : "payment-choice"
            }
          >
            <input
              checked={walletApplied}
              onChange={(event) => setWalletApplied(event.target.checked)}
              type="checkbox"
            />
            <WalletCards aria-hidden size={21} />
            <span>
              <strong>Use Duna Wallet</strong>
              <small>
                <Numeric>$184.00</Numeric> available
              </small>
            </span>
            <Numeric>-{formatMoney(walletAmount, "USD")}</Numeric>
          </label>
          {cardAmount > 0 && (
            <label className="payment-choice selected">
              <input defaultChecked name="payment" type="radio" />
              <CreditCard aria-hidden size={21} />
              <span>
                <strong>Visa •••• 4242</strong>
                <small>Securely stored with Stripe</small>
              </span>
              <Numeric>{formatMoney(cardAmount, "USD")}</Numeric>
            </label>
          )}
        </article>

        {!isDunaPlus && event.kind !== "tournament" && (
          <article className="checkout-plus">
            <div>
              <Badge tone="positive">Duna+</Badge>
              <h3>Make the platform fee disappear.</h3>
              <p>
                Start at $7.99/month. Pause any time, up to four months each
                year.
              </p>
            </div>
            <button onClick={() => setIsDunaPlus(true)}>Add Duna+</button>
          </article>
        )}
      </section>

      <aside className="checkout-summary">
        <div className="checkout-summary__art">
          <Badge>{event.kind.replace("-", " ")}</Badge>
        </div>
        <h2>{event.title}</h2>
        <p>{event.venueName}</p>
        <div className="checkout-summary__math">
          <span>
            <small>
              {event.kind === "tournament" ? "Team entry" : "Booking"}
            </small>
            <Numeric>{formatMoney(pricing.subtotalMinor, "USD")}</Numeric>
          </span>
          {pricing.fees.map((fee) => (
            <span key={fee.id}>
              <small>{fee.label}</small>
              <Numeric>{formatMoney(fee.amountMinor, "USD")}</Numeric>
            </span>
          ))}
          {isDunaPlus && (
            <span className="positive">
              <small>Duna+ platform-fee waiver</small>
              <Numeric>Included</Numeric>
            </span>
          )}
          <span className="checkout-summary__total">
            <strong>Total</strong>
            <Numeric>{formatMoney(pricing.totalMinor, "USD")}</Numeric>
          </span>
          {walletAmount > 0 && (
            <span>
              <small>From wallet</small>
              <Numeric>-{formatMoney(walletAmount, "USD")}</Numeric>
            </span>
          )}
        </div>
        <button
          className="checkout-summary__pay"
          onClick={() => setComplete(true)}
        >
          <LockKeyhole aria-hidden size={17} />
          {cardAmount > 0
            ? `Pay ${formatMoney(cardAmount, "USD")}`
            : "Confirm with Wallet"}
        </button>
        <p className="checkout-summary__trust">
          <ShieldCheck aria-hidden size={16} />
          Payments are processed by Stripe. Card details never touch Duna.
        </p>
      </aside>
    </div>
  );
}
