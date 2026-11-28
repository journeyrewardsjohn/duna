"use client";

import type { CSSProperties } from "react";
import {
  calculateBooking,
  DEFAULT_CALCULATOR_INPUT,
  money,
} from "../pricing/pricing-data";
import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

/**
 * One booking's path to the bank, as the payout policy has it (Duna Pay
 * Terms §6 and §8, docs/money/duna-pay.md): money is released once the
 * payment has settled and the session has taken place, then paid out within
 * three business days on the daily schedule. The weekdays are an example;
 * the amounts are the real fee composition for an example $40 booking on
 * the Free plan, paid by card.
 */
const STEPS = [
  { day: "Mon", what: "Booked and paid", note: "By card, in the app" },
  {
    day: "Wed",
    what: "Payment settled",
    note: "Cards usually settle in about 2 business days",
  },
  {
    day: "Thu",
    what: "Session played",
    note: "6:00 PM · now it can be released",
  },
  {
    day: "By Tue",
    what: "Paid out to the club",
    note: "Within 3 business days, daily schedule",
  },
] as const;

export function ConceptPayout({
  label = "Duna Pay",
  className,
}: {
  readonly label?: string;
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  const booking = calculateBooking(DEFAULT_CALCULATOR_INPUT);
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className ? `site-concept-payout ${className}` : "site-concept-payout"
        }
        data-phase={phase}
        example
        label={label}
        status="On schedule"
      >
        <ol className="site-payout">
          {STEPS.map((step, index) => (
            <li
              data-secondary={index === 1 ? "" : undefined}
              key={step.what}
              style={{ "--i": index } as CSSProperties}
            >
              <span className="td-num site-payout__day">{step.day}</span>
              <span className="site-payout__what">
                <b>{step.what}</b>
                <span>{step.note}</span>
              </span>
            </li>
          ))}
        </ol>
        <dl className="site-stats">
          <div>
            <dt>Booking</dt>
            <dd className="td-num">{money(booking.bookingMinor)}</dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd className="td-num">
              {money(booking.organizationFeeMinor + booking.processingMinor)}
            </dd>
          </div>
          <div>
            <dt>Paid out</dt>
            <dd className="td-num">{money(booking.paidOutMinor)}</dd>
          </div>
        </dl>
      </GlassCard>
    </div>
  );
}
