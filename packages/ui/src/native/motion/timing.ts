/**
 * Motion timing, pure: the three verbs from the tokens (contract R10).
 * Rise 600 ms, Rally 600 ms per item 120 ms apart, Cross 320 ms, all on the
 * one ease-out curve; nothing overshoots. Under reduced motion each becomes
 * the end state with a 200 ms fade and no stagger.
 */
import { nativeTokens } from "../tokens";

export type MotionVerb = "rise" | "rally" | "cross";

export interface VerbTiming {
  readonly verb: MotionVerb;
  /** Milliseconds. */
  readonly duration: number;
  /** Milliseconds between items (Rally only; 0 otherwise). */
  readonly stagger: number;
  /** cubic-bezier control points. */
  readonly easing: readonly [number, number, number, number];
  /** Movement allowed; false means fade only. */
  readonly moves: boolean;
}

const { duration, easing, reduced } = nativeTokens.motion;

export function verbTiming(
  verb: MotionVerb,
  reduceMotion: boolean,
): VerbTiming {
  const stagger = verb === "rally" ? duration["stagger-rally"] : 0;
  if (reduceMotion) {
    return {
      verb,
      duration: duration["fade-reduced"],
      stagger: verb === "rally" ? reduced["stagger-rally"] : 0,
      easing: easing.out,
      moves: false,
    };
  }
  return {
    verb,
    duration: duration[verb],
    stagger,
    easing: easing[verb],
    moves: true,
  };
}

/** True when an easing stays inside 0..1 (no overshoot, no bounce). */
export function staysInside(points: readonly number[]): boolean {
  return points.every((point) => point >= 0 && point <= 1);
}

/** The delay of item `index` in a Rally. */
export function rallyDelay(index: number, reduceMotion: boolean): number {
  return index * verbTiming("rally", reduceMotion).stagger;
}
