"use client";

import { formatMoney, type EventTicketSummary } from "@duna/core";
import { Numeric } from "@duna/ui";
import { ArrowRight, Check, Crown, Minus, Plus, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function ticketBenefits(description?: string) {
  if (!description) return ["Event access included"];
  const parts = description
    .split(/(?:\n|;|\.\s+)/)
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, 4) : [description];
}

function isVipTicket(ticket: EventTicketSummary) {
  return /\b(vip|premium|hospitality|reserved)\b/i.test(
    `${ticket.name} ${ticket.description ?? ""}`,
  );
}

export function EventTicketSelector({
  eventSlug,
  tickets,
}: {
  readonly eventSlug: string;
  readonly tickets: readonly EventTicketSummary[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  return (
    <div className="ticket-selector">
      <div className="ticket-selector__rail">
        {tickets.map((ticketItem, index) => {
          const quantity = quantities[ticketItem.id] ?? 1;
          const max = Math.max(1, Math.min(10, ticketItem.remaining ?? 10));
          const soldOut = ticketItem.remaining === 0;
          const vip = isVipTicket(ticketItem);
          return (
            <article
              className={`ticket-selector__card ticket-selector__card--${(index % 3) + 1}${vip ? " ticket-selector__card--vip" : ""}`}
              key={ticketItem.id}
            >
              <header>
                <span>
                  {vip ? (
                    <Crown aria-hidden size={19} />
                  ) : (
                    <Ticket aria-hidden size={19} />
                  )}
                  {vip
                    ? "VIP access"
                    : `Ticket ${String(index + 1).padStart(2, "0")}`}
                </span>
                <Numeric>
                  {ticketItem.price.amountMinor === 0
                    ? "Free"
                    : formatMoney(
                        ticketItem.price.amountMinor,
                        ticketItem.price.currency,
                      )}
                </Numeric>
              </header>
              <div>
                <h3>{ticketItem.name}</h3>
                <ul>
                  {ticketBenefits(ticketItem.description).map((benefit) => (
                    <li key={benefit}>
                      <Check aria-hidden size={16} /> {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              <small>
                {soldOut && ticketItem.waitlistEnabled
                  ? "Sold out · waitlist open"
                  : vip && ticketItem.remaining !== undefined
                    ? `${ticketItem.remaining} VIP ${ticketItem.remaining === 1 ? "place" : "places"} remaining`
                    : ticketItem.approvalRequired
                      ? "Host approval required"
                      : `${ticketItem.remaining ?? "Unlimited"} available`}
              </small>
              <div className="ticket-selector__quantity">
                <span>
                  <small>Quantity</small>
                  <strong>{quantity}</strong>
                </span>
                <div>
                  <button
                    aria-label={`Remove one ${ticketItem.name} ticket`}
                    disabled={quantity <= 1}
                    onClick={() =>
                      setQuantities((current) => ({
                        ...current,
                        [ticketItem.id]: Math.max(1, quantity - 1),
                      }))
                    }
                    type="button"
                  >
                    <Minus aria-hidden size={17} />
                  </button>
                  <button
                    aria-label={`Add one ${ticketItem.name} ticket`}
                    disabled={quantity >= max}
                    onClick={() =>
                      setQuantities((current) => ({
                        ...current,
                        [ticketItem.id]: Math.min(max, quantity + 1),
                      }))
                    }
                    type="button"
                  >
                    <Plus aria-hidden size={17} />
                  </button>
                </div>
              </div>
              <Link
                aria-disabled={soldOut && !ticketItem.waitlistEnabled}
                href={`/checkout/${eventSlug}?ticket=${ticketItem.id}&quantity=${quantity}`}
              >
                {soldOut && ticketItem.waitlistEnabled
                  ? "Join waitlist"
                  : vip
                    ? "Reserve VIP access"
                    : "Review tickets"}
                <ArrowRight aria-hidden size={16} />
              </Link>
            </article>
          );
        })}
      </div>
      <p className="ticket-selector__hint">
        Review your tickets before creating or signing in to your free Duna
        account.
      </p>
    </div>
  );
}
