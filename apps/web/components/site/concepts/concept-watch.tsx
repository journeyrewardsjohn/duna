"use client";

import { Icon } from "@duna/ui/tideline";
import { usePlayOnce } from "../use-play-once";

/** The shipped Apple Watch scoring gestures (AGENTS.md: never changes). */
const GESTURES = [
  {
    icon: "chevron-down",
    rotate: true,
    words: "Swipe up: a point for the top team",
  },
  {
    icon: "chevron-down",
    rotate: false,
    words: "Swipe down: a point for the bottom team",
  },
  {
    icon: "chevron-right",
    rotate: false,
    words: "Swipe right: save a favourite moment",
  },
  {
    icon: "chevron-left",
    rotate: false,
    words: "Swipe left: undo the last point",
  },
] as const;

/**
 * Duna on Apple Watch: the score on the wrist and the four swipes that keep
 * it. The face is drawn (not a screenshot); the score ticks once to the
 * point it shows when the card is seen.
 */
export function ConceptWatch({ className }: { readonly className?: string }) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div
      className={
        className ? `site-concept-watch ${className}` : "site-concept-watch"
      }
      data-phase={phase}
      ref={ref}
    >
      <div
        aria-label="Example watch face: set 2, Kai and Rio 19 serving, Noa and Sam 17."
        className="td site-watch"
        data-theme="dark"
        role="img"
      >
        <span className="site-watch__label">Set 2 · to 21</span>
        <span className="site-watch__row">
          <span>
            <i aria-hidden="true" className="site-watch__serve" />
            Kai / Rio
          </span>
          <span className="td-num">19</span>
        </span>
        <span className="site-watch__net" />
        <span className="site-watch__row">
          <span>Noa / Sam</span>
          <span className="td-num">17</span>
        </span>
      </div>
      <ul className="td site-glass site-watch__gestures" data-theme="dark">
        {GESTURES.map((gesture) => (
          <li key={gesture.words}>
            <span
              aria-hidden="true"
              className="site-watch__gesture"
              data-up={gesture.rotate ? "" : undefined}
            >
              <Icon name={gesture.icon} size="inline" />
            </span>
            {gesture.words}
          </li>
        ))}
      </ul>
    </div>
  );
}
