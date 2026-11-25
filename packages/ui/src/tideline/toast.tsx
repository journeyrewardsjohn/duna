"use client";

import {
  Toast as UiToast,
  ToastAction as UiToastAction,
  ToastClose as UiToastClose,
  ToastDescription as UiToastDescription,
  ToastRegion as UiToastRegion,
  ToastTitle as UiToastTitle,
  toast,
} from "@ui-sdk/react/toast";
import type { ComponentProps } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

const typeIcons: Partial<Record<string, IconName>> = {
  success: "success",
  error: "alert",
  warning: "alert",
  info: "info",
};

export interface ToasterProps extends Omit<
  ComponentProps<typeof UiToastRegion>,
  "className" | "children"
> {
  className?: string;
  /** The name of each toast's dismiss button. */
  closeLabel?: string;
}

/**
 * The region toasts appear in. Render it once inside a `Tideline` scope, then
 * call `toast()` from anywhere. UI SDK Toast: polite or assertive
 * announcements, timers that pause on hover and focus, swipe to dismiss, and
 * F6 to move focus into the stack.
 */
export function Toaster({
  className,
  closeLabel = "Dismiss",
  side = "bottom",
  align = "end",
  ...props
}: ToasterProps) {
  return (
    <UiToastRegion
      align={align}
      className={cx("td-toasts", className)}
      side={side}
      {...props}
    >
      {(item) => {
        const icon = item.type ? typeIcons[item.type] : undefined;
        return (
          <UiToast className="td-toast">
            {icon ? <Icon className="td-toast__icon" name={icon} /> : null}
            <div className="td-toast__body">
              <UiToastTitle className="td-toast__title" />
              <UiToastDescription className="td-toast__description" />
            </div>
            <UiToastAction className="td-btn td-btn--secondary td-btn--sm" />
            <UiToastClose aria-label={closeLabel} className="td-toast__close">
              <Icon name="close" />
            </UiToastClose>
          </UiToast>
        );
      }}
    </UiToastRegion>
  );
}

export { toast };
