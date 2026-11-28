"use client";

import { Icon, Segmented } from "@duna/ui/tideline";
import { useState } from "react";
import { LinkButton } from "../link-button";
import { clubSignupHref, siteLinks } from "../links";
import {
  clubPlanCards,
  dollars,
  type PlanCardModel,
  playerPlanCards,
  yearlySavingMinor,
} from "./pricing-data";

type Interval = "month" | "year";

function PlanCard({
  card,
  interval,
}: {
  readonly card: PlanCardModel;
  readonly interval: Interval;
}) {
  const free = card.monthlyMinor === 0 && card.annualMinor === 0;
  const primary = interval === "month" ? card.monthlyMinor : card.annualMinor;
  const saving = yearlySavingMinor(card);
  const href =
    card.audience === "clubs"
      ? clubSignupHref(card.id, interval, "pricing")
      : card.cta.href;
  return (
    <article
      aria-labelledby={`plan-${card.id}`}
      className="site-price-card"
      data-featured={card.featured ? "" : undefined}
      data-plan={card.id}
    >
      <header className="site-price-card__head">
        <h3 className="site-h3" id={`plan-${card.id}`}>
          {card.name}
        </h3>
      </header>
      <p className="site-price-card__price">
        <span className="td-num" data-testid={`price-${card.id}`}>
          {dollars(primary)}
        </span>
        <span className="site-meta">
          {free ? "forever" : interval === "month" ? "a month" : "a year"}
        </span>
      </p>
      <p className="site-meta site-price-card__alt">
        {free
          ? "No monthly fee"
          : interval === "month"
            ? `or ${dollars(card.annualMinor)} a year${saving > 0 ? `, saving ${dollars(saving)}` : ""}`
            : `or ${dollars(card.monthlyMinor)} a month`}
      </p>
      <p className="site-price-card__fee" data-testid={`fee-${card.id}`}>
        {card.feeLine}
      </p>
      <p className="site-body">{card.tagline}</p>
      <ul className="site-price-card__list">
        {card.inclusions.map((item) => (
          <li key={item}>
            <Icon name="check" size="inline" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <LinkButton
        block
        href={href}
        variant={card.featured ? "primary" : "secondary"}
      >
        {card.cta.label}
      </LinkButton>
    </article>
  );
}

/**
 * The plan cards for both audiences, from the plan tables in code. Both
 * groups are always on the page (each with its own heading), so nothing is
 * hidden from a visitor without script; the Monthly / Yearly switch changes
 * which price leads, and the other is always written underneath.
 */
export function PlanCards() {
  const [interval, setInterval] = useState<Interval>("month");
  const clubs = clubPlanCards((id) => clubSignupHref(id));
  const players = playerPlanCards(siteLinks.premium, siteLinks.signUp);
  return (
    <div className="site-price-groups">
      <div className="site-price-switches">
        <nav aria-label="Plans for" className="site-price-jump">
          <a href="#plans-clubs">Clubs and coaches</a>
          <a href="#plans-players">Players</a>
        </nav>
        <Segmented
          aria-label="Billing period"
          onValueChange={(value) => setInterval(value as Interval)}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
          value={interval}
        />
      </div>
      <section
        aria-labelledby="plans-clubs-title"
        className="site-price-group"
        id="plans-clubs"
      >
        <div className="site-price-group__head">
          <h2 className="site-h2" id="plans-clubs-title">
            Clubs and coaches
          </h2>
          <p className="site-body">
            Every plan has every feature. A bigger plan costs more a month and
            takes a smaller fee on what you sell.
          </p>
        </div>
        <div className="site-price-cards" aria-live="polite">
          {clubs.map((card) => (
            <PlanCard card={card} interval={interval} key={card.id} />
          ))}
        </div>
      </section>
      <section
        aria-labelledby="plans-players-title"
        className="site-price-group"
        id="plans-players"
      >
        <div className="site-price-group__head">
          <h2 className="site-h2" id="plans-players-title">
            Players
          </h2>
          <p className="site-body">
            Finding games, booking, keeping score and your Sand Rating are free.
            Premium takes the service fee off your bookings and adds video.
          </p>
        </div>
        <div className="site-price-cards" aria-live="polite">
          {players.map((card) => (
            <PlanCard card={card} interval={interval} key={card.id} />
          ))}
        </div>
      </section>
    </div>
  );
}
