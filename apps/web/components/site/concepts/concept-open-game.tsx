"use client";

import { Avatar } from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import { GlassCard } from "../glass-card";
import { type PlayPhase, usePlayOnce } from "../use-play-once";

/** The example session (demo data, labelled on the card). */
const PLAYERS = ["Kai Arden", "Rio Imani", "Noa Ortiz", "Sam Ahn"] as const;
const CAPACITY = 4;
const PRICE_PER_PLAYER = 12;
/** How many players are in before the two late joins. */
const OPENING_FILLED = 2;
/** When the two late joins arrive after the card starts playing. */
const JOIN_AT_MS = [500, 1700] as const;

function statusText(filled: number) {
  const needs = CAPACITY - filled;
  return needs > 0 ? `Needs ${needs} more` : "Confirmed";
}

interface ConceptOpenGameProps {
  /** `club` is the same game from the club's side: what it has collected. */
  readonly view?: "player" | "club";
  readonly trigger?: "in-view" | "driven";
  readonly phase?: PlayPhase;
  readonly className?: string;
}

function Card({
  view,
  phase,
  className,
}: {
  readonly view: "player" | "club";
  readonly phase: PlayPhase;
  readonly className?: string;
}) {
  const [filled, setFilled] = useState(
    phase === "rest" ? CAPACITY : OPENING_FILLED,
  );
  useEffect(() => {
    if (phase !== "play") return;
    const timers = JOIN_AT_MS.map((delay, index) =>
      window.setTimeout(() => setFilled(OPENING_FILLED + index + 1), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [phase]);
  const collected = filled * PRICE_PER_PLAYER;
  return (
    <GlassCard
      className={
        className ? `site-concept-game ${className}` : "site-concept-game"
      }
      example
      label={view === "club" ? "Club view" : "Open game"}
      status={statusText(filled)}
    >
      <div>
        <p className="site-concept-game__title">
          Tue · <span className="td-num">6:00 PM</span> · Pier Courts
        </p>
        <p className="site-meta">
          Level 3.0 to 3.5 · Doubles · confirms Mon{" "}
          <span className="td-num">6:00 PM</span>
        </p>
      </div>
      <ul
        aria-label={`${filled} of ${CAPACITY} players in`}
        className="site-faces"
      >
        {PLAYERS.map((name, index) =>
          index < filled ? (
            <li
              className={
                index >= OPENING_FILLED && phase === "play"
                  ? "site-faces__in td-rise td-rise--short"
                  : "site-faces__in"
              }
              key={name}
            >
              <Avatar name={name} size="md" />
            </li>
          ) : (
            <li className="site-faces__open" key={name}>
              <span className="td-sr">Open spot</span>
            </li>
          ),
        )}
      </ul>
      <div aria-hidden="true" className="site-bar">
        <i style={{ transform: `scaleX(${filled / CAPACITY})` }} />
      </div>
      {view === "club" ? (
        <dl className="site-stats">
          <div>
            <dt>Players</dt>
            <dd className="td-num">
              {filled}/{CAPACITY}
            </dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd className="td-num">${collected}</dd>
          </div>
          <div>
            <dt>Min to run</dt>
            <dd className="td-num">{CAPACITY}</dd>
          </div>
        </dl>
      ) : (
        <div className="site-concept-game__foot">
          <span className="td-num site-concept-game__price">
            ${PRICE_PER_PLAYER}
          </span>
          <span className="site-concept-game__join">Join</span>
        </div>
      )}
    </GlassCard>
  );
}

function InView({
  view,
  className,
}: {
  readonly view: "player" | "club";
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Card
        className={className}
        key={phase === "rest" ? "rest" : "live"}
        phase={phase}
        view={view}
      />
    </div>
  );
}

/**
 * An open game that "needs 2 more": two players Rise into the empty slots
 * (120 ms apart in spirit, 1.2 s apart in time so each join reads), the
 * status turns to "Needs 1 more" and then "Confirmed", the bar fills. The
 * club view adds what has been collected.
 */
export function ConceptOpenGame({
  view = "player",
  trigger = "in-view",
  phase = "rest",
  className,
}: ConceptOpenGameProps) {
  if (trigger === "driven") {
    return (
      <Card
        className={className}
        key={phase === "rest" ? "rest" : "live"}
        phase={phase}
        view={view}
      />
    );
  }
  return <InView className={className} view={view} />;
}
