import {
  SegmentedControl as UiSegmentedControl,
  SegmentedControlIndicator as UiSegmentedControlIndicator,
  SegmentedControlItem as UiSegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

type UiSegmentedProps = ComponentProps<typeof UiSegmentedControl<string>>;

export interface SegmentedProps extends Omit<
  UiSegmentedProps,
  "className" | "children" | "render"
> {
  className?: string;
  /** Two to four views. Use a Select for a longer list. */
  options: ReadonlyArray<SegmentedOption | string>;
  /** Stretches the options across the full width. */
  block?: boolean;
}

/**
 * Switches between a few views. Name it with `aria-label` or a `Field`.
 * UI SDK Segmented Control: one tab stop, arrow keys move and select.
 */
export function Segmented({
  options,
  block,
  className,
  ...props
}: SegmentedProps) {
  return (
    <UiSegmentedControl
      className={cx("td-seg", block && "td-seg--block", className)}
      {...props}
    >
      <UiSegmentedControlIndicator className="td-seg__thumb" />
      {options.map((option) => {
        const item =
          typeof option === "string"
            ? { value: option, label: option }
            : option;
        return (
          <UiSegmentedControlItem
            className="td-seg__opt"
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </UiSegmentedControlItem>
        );
      })}
    </UiSegmentedControl>
  );
}
