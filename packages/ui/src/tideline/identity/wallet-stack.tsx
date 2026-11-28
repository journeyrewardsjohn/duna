"use client";

import {
  cardAccessibleName,
  stackLayout,
  walletKeyStep,
} from "@duna/tideline-core";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button as UiButton } from "@ui-sdk/react/button";
import { cx } from "../base/cx";
import { MembershipCard } from "./membership-card";
import type { WalletCard } from "./membership-card-types";

export type { WalletCard } from "./membership-card-types";

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface WalletStackProps {
  cards: ReadonlyArray<WalletCard>;
  /** The selected card (controlled). */
  value?: string;
  /** The card selected first (uncontrolled). Default: the first card. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** A card is drawn out of the stack (controlled). */
  drawn?: boolean;
  onDrawnChange?: (drawn: boolean) => void;
  /** The drawn card shows its pass. */
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Names the listbox for screen readers. */
  label?: string;
  /** Shown when there are no cards: never an empty frame. */
  empty?: ReactNode;
  className?: string;
}

/**
 * The stack: every card shows a 36 % strip with its own art; the last shows
 * in full. Tap a strip or drag it up to draw it out: it Rises to the top and
 * the rest collapse into a pile beneath. Tap the drawn card to turn it over;
 * drag it down, tap the pile or "Back to stack" to return. A listbox: arrows
 * move, Enter draws or turns over, Escape steps back.
 */
export function WalletStack({
  cards,
  value,
  defaultValue,
  onChange,
  drawn: drawnProp,
  onDrawnChange,
  flipped = false,
  onFlip,
  label = "Membership cards, stacked",
  empty,
  className,
}: WalletStackProps) {
  const [inner, setInner] = useState(defaultValue ?? cards[0]?.id);
  const selectedId = value ?? inner ?? cards[0]?.id;
  const [innerDrawn, setInnerDrawn] = useState(false);
  const drawn = drawnProp ?? innerDrawn;
  const base = useId();
  const optionId = (id: string) => `${base}-opt-${id}`;
  const listRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const pointer = useRef<{
    id: string;
    y: number;
    dy: number;
    moved: boolean;
    el: HTMLElement;
  } | null>(null);

  useIsoLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setCardHeight(list.clientWidth / 1.586);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [cards.length]);

  if (cards.length === 0) {
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

  const index = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId),
  );
  const layout = stackLayout({
    count: cards.length,
    cardHeight: cardHeight || 200,
    drawn: drawn ? index : null,
  });
  const select = (id: string) => {
    if (value === undefined) setInner(id);
    if (id !== selectedId) onChange?.(id);
  };
  const setDrawn = (next: boolean) => {
    if (drawnProp === undefined) setInnerDrawn(next);
    onDrawnChange?.(next);
    if (!next && flipped) onFlip?.(false);
  };
  const draw = (id: string) => {
    select(id);
    setDrawn(true);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    pointer.current = {
      id,
      y: event.clientY,
      dy: 0,
      moved: false,
      el: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = pointer.current;
    if (!current) return;
    current.dy = event.clientY - current.y;
    if (Math.abs(current.dy) > 6) current.moved = true;
    if (!current.moved) return;
    const top = drawn && current.id === selectedId;
    const dy = drawn
      ? top
        ? Math.max(0, current.dy)
        : 0
      : Math.min(0, current.dy) * 0.9;
    current.el.style.setProperty("--td-wstack-drag", `${dy}px`);
    current.el.dataset.dragging = "true";
  };
  const onPointerUp = () => {
    const current = pointer.current;
    pointer.current = null;
    if (!current) return;
    current.el.style.removeProperty("--td-wstack-drag");
    delete current.el.dataset.dragging;
    if (!current.moved) {
      if (!drawn) draw(current.id);
      else if (current.id === selectedId) onFlip?.(!flipped);
      else setDrawn(false);
      return;
    }
    if (!drawn && current.dy < -30) draw(current.id);
    else if (drawn && current.id === selectedId && current.dy > 60)
      setDrawn(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = walletKeyStep(event.key, index, cards.length, "vertical");
    if (next !== null) {
      event.preventDefault();
      if (flipped) onFlip?.(false);
      select(cards[next]!.id);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (drawn) onFlip?.(!flipped);
      else draw(selectedId!);
    } else if (event.key === "Escape" && drawn) {
      event.preventDefault();
      if (flipped) onFlip?.(false);
      else setDrawn(false);
    }
  };

  return (
    <div className={cx("td-wstack", className)} data-drawn={drawn || undefined}>
      <div
        aria-activedescendant={optionId(selectedId!)}
        aria-label={label}
        className="td-wstack__list"
        onKeyDown={onKeyDown}
        ref={listRef}
        role="listbox"
        style={
          { height: cardHeight ? layout.height : undefined } as CSSProperties
        }
        tabIndex={0}
      >
        {cards.map((card, i) => {
          const slot = layout.slots[i]!;
          const selected = card.id === selectedId;
          return (
            <div
              aria-label={cardAccessibleName({
                club: card.club.name,
                ...(card.plan ? { plan: card.plan } : {}),
                member: card.member,
                ...(card.heldBy ? { heldBy: card.heldBy } : {}),
                status: card.status,
                ...(card.statusText ? { statusText: card.statusText } : {}),
                fact: card.fact ?? null,
                index: i,
                total: cards.length,
              })}
              aria-selected={selected}
              className="td-wstack__item"
              data-card-id={card.id}
              data-selected={selected || undefined}
              id={optionId(card.id)}
              key={card.id}
              onPointerCancel={onPointerUp}
              onPointerDown={(event) => onPointerDown(event, card.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              role="option"
              style={
                {
                  "--td-wstack-y": `${slot.y}px`,
                  "--td-wstack-scale": slot.scale,
                  zIndex: slot.z,
                } as CSSProperties
              }
            >
              <MembershipCard
                {...card}
                flipped={drawn && selected && flipped}
                motion={drawn && selected ? "auto" : "still"}
              />
            </div>
          );
        })}
      </div>
      <div className="td-wstack__foot">
        <span className="td-wallet__caption">
          {drawn
            ? flipped
              ? "Tap again for the card"
              : "Tap the card for your pass"
            : `${cards.length} cards · draw one out`}
        </span>
        {drawn ? (
          <UiButton className="td-wstack__back" onClick={() => setDrawn(false)}>
            Back to stack
          </UiButton>
        ) : null}
      </div>
    </div>
  );
}
