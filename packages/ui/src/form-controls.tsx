import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

function classNames(...values: (string | undefined | false)[]): string {
  return values.filter(Boolean).join(" ");
}

/**
 * Origin UI-inspired form primitives for Duna's non-Tailwind applications.
 * They intentionally preserve native form semantics while standardizing the
 * label, hint, validation, input adornment, and select affordances.
 */
export function Field({
  children,
  className,
  error,
  hint,
  htmlFor,
  label,
  required = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly error?: string;
  readonly hint?: ReactNode;
  readonly htmlFor?: string;
  readonly label: ReactNode;
  readonly required?: boolean;
}) {
  return (
    <div className={classNames("duna-field", className)}>
      <label className="duna-field__label" htmlFor={htmlFor}>
        <span>{label}</span>
        {required && <em aria-hidden>Required</em>}
      </label>
      {children}
      {error ? (
        <small className="duna-field__error" role="alert">
          {error}
        </small>
      ) : hint ? (
        <small className="duna-field__hint">{hint}</small>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    readonly endAdornment?: ReactNode;
    readonly groupClassName?: string;
    readonly startAdornment?: ReactNode;
  }
>(function Input(
  { className, endAdornment, groupClassName, startAdornment, ...props },
  ref,
) {
  if (!startAdornment && !endAdornment) {
    return (
      <input
        className={classNames("duna-input", className)}
        ref={ref}
        {...props}
      />
    );
  }

  return (
    <span
      className={classNames(
        "duna-input-group",
        groupClassName,
        Boolean(startAdornment) && "duna-input-group--has-start",
        Boolean(endAdornment) && "duna-input-group--has-end",
      )}
    >
      {startAdornment && (
        <span aria-hidden className="duna-input-group__start">
          {startAdornment}
        </span>
      )}
      <input
        className={classNames("duna-input", className)}
        ref={ref}
        {...props}
      />
      {endAdornment && (
        <span aria-hidden className="duna-input-group__end">
          {endAdornment}
        </span>
      )}
    </span>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ children, className, ...props }, ref) {
  return (
    <span className="duna-select">
      <select
        className={classNames("duna-input", className)}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <span aria-hidden className="duna-select__indicator">
        ⌄
      </span>
    </span>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      className={classNames("duna-input", "duna-textarea", className)}
      ref={ref}
      {...props}
    />
  );
});

export function QuantityStepper({
  decrementLabel = "Decrease quantity",
  disabled = false,
  incrementLabel = "Increase quantity",
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onValueChange,
  value,
}: {
  readonly decrementLabel?: string;
  readonly disabled?: boolean;
  readonly incrementLabel?: string;
  readonly max?: number;
  readonly min?: number;
  readonly onValueChange: (value: number) => void;
  readonly value: number;
}) {
  return (
    <span className="duna-stepper">
      <button
        aria-label={decrementLabel}
        disabled={disabled || value <= min}
        onClick={() => onValueChange(Math.max(min, value - 1))}
        type="button"
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        aria-label={incrementLabel}
        disabled={disabled || value >= max}
        onClick={() => onValueChange(Math.min(max, value + 1))}
        type="button"
      >
        +
      </button>
    </span>
  );
}
