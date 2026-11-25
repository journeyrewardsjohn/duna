"use client";

import {
  Input as UiInput,
  InputClear as UiInputClear,
  InputGroup as UiInputGroup,
} from "@ui-sdk/react/input";
import { type ReactNode, useId } from "react";
import { Button } from "./button";
import { cx } from "./cx";
import { Icon } from "./icons";
import type { AsyncSearchStatus } from "./interaction-core";
import { useDelayedLoading } from "./interactions";
import { Spinner } from "./loaders";

/** What a search field shows. `offline` is the caller's to set. */
export type SearchFieldStatus = AsyncSearchStatus | "offline";

export interface SearchFieldMessages {
  idle: ReactNode;
  loading: ReactNode;
  success: (count: number | undefined) => ReactNode;
  empty: (query: string) => ReactNode;
  error: ReactNode;
  offline: ReactNode;
  retry: ReactNode;
  clear: string;
}

const defaultMessages: SearchFieldMessages = {
  idle: "",
  loading: "Searching…",
  success: (count) =>
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
  /** The text. Pass `query` from `useAsyncSearch`. */
  value: string;
  /** Called on every keystroke. Pass `setQuery` from `useAsyncSearch`. */
  onValueChange: (value: string) => void;
  /** Called on Enter. Pass `submit` from `useAsyncSearch`. */
  onSubmit?: () => void;
  /** Where the search is. Pass `status` from `useAsyncSearch`. */
  status?: SearchFieldStatus;
  /** The results on screen answer an earlier query: they are dimmed. */
  stale?: boolean;
  /** How many results there are, for the announcement. */
  resultCount?: number;
  /** Runs the search again from the error state. */
  onRetry?: () => void;
  placeholder?: string;
  messages?: Partial<SearchFieldMessages>;
  /** The results. They stay on screen while the next ones load. */
  children?: ReactNode;
  className?: string;
}

/**
 * A search box with every state drawn: idle, loading, success, empty, error
 * and offline, each announced through a status region. It owns no timing and
 * fetches nothing: drive it with `useAsyncSearch`, which debounces, cancels
 * and keeps results steady. The spinner waits 250ms before it shows. Built
 * on UI SDK Input. Parts: Root, Icon, Input, Clear, Status, Results.
 */
export function SearchField({
  label,
  value,
  onValueChange,
  onSubmit,
  status = "idle",
  stale = false,
  resultCount,
  onRetry,
  placeholder,
  messages,
  children,
  className,
}: SearchFieldProps) {
  const text = { ...defaultMessages, ...messages };
  const statusId = useId();
  const busy = useDelayedLoading(status === "loading");

  const message: ReactNode = {
    idle: text.idle,
    // Say "Searching" only once the wait is long enough to show.
    loading: busy ? text.loading : "",
    success: text.success(resultCount),
    empty: text.empty(value.trim()),
    error: text.error,
    offline: text.offline,
  }[status];

  return (
    <div
      aria-busy={status === "loading" || undefined}
      className={cx("td-search", className)}
      data-state={status}
    >
      <UiInputGroup className="td-search__box">
        <span className="td-search__icon">
          {busy ? <Spinner /> : <Icon name="search" />}
        </span>
        <UiInput
          aria-describedby={statusId}
          aria-label={label}
          autoComplete="off"
          className="td-search__input"
          enterKeyHint="search"
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit?.();
          }}
          onValueChange={onValueChange}
          placeholder={placeholder}
          spellCheck={false}
          type="search"
          value={value}
        />
        <UiInputClear aria-label={text.clear} className="td-search__clear">
          <Icon name="close" size="sm" />
        </UiInputClear>
      </UiInputGroup>
      <div className="td-search__status">
        <p className="td-search__message" id={statusId} role="status">
          {message}
        </p>
        {status === "error" && onRetry ? (
          <Button onClick={onRetry} size="sm" variant="secondary">
            {text.retry}
          </Button>
        ) : null}
      </div>
      {children && status !== "idle" ? (
        <div className="td-search__results" data-stale={stale ? "" : undefined}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
