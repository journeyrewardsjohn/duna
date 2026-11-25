import { Button as UiButton } from "@ui-sdk/react/button";
import type { ComponentProps, ReactNode } from "react";
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

type UiButtonProps = ComponentProps<typeof UiButton>;

export interface ButtonProps
  extends
    Omit<UiButtonProps, "className" | "children" | "render">,
    ButtonStyleOptions {
  className?: string;
  children?: ReactNode;
  /** Shown before the label. The spinner takes its place while loading. */
  icon?: ReactNode;
  /** Shown after the label. */
  iconEnd?: ReactNode;
  /**
   * Shows the spinner and ignores presses. A press handler that returns a
   * Promise does the same until it settles, without this prop.
   */
  loading?: boolean;
  /** Renders a link that looks like a button. */
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * Runs an action, or navigates with `href`. Built on UI SDK's Button: pending
 * state, `aria-busy`, the delayed "Loading" announcement and disabled links.
 */
export function Button({
  variant,
  size,
  block,
  className,
  children,
  icon,
  iconEnd,
  loading = false,
  disabled,
  href,
  target,
  rel,
  ...props
}: ButtonProps) {
  return (
    <UiButton
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, block }, className)}
      data-loading={loading ? "" : undefined}
      disabled={disabled || loading}
      // A loading button keeps focus and stays in the tab order.
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      render={
        href === undefined ? undefined : (
          <a href={href} rel={rel} target={target} />
        )
      }
      {...props}
    >
      <span aria-hidden="true" className="td-sunspot td-btn__spin">
        <i />
      </span>
      {icon ? <span className="td-btn__icon">{icon}</span> : null}
      {children}
      {iconEnd ? <span className="td-btn__icon">{iconEnd}</span> : null}
    </UiButton>
  );
}

export interface IconButtonProps extends Omit<
  UiButtonProps,
  "className" | "children" | "render"
> {
  className?: string;
  /** The accessible name; an icon alone names nothing. */
  label: string;
  /** The icon to draw. */
  children: ReactNode;
  variant?: "ghost" | "tonal" | "outline";
  size?: "sm" | "md";
  loading?: boolean;
}

/** A button that shows only an icon, with a 48px target and a required name. */
export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  className,
  loading = false,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <UiButton
      aria-busy={loading || undefined}
      aria-label={label}
      className={cx(
        "td-iconbtn",
        variant !== "ghost" && `td-iconbtn--${variant}`,
        size === "sm" && "td-iconbtn--sm",
        className,
      )}
      data-loading={loading ? "" : undefined}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      {...props}
    >
      <span aria-hidden="true" className="td-sunspot td-btn__spin">
        <i />
      </span>
      <span className="td-iconbtn__icon">{children}</span>
    </UiButton>
  );
}
