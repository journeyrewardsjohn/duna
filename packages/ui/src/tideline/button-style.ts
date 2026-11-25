import { cx } from "./cx";

/** `light` is the one main action on a dark ground (Tidewater, Night Court). */
export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "light";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonStyleOptions {
  /** One `primary` per page, sheet and dialog. */
  variant?: ButtonVariant;
  /** `md` is the 48px target; `lg` is the 56px primary mobile action. */
  size?: ButtonSize;
  /** Fills the width of its container. */
  block?: boolean;
}

/** The classes of a Tideline button, for triggers that render their own element. */
export function buttonClassName(
  {
    variant = "secondary",
    size = "md",
    block = false,
  }: ButtonStyleOptions = {},
  className?: string,
) {
  return cx(
    "td-btn",
    `td-btn--${variant}`,
    size !== "md" && `td-btn--${size}`,
    block && "td-btn--block",
    className,
  );
}
