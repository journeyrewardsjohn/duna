/**
 * Rise and Rally as markup: no client JavaScript, so server components can
 * use them. Each plays once, when the element first renders; nothing loops,
 * nothing blocks input, and only `transform`, `clip-path` and `opacity`
 * move, so no content shifts under a pointer.
 */
import {
  Children,
  cloneElement,
  type ComponentProps,
  type CSSProperties,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "../base/cx";
import { rallyIndex } from "./motion-core";

/** The edge the line is on: the element grows away from it. */
export type RiseFrom = "bottom" | "top" | "start" | "end";

export interface MotionClassOptions {
  from?: RiseFrom;
  /** A short Rise for an item arriving in place (an insert, a confirmation). */
  short?: boolean;
}

/**
 * Classes that make any element Rise when it first renders, for elements the
 * `Rise` wrapper cannot be (a table row, a list item you already render).
 */
export function riseClassName(
  { from = "bottom", short = false }: MotionClassOptions = {},
  className?: string,
): string {
  return cx(
    "td-rise",
    from !== "bottom" && `td-rise--${from}`,
    short && "td-rise--short",
    className,
  )!;
}

/** The style that places an element `index` in a Rally (120 ms apart, capped). */
export function rallyStyle(
  index: number,
  style?: CSSProperties,
): CSSProperties {
  return { ...style, "--td-rally-i": rallyIndex(index) } as CSSProperties;
}

export interface RiseProps extends ComponentProps<"div">, MotionClassOptions {}

/**
 * Rise: something enters by growing out of a line, 600 ms on `ease-rise`.
 * Use it for a pane, a card or a confirmation arriving. Under reduced motion
 * it is a 200 ms fade.
 */
export function Rise({ from, short, className, ...props }: RiseProps) {
  return (
    <div className={riseClassName({ from, short }, className)} {...props} />
  );
}

export interface RallyProps extends Omit<ComponentProps<"div">, "children"> {
  from?: RiseFrom;
  /**
   * Elements to bring in one after another. Each must accept `className`
   * and `style`. Pass `as="ul"` style containers by rendering the list
   * yourself and using `riseClassName` + `rallyStyle` per item instead.
   */
  children: ReactNode;
}

/**
 * Rally: the same Rise per item, 120 ms apart (the first eight; the rest
 * arrive with the eighth), on first render only, never on scroll.
 */
export function Rally({ from, className, children, ...props }: RallyProps) {
  let index = 0;
  return (
    <div className={cx("td-rally", className)} {...props}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<{
          className?: string;
          style?: CSSProperties;
        }>;
        const position = index;
        index += 1;
        return cloneElement(element, {
          className: riseClassName({ from }, element.props.className),
          style: rallyStyle(position, element.props.style),
        });
      })}
    </div>
  );
}
