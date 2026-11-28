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
import type { ComponentProps, CSSProperties } from "react";
import { cx } from "../base/cx";
import { Icon, type IconName } from "../base/icons";
import { TOAST_MAX_VISIBLE, type TidelineToastData } from "./notify";

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

const toastData = (data: unknown): TidelineToastData =>
  typeof data === "object" && data !== null ? (data as TidelineToastData) : {};

const seconds = (ms: number) => Math.round(ms / 1000);

/**
 * The region toasts appear in. Render it once inside a `Tideline` scope, then
 * call `toast()` (or `successToast`, `errorToast`, `undoToast`) from
 * anywhere. UI SDK Toast: polite or assertive announcements, timers that
 * pause on hover and focus, swipe to dismiss, F6 to move focus into the
 * stack, and at most three at once (`maxVisible`); the rest wait.
 */
export function Toaster({
  className,
  closeLabel = "Dismiss",
  side = "bottom",
  align = "end",
  maxVisible = TOAST_MAX_VISIBLE,
  ...props
}: ToasterProps) {
  return (
    <UiToastRegion
      align={align}
      className={cx("td-toasts", className)}
      maxVisible={maxVisible}
      side={side}
      {...props}
    >
      {(item) => {
        const icon = item.type ? typeIcons[item.type] : undefined;
        const { reference, countdownMs } = toastData(item.data);
        return (
          <UiToast className="td-toast">
            {icon ? <Icon className="td-toast__icon" name={icon} /> : null}
            <div className="td-toast__body">
              <UiToastTitle className="td-toast__title" />
              <UiToastDescription className="td-toast__description" />
              {reference ? (
                <p className="td-toast__reference">
                  Reference: <span className="td-toast__code">{reference}</span>
                </p>
              ) : null}
              {countdownMs ? (
                <p className="td-toast__window">
                  Undo is available for {seconds(countdownMs)} seconds.
                </p>
              ) : null}
            </div>
            <UiToastAction className="td-btn td-btn--secondary td-btn--sm" />
            <UiToastClose aria-label={closeLabel} className="td-toast__close">
              <Icon name="close" />
            </UiToastClose>
            {countdownMs ? (
              <span
                aria-hidden="true"
                className="td-toast__countdown"
                style={
                  {
                    "--td-toast-countdown": `${countdownMs}ms`,
                  } as CSSProperties
                }
              />
            ) : null}
          </UiToast>
        );
      }}
    </UiToastRegion>
  );
}

export { toast };
