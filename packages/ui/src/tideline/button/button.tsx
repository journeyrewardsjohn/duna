"use client";

import { Button as UiButton } from "@ui-sdk/react/button";
import type { ComponentProps, ReactNode } from "react";
import { buttonClassName, type ButtonStyleOptions } from "./button-style";
import { cx } from "../base/cx";
import { useDelayedLoading } from "../interactions/interactions";
import { MicroRally } from "../loaders/brand-loaders";

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

/** The brand's in-button loader: the micro mark with its crest swelling. */
const busy = (
  <span className="td-btn__busy">
    <MicroRally />
  </span>
);

/**
 * Runs an action, or navigates with `href`. Built on UI SDK's Button: pending
 * state, `aria-busy`, the delayed "Loading" announcement and disabled links.
 *
 * Loading blocks a second press at once, but the loader (the micro Rally)
 * only appears after 250ms and then stays 400ms (`useDelayedLoading`), so
 * quick saves do not flicker. The button keeps its width, colour and label;
 * the loader takes the icon's place.
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
  const spinning = useDelayedLoading(loading);
  return (
    <UiButton
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, block }, className)}
      data-loading={loading ? "" : undefined}
      data-spinning={spinning ? "" : undefined}
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
      {icon ? (
        <span className="td-btn__icon td-btn__icon--start">
          {icon}
          {busy}
        </span>
      ) : (
        busy
      )}
      <span className="td-btn__label">{children}</span>
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
  const spinning = useDelayedLoading(loading);
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
      data-spinning={spinning ? "" : undefined}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      {...props}
    >
      {busy}
      <span className="td-iconbtn__icon">{children}</span>
    </UiButton>
  );
}
