import {
  Checkbox as UiCheckbox,
  CheckboxIndicator as UiCheckboxIndicator,
} from "@ui-sdk/react/checkbox";
import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
  RadioIndicator as UiRadioIndicator,
} from "@ui-sdk/react/radio";
import {
  Switch as UiSwitch,
  SwitchThumb as UiSwitchThumb,
} from "@ui-sdk/react/switch";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

type UiSwitchProps = ComponentProps<typeof UiSwitch>;

export interface SwitchProps extends Omit<
  UiSwitchProps,
  "className" | "children" | "render"
> {
  className?: string;
  /** Visible text that names the switch. Without it, pass `aria-label`. */
  label?: ReactNode;
  /** A second line that describes the setting. */
  description?: ReactNode;
}

/** A setting that applies as soon as it is flipped. UI SDK Switch. */
export function Switch({
  label,
  description,
  className,
  ...props
}: SwitchProps) {
  const descriptionId = useId();
  return (
    <div className={cx("td-switch", className)}>
      <label className="td-switch__row">
        <UiSwitch
          aria-describedby={description ? descriptionId : undefined}
          className="td-switch__track"
          {...props}
        >
          <UiSwitchThumb className="td-switch__thumb" />
        </UiSwitch>
        {label ? <span className="td-switch__label">{label}</span> : null}
      </label>
      {description ? (
        <p className="td-switch__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

type UiCheckboxProps = ComponentProps<typeof UiCheckbox>;

export interface CheckboxProps extends Omit<
  UiCheckboxProps,
  "className" | "children" | "render"
> {
  className?: string;
  /** Visible text that names the checkbox. Without it, pass `aria-label`. */
  label?: ReactNode;
  description?: ReactNode;
}

/** A choice that waits for a confirming button. UI SDK Checkbox. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: CheckboxProps) {
  const descriptionId = useId();
  return (
    <div className={cx("td-check", className)}>
      <label className="td-check__row">
        <UiCheckbox
          aria-describedby={description ? descriptionId : undefined}
          className="td-check__box"
          {...props}
        >
          <UiCheckboxIndicator className="td-check__mark">
            <Icon className="td-check__tick" name="check" />
            <Icon className="td-check__dash" name="minus" />
          </UiCheckboxIndicator>
        </UiCheckbox>
        {label ? <span className="td-check__label">{label}</span> : null}
      </label>
      {description ? (
        <p className="td-check__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;

export interface RadioGroupProps extends Omit<
  UiRadioGroupProps,
  "className" | "render"
> {
  className?: string;
  /** Lays the options out in a row instead of a column. */
  inline?: boolean;
}

/**
 * One choice from a few visible options. Name it with `aria-label`, or put it
 * in a `Field`. UI SDK Radio: arrow keys move and select.
 */
export function RadioGroup({ className, inline, ...props }: RadioGroupProps) {
  return (
    <UiRadioGroup
      className={cx(
        "td-radiogroup",
        inline && "td-radiogroup--inline",
        className,
      )}
      {...props}
    />
  );
}

export interface RadioOptionProps {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** One option of a `RadioGroup`. */
export function RadioOption({
  value,
  label,
  description,
  disabled,
  className,
}: RadioOptionProps) {
  const descriptionId = useId();
  return (
    <div className={cx("td-radio", className)}>
      <label className="td-radio__row">
        <UiRadio
          aria-describedby={description ? descriptionId : undefined}
          className="td-radio__dot"
          disabled={disabled}
          value={value}
        >
          <UiRadioIndicator className="td-radio__mark" />
        </UiRadio>
        <span className="td-radio__label">{label}</span>
      </label>
      {description ? (
        <p className="td-radio__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
