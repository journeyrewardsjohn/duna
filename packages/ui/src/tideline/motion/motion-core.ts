/**
 * The motion rules with no React in them: list diffs, the changed digits of
 * a number, the first-open timeline, token timing read from the page, and the
 * view-transition Cross. Tested in `motion-core.test.ts`.
 *
 * Contract R10: three verbs. Rise (something grows out of a line, 600 ms),
 * Rally (the same move per item, 120 ms apart), Cross (travel over a line,
 * 320 ms). Every curve stays inside 0..1 (nothing overshoots), durations and
 * easings come from tokens, and under reduced motion the tokens turn every
 * verb into a 200 ms fade (`--td-motion: 0` removes all travel).
 */

/** Rally staggers at most this many items; the rest arrive with the last. */
export const RALLY_MAX_STAGGERED = 8;

/** Index used for an item's Rally delay: capped so long lists never wait. */
export function rallyIndex(index: number): number {
  return Math.max(0, Math.min(index, RALLY_MAX_STAGGERED - 1));
}

export interface ListEntry<Item> {
  key: string;
  item: Item;
  /** Removed: fading out in its old place, inert, then dropped. */
  exiting: boolean;
}

/**
 * The list to render after `next` arrives: every next item in order, with
 * the items that just left kept at their old positions (marked `exiting`)
 * so they can fade where they were instead of vanishing. Items already
 * exiting stay until `drop` removes them; an item that comes back stops
 * exiting.
 */
export function mergeExiting<Item>(
  previous: ReadonlyArray<ListEntry<Item>>,
  next: ReadonlyArray<Item>,
  getKey: (item: Item) => string,
): ListEntry<Item>[] {
  const nextKeys = new Set(next.map(getKey));
  const out: ListEntry<Item>[] = next.map((item) => ({
    key: getKey(item),
    item,
    exiting: false,
  }));
  // Walk the previous render; slot each departed entry after the nearest
  // surviving entry that preceded it.
  let anchor: string | null = null;
  const inserts: Array<{ after: string | null; entry: ListEntry<Item> }> = [];
  for (const entry of previous) {
    if (nextKeys.has(entry.key)) {
      anchor = entry.key;
      continue;
    }
    inserts.push({ after: anchor, entry: { ...entry, exiting: true } });
  }
  for (const { after, entry } of inserts) {
    const position =
      after === null
        ? -1
        : out.findIndex((candidate) => candidate.key === after);
    // Keep departed entries that shared an anchor in their original order.
    let at = position + 1;
    while (at < out.length && out[at]!.exiting) at += 1;
    out.splice(at, 0, entry);
  }
  return out;
}

/** What changed between two renders of a keyed list. */
export function diffKeys(
  previous: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): { inserted: string[]; removed: string[]; moved: string[] } {
  const before = new Set(previous);
  const after = new Set(next);
  const inserted = next.filter((key) => !before.has(key));
  const removed = previous.filter((key) => !after.has(key));
  // A key moved when its order among the keys both lists share changed.
  const shared = previous.filter((key) => after.has(key));
  const sharedNext = next.filter((key) => before.has(key));
  const moved = sharedNext.filter((key, index) => shared[index] !== key);
  return { inserted, removed, moved };
}

/**
 * Which characters of `next` changed from `previous`, compared from the right
 * so units stay aligned (9 → 10 changes both digits of "10"; 12 → 13 only the
 * last). Returns indexes into `next`.
 */
export function changedCharacters(previous: string, next: string): number[] {
  const changed: number[] = [];
  for (let offset = 1; offset <= next.length; offset += 1) {
    const index = next.length - offset;
    const before = previous[previous.length - offset];
    if (before !== next[index]) changed.push(index);
  }
  return changed.reverse();
}

/** The first-open sequence, from the brand book (section 6). Times in ms. */
export const FIRST_OPEN = {
  /** The line stands up from its centre. */
  lineAt: 300,
  lineMs: 450,
  /** Crests rise inner to outer, 600 ms each, 120 ms apart. */
  crestsAt: 700,
  /** The wordmark draws on beneath, about 1.1 s. */
  wordmarkAt: 1400,
  wordmarkMs: 1100,
  /** Nominal start of the page turn. */
  turnAt: 3500,
  /** The turn: rotateY to −108° over 1.4 s, perspective 1500 px. */
  turnMs: 1400,
  /** The earliest the turn may start: once the crests have landed. */
  minTurnAt: 1500,
} as const;

export type FirstOpenPhase =
  "ground" | "line" | "crests" | "wordmark" | "turn" | "done";

