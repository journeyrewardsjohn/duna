"use client";

import {
  carouselScale,
  cardAccessibleName,
  walletKeyStep,
} from "@duna/tideline-core";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import { cx } from "../base/cx";
import { useReducedMotion } from "../interactions/kit-hooks";
import { MembershipCard } from "./membership-card";
import type { WalletCard } from "./membership-card-types";

export interface WalletCarouselProps {
  cards: ReadonlyArray<WalletCard>;
  /** The selected card (controlled). */
  value: string;
  onChange: (id: string) => void;
  /** The selected card shows its pass. */
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
  /** Names the tablist. */
  label?: string;
  /** The id of the panel the tabs control (the sheet beneath). */
  controls?: string;
  className?: string;
}

/**
 * The carousel: one card centred, neighbours peeking at 94 % from their inner
 * edge, scroll-snap per card, page dots. A tablist: arrows, Home and End move,
 * Enter or Space turns the card over. Touch and trackpad swipe natively; a
 * mouse drags. Tapping the selected card turns it over; tapping a neighbour
 * selects it.
 */
export function WalletCarousel({
  cards,
  value,
  onChange,
  flipped = false,
  onFlip,
  label = "Membership cards",
  controls,
  className,
}: WalletCarouselProps) {
  const reduced = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const tabId = (id: string) => `${base}-tab-${id}`;
  const index = Math.max(
    0,
    cards.findIndex((card) => card.id === value),
  );

  const slots = () => [...(railRef.current?.children ?? [])] as HTMLElement[];

  const scale = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const middle = rail.scrollLeft + rail.clientWidth / 2;
    for (const slot of slots()) {
      const step = slot.offsetWidth + 12 || 1;
      const distance = (slot.offsetLeft + slot.offsetWidth / 2 - middle) / step;
      slot.style.transformOrigin = distance > 0 ? "0% 50%" : "100% 50%";
      slot.style.transform = reduced ? "" : `scale(${carouselScale(distance)})`;
    }
  }, [reduced]);

  const scrollTo = useCallback(
    (id: string, smooth: boolean) => {
      const rail = railRef.current;
      const slot = rail?.querySelector<HTMLElement>(
        `[data-card-id="${CSS.escape(id)}"]`,
      );
      if (!rail || !slot) return;
      rail.scrollTo({
        left: slot.offsetLeft + slot.offsetWidth / 2 - rail.clientWidth / 2,
        behavior: smooth && !reduced ? "smooth" : "instant",
      });
    },
    [reduced],
  );

  // Keep the selected card centred when the value changes from outside.
  const settled = useRef(value);
  useEffect(() => {
    const first = settled.current === value && !railRef.current?.dataset.ready;
    scrollTo(value, !first);
    if (railRef.current) railRef.current.dataset.ready = "true";
    settled.current = value;
    scale();
  }, [value, scrollTo, scale]);

  useEffect(() => {
    const onResize = () => {
      scrollTo(settled.current, false);
      scale();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scrollTo, scale]);

  const nearest = () => {
    const rail = railRef.current;
    if (!rail) return null;
    const middle = rail.scrollLeft + rail.clientWidth / 2;
    let best: HTMLElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slots()) {
      const d = Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - middle);
      if (d < bestDistance) {
        bestDistance = d;
        best = slot;
      }
    }
    return best?.dataset.cardId ?? null;
  };

  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frame = useRef(0);

  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(scale);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (drag.current) return;
      const id = nearest();
      if (id && id !== settled.current) {
        settled.current = id;
        onChange(id);
      }
    }, 120);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      left: railRef.current?.scrollLeft ?? 0,
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const rail = railRef.current;
    if (!current || !rail) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) > 4) {
      current.moved = true;
      rail.dataset.dragging = "true";
      rail.setPointerCapture(event.pointerId);
    }
    if (current.moved) rail.scrollLeft = current.left - dx;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    const rail = railRef.current;
    if (!current?.moved || !rail) return;
    delete rail.dataset.dragging;
    const dx = event.clientX - current.x;
    let id = nearest() ?? value;
    if (id === value && Math.abs(dx) > 40) {
      const next = Math.max(
        0,
        Math.min(cards.length - 1, index + (dx < 0 ? 1 : -1)),
      );
      id = cards[next]!.id;
    }
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
    settled.current = id;
    scrollTo(id, true);
    if (id !== value) onChange(id);
  };

  const select = (id: string, focus: boolean) => {
    settled.current = id;
    if (id !== value) onChange(id);
    scrollTo(id, true);
    if (focus)
      document.getElementById(tabId(id))?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = walletKeyStep(event.key, index, cards.length, "horizontal");
    if (next !== null) {
      event.preventDefault();
      select(cards[next]!.id, true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onFlip?.(!flipped);
    }
  };

  return (
    <div className={cx("td-wcarousel", className)}>
      <div
        aria-label={label}
        aria-orientation="horizontal"
        className="td-wcarousel__rail"
        onKeyDown={onKeyDown}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onScroll={onScroll}
        ref={railRef}
        role="tablist"
      >
        {cards.map((card, i) => {
          const selected = card.id === value;
          return (
            <div
              aria-controls={controls}
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
              className="td-wcarousel__slot"
              data-card-id={card.id}
              id={tabId(card.id)}
              key={card.id}
              onClick={() => {
                if (suppressClick.current) return;
                if (selected) onFlip?.(!flipped);
                else select(card.id, false);
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
            >
              <MembershipCard
                {...card}
                flipped={selected && flipped}
                motion={selected ? "auto" : "still"}
              />
            </div>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div aria-hidden="true" className="td-wcarousel__dots">
          {cards.map((card) => (
            <span
              className="td-wcarousel__dot"
              data-on={card.id === value || undefined}
              key={card.id}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
