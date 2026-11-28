"use client";

/**
 * The motion parts that need to know what changed: a value changing in
 * place, a view crossing to the next, a list gaining and losing items, a
 * number or score updating, and the first-open sequence.
 */
import {
  type ComponentProps,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Button } from "../button/button";
import { CrestMark, Wordmark } from "./crest";
import {
  changedCharacters,
  FIRST_OPEN,
  type FirstOpenPhase,
  firstOpenPhase,
  firstOpenTurnAt,
  type ListEntry,
  mergeExiting,
  readMotionTiming,
} from "./motion-core";
import { rallyStyle, riseClassName } from "./verbs";

// Layout effects warn during server rendering; there is no layout there.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Whether this is the first render of the component. */
function useFirstRender(): boolean {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return first.current;
}

export interface RallyOnChangeProps extends ComponentProps<"span"> {
  /** When this changes (not on first render), the content Rises again in place. */
  value: unknown;
}

/**
 * Rally for a change in place: a status that flips to "Confirmed", a count
 * that updates. The content re-enters with a short Rise when `value`
 * changes; the first render is still, so static pages never animate.
 */
export function RallyOnChange({
  value,
  className,
  children,
  ...props
}: RallyOnChangeProps) {
  const first = useFirstRender();
  const [version, setVersion] = useState(0);
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setVersion((count) => count + 1);
  }, [value]);
  return (
    <span
      className={cx(
        "td-rally-change",
        !first && version > 0 && riseClassName({ short: true }),
        className,
      )}
      key={version}
      {...props}
    >
      {children}
    </span>
  );
}

export interface AnimatedListProps<Item> {
  items: ReadonlyArray<Item>;
  getKey: (item: Item) => string;
  renderItem: (item: Item, state: { exiting: boolean }) => ReactNode;
  /** The list element: `ul` by default; items render as `li` unless `itemAs` says otherwise. */
  as?: ElementType;
  itemAs?: ElementType;
  className?: string;
  itemClassName?: string;
  /** Names the list for assistive technology. */
  "aria-label"?: string;
}

/**
 * A list whose changes read clearly: the first load Rallies in (once, never
 * on scroll), an insert Rises in place, a removal fades where it was (inert,
 * hidden from assistive technology) before it leaves, and a reorder slides
 * items to their new places (Cross timing) unless the pointer is over the
 * list, so nothing moves under a pointer. Only transform and opacity move.
 */
export function AnimatedList<Item>({
  items,
  getKey,
  renderItem,
  as: List = "ul",
  itemAs: ItemElement = "li",
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: AnimatedListProps<Item>) {
  const listRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const [entries, setEntries] = useState<ListEntry<Item>[]>(() =>
    items.map((item) => ({ key: getKey(item), item, exiting: false })),
  );
  const inserted = useRef(new Set<string>());
  const positions = useRef(new Map<string, number>());

  // Merge new items with the ones leaving, during render, React's way.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    const before = new Set(entries.map((entry) => entry.key));
    const next = mergeExiting(entries, items, getKey);
    inserted.current = new Set(
      next.filter((entry) => !before.has(entry.key)).map((entry) => entry.key),
    );
    setEntries(next);
  }

  useEffect(() => {
    first.current = false;
  }, []);

  // Reorder: slide moved items from where they were (FLIP on `translate`).
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const children = Array.from(
      list.querySelectorAll<HTMLElement>(":scope > [data-key]"),
    );
    const previous = positions.current;
    const next = new Map<string, number>();
    for (const child of children) {
      next.set(child.dataset.key!, child.getBoundingClientRect().top);
    }
    positions.current = next;
    if (previous.size === 0 || list.matches(":hover")) return;
    const { durationMs, easing, travel } = readMotionTiming(list, "cross");
    if (travel === 0 || durationMs === 0) return;
    for (const child of children) {
      const key = child.dataset.key!;
      const before = previous.get(key);
      const after = next.get(key);
      if (before === undefined || after === undefined) continue;
      if (inserted.current.has(key) || child.dataset.exiting !== undefined)
        continue;
      const delta = before - after;
      if (Math.abs(delta) < 1) continue;
      child.animate?.([{ translate: `0 ${delta}px` }, { translate: "0 0" }], {
        duration: durationMs,
        easing,
      });
    }
  }, [entries]);

  const drop = (key: string) =>
    setEntries((current) =>
      current.filter((entry) => !(entry.key === key && entry.exiting)),
    );

  return (
    <List
      aria-label={ariaLabel}
      className={cx("td-alist", className)}
      ref={listRef}
    >
      {entries.map((entry, index) => {
        const entering = !first.current && inserted.current.has(entry.key);
        const initial = first.current;
        return (
          <ItemElement
            aria-hidden={entry.exiting || undefined}
            className={cx(
              "td-alist__item",
              initial && riseClassName(),
              entering && riseClassName({ short: true }),
              entry.exiting && "td-alist__item--exiting",
              itemClassName,
            )}
            data-exiting={entry.exiting ? "" : undefined}
            data-key={entry.key}
            inert={entry.exiting || undefined}
            key={entry.key}
            onAnimationEnd={
              entry.exiting
                ? (event: {
                    target: EventTarget;
                    currentTarget: EventTarget;
                  }) => {
                    if (event.target === event.currentTarget) drop(entry.key);
                  }
                : undefined
            }
            style={initial ? rallyStyle(index) : undefined}
          >
            {renderItem(entry.item, { exiting: entry.exiting })}
          </ItemElement>
        );
      })}
    </List>
  );
}

