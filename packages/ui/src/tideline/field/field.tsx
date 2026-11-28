import {
  Field as UiField,
  FieldDescription as UiFieldDescription,
  FieldError as UiFieldError,
  FieldLabel as UiFieldLabel,
} from "@ui-sdk/react/field";
import {
  Input as UiInput,
  InputClear as UiInputClear,
  InputGroup as UiInputGroup,
} from "@ui-sdk/react/input";
import {
  NumberInput as UiNumberInput,
  NumberInputControl as UiNumberInputControl,
  NumberInputDecrement as UiNumberInputDecrement,
  NumberInputGroup as UiNumberInputGroup,
  NumberInputIncrement as UiNumberInputIncrement,
} from "@ui-sdk/react/number-input";
import { Textarea as UiTextarea } from "@ui-sdk/react/textarea";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

type UiFieldProps = ComponentProps<typeof UiField>;

export interface FieldProps extends Omit<
  UiFieldProps,
  "className" | "children" | "render"
> {
  className?: string;
  /** Names the control inside. */
  label: ReactNode;
  /** Help text, announced with the control. */
  hint?: ReactNode;
  /**
   * An error your code decided, like one from the server. Without it the
   * field shows the browser's own message once a submit finds it invalid.
   */
  error?: ReactNode;
  /** Marks the label "Optional". */
  optional?: boolean;
  /** The control: Input, Textarea, NumberInput, Select, Combobox and so on. */
  children: ReactNode;
}

/**
 * A label, hint and error wired to the control inside. UI SDK Field supplies
 * the ids, `aria-describedby`, `aria-invalid` and native validation.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
  invalid,
  ...props
}: FieldProps) {
  return (
    <UiField
      className={cx("td-field", className)}
      invalid={error ? true : invalid}
      {...props}
    >
      <UiFieldLabel className="td-field__label">
        {label}
        {optional ? <span className="td-field__optional">Optional</span> : null}
      </UiFieldLabel>
      {children}
      {hint ? (
        <UiFieldDescription className="td-field__hint">
          {hint}
        </UiFieldDescription>
      ) : null}
      {error ? (
        <UiFieldError className="td-field__error" match>
          <Icon name="alert" />
          <span>{error}</span>
        </UiFieldError>
      ) : (
        <UiFieldError className="td-field__error" />
      )}
    </UiField>
  );
}

type UiInputProps = ComponentProps<typeof UiInput>;

export interface InputProps extends Omit<UiInputProps, "className" | "render"> {
  className?: string;
  /** A decorative icon at the start of the field. */
  icon?: ReactNode;
  /** Adds a button that empties the field. */
  clearable?: boolean;
  /** The clear button's name. */
  clearLabel?: string;
}

/** A single line of text. UI SDK Input, inside a `Field` or with `aria-label`. */
export function Input({
  className,
  icon,
  clearable = false,
  clearLabel = "Clear",
  ...props
}: InputProps) {
  if (!icon && !clearable) {
    return <UiInput className={cx("td-input", className)} {...props} />;
  }
  return (
    <UiInputGroup className={cx("td-inputgroup", className)}>
      {icon ? <span className="td-inputgroup__icon">{icon}</span> : null}
      <UiInput className="td-inputgroup__input" {...props} />
      {clearable ? (
        <UiInputClear aria-label={clearLabel} className="td-inputgroup__clear">
          <Icon name="close" />
        </UiInputClear>
      ) : null}
    </UiInputGroup>
  );
}

type UiTextareaProps = ComponentProps<typeof UiTextarea>;

export interface TextareaProps extends Omit<
  UiTextareaProps,
  "className" | "render"
> {
  className?: string;
}

/** Several lines of text. UI SDK Textarea; `autoResize` grows it as you type. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <UiTextarea className={cx("td-input td-textarea", className)} {...props} />
  );
}

type UiNumberInputProps = ComponentProps<typeof UiNumberInput>;

export interface NumberInputProps extends Omit<
  UiNumberInputProps,
  "className" | "children"
> {
  className?: string;
  placeholder?: string;
  decrementLabel?: string;
  incrementLabel?: string;
}

/**
 * A number with step buttons. UI SDK Number Input: arrow keys step, Page keys
 * take large steps, and the value is clamped and formatted on commit.
 */
export function NumberInput({
  className,
  placeholder,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: NumberInputProps) {
  return (
    <UiNumberInput className={cx("td-number", className)} {...props}>
      <UiNumberInputGroup className="td-number__group">
        <UiNumberInputDecrement
          aria-label={decrementLabel}
          className="td-number__step"
        >
          <Icon name="minus" />
        </UiNumberInputDecrement>
        <UiNumberInputControl
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className="td-number__control"
          placeholder={placeholder}
        />
        <UiNumberInputIncrement
          aria-label={incrementLabel}
          className="td-number__step"
        >
          <Icon name="plus" />
        </UiNumberInputIncrement>
      </UiNumberInputGroup>
    </UiNumberInput>
  );
}
