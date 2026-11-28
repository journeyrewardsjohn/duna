"use client";

import {
  CARD_STATUS_WORDS,
  walletPresentation,
  type WalletPresentation,
} from "@duna/tideline-core";
import { Button as UiButton } from "@ui-sdk/react/button";
import { type ReactNode, useEffect, useId, useState } from "react";
import { cx } from "../base/cx";
import { Icon, type IconName } from "../base/icons";
import type { WalletCard } from "./membership-card-types";
import { WalletCarousel } from "./wallet-carousel";
import { WalletStack } from "./wallet-stack";

const PRESENTATION_KEY = "duna.wallet.presentation";

function readPresentation(): WalletPresentation | null {
  try {
    const stored = window.localStorage.getItem(PRESENTATION_KEY);
    return stored === "carousel" || stored === "stack" ? stored : null;
  } catch {
    return null;
  }
}

function writePresentation(value: WalletPresentation) {
  try {
    window.localStorage.setItem(PRESENTATION_KEY, value);
  } catch {
    // Private windows and blocked storage: the choice lasts this visit.
  }
}

export interface WalletProps {
  cards: ReadonlyArray<WalletCard>;
  /** The selected card (controlled). */
  value?: string;
  /** The card selected first (uncontrolled). Default: the first card. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** `auto`: carousel up to six cards, stack from seven; the person can switch. */
  presentation?: "auto" | WalletPresentation;
  onPresentationChange?: (presentation: WalletPresentation) => void;
  /** Remember the person's carousel / stack choice on this device. Default on. */
  rememberPresentation?: boolean;
  /** The selected card shows its pass (controlled). */
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** The band's title (the screen's one Jost title, or a smaller heading). */
  title?: ReactNode;
  /** Extra buttons in the band's bar (add a card, order). */
  toolbar?: ReactNode;
  /** A one-line notice under the bar. */
  notice?: ReactNode;
  /** The four actions under the card (`WalletActions`). */
  actions?: ReactNode;
  /** The sheet for the selected card. */
  children?: ReactNode;
  /** Shown instead of the cards when there are none: title, line, one action. */
  empty?: ReactNode;
  /** `split` puts the band beside the sheet; `auto` splits from 860 px of width. */
  layout?: "auto" | "compact" | "split";
  /** Names the cards for screen readers. */
  label?: string;
  className?: string;
}

/**
 * The wallet (docs/design/wallet.md §3): a Night Court band holding the
 * cards, as a carousel (up to six) or a stack (seven or more, or by choice),
 * the four actions, and the selected card's sheet beneath (or beside, on wide
 * screens). Turning the card over shows its pass; the flip is announced.
 */
