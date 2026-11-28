"use client";

/**
 * Form behaviour on the UI SDK parts already wrapped in `field/`: validate on
 * blur and on submit (never per keystroke, except to clear an error once it
 * is fixed), map server errors to their fields, focus the first invalid
 * field and announce how many need attention, money and character inputs
 * that never fight the caret, and a submit bar wired to `useSubmit` and the
 * autosave indicator.
 */
import {
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { Button } from "../button/button";
import { Input, type InputProps } from "../field/field";
import type { AutosaveStatus as AutosaveStatusName } from "../interactions/autosave-core";
import type { FieldErrors } from "../interactions/errors";
import {
  focusFirstInvalid,
  type FormValues,
  preventKeyRepeat,
  readFormValues,
  type UseSubmit,
  useSubmit,
  type UseSubmitOptions,
} from "../interactions/kit-hooks";
import type { ActionContext } from "../interactions/submit-core";
import { ReferenceLine } from "../states/states";
import {
  characterCount,
  cleanErrors,
  currencySymbol,
  editableMoney,
  errorSummary,
  formatMoneyInput,
  type MoneyFormat,
  mergeErrors,
  parseMoneyMinor,
  sanitizeMoney,
} from "./form-core";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type Validate = (
  values: FormValues,
) => Record<string, string | undefined | null | false>;

export interface UseFormBehaviourOptions<
  Result,
> extends UseSubmitOptions<Result> {
  /** Client rules: field name to message (empty for valid). Runs on blur and submit. */
  validate?: Validate;
  /** Sends the form. Gets the idempotency key for this attempt. */
  submit: (values: FormValues, context: ActionContext) => Promise<Result>;
}

export interface UseFormBehaviour<Result> extends UseSubmit<Result> {
  /** Client and server errors by field name: pass `errors[name]` to `Field error`. */
  errors: FieldErrors;
  /** "2 fields need attention." after a failed submit; render with `FormStatus`. */
  announcement: string;
  /** A failure that belongs to no field, in plain words. */
  formError: unknown;
  /** Spread on the `<form>`. */
  formProps: UseSubmit<Result>["formProps"] & {
    noValidate: true;
    onBlur: (event: FocusEvent<HTMLFormElement>) => void;
    onInput: (event: FormEvent<HTMLFormElement>) => void;
  };
}

const without = (errors: FieldErrors, name: string): FieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => key !== name));

const nameOf = (target: EventTarget | null): string | undefined => {
  const element = target as HTMLInputElement | null;
  if (element?.name) return element.name;
  // A control inside a Field without its own name (UI SDK gives the input the field's name).
  const field = element?.closest?.('[data-slot="field"]');
  return field?.querySelector<HTMLInputElement>("input[name], textarea[name]")
    ?.name;
};

/**
 * A form that behaves well: see the file comment. Pass `errors[name]` to each
 * Field, render `FormStatus` once for the announcement and any form-level
 * error, and finish with `SubmitBar`.
 */
export function useFormBehaviour<Result>({
  validate,
  submit,
  ...options
}: UseFormBehaviourOptions<Result>): UseFormBehaviour<Result> {
  const latestValidate = useRef(validate);
  useEffect(() => {
    latestValidate.current = validate;
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [announcement, setAnnouncement] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  const sent = useSubmit<Result>(submit, options);
  const { fieldErrors, clearFieldError } = sent;
  const errors = useMemo(
    () => mergeErrors(clientErrors, fieldErrors),
    [clientErrors, fieldErrors],
  );

  const check = useCallback((form: HTMLFormElement) => {
    const rules = latestValidate.current;
    return rules ? cleanErrors(rules(readFormValues(form))) : {};
  }, []);

  useEffect(() => {
    if (sent.status !== "error") return;
    const count = Object.keys(sent.fieldErrors).length;
    if (count > 0) setAnnouncement(errorSummary(sent.fieldErrors));
  }, [sent.status, sent.fieldErrors]);

  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    const name = nameOf(event.target);
    if (!name) return;
    // Leaving a field the person has not typed in yet says nothing.
    const input = event.target as unknown as HTMLInputElement;
    if (!input.value && !(name in clientErrors)) return;
    const message = check(event.currentTarget)[name];
    setClientErrors((current) => {
      if (current[name] === message) return current;
      const rest = without(current, name);
      return message ? { ...rest, [name]: message } : rest;
    });
  };

  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const name = nameOf(event.target);
    if (!name) return;
    if (name in fieldErrors) clearFieldError(name);
    // Only ever clear while typing: a fixed field stops complaining at once.
    if (!(name in clientErrors)) return;
    if (!check(event.currentTarget)[name]) {
      setClientErrors((current) => without(current, name));
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sent.pending) return;
    const form = event.currentTarget;
    const found = check(form);
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      setAnnouncement(errorSummary(found));
      focusFirstInvalid(form, found);
      return;
    }
    setAnnouncement("");
    void sent.run(readFormValues(form));
  };

  const formError =
    sent.status === "error" && Object.keys(sent.fieldErrors).length === 0
      ? sent.error
      : null;

  return {
    ...sent,
    errors,
    announcement,
    formError,
    formProps: {
      ...sent.formProps,
      ref: (form) => {
        formRef.current = form;
        sent.formProps.ref(form);
      },
      noValidate: true,
      onBlur,
      onInput,
      onSubmit,
    },
  };
}

