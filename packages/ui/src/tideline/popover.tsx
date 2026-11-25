import {
  Menu as UiMenu,
  MenuContent as UiMenuContent,
  MenuGroup as UiMenuGroup,
  MenuGroupLabel as UiMenuGroupLabel,
  MenuItem as UiMenuItem,
  MenuSeparator as UiMenuSeparator,
  MenuTrigger as UiMenuTrigger,
} from "@ui-sdk/react/menu";
import {
  Popover as UiPopover,
  PopoverClose as UiPopoverClose,
  PopoverContent as UiPopoverContent,
  PopoverDescription as UiPopoverDescription,
  PopoverTitle as UiPopoverTitle,
  PopoverTrigger as UiPopoverTrigger,
} from "@ui-sdk/react/popover";
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipTrigger as UiTooltipTrigger,
} from "@ui-sdk/react/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { buttonClassName, type ButtonStyleOptions } from "./button";
import { cx } from "./cx";

type Styled<Props> = Omit<Props, "className"> & { className?: string };

export type PopoverProps = ComponentProps<typeof UiPopover>;

/**
 * Edit or explore something beside its trigger. UI SDK Popover: placed in the
 * top layer, flips at the window's edge, closes on Escape, an outside press
 * or focus leaving, and returns focus to the trigger.
 */
export function Popover(props: PopoverProps) {
  return <UiPopover {...props} />;
}

export type PopoverTriggerProps = Styled<
  ComponentProps<typeof UiPopoverTrigger>
> &
  ButtonStyleOptions;

export function PopoverTrigger({
  variant,
  size,
  block,
  className,
  ...props
}: PopoverTriggerProps) {
  return (
    <UiPopoverTrigger
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}

export interface PopoverContentProps extends Omit<
  ComponentProps<typeof UiPopoverContent>,
  "className" | "title" | "children"
> {
  className?: string;
  /** Names the popover. Without it, pass `aria-label`. */
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function PopoverContent({
  title,
  description,
  children,
  className,
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  return (
    <UiPopoverContent
      className={cx("td-popup td-popover", className)}
      sideOffset={sideOffset}
      {...props}
    >
      {title ? (
        <UiPopoverTitle className="td-popover__title">{title}</UiPopoverTitle>
      ) : null}
      {description ? (
        <UiPopoverDescription className="td-popover__description">
          {description}
        </UiPopoverDescription>
      ) : null}
      {children}
    </UiPopoverContent>
  );
}

export type PopoverCloseProps = Styled<ComponentProps<typeof UiPopoverClose>> &
  ButtonStyleOptions;

export function PopoverClose({
  variant = "ghost",
  size = "sm",
  block,
  className,
  ...props
}: PopoverCloseProps) {
  return (
    <UiPopoverClose
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}

export interface TooltipProps
  extends
    Omit<ComponentProps<typeof UiTooltip>, "children">,
    Pick<
      ComponentProps<typeof UiTooltipContent>,
      "side" | "align" | "sideOffset"
    > {
  /** The hint. It names an icon-only trigger and describes any other. */
  content: ReactNode;
  /** The trigger: one element that forwards its props, like a Button. */
  children: ReactElement;
}

/**
 * A short hint on hover and keyboard focus. UI SDK Tooltip: opens on focus,
 * closes on Escape, never takes focus, and wires the ARIA relationship.
 */
export function Tooltip({
  content,
  children,
  side,
  align,
  sideOffset = 8,
  ...props
}: TooltipProps) {
  return (
    <UiTooltip {...props}>
      <UiTooltipTrigger render={children} />
      <UiTooltipContent
        align={align}
        className="td-tooltip"
        side={side}
        sideOffset={sideOffset}
      >
        {content}
      </UiTooltipContent>
    </UiTooltip>
  );
}

export type MenuProps = ComponentProps<typeof UiMenu>;

/**
 * Actions from a button. UI SDK Menu: arrow keys, Home and End, typeahead,
 * Escape to close, and focus returned to the trigger. Handle `onAction`.
 */
export function Menu(props: MenuProps) {
  return <UiMenu {...props} />;
}

export type MenuTriggerProps = Styled<ComponentProps<typeof UiMenuTrigger>> &
  ButtonStyleOptions & {
    /** Renders the square icon button; pass `aria-label` with it. */
    iconOnly?: boolean;
  };

export function MenuTrigger({
  variant,
  size,
  block,
  iconOnly = false,
  className,
  ...props
}: MenuTriggerProps) {
  return (
    <UiMenuTrigger
      className={
        iconOnly
          ? cx("td-iconbtn", size === "sm" && "td-iconbtn--sm", className)
          : buttonClassName({ variant, size, block }, className)
      }
      {...props}
    />
  );
}

export type MenuContentProps = Styled<ComponentProps<typeof UiMenuContent>>;

export function MenuContent({
  className,
  sideOffset = 6,
  ...props
}: MenuContentProps) {
  return (
    <UiMenuContent
      className={cx("td-popup td-menu", className)}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export type MenuItemProps = Styled<ComponentProps<typeof UiMenuItem>>;

/** One action. `destructive` marks a dangerous one, like Delete. */
export function MenuItem({ className, ...props }: MenuItemProps) {
  return <UiMenuItem className={cx("td-menu__item", className)} {...props} />;
}

export function MenuSeparator({
  className,
  ...props
}: Styled<ComponentProps<typeof UiMenuSeparator>>) {
  return (
    <UiMenuSeparator
      className={cx("td-menu__separator", className)}
      {...props}
    />
  );
}

export function MenuGroup({
  className,
  ...props
}: Styled<ComponentProps<typeof UiMenuGroup>>) {
  return <UiMenuGroup className={cx("td-menu__group", className)} {...props} />;
}

export function MenuGroupLabel({
  className,
  ...props
}: Styled<ComponentProps<typeof UiMenuGroupLabel>>) {
  return (
    <UiMenuGroupLabel className={cx("td-menu__label", className)} {...props} />
  );
}
