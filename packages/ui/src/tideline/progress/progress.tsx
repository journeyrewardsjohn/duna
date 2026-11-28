import {
  Progress as UiProgress,
  ProgressIndicator as UiProgressIndicator,
  ProgressLabel as UiProgressLabel,
  ProgressTrack as UiProgressTrack,
  ProgressValue as UiProgressValue,
} from "@ui-sdk/react/progress";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

export interface ProgressProps extends Omit<
  ComponentProps<typeof UiProgress>,
  "className" | "children"
> {
  className?: string;
  /** A visible name. Without it, pass `aria-label`. */
  label?: ReactNode;
  /** Shows the formatted value beside the label. */
  showValue?: boolean;
}

/**
 * How far a task has come. `value={null}` is under way with no known length.
 * UI SDK Progress supplies the role, the range and the spoken value.
 */
export function Progress({
  label,
  showValue = false,
  className,
  ...props
}: ProgressProps) {
  return (
    <UiProgress className={cx("td-progress", className)} {...props}>
      {label || showValue ? (
        <div className="td-progress__meta">
          {label ? (
            <UiProgressLabel className="td-progress__label">
              {label}
            </UiProgressLabel>
          ) : (
            <span />
          )}
          {showValue ? (
            <UiProgressValue className="td-progress__value" />
          ) : null}
        </div>
      ) : null}
      <UiProgressTrack className="td-progress__track">
        <UiProgressIndicator className="td-progress__fill" />
      </UiProgressTrack>
    </UiProgress>
  );
}

export interface StepperStep {
  title: ReactNode;
  description?: ReactNode;
}

export interface StepperProps extends Omit<ComponentProps<"ol">, "children"> {
  steps: ReadonlyArray<StepperStep>;
  /** The index of the step in progress. Earlier steps are complete. */
  current: number;
  /** Spoken after each step's title. */
  statusLabels?: { complete: string; current: string; upcoming: string };
}

/**
 * The steps of a flow, top to bottom, with where the person is. UI SDK ships
 * no stepper, and a read-only one needs no behaviour: this is an ordered list
 * with `aria-current="step"` and each step's status in words.
 */
export function Stepper({
  steps,
  current,
  statusLabels = {
    complete: "Completed",
    current: "Current step",
    upcoming: "Not started",
  },
  className,
  ...props
}: StepperProps) {
  return (
    <ol className={cx("td-stepper", className)} {...props}>
      {steps.map((step, index) => {
        const state =
          index < current
            ? "complete"
            : index === current
              ? "current"
              : "upcoming";
        return (
          <li
            aria-current={state === "current" ? "step" : undefined}
            className="td-stepper__step"
            data-state={state}
            key={index}
          >
            <span aria-hidden="true" className="td-stepper__marker">
              {state === "complete" ? <Icon name="check" /> : index + 1}
            </span>
            <span className="td-stepper__text">
              <span className="td-stepper__title">
                {step.title}
                <span className="td-sr">, {statusLabels[state]}</span>
              </span>
              {step.description ? (
                <span className="td-stepper__description">
                  {step.description}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
