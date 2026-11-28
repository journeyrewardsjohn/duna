"use client";

import { NetScore } from "@duna/ui/tideline";
import { useEffect, useReducer, useRef } from "react";
import { GlassCard } from "../glass-card";
import { type PlayPhase, usePlayOnce } from "../use-play-once";

type Side = "home" | "away";

interface ScoreState {
  readonly home: number;
  readonly away: number;
  readonly serving: Side;
  /** Set number in play (set 1 is done). */
  readonly set: 2 | 3;
  readonly log: string;
}

const TEAMS = ["Kai / Rio", "Noa / Sam"] as const;
const FIRST_SET = [21, 17] as const;
/** Where the example opens, and the four rallies it plays (1.4 s apart). */
const OPENING: ScoreState = {
  home: 18,
  away: 16,
  serving: "home",
  set: 2,
  log: "Side out · Rio serving",
};
const RALLIES: readonly Side[] = ["home", "away", "home", "home"];
export const RALLY_INTERVAL_MS = 1400;

function setWon(state: ScoreState) {
  const target = state.set === 3 ? 15 : 21;
  const high = Math.max(state.home, state.away);
  return high >= target && Math.abs(state.home - state.away) >= 2;
}

type Action = { type: "point"; side: Side } | { type: "next-set" };

function reduce(state: ScoreState, action: Action): ScoreState {
  if (action.type === "next-set") {
    return { home: 0, away: 0, serving: "home", set: 3, log: "Set 3 · to 15" };
  }
  if (setWon(state)) return state;
  const next = {
    ...state,
    [action.side]: state[action.side] + 1,
    serving: action.side,
  };
  const name = action.side === "home" ? TEAMS[0] : TEAMS[1];
  const done = setWon(next);
  return {
    ...next,
    log: done
      ? `Set won by ${name}, ${Math.max(next.home, next.away)}–${Math.min(next.home, next.away)}`
      : `${name} point · ${next.home}–${next.away}`,
  };
}

/** The end of the four rallies: what reduced motion and no script show. */
export const SCORE_END_STATE = RALLIES.reduce(
  (state, side) => reduce(state, { type: "point", side }),
  OPENING,
);

function useScoreConcept(phase: PlayPhase) {
  const [state, dispatch] = useReducer(
    reduce,
    phase === "rest" ? SCORE_END_STATE : OPENING,
  );
  const touched = useRef(false);
  useEffect(() => {
    if (phase !== "play") return;
    let index = 0;
    const timer = window.setInterval(() => {
      if (touched.current || index >= RALLIES.length) {
        window.clearInterval(timer);
        return;
      }
      dispatch({ type: "point", side: RALLIES[index]! });
      index += 1;
    }, RALLY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);
  const point = (side: Side) => {
    touched.current = true;
    dispatch({ type: "point", side });
  };
  return { state, point, nextSet: () => dispatch({ type: "next-set" }) };
}

interface ConceptScoreProps {
  readonly trigger?: "in-view" | "driven";
  readonly phase?: PlayPhase;
  readonly className?: string;
}

function Board({
  phase,
  className,
}: {
  readonly phase: PlayPhase;
  readonly className?: string;
}) {
  const { state, point, nextSet } = useScoreConcept(phase);
  const over = setWon(state);
  const sets =
    state.set === 3
      ? [FIRST_SET, [17, 21] as const, [state.home, state.away] as const]
      : [FIRST_SET, [state.home, state.away] as const];
  return (
    <GlassCard
      className={
        className ? `site-concept-score ${className}` : "site-concept-score"
      }
      example
      label={`Set ${state.set} · to ${state.set === 3 ? 15 : 21}`}
      status="Scoring"
    >
      {/* NetScore draws the in-progress score; its Live chip is hidden here
          because a self-kept score is not a live broadcast (spec 2.4: the
          Live chip appears only on the Pro Tour). */}
      <NetScore
        announce={false}
        bestOf={3}
        layout="net"
        liveZone={false}
        serving={state.serving}
        sets={sets}
        size="sm"
        status="live"
        teams={TEAMS}
      />
      <div className="site-concept-score__actions">
        {over ? (
          <button onClick={nextSet} type="button">
            Start set 3
          </button>
        ) : (
          <>
            <button onClick={() => point("home")} type="button">
              Point {TEAMS[0]}
            </button>
            <button onClick={() => point("away")} type="button">
              Point {TEAMS[1]}
            </button>
          </>
        )}
      </div>
      <p aria-live="polite" className="site-meta">
        {state.log}
      </p>
    </GlassCard>
  );
}

function InView({ className }: { readonly className?: string }) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Board
        className={className}
        key={phase === "rest" ? "rest" : "live"}
        phase={phase}
      />
    </div>
  );
}

/**
 * The scorekeeper: the kit's NetScore with two working point buttons. It
 * plays four rallies 1.4 s apart once in view and stops at set point; a tap
 * takes over. Reduced motion shows the end of those rallies.
 */
export function ConceptScore({
  trigger = "in-view",
  phase = "rest",
  className,
}: ConceptScoreProps) {
  if (trigger === "driven") {
    return (
      <Board
        className={className}
        key={phase === "rest" ? "rest" : "live"}
        phase={phase === "play" ? "play" : "rest"}
      />
    );
  }
  return <InView className={className} />;
}
