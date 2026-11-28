"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cx } from "../base/cx";

export interface CardFlipProps {
  /** Shows the back. */
  flipped: boolean;
  front: ReactNode;
  /** Rendered once the card has turned over the first time. */
  back: ReactNode;
  className?: string;
}

/**
 * Turns a card over: 620 ms on the Rise curve round the vertical axis, with
 * perspective; under reduced motion a 200 ms cross-fade. The hidden face is
 * inert and hidden from screen readers.
 */
export function CardFlip({ flipped, front, back, className }: CardFlipProps) {
  const [everFlipped, setEverFlipped] = useState(flipped);
  useEffect(() => {
    if (flipped) setEverFlipped(true);
  }, [flipped]);
  return (
    <span
      className={cx("td-cardflip", className)}
      data-flipped={flipped || undefined}
    >
      <span className="td-cardflip__inner">
        <span
          aria-hidden={flipped || undefined}
          className="td-cardflip__face td-cardflip__front"
          inert={flipped || undefined}
        >
          {front}
        </span>
        <span
          aria-hidden={!flipped || undefined}
          className="td-cardflip__face td-cardflip__back"
          inert={!flipped || undefined}
        >
          {everFlipped || flipped ? back : null}
        </span>
      </span>
    </span>
  );
}
