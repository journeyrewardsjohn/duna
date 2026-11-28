import {
  scoreAnnouncement,
  type NetScoreState,
  type ScoreEventPart,
  type Side,
} from "@duna/tideline-core/score";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { Numerals, type NumeralsProps } from "../type/Numerals";
import { useHaptics } from "./haptics";
import { useReducedMotion } from "./reduced-motion";
import { Rise } from "./Rise";
import { verbTiming } from "./timing";

type Names = { readonly home: string; readonly away: string };

/** English for a screen reader, from `scoreAnnouncement` parts. Pure. */
export function describeScoreParts(
  parts: readonly ScoreEventPart[],
  names: Names = { home: "Home", away: "Away" },
): string {
  const name = (side: Side) => names[side];
  return parts
    .map((part) => {
      switch (part.kind) {
        case "point":
          return part.points === 1
            ? `Point ${name(part.side)}`
            : `${part.points} points ${name(part.side)}`;
        case "set-won":
          return `${name(part.side)} win set ${part.setNumber}`;
        case "match-won":
          return part.provisional
            ? `${name(part.side)} win, pending verification`
            : `${name(part.side)} win the match`;
        case "serve-change":
          return `${name(part.side)} to serve`;
        case "match-point":
          return `Match point ${name(part.side)}`;
        case "set-point":
          return `Set point ${name(part.side)}`;
        case "correction":
          return "Score corrected";
      }
    })
    .join(". ");
}

export interface ScoreChange {
  /** The parts of the last change (empty before the first). */
  readonly parts: readonly ScoreEventPart[];
  /** Increments on every change, to key animations. */
  readonly sequence: number;
}

/**
 * Watches a score state: on each change it announces the parts to screen
 * readers, gives one light haptic per side that scored (never for a
 * correction), and returns the parts so a renderer can animate them. All
 * three come from `@duna/tideline-core`'s `scoreAnnouncement`.
 */
export function useScoreChange(
  state: NetScoreState,
  {
    names,
    announce = true,
    haptics = true,
  }: {
    readonly names?: Names;
    readonly announce?: boolean;
    readonly haptics?: boolean;
  } = {},
): ScoreChange {
  const previous = useRef(state);
  const feedback = useHaptics();
  const [change, setChange] = useState<ScoreChange>({
    parts: [],
    sequence: 0,
  });

  useEffect(() => {
    if (previous.current === state) return;
    const parts = scoreAnnouncement(previous.current, state);
    previous.current = state;
    if (parts.length === 0) return;
    if (announce) {
      AccessibilityInfo.announceForAccessibility(
        describeScoreParts(parts, names),
      );
    }
    if (haptics && parts.some((part) => part.kind === "point")) {
      feedback.pointScored();
    }
    setChange((last) => ({ parts, sequence: last.sequence + 1 }));
  }, [announce, feedback, haptics, names, state]);

  return change;
}

/**
 * A score number whose changed digits Rise in a Rally from the net line when
 * the value changes (the first render is still). Reduced motion: a fade.
 */
export function ScoreNumerals({
  value,
  ...props
}: Omit<NumeralsProps, "children"> & { readonly value: number | string }) {
  const reduceMotion = useReducedMotion();
  const text = String(value);
  const previous = useRef(text);
  const mounted = useRef(false);
  const before = previous.current;
  useEffect(() => {
    previous.current = text;
    mounted.current = true;
  }, [text]);

  const stagger = verbTiming("rally", reduceMotion).stagger;
  const padded = before.padStart(text.length, " ");
  let changedIndex = 0;
  return (
    <View accessibilityLabel={text} accessible style={{ flexDirection: "row" }}>
      {[...text].map((digit, index) => {
        const changed = mounted.current && padded[index] !== digit;
        const delay = changed ? changedIndex++ * stagger : 0;
        return (
          <Rise
            appear={false}
            delay={delay}
            from="bottom"
            key={index}
            trigger={digit}
          >
            <Numerals {...props}>{digit}</Numerals>
          </Rise>
        );
      })}
    </View>
  );
}
