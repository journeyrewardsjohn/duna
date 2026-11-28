"use client";

import {
  CLUB_COLOUR_ART,
  DUNA_ART_SET,
  type CardArtSource,
} from "@duna/tideline-core";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { CardArt } from "./card-art";
import { MembershipCard } from "./membership-card";
import type { MembershipCardProps } from "./membership-card-types";

export interface CardArrivalProps {
  /** The card that was just bought, with the person's name on it. */
  card: MembershipCardProps;
  /** "Welcome to Saltline": the moment's one Jost title. */
  title: string;
  /** "Your annual card is in your wallet. Your pass works from today." */
  text: ReactNode;
  /** "Open my wallet", and a wallet-pass link where one exists. */
  actions?: ReactNode;
  /** Replays the moment when it changes (the gallery's replay button). */
  playKey?: string | number;
  className?: string;
}

/**
 * The purchase moment (spec §6): a Dune line draws from the centre (450 ms),
 * the card Rises out of it (700 ms, clip from the line and a 22 px lift) with
 * its loop already playing, then the title, the line and the actions Rally in.
 * Under reduced motion it is the finished frame with a 200 ms fade.
 */
export function CardArrival({
  card,
  title,
  text,
  actions,
  playKey,
  className,
}: CardArrivalProps) {
  const [phase, setPhase] = useState<"start" | "play">("start");
  const titleId = useId();
  useEffect(() => {
    setPhase("start");
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPhase("play"));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [playKey]);
  return (
    <div
      aria-labelledby={titleId}
      className={cx("td-arrival", className)}
      data-phase={phase}
      role="group"
    >
      <div className="td-arrival__stage">
        <span aria-hidden="true" className="td-arrival__line" />
        <div className="td-arrival__riser">
          <MembershipCard {...card} motion={card.motion ?? "auto"} />
        </div>
      </div>
      <div className="td-arrival__text">
        <h2 className="td-arrival__title" id={titleId}>
          {title}
        </h2>
        <p className="td-arrival__line-text">{text}</p>
        {actions ? <div className="td-arrival__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface CardArtPickerProps {
  value: CardArtSource;
  onChange: (art: CardArtSource) => void;
  /** Offers "Club colour" art derived from this colour. */
  clubColor?: string | null;
  label?: string;
  className?: string;
}

const same = (a: CardArtSource, b: CardArtSource) =>
  a.source === b.source &&
  (a.source === "set" && b.source === "set" ? a.key === b.key : true);

/**
 * The art picker (the HQ card designer's first tab): the Duna art set and,
 * when the club has a colour, art derived from it. A radio group; arrows move.
 */
export function CardArtPicker({
  value,
  onChange,
  clubColor,
  label = "Card art",
  className,
}: CardArtPickerProps) {
  const options: { art: CardArtSource; name: string }[] = [
    ...(clubColor
      ? [
          {
            art: { source: "colour", color: clubColor } as CardArtSource,
            name: CLUB_COLOUR_ART.name,
          },
        ]
      : []),
    ...DUNA_ART_SET.map((piece) => ({
      art: { source: "set", key: piece.key } as CardArtSource,
      name: piece.name,
    })),
  ];
  const groupRef = useRef<HTMLDivElement>(null);
  const current = Math.max(
    0,
    options.findIndex((option) => same(option.art, value)),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (current + step + options.length) % options.length;
    onChange(options[next]!.art);
    const radios =
      groupRef.current?.querySelectorAll<HTMLElement>("[role=radio]");
    radios?.[next]?.focus();
  };
  return (
    <div
      aria-label={label}
      className={cx("td-artpicker", className)}
      onKeyDown={onKeyDown}
      ref={groupRef}
      role="radiogroup"
    >
      {options.map((option, index) => {
        const checked = index === current;
        return (
          <span
            aria-checked={checked}
            className="td-artpicker__option"
            key={option.name}
            onClick={() => onChange(option.art)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onChange(option.art);
              }
            }}
            role="radio"
            tabIndex={checked ? 0 : -1}
          >
            <span className="td-artpicker__swatch">
              <CardArt art={option.art} />
            </span>
            <span className="td-artpicker__name">{option.name}</span>
          </span>
        );
      })}
    </div>
  );
}
