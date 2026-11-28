/**
 * The React Native stand-in for `packages/ui` unit tests (see
 * `vitest.config.ts`). It extends the layout stand-in with what the native
 * foundation uses: Animated (values record what they were asked to do and
 * never run), Easing, AccessibilityInfo, the colour scheme and font scale.
 * Host components render as named elements in react-test-renderer.
 */
import { createElement, type ReactNode } from "react";

export * from "../layout/test-support/react-native";

type Props = Record<string, unknown> & { children?: ReactNode };
const host = (name: string) => {
  const component = (props: Props) =>
    createElement(name, props, props.children);
  component.displayName = name;
  return component;
};

export const Image = host("Image");
export const StatusBar = host("StatusBar");

/** What the stand-in's AccessibilityInfo and Appearance report; tests set it. */
export const testEnvironment = {
  reduceMotion: false,
  screenReader: false,
  colorScheme: "light" as "light" | "dark" | null,
  announcements: [] as string[],
};

const listeners = new Map<string, Set<(value: boolean) => void>>();

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(testEnvironment.reduceMotion),
  isScreenReaderEnabled: () => Promise.resolve(testEnvironment.screenReader),
  addEventListener(event: string, handler: (value: boolean) => void) {
    const set = listeners.get(event) ?? new Set();
    set.add(handler);
    listeners.set(event, set);
    return { remove: () => set.delete(handler) };
  },
  announceForAccessibility(text: string) {
    testEnvironment.announcements.push(text);
  },
};

/** Fire an AccessibilityInfo event, as the system would. */
export function emitAccessibilityEvent(event: string, value: boolean) {
  for (const handler of listeners.get(event) ?? []) handler(value);
}

export function useColorScheme() {
  return testEnvironment.colorScheme;
}

export const Appearance = {
  getColorScheme: () => testEnvironment.colorScheme,
};

export const Platform = {
  OS: "ios" as const,
  select: <T>(options: { ios?: T; default?: T }) =>
    options.ios ?? options.default,
};

export const PixelRatio = {
  getFontScale: () => 1,
  get: () => 3,
};

export const I18nManager = { isRTL: false };

/** A recorded animation request. Tests read `testAnimations`. */
export interface RecordedAnimation {
  kind: string;
  config?: Record<string, unknown>;
}
export const testAnimations: RecordedAnimation[] = [];

class AnimatedValue {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  setValue(value: number) {
    this.value = value;
  }
  stopAnimation() {}
  interpolate(config: Record<string, unknown>): {
    interpolate: Record<string, unknown>;
    from: AnimatedValue;
  } {
    return { interpolate: config, from: this };
  }
}

interface CompositeAnimation {
  start: (callback?: (result: { finished: boolean }) => void) => void;
  stop: () => void;
  reset: () => void;
}

const animation = (
  kind: string,
  config?: Record<string, unknown>,
  apply?: () => void,
): CompositeAnimation => {
  testAnimations.push({ kind, config });
  return {
    start(callback) {
      apply?.();
      callback?.({ finished: true });
    },
    stop() {},
    reset() {},
  };
};

export const Animated = {
  Value: AnimatedValue,
  View: host("Animated.View"),
  Text: host("Animated.Text"),
  createAnimatedComponent: <T>(component: T) => component,
  timing: (value: AnimatedValue, config: Record<string, unknown>) =>
    animation("timing", config, () =>
      value.setValue(Number(config.toValue ?? 0)),
    ),
  delay: (ms: number) => animation("delay", { ms }),
  sequence: (items: CompositeAnimation[]) =>
    animation("sequence", { count: items.length }, () => {
      for (const item of items) item.start();
    }),
  parallel: (items: CompositeAnimation[]) =>
    animation("parallel", { count: items.length }, () => {
      for (const item of items) item.start();
    }),
  stagger: (ms: number, items: CompositeAnimation[]) =>
    animation("stagger", { ms, count: items.length }, () => {
      for (const item of items) item.start();
    }),
  loop: (item: CompositeAnimation) => animation("loop", undefined, () => item),
  ScrollView: host("Animated.ScrollView"),
  event: (_mapping: unknown, config?: Record<string, unknown>) => {
    const handler = () => undefined;
    (handler as unknown as { config?: unknown }).config = config;
    return handler;
  },
  add: (a: AnimatedValue, b: AnimatedValue) => ({ add: [a, b] }),
};

/** The gesture system: handlers record nothing; tests press, not drag. */
export const PanResponder = {
  create: (config: Record<string, unknown>) => ({
    config,
    panHandlers: {},
  }),
};

export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number) => {
    const fn = (t: number) => t;
    (fn as unknown as { points: number[] }).points = [x1, y1, x2, y2];
    return fn;
  },
  linear: (t: number) => t,
  inOut: (fn: (t: number) => number) => fn,
  ease: (t: number) => t,
};

const flatten = (style: unknown): Record<string, unknown> | undefined => {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map((item) => flatten(item) ?? {}));
  }
  return typeof style === "object"
    ? (style as Record<string, unknown>)
    : undefined;
};

/** Overrides the layout stand-in's StyleSheet with `flatten`. */
export const StyleSheet = {
  create: <T>(styles: T) => styles,
  flatten,
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  hairlineWidth: 1,
};