export function Wallet({
  cards,
  value,
  defaultValue,
  onChange,
  presentation: preference = "auto",
  onPresentationChange,
  rememberPresentation = true,
  flipped: flippedProp,
  onFlip,
  title,
  toolbar,
  notice,
  actions,
  children,
  empty,
  layout = "auto",
  label = "Membership cards",
  className,
}: WalletProps) {
  const [inner, setInner] = useState(defaultValue ?? cards[0]?.id);
  const selectedId =
    (value ?? inner) && cards.some((card) => card.id === (value ?? inner))
      ? (value ?? inner)!
      : cards[0]?.id;
  const selected = cards.find((card) => card.id === selectedId);
  const [innerFlipped, setInnerFlipped] = useState(false);
  const flipped = flippedProp ?? innerFlipped;
  const [chosen, setChosen] = useState<WalletPresentation | null>(null);
  const [drawn, setDrawn] = useState(false);
  const sheetId = useId();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (rememberPresentation && preference === "auto")
      setChosen(readPresentation());
  }, [rememberPresentation, preference]);

  const { presentation, canSwitch } = walletPresentation(
    cards.length,
    preference === "auto" ? (chosen ?? "auto") : preference,
  );

  const flip = (next: boolean) => {
    if (flippedProp === undefined) setInnerFlipped(next);
    onFlip?.(next);
    if (!selected) return;
    setAnnouncement(
      next
        ? `Showing ${selected.club.name} pass. ${
            selected.status === "pending"
              ? "No pass yet."
              : selected.status === "expired"
                ? "Membership ended."
                : `${selected.member}, ${CARD_STATUS_WORDS[selected.status].toLowerCase()}${
                    selected.number ? `, number ${selected.number}` : ""
                  }.`
          }`
        : `${selected.club.name} card`,
    );
  };
  const choose = (id: string) => {
    if (id === selectedId) return;
    if (flipped) flip(false);
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const switchTo = (next: WalletPresentation) => {
    setChosen(next);
    if (flipped) flip(false);
    setDrawn(false);
    if (rememberPresentation) writePresentation(next);
    onPresentationChange?.(next);
  };

  const switchIcon: IconName =
    presentation === "stack" ? "layout" : "member-card";

  return (
    <div
      className={cx("td-walletv", className)}
      data-empty={cards.length === 0 || undefined}
      data-layout={layout}
      data-presentation={presentation}
    >
      <div className="td-walletv__layout">
        <section aria-label={label} className="td-walletv__band">
          {title || toolbar || canSwitch ? (
            <div className="td-walletv__bar">
              <div className="td-walletv__title">{title}</div>
              {canSwitch ? (
                <UiButton
                  aria-label={
                    presentation === "stack"
                      ? "Show the cards side by side"
                      : "Stack the cards"
                  }
                  className="td-walletv__icon"
                  onClick={() =>
                    switchTo(presentation === "stack" ? "carousel" : "stack")
                  }
                  title={
                    presentation === "stack"
                      ? "Side by side"
                      : "Stack the cards"
                  }
                >
                  <Icon name={switchIcon} size="control" />
                </UiButton>
              ) : null}
              {toolbar}
            </div>
          ) : null}
          {notice ? <div className="td-walletv__notice">{notice}</div> : null}
          {cards.length === 0 ? (
            <div className="td-walletv__empty">{empty}</div>
          ) : presentation === "carousel" ? (
            <>
              <WalletCarousel
                cards={cards}
                controls={children ? sheetId : undefined}
                flipped={flipped}
                label={label}
                onChange={choose}
                onFlip={flip}
                value={selectedId!}
              />
              <p className="td-wallet__caption">
                {flipped
                  ? "Tap again for the card"
                  : "Tap the card to show your pass"}
              </p>
            </>
          ) : (
            <WalletStack
              cards={cards}
              drawn={drawn}
              flipped={flipped}
              label={`${label}, stacked`}
              onChange={choose}
              onDrawnChange={setDrawn}
              onFlip={flip}
              value={selectedId!}
            />
          )}
          {actions && cards.length > 0 ? (
            <div className="td-walletv__actions">{actions}</div>
          ) : null}
          <span aria-live="polite" className="td-sr" role="status">
            {announcement}
          </span>
        </section>
        {children && cards.length > 0 ? (
          <div
            aria-label={selected ? `${selected.club.name} details` : undefined}
            className="td-walletv__sheet"
            id={sheetId}
            role={presentation === "carousel" ? "tabpanel" : "region"}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface WalletActionItem {
  key: string;
  label: string;
  icon: IconName;
  /** Runs the action (Show pass turns the card over). */
  onClick?: () => void;
  /** Goes somewhere (Book opens booking at the club). */
  href?: string;
  /** A toggle that is on (Show pass while the pass shows). */
  pressed?: boolean;
  /** Unavailable for this card; `reason` says why. */
  disabled?: boolean;
  reason?: string;
}

/**
 * The four actions under the selected card: 48 px circles with a label on the
 * band. Links stay links; a disabled action keeps its place and says why.
 */
export function WalletActions({
  items,
  label = "Card actions",
}: {
  items: ReadonlyArray<WalletActionItem>;
  label?: string;
}) {
  return (
    <div aria-label={label} className="td-wactions" role="group">
      {items.map((item) => {
        const body = (
          <>
            <span aria-hidden="true" className="td-waction__circle">
              <Icon name={item.icon} size="control" />
            </span>
            <span className="td-waction__label">{item.label}</span>
          </>
        );
        if (item.href && !item.disabled)
          return (
            <a className="td-waction" href={item.href} key={item.key}>
              {body}
            </a>
          );
        return (
          <UiButton
            aria-pressed={item.pressed}
            className="td-waction"
            disabled={item.disabled}
            focusableWhenDisabled={item.disabled}
            key={item.key}
            onClick={item.onClick}
            title={item.disabled ? item.reason : undefined}
          >
            {body}
            {item.disabled && item.reason ? (
              <span className="td-sr">{item.reason}</span>
            ) : null}
          </UiButton>
        );
      })}
    </div>
  );
}
