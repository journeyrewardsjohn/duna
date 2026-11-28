/**
 * A minimal React Native stand-in for unit tests: host components render as
 * named elements in react-test-renderer and the window size is settable.
 */
import { createElement, type ReactNode } from "react";

type Props = Record<string, unknown> & { children?: ReactNode };
const host = (name: string) => {
  const component = (props: Props) =>
    createElement(name, props, props.children);
  component.displayName = name;
  return component;
};

export const View = host("View");
export const Text = host("Text");
export const Pressable = host("Pressable");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const Modal = host("Modal");
export const ScrollView = host("ScrollView");
export const TextInput = host("TextInput");

export const StyleSheet = {
  create: <T>(styles: T) => styles,
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  hairlineWidth: 1,
};

export const testWindow = { width: 402, height: 874, fontScale: 1, scale: 3 };

export function useWindowDimensions() {
  return { ...testWindow };
}

export type LayoutChangeEvent = {
  nativeEvent: {
    layout: { x: number; y: number; width: number; height: number };
  };
};
export type StyleProp<T> = T | readonly T[] | null | undefined | false;
export type ViewStyle = Record<string, unknown>;
export type ViewProps = Record<string, unknown>;
