import {
  Combobox as UiCombobox,
  ComboboxClear as UiComboboxClear,
  ComboboxContent as UiComboboxContent,
  ComboboxEmpty as UiComboboxEmpty,
  ComboboxInput as UiComboboxInput,
  ComboboxItem as UiComboboxItem,
  ComboboxItemIndicator as UiComboboxItemIndicator,
  ComboboxList as UiComboboxList,
  ComboboxTrigger as UiComboboxTrigger,
} from "@ui-sdk/react/combobox";
import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectItem as UiSelectItem,
  SelectItemIndicator as UiSelectItemIndicator,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from "@ui-sdk/react/select";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function normalizeOptions(
  options: ReadonlyArray<SelectOption | string>,
): SelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

type UiSelectProps = ComponentProps<typeof UiSelect<string, false>>;
type ValueProps = "value" | "defaultValue" | "onValueChange";
type SelectChangeDetails = Parameters<
  NonNullable<UiSelectProps["onValueChange"]>
>[1];

export interface SelectProps extends Omit<
  UiSelectProps,
  "children" | "items" | "multiple" | ValueProps
> {
  className?: string;
  /** The chosen value; `null` when nothing is chosen. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null, details: SelectChangeDetails) => void;
  options: ReadonlyArray<SelectOption | string>;
  /** Names the trigger when the select is not inside a `Field`. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  id?: string;
}

/**
 * One value from a popup list. UI SDK Select: arrow keys, Home and End,
 * typeahead on the trigger and in the list, Escape to close, focus returned.
 */
export function Select({
  options,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SelectProps) {
  const items = normalizeOptions(options);
  return (
    <UiSelect<string, false> items={items} {...props}>
      <UiSelectTrigger
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cx("td-input td-select", className)}
        id={id}
      >
        <UiSelectValue className="td-select__value" />
        <Icon className="td-select__chevron" name="chevron-down" />
      </UiSelectTrigger>
      <UiSelectContent className="td-popup td-listbox" sideOffset={6}>
        {items.map((item) => (
          <UiSelectItem
            className="td-option"
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            <span className="td-option__label">{item.label}</span>
            <UiSelectItemIndicator className="td-option__check">
              <Icon name="check" />
            </UiSelectItemIndicator>
          </UiSelectItem>
        ))}
      </UiSelectContent>
    </UiSelect>
  );
}

type UiComboboxProps = ComponentProps<typeof UiCombobox<string, false>>;
type ComboboxChangeDetails = Parameters<
  NonNullable<UiComboboxProps["onValueChange"]>
>[1];

export interface ComboboxProps extends Omit<
  UiComboboxProps,
  "children" | "items" | "multiple" | ValueProps
> {
  className?: string;
  /** The chosen value; `null` when nothing is chosen. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (
    value: string | null,
    details: ComboboxChangeDetails,
  ) => void;
  options: ReadonlyArray<SelectOption | string>;
  placeholder?: string;
  /** Shown when nothing matches what was typed. */
  emptyText?: ReactNode;
  /** The name of the button that opens the list. */
  toggleLabel?: string;
  /** The name of the button that clears the value. */
  clearLabel?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  id?: string;
}

/**
 * Search a list and choose one value. UI SDK Combobox: typing filters and
 * opens the list, arrow keys move the highlight, Enter chooses, Escape closes.
 */
export function Combobox({
  options,
  className,
  placeholder,
  emptyText = "No matches",
  toggleLabel = "Show options",
  clearLabel = "Clear",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: ComboboxProps) {
  const items = normalizeOptions(options);
  return (
    <UiCombobox<string, false> items={items} {...props}>
      <div className={cx("td-combobox", className)}>
        <UiComboboxInput
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className="td-input td-combobox__input"
          id={id}
          placeholder={placeholder}
        />
        <UiComboboxClear aria-label={clearLabel} className="td-combobox__clear">
          <Icon name="close" />
        </UiComboboxClear>
        <UiComboboxTrigger
          aria-label={toggleLabel}
          className="td-combobox__toggle"
        >
          <Icon name="chevron-down" />
        </UiComboboxTrigger>
      </div>
      <UiComboboxContent className="td-popup td-listbox" sideOffset={6}>
        <UiComboboxList className="td-listbox__list">
          {items.map((item) => (
            <UiComboboxItem
              className="td-option"
              disabled={item.disabled}
              key={item.value}
              value={item.value}
            >
              <span className="td-option__label">{item.label}</span>
              <UiComboboxItemIndicator className="td-option__check">
                <Icon name="check" />
              </UiComboboxItemIndicator>
            </UiComboboxItem>
          ))}
        </UiComboboxList>
        <UiComboboxEmpty className="td-listbox__empty">
          {emptyText}
        </UiComboboxEmpty>
      </UiComboboxContent>
    </UiCombobox>
  );
}