export interface FormStatusProps {
  form: Pick<
    UseFormBehaviour<unknown>,
    "announcement" | "formError" | "reference"
  >;
  /** Plain words for a failure that belongs to no field. */
  errorMessage?: string;
  className?: string;
}

/**
 * Announces "2 fields need attention" after a failed submit, and shows a
 * failure that belongs to no field, with its reference.
 */
export function FormStatus({
  form,
  errorMessage = "That did not save. Nothing was lost: try again.",
  className,
}: FormStatusProps) {
  return (
    <div className={cx("td-formstatus", className)}>
      <p aria-live="polite" className="td-sr" role="status">
        {form.announcement}
      </p>
      {form.formError ? (
        <div className="td-formstatus__error" role="alert">
          <Icon name="alert" size="sm" />
          <div>
            <p>{errorMessage}</p>
            {form.reference ? (
              <ReferenceLine reference={form.reference} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface MoneyInputProps extends Omit<
  InputProps,
  "value" | "defaultValue" | "onValueChange" | "type" | "icon"
> {
  /** The amount in minor units (cents); null for empty. */
  value: number | null;
  onValueChange: (minor: number | null) => void;
  /** ISO currency: "USD". Shows its symbol and sets the decimals. */
  currency?: string;
  locale?: string;
  /** Overrides the currency's decimals. */
  decimals?: number;
  /** Submits the minor units under this name. */
  name?: string;
}

const decimalsFor = (currency: string, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;

/**
 * A money field that formats without fighting the caret: while focused it
 * takes digits and one point (anything else is dropped where it was typed,
 * the caret staying put); on blur it shows the grouped amount. The value is
 * minor units, so no float ever reaches the server.
 */
export function MoneyInput({
  value,
  onValueChange,
  currency = "USD",
  locale = "en-US",
  decimals,
  name,
  className,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const places = decimals ?? decimalsFor(currency, locale);
  const format: MoneyFormat = { decimals: places };
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => editableMoney(value, format));
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // Outside edits (a reset, a proposal) replace the draft while not typing.
  useEffect(() => {
    if (!focused) setDraft(editableMoney(value, format));
  }, [value, focused, places]);

  useIsomorphicLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const shown = focused
    ? draft
    : formatMoneyInput(value, { ...format, locale });
  return (
    <>
      <Input
        {...props}
        className={cx("td-money", className)}
        icon={
          <span aria-hidden="true" className="td-money__symbol">
            {currencySymbol(currency, locale)}
          </span>
        }
        inputMode={places > 0 ? "decimal" : "numeric"}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          setDraft(editableMoney(value, format));
          onFocus?.(event);
        }}
        onValueChange={(next) => {
          const typed = String(next ?? "");
          const at = ref.current?.selectionStart ?? typed.length;
          const edited = sanitizeMoney(typed, at, format);
          caret.current = edited.caret;
          setDraft(edited.text);
          onValueChange(parseMoneyMinor(edited.text, format));
        }}
        ref={ref}
        value={shown}
      />
      {name ? <input name={name} type="hidden" value={value ?? ""} /> : null}
    </>
  );
}

export interface CharacterCounterProps {
  value: string;
  max: number;
  className?: string;
}

/**
 * "42 / 160" under a field (put it in the Field's `hint`). Announced only near
 * and over the limit, so screen readers are not read every keystroke.
 */
export function CharacterCounter({
  value,
  max,
  className,
}: CharacterCounterProps) {
  const { count, remaining, over, near } = characterCount(value, max);
  const spoken = over
    ? `${-remaining} characters over the limit`
    : `${remaining} characters left`;
  return (
    <span
      className={cx("td-charcount", className)}
      data-over={over ? "" : undefined}
    >
      <span aria-hidden="true" className="td-num">
        {count} / {max}
      </span>
      <span aria-live="polite" className="td-sr">
        {near ? spoken : ""}
      </span>
    </span>
  );
}

export interface AutosaveStatusProps {
  status: AutosaveStatusName;
  savedAt?: number | null;
  onRetry?: () => void;
  className?: string;
}

const clock = (at: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);

/**
 * The draft's state, quietly: "Saving…", "Saved at 10:42", "Couldn't save"
 * with Try again, or "Unsaved changes". Keeps its height when empty, so
 * nothing moves when it appears.
 */
export function AutosaveStatus({
  status,
  savedAt,
  onRetry,
  className,
}: AutosaveStatusProps) {
  let text: ReactNode = null;
  if (status === "saving") text = "Saving…";
  else if (status === "saved")
    text = savedAt ? `Saved at ${clock(savedAt)}` : "Saved";
  else if (status === "dirty") text = "Unsaved changes";
  else if (status === "error") text = "Couldn't save your draft.";
  return (
    <span
      className={cx("td-autosave", className)}
      data-status={status}
      role="status"
    >
      {status === "saved" ? <Icon name="check" size="sm" /> : null}
      {status === "error" ? <Icon name="alert" size="sm" /> : null}
      <span>{text}</span>
      {status === "error" && onRetry ? (
        <Button onClick={onRetry} size="sm" variant="ghost">
          Try again
        </Button>
      ) : null}
    </span>
  );
}

export interface SubmitBarProps {
  /** A `useFormBehaviour` or `useSubmit`: its pending state drives the button. */
  form: Pick<UseSubmit<unknown>, "pending" | "status">;
  /** The verb: "Save practice", never "Submit". */
  label: string;
  /** Said briefly after a success: "Saved". */
  successLabel?: string;
  /** For a submit that sends, pays or publishes: the sentence for `data-agent-confirm`. */
  agentConfirm?: string;
  /** The draft's autosave, shown at the start of the bar. */
  autosave?: {
    status: AutosaveStatusName;
    savedAt: number | null;
    retry: () => unknown;
  };
  /** Cancel, Save draft: before the primary. */
  secondary?: ReactNode;
  /** Pin to the bottom of the viewport (forms longer than a screen). */
  sticky?: boolean;
  variant?: "primary" | "danger";
  className?: string;
}

/**
 * The end of a form: status on the left (autosave or the last result), then
 * the actions, the primary last. Sticky on long forms so the action is
 * always in reach. The primary submits once however often it is pressed.
 */
export function SubmitBar({
  form,
  label,
  successLabel = "Saved",
  agentConfirm,
  autosave,
  secondary,
  sticky = false,
  variant = "primary",
  className,
}: SubmitBarProps) {
  return (
    <div
      className={cx(
        "td-submitbar",
        sticky && "td-submitbar--sticky",
        className,
      )}
    >
      <div className="td-submitbar__status">
        {autosave ? (
          <AutosaveStatus
            onRetry={() => void autosave.retry()}
            savedAt={autosave.savedAt}
            status={autosave.status}
          />
        ) : (
          <span className="td-autosave" data-status={form.status} role="status">
            {form.status === "success" ? (
              <>
                <Icon name="check" size="sm" />
                <span>{successLabel}</span>
              </>
            ) : null}
          </span>
        )}
      </div>
      <div className="td-submitbar__actions">
        {secondary}
        <Button
          data-agent-confirm={agentConfirm}
          loading={form.pending}
          onKeyDown={preventKeyRepeat}
          type="submit"
          variant={variant}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
