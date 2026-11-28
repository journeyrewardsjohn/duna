"use client";

import {
  Button,
  Checkbox,
  Field,
  Icon,
  IconButton,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from "@duna/ui/tideline";
import { useState } from "react";
import {
  type EditField,
  editFields,
  type HoursWindow,
  readPath,
  writePath,
} from "./setup-model";

const weekdays = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

/** Opening hours by day: open or closed, with the opening and closing time. */
export function HoursEditor({
  value,
  onChange,
  idPrefix,
}: {
  readonly value: readonly HoursWindow[];
  readonly onChange: (next: HoursWindow[]) => void;
  readonly idPrefix: string;
}) {
  const byDay = new Map(value.map((window) => [window.weekday, window]));
  const set = (weekday: number, window: HoursWindow | undefined) => {
    const next = value.filter((w) => w.weekday !== weekday);
    if (window) next.push(window);
    onChange(next.sort((a, b) => a.weekday - b.weekday));
  };
  return (
    <fieldset className="setup-hours">
      <legend className="td-sr">Opening hours by day</legend>
      {weekdays.map(({ weekday, label }) => {
        const window = byDay.get(weekday);
        return (
          <div className="setup-hours__day" key={weekday}>
            <Checkbox
              checked={Boolean(window)}
              label={label}
              onCheckedChange={(checked) =>
                set(
                  weekday,
                  checked
                    ? (window ?? { weekday, opens: "08:00", closes: "20:00" })
                    : undefined,
                )
              }
            />
            {window ? (
              <span className="setup-hours__times">
                <Input
                  aria-label={`${label} opens`}
                  id={`${idPrefix}-${weekday}-opens`}
                  onChange={(event) =>
                    set(weekday, {
                      ...window,
                      opens: event.currentTarget.value,
                    })
                  }
                  type="time"
                  value={window.opens}
                />
                <span aria-hidden="true">to</span>
                <Input
                  aria-label={`${label} closes`}
                  id={`${idPrefix}-${weekday}-closes`}
                  onChange={(event) =>
                    set(weekday, {
                      ...window,
                      closes: event.currentTarget.value,
                    })
                  }
                  type="time"
                  value={window.closes}
                />
              </span>
            ) : (
              <span className="setup-quiet">Closed</span>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  id,
  currency,
}: {
  readonly field: EditField;
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
  readonly id: string;
  readonly currency: string;
}) {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? String(value)
        : "";
  switch (field.kind) {
    case "textarea":
      return (
        <Textarea
          id={id}
          onChange={(event) => onChange(event.currentTarget.value)}
          rows={4}
          value={text}
        />
      );
    case "number":
      return (
        <Input
          id={id}
          inputMode="numeric"
          onChange={(event) => {
            const raw = event.currentTarget.value.trim();
            onChange(raw === "" ? undefined : Number(raw));
          }}
          type="number"
          value={text}
        />
      );
    case "money": {
      const price = (value ?? null) as {
        amountMinor?: number;
        currency?: string;
      } | null;
      return (
        <MoneyInput
          currency={price?.currency ?? currency}
          id={id}
          onValueChange={(minor) =>
            onChange(
              minor === null
                ? null
                : {
                    ...(price ?? {}),
                    amountMinor: minor,
                    currency: price?.currency ?? currency,
                  },
            )
          }
          value={price?.amountMinor ?? null}
        />
      );
    }
    case "select":
      return (
        <Select
          id={id}
          onValueChange={(next) => onChange(next ?? undefined)}
          options={field.options ?? []}
          value={text || null}
        />
      );
    case "sports": {
      const values = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (sport: string, on: boolean) =>
        onChange(
          on
            ? [...new Set([...values, sport])].sort()
            : values.filter((v) => v !== sport),
        );
      return (
        <div className="setup-checks">
          <Checkbox
            checked={values.includes("beach")}
            label="Beach volleyball"
            onCheckedChange={(on) => toggle("beach", on === true)}
          />
          <Checkbox
            checked={values.includes("indoor")}
            label="Indoor volleyball"
            onCheckedChange={(on) => toggle("indoor", on === true)}
          />
        </div>
      );
    }
    case "hours":
      return (
        <HoursEditor
          idPrefix={id}
          onChange={onChange}
          value={Array.isArray(value) ? (value as HoursWindow[]) : []}
        />
      );
    case "color":
      return (
        <span className="setup-colour-input">
          <input
            aria-label={`${field.label} picker`}
            className="setup-colour-input__swatch"
            onChange={(event) =>
              onChange(event.currentTarget.value.toUpperCase())
            }
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(text) ? text : "#0E1A22"}
          />
          <Input
            id={id}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder="#1A2B3C"
            value={text}
          />
        </span>
      );
    default:
      return (
        <Input
          id={id}
          onChange={(event) => onChange(event.currentTarget.value)}
          type={field.kind === "text" ? "text" : field.kind}
          value={text}
        />
      );
  }
}

/**
 * The same form a person fills by hand, opened on a proposal's value:
 * Ask Duna stages the value, the person edits and saves it (one form, two
 * drivers). Policies take their notice in hours and save minutes.
 */
export function FactEditor({
  fieldKey,
  initial,
  currency,
  idPrefix,
  error,
  pending,
  onSave,
  onCancel,
}: {
  readonly fieldKey: string;
  readonly initial: Record<string, unknown>;
  readonly currency: string;
  readonly idPrefix: string;
  readonly error?: string;
  readonly pending?: boolean;
  readonly onSave: (value: Record<string, unknown>) => void;
  readonly onCancel: () => void;
}) {
  const fields = editFields(fieldKey);
  const policy = fieldKey.startsWith("policies.");
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    policy && typeof initial.refundBeforeMinutes === "number"
      ? { ...initial, refundBeforeMinutes: initial.refundBeforeMinutes / 60 }
      : initial,
  );
  const save = () => {
    const value =
      policy && typeof draft.refundBeforeMinutes === "number"
        ? {
            ...draft,
            refundBeforeMinutes: Math.round(draft.refundBeforeMinutes * 60),
          }
        : draft;
    onSave(value);
  };
  return (
    <form
      className="setup-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key.replace(/\./g, "-")}`;
        return (
          <Field
            hint={field.hint}
            key={field.key}
            label={field.label}
            optional={field.optional}
          >
            <FieldControl
              currency={currency}
              field={field}
              id={id}
              onChange={(next) =>
                setDraft((current) => writePath(current, field.key, next))
              }
              value={readPath(draft, field.key)}
            />
          </Field>
        );
      })}
      {error ? (
        <p className="setup-editor__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-editor__actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button loading={pending} type="submit" variant="secondary">
          Keep my edit
        </Button>
      </div>
    </form>
  );
}

/** A small icon button to remove a row (socials). */
export function RemoveButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <IconButton label={label} onClick={onClick} size="sm" variant="ghost">
      <Icon name="close" size="inline" />
    </IconButton>
  );
}
