"use client";

import { Check, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface PlayerComboboxOption {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly isProfessional?: boolean;
  readonly profileClaimStatus?: string;
  readonly rating?: number;
  readonly connection?: "organization" | "duna";
}

function uniqueOptions(
  options: readonly PlayerComboboxOption[],
): readonly PlayerComboboxOption[] {
  return [...new Map(options.map((option) => [option.id, option])).values()];
}

function searchRank(option: PlayerComboboxOption, query: string): number {
  if (!query) return 0;
  const name = option.displayName.toLowerCase();
  const handle = option.handle.toLowerCase();
  const words = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (name === query || handle === query) return 0;
  if (words.includes(query)) return 1;
  if (name.startsWith(query) || handle.startsWith(query)) return 2;
  if (words.some((word) => word.startsWith(query))) return 3;
  return 4;
}

export function PlayerCombobox({
  autoOpenOnSearchHint = true,
  currentOption,
  initialOptions,
  label = "Duna player",
  name = "personId",
  placeholder = "Search name or @handle…",
  remoteSearchPath = "/api/admin/player-search?q=",
  searchHint,
  suggestedConfidence,
  suggestedOption,
}: {
  readonly autoOpenOnSearchHint?: boolean;
  readonly currentOption?: PlayerComboboxOption;
  readonly initialOptions: readonly PlayerComboboxOption[];
  readonly label?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly remoteSearchPath?: string;
  readonly searchHint?: string;
  readonly suggestedConfidence?: number;
  readonly suggestedOption?: PlayerComboboxOption;
}) {
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const startingOption = currentOption ?? suggestedOption;
  const [selected, setSelected] = useState<PlayerComboboxOption | undefined>(
    startingOption,
  );
  const [query, setQuery] = useState(startingOption?.displayName ?? "");
  const [remoteOptions, setRemoteOptions] = useState<
    readonly PlayerComboboxOption[]
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const normalizedQuery = query.trim().toLowerCase();
  const options = useMemo(() => {
    const local = initialOptions.filter((option) => {
      if (!normalizedQuery) return true;
      return (
        option.displayName.toLowerCase().includes(normalizedQuery) ||
        option.handle.toLowerCase().includes(normalizedQuery.replace(/^@/, ""))
      );
    });
    const merged = uniqueOptions(
      [
        ...(suggestedOption ? [suggestedOption] : []),
        ...(currentOption ? [currentOption] : []),
        ...remoteOptions,
        ...local,
      ].filter((option) =>
        normalizedQuery
          ? option.displayName.toLowerCase().includes(normalizedQuery) ||
            option.handle
              .toLowerCase()
              .includes(normalizedQuery.replace(/^@/, ""))
          : true,
      ),
    );
    return [...merged]
      .sort((left, right) => {
        if (left.id === right.id) return 0;
        if (left.id === currentOption?.id) return -1;
        if (right.id === currentOption?.id) return 1;
        if (left.id === suggestedOption?.id) return -1;
        if (right.id === suggestedOption?.id) return 1;
        return (
          searchRank(left, normalizedQuery) -
            searchRank(right, normalizedQuery) ||
          left.displayName.localeCompare(right.displayName)
        );
      })
      .slice(0, 10);
  }, [
    currentOption,
    initialOptions,
    normalizedQuery,
    remoteOptions,
    suggestedOption,
  ]);

  useEffect(() => {
    if (selected || !searchHint?.trim()) return;
    setQuery(searchHint.trim());
    setOpen(autoOpenOnSearchHint);
  }, [autoOpenOnSearchHint, searchHint, selected]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setCustomValidity(
      selected ? "" : "Choose a Duna player from the search results.",
    );
  }, [selected]);

  useEffect(() => {
    if (selected && query === selected.displayName) {
      setRemoteOptions([]);
      setLoading(false);
      return;
    }
    if (normalizedQuery.length < 2) {
      setRemoteOptions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${remoteSearchPath}${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search unavailable");
        const payload = (await response.json()) as {
          players?: readonly PlayerComboboxOption[];
        };
        setRemoteOptions(payload.players ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteOptions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [normalizedQuery, query, remoteSearchPath, selected]);

  const choose = (option: PlayerComboboxOption) => {
    setSelected(option);
    setQuery(option.displayName);
    setOpen(false);
    setHighlighted(-1);
  };
  const listId = `${generatedId}-listbox`;

  return (
    <div className="player-combobox">
      <label htmlFor={generatedId}>{label}</label>
      <input name={name} type="hidden" value={selected?.id ?? ""} />
      <span className="player-combobox__control">
        <Search aria-hidden size={16} />
        <input
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(undefined);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => {
            if (!query && searchHint) setQuery(searchHint);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlighted((value) =>
                Math.min(options.length - 1, value + 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((value) => Math.max(0, value - 1));
            } else if (
              event.key === "Enter" &&
              open &&
              highlighted >= 0 &&
              options[highlighted]
            ) {
              event.preventDefault();
              choose(options[highlighted]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          required
          role="combobox"
          id={generatedId}
          type="search"
          value={query}
        />
        {loading ? (
          <LoaderCircle
            aria-label="Searching players"
            className="spin"
            size={16}
          />
        ) : selected ? (
          <button
            aria-label={`Clear ${selected.displayName}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSelected(undefined);
              setQuery("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden size={14} />
          </button>
        ) : null}
      </span>
      {open && (
        <div className="player-combobox__menu" id={listId} role="listbox">
          {options.map((option, index) => (
            <button
              aria-selected={selected?.id === option.id}
              className={highlighted === index ? "is-highlighted" : undefined}
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(option)}
              role="option"
              type="button"
            >
              <span>
                <strong>{option.displayName}</strong>
                <small>
                  @{option.handle}
                  {option.rating !== undefined
                    ? ` · Sand ${option.rating.toFixed(2)}`
                    : option.isProfessional
                      ? " · Pro"
                      : ""}
                  {option.connection === "organization"
                    ? " · Your organization"
                    : option.connection === "duna"
                      ? " · Duna player"
                      : ""}
                </small>
              </span>
              {option.id === suggestedOption?.id ? (
                <em>
                  <Sparkles aria-hidden size={12} /> Suggested
                  {suggestedConfidence !== undefined
                    ? ` ${suggestedConfidence}%`
                    : ""}
                </em>
              ) : selected?.id === option.id ? (
                <Check aria-hidden size={15} />
              ) : null}
            </button>
          ))}
          {!loading && options.length === 0 && (
            <small className="player-combobox__empty">
              {normalizedQuery.length < 2
                ? "Type at least two characters to search every Duna player."
                : "No player matches this search."}
            </small>
          )}
        </div>
      )}
      {selected && (
        <small className="player-combobox__selected">
          Selected: <strong>{selected.displayName}</strong> · @{selected.handle}
        </small>
      )}
    </div>
  );
}