/**
 * When the page turn starts. Without a readiness signal the nominal time; if
 * Home becomes ready early the turn may start once the crests have landed;
 * if it is late, the finished mark holds until it is ready.
 */
export function firstOpenTurnAt(
  readyAt: number | null | undefined,
): number | null {
  if (readyAt === undefined) return FIRST_OPEN.turnAt;
  if (readyAt === null) return null;
  return Math.max(FIRST_OPEN.minTurnAt, readyAt);
}

/**
 * The phase at `elapsed` ms, given when the turn starts (null: not yet) and
 * how long it lasts (the 200 ms fade under reduced motion).
 */
export function firstOpenPhase(
  elapsed: number,
  turnAt: number | null,
  turnMs: number = FIRST_OPEN.turnMs,
): FirstOpenPhase {
  if (turnAt !== null && elapsed >= turnAt + turnMs) return "done";
  if (turnAt !== null && elapsed >= turnAt) return "turn";
  if (elapsed >= FIRST_OPEN.wordmarkAt) return "wordmark";
  if (elapsed >= FIRST_OPEN.crestsAt) return "crests";
  if (elapsed >= FIRST_OPEN.lineAt) return "line";
  return "ground";
}

/** Parses a CSS time ("320ms", "0.32s") to ms; NaN when it is not one. */
export function parseCssTime(value: string): number {
  const text = value.trim();
  if (text.endsWith("ms")) return Number.parseFloat(text);
  if (text.endsWith("s")) return Number.parseFloat(text) * 1000;
  return Number.NaN;
}

export interface MotionTiming {
  durationMs: number;
  easing: string;
  /** 1 while things may travel, 0 under reduced motion. */
  travel: number;
}

/**
 * A verb's duration and easing as the tokens resolve on `element` (so the
 * reduced-motion values apply), for motion driven from script.
 */
export function readMotionTiming(
  element: Element,
  verb: "rise" | "rally" | "cross",
): MotionTiming {
  const style = getComputedStyle(element);
  const duration = parseCssTime(
    style.getPropertyValue(`--td-duration-${verb}`),
  );
  const easing = style.getPropertyValue(`--td-ease-${verb}`).trim();
  const travel = Number.parseFloat(style.getPropertyValue("--td-motion"));
  return {
    durationMs: Number.isFinite(duration) ? duration : 0,
    easing: easing || "ease-out",
    travel: Number.isFinite(travel) ? travel : 1,
  };
}

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
};

export interface CrossViewTransitionOptions {
  /** `forward` travels left, `back` travels right. */
  direction?: "forward" | "back";
  /** The `.td` element whose tokens time the transition. */
  scope?: Element | null;
  /** How far the views travel, in px, before `--td-motion` scales it. */
  distance?: number;
}

/**
 * Runs `update` as a Cross between two views with the View Transitions API
 * (`document.startViewTransition`, where the browser has it), timed by the
 * Cross tokens: the old view leaves and the new one arrives over the line.
 * Anywhere else it just runs `update`; pair it with the CSS `Cross` for the
 * entrance. A pointer press during the transition skips it, so a quick tap
 * is never held behind the animation.
 *
 * Opt-in: the CSS `Cross`/`PageTransition` never blocks input and is the
 * default. Use this for same-document swaps where both views should move.
 */
export function crossViewTransition(
  update: () => void | Promise<void>,
  {
    direction = "forward",
    scope,
    distance = 24,
  }: CrossViewTransitionOptions = {},
): Promise<void> {
  const doc =
    typeof document === "undefined"
      ? undefined
      : (document as Document & {
          startViewTransition?: (
            callback: () => void | Promise<void>,
          ) => ViewTransitionLike;
        });
  if (!doc?.startViewTransition) return Promise.resolve(update());
  const element = scope ?? doc.querySelector(".td") ?? doc.documentElement;
  const { durationMs, easing, travel } = readMotionTiming(element, "cross");
  const sign = direction === "forward" ? 1 : -1;
  const shift = distance * travel * sign;

  const transition = doc.startViewTransition(update);
  const skip = () => transition.skipTransition();
  doc.addEventListener("pointerdown", skip, { once: true, capture: true });
  transition.ready
    .then(() => {
      const root = doc.documentElement;
      const timing = { duration: durationMs, easing, fill: "both" as const };
      root.animate(
        { opacity: [1, 0], translate: ["0 0", `${-shift}px 0`] },
        { ...timing, pseudoElement: "::view-transition-old(root)" },
      );
      root.animate(
        { opacity: [0, 1], translate: [`${shift}px 0`, "0 0"] },
        { ...timing, pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  return transition.finished
    .catch(() => {})
    .finally(() => doc.removeEventListener("pointerdown", skip, true));
}
