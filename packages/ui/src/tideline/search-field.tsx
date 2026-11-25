"use client";

import {
  Input as UiInput,
  InputClear as UiInputClear,
  InputGroup as UiInputGroup,
} from "@ui-sdk/react/input";
import { type ReactNode, useId, useState } from "react";
import { Button } from "./button";
import { cx } from "./cx";
import { useDebouncedCallback } from "./debounce";
import { Icon } from "./icons";
import { Sunspot } from "./loaders";
import {
  resolveSearchState,
  type SearchFieldState,
  type SearchStatus,
} from "./search-state";

export interface SearchFieldMessages {
  /** Shown before anything is typed. */
  idle: ReactNode;
  typing: ReactNode;
  searching: ReactNode;
  results: (count: number | undefined) => ReactNode;
  empty: (query: string) => ReactNode;
  error: ReactNode;
  offline: ReactNode;
  retry: ReactNode;
  clear: string;
}

const defaultMessages: SearchFieldMessages = {
  idle: "",
  typing: "Keep typing, or pause to search.",
  searching: "Searching…",
  results: (count) =>
    count === undefined
      ? "Results below."
      : `${count} ${count === 1 ? "result" : "results"}.`,
  empty: (query) => `No results for “${query}”.`,
  error: "Search did not finish. Try again.",
  offline: "You are offline. Search works again when you are back online.",
  retry: "Try again",
  clear: "Clear search",
};

export interface SearchFieldProps {
  /** Names the field. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Called with the trimmed text once typing has paused for `debounce`, at once
   * on Enter, and with `""` when the field is emptied. The caller fetches and
   * reports back through `status`; this component fetches nothing.
   */
  onSearch: (query: string) => void;
  /** Milliseconds of quiet before `onSearch` runs. */
  debounce?: number;
  /** Fewer trimmed characters than this is not searched. */
  minLength?: number;
  /** The caller's data status for the last search it started. */
  status?: SearchStatus;
  /** Forces the state shown, for documentation and tests. */
  state?: SearchFieldState;
  /** How many results there are, for the announcement. */
  resultCount?: number;
  /** Runs the last search again from the error state. */
  onRetry?: () => void;
  placeholder?: string;
  messages?: Partial<SearchFieldMessages>;
  /** The results, shown only in the `results` state. */
  children?: ReactNode;
  className?: string;
}

/**
 * A search box that waits for a pause before it asks. It renders one of seven
 * states (idle, typing, searching, results, no results, error, offline) and
 * announces each through a status region. Built on UI SDK Input and
 * `useDebouncedCallback`.
 */
export function SearchField({
  label,
  value,
  defaultValue = "",
  onValueChange,
  onSearch,
  debounce = 300,
  minLength = 1,
  status = "idle",
  state: forcedState,
  resultCount,
  onRetry,
  placeholder,
  messages,
  children,
  className,
}: SearchFieldProps) {
  const text = { ...defaultMessages, ...messages };
  const statusId = useId();
  const [inner, setInner] = useState(defaultValue);
  const [pending, setPending] = useState(false);
  const query = value ?? inner;

  const search = useDebouncedCallback((next: string) => {
    setPending(false);
    onSearch(next);
  }, debounce);

  const state: SearchFieldState =
    forcedState ?? resolveSearchState({ query, pending, status, minLength });

  const change = (next: string) => {
    setInner(next);
    onValueChange?.(next);
    const trimmed = next.trim();
    if (trimmed.length < Math.max(1, minLength)) {
      search.cancel();
      setPending(false);
      onSearch("");
      return;
    }
    setPending(true);
    search(trimmed);
  };

  const message: ReactNode = {
    idle: text.idle,
    typing: text.typing,
    searching: text.searching,
    results: text.results(resultCount),
    empty: text.empty(query.trim()),
    error: text.error,
    offline: text.offline,
  }[state];

  return (
    <div className={cx("td-search", className)} data-state={state}>
      <UiInputGroup className="td-search__box">
        <span className="td-search__icon">
          {state === "typing" || state === "searching" ? (
            <Sunspot />
          ) : (
            <Icon name="search" />
          )}
        </span>
        <UiInput
          aria-describedby={statusId}
          aria-label={label}
          autoComplete="off"
          className="td-search__input"
          enterKeyHint="search"
          onKeyDown={(event) => {
            if (event.key === "Enter") search.flush();
          }}
          onValueChange={change}
          placeholder={placeholder}
          spellCheck={false}
          type="search"
          value={query}
        />
        <UiInputClear aria-label={text.clear} className="td-search__clear">
          <Icon name="close" />
        </UiInputClear>
      </UiInputGroup>
      <div className="td-search__status">
        <p className="td-search__message" id={statusId} role="status">
          {message}
        </p>
        {state === "error" && onRetry ? (
          <Button onClick={onRetry} size="sm" variant="secondary">
            {text.retry}
          </Button>
        ) : null}
      </div>
      {state === "results" && children ? (
        <div className="td-search__results">{children}</div>
      ) : null}
    </div>
  );
}
