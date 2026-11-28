"use client";

import { MEMBERSHIP_STATUS_TEXT } from "@duna/tideline-core";
import { Button as UiButton } from "@ui-sdk/react/button";
import { type ReactNode, useState } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { rallyStyle, riseClassName } from "../motion/verbs";
import { ClubMark } from "./club-mark";
import {
  MembershipCard,
  MembershipStatusChip,
  type MembershipCardProps,
} from "./membership-card";

export interface WalletCard extends Omit<
  MembershipCardProps,
  "compact" | "rise"
> {
  id: string;
}

export interface WalletStackProps {
  cards: ReadonlyArray<WalletCard>;
  /** The open card (controlled). */
  value?: string;
  /** The card open first (uncontrolled). Default: the first card. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Names the group for screen readers. */
  label?: string;
  /** Shown when there are no cards: never an empty frame. */
  empty?: ReactNode;
  className?: string;
}

/**
 * The wallet: the open card on top, every other card as a 64 px strip below
 * it (a button that opens that card). The newly opened card Rises; the
 * strips Rally in on first render only.
 */
export function WalletStack({
  cards,
  value,
  defaultValue,
  onChange,
  label = "Membership cards",
  empty,
  className,
}: WalletStackProps) {
  const [inner, setInner] = useState(defaultValue ?? cards[0]?.id);
  const openId = value ?? inner;
  const open = cards.find((card) => card.id === openId) ?? cards[0];
  if (!open) {
    return (
      <div className={cx("td-wallet td-wallet--empty", className)}>
        {empty ?? (
          <p className="td-wallet__empty">
            No club cards yet. A card appears here when a club adds you.
          </p>
        )}
      </div>
    );
  }
  const rest = cards.filter((card) => card.id !== open.id);
  const choose = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  return (
    <section aria-label={label} className={cx("td-wallet", className)}>
      <MembershipCard key={open.id} {...open} />
      {rest.length > 0 ? (
        <ul className="td-wallet__strips">
          {rest.map((card, index) => (
            <li
              className={riseClassName()}
              key={card.id}
              style={rallyStyle(index)}
            >
              <UiButton
                aria-label={`Open ${card.club.name} card, ${(
                  card.statusText ?? MEMBERSHIP_STATUS_TEXT[card.status]
                ).toLowerCase()}`}
                className="td-wallet__strip"
                data-status={card.status}
                onClick={() => choose(card.id)}
              >
                <ClubMark {...card.club} decorative size="md" />
                <span className="td-mcard__striptext">
                  <span className="td-mcard__club">{card.club.name}</span>
                  <span className="td-mcard__plan">
                    {card.plan ?? card.kind ?? ""}
                  </span>
                </span>
                <MembershipStatusChip
                  status={card.status}
                  text={card.statusText}
                />
                <Icon name="chevron-right" size="inline" />
              </UiButton>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
