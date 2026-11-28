/** A react-native-svg stand-in for unit tests: elements render as named hosts. */
import { createElement, type ReactNode } from "react";

type Props = Record<string, unknown> & { children?: ReactNode };
const host = (name: string) => {
  const component = (props: Props) =>
    createElement(name, props, props.children);
  component.displayName = name;
  return component;
};

const Svg = host("Svg");
export default Svg;
export { Svg };
export const Path = host("Path");
export const Rect = host("Rect");
export const Circle = host("Circle");
export const G = host("G");
export const Line = host("Line");