export interface NumberChangeProps extends Omit<
  ComponentProps<"span">,
  "children"
> {
  value: number | string;
  /** Turns the value into text: `(n) => n.toFixed(2)`. */
  format?: (value: number | string) => string;
  /**
   * Announce changes politely (a live score). Off by default: most numbers
   * change because the person changed them, and they already know.
   */
  announce?: boolean;
}

/**
 * A number or score that changes in place: only the characters that changed
 * Rally up from the baseline, one after another, in a fixed-width cell so
 * nothing beside them moves. Geist 600 tabular. The first render is still.
 * Do not use it for money or a rating before the value is final.
 */
export function NumberChange({
  value,
  format = String,
  announce = false,
  className,
  ...props
}: NumberChangeProps) {
  const text = format(value);
  const previous = useRef(text);
  const [render, setRender] = useState({
    text,
    changed: [] as number[],
    version: 0,
  });
  if (render.text !== text) {
    const changed = changedCharacters(render.text, text);
    setRender({ text, changed, version: render.version + 1 });
  }
  useEffect(() => {
    previous.current = text;
  }, [text]);
  return (
    <span className={cx("td-numchange td-num", className)} {...props}>
      <span className="td-sr" aria-live={announce ? "polite" : undefined}>
        {render.text}
      </span>
      <span aria-hidden="true" className="td-numchange__digits">
        {[...render.text].map((character, index) => {
          const order = render.changed.indexOf(index);
          return (
            <span
              className="td-numchange__cell"
              key={`${index}-${render.text.length}`}
            >
              <span
                className={cx(order >= 0 && "td-numchange__char--changed")}
                key={order >= 0 ? render.version : "still"}
                style={order >= 0 ? rallyStyle(order) : undefined}
              >
                {character}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const FIRST_OPEN_KEY = "td-first-open";

export interface FirstOpenProps {
  /**
   * Whether Home has loaded underneath. Leave it out to play the nominal
   * 3.5 s. Pass `false` while loading: the finished mark holds until it
   * turns `true`; if it is ready early, the page turns once the crests have
   * landed (about 1.5 s).
   */
  ready?: boolean;
  /**
   * Play it at all. Default: once per browser session (a cold start), using
   * `sessionStorage`; `"device"` plays once per device; `"always"` every
   * mount (the gallery's Replay).
   */
  once?: "session" | "device" | "always";
  /** The skip button's label. */
  skipLabel?: string;
  /** Read by screen readers while it plays. */
  label?: string;
  onDone?: () => void;
  /** Cover the host element instead of the viewport (for previews). */
  contained?: boolean;
  /** Home, loading underneath. Inert while the sequence covers it. */
  children?: ReactNode;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const storeFor = (once: FirstOpenProps["once"]): Store | null => {
  try {
    if (once === "device") return window.localStorage;
    if (once === "session") return window.sessionStorage;
  } catch {
    // Storage can be blocked; then it plays, which is the safe default.
  }
  return null;
};

/**
 * The first-open sequence (brand book section 6): Night Court, the line
 * stands up, the crests rise inner to outer, the wordmark draws on, then the
 * launch layer turns from its left edge like a page and reveals Home.
 * Skippable (the Skip button or Escape) and played once. Reduced motion
 * shows the finished lockup, then a 200 ms cross-fade.
 */
export function FirstOpen({
  ready,
  once = "session",
  skipLabel = "Skip",
  label = "Opening Duna",
  onDone,
  contained = false,
  children,
}: FirstOpenProps) {
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<FirstOpenPhase>("ground");
  const started = useRef<number | null>(null);
  const turnMs = useRef<number>(FIRST_OPEN.turnMs);
  const readyAt = useRef<number | null | undefined>(
    ready === undefined ? undefined : ready ? 0 : null,
  );
  const latestDone = useRef(onDone);
  useEffect(() => {
    latestDone.current = onDone;
  });

  // Decide on the client whether this is a cold start.
  useEffect(() => {
    const store = storeFor(once);
    if (once !== "always" && store?.getItem(FIRST_OPEN_KEY)) {
      setPhase("done");
      return;
    }
    store?.setItem(FIRST_OPEN_KEY, "1");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The finished lockup, then a 200 ms cross-fade as soon as allowed.
      turnMs.current = 200;
      if (readyAt.current === undefined) readyAt.current = 0;
    }
    started.current = performance.now();
    setPhase("ground");
    setPlaying(true);
  }, [once]);

  useEffect(() => {
    if (ready && readyAt.current === null && started.current !== null) {
      readyAt.current = performance.now() - started.current;
    }
  }, [ready]);

  // One clock for the timeline; phases drive CSS through data-phase.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - (started.current ?? 0);
      const next = firstOpenPhase(
        elapsed,
        firstOpenTurnAt(readyAt.current),
        turnMs.current,
      );
      setPhase((current) => (current === next ? current : next));
      if (next === "done") {
        setPlaying(false);
        latestDone.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const skip = () => {
      setPlaying(false);
      setPhase("done");
      latestDone.current?.();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const skip = () => {
    setPlaying(false);
    setPhase("done");
    latestDone.current?.();
  };

  // Home is usable as soon as the page starts to turn.
  const covering = phase !== "done" && phase !== "turn";
  return (
    <div
      className={cx(
        "td-firstopen-host",
        contained && "td-firstopen-host--contained",
      )}
    >
      <div className="td-firstopen-home" inert={covering || undefined}>
        {children}
      </div>
      {phase !== "done" ? (
        <div
          className={cx(
            "td td-firstopen",
            contained && "td-firstopen--contained",
          )}
          data-phase={phase}
          data-theme="dark"
          role="status"
          style={
            {
              "--td-firstopen-turn": `${turnMs.current}ms`,
              "--td-firstopen-line": `${FIRST_OPEN.lineMs}ms`,
              "--td-firstopen-wordmark": `${FIRST_OPEN.wordmarkMs}ms`,
            } as CSSProperties
          }
        >
          <span className="td-sr">{label}</span>
          <div className="td-firstopen__lockup">
            <CrestMark
              className="td-firstopen__mark"
              crestClassName="td-firstopen__crest"
              lineClassName="td-firstopen__line"
            />
            <Wordmark
              className="td-firstopen__wordmark"
              strokeClassName="td-firstopen__stroke"
            />
          </div>
          <Button
            className="td-firstopen__skip"
            onClick={skip}
            size="sm"
            variant="ghost"
          >
            {skipLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
