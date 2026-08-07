"use client";

import { Check, ChevronDown, Globe2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CountryCode } from "@/components/country-code";

export type RankingsCountryOption = {
  readonly code: string;
  readonly name: string;
  readonly count: number;
  readonly href: string;
};

export function RankingsCountryFilter({
  allHref,
  options,
  selectedCode,
}: {
  readonly allHref: string;
  readonly options: readonly RankingsCountryOption[];
  readonly selectedCode?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.code === selectedCode);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.name} ${option.code}`.toLowerCase().includes(normalized),
    );
  }, [options, query]);
  const choices = [
    { code: "", name: "All countries", count: undefined, href: allHref },
    ...filtered,
  ];

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (href: string) => {
    setOpen(false);
    setQuery("");
    startTransition(() => router.push(href));
  };

  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % choices.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + choices.length) % choices.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = choices[activeIndex];
      if (choice) choose(choice.href);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="rankings-country-filter" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="rankings-country-filter__trigger"
        data-pending={pending || undefined}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          {selected ? (
            <CountryCode code={selected.code} />
          ) : (
            <Globe2 aria-hidden size={17} />
          )}
        </span>
        <span>
          <small>Country</small>
          <strong>{selected?.name ?? "All countries"}</strong>
        </span>
        <ChevronDown aria-hidden size={18} />
      </button>

      {open ? (
        <div className="rankings-country-filter__popover">
          <label>
            <Search aria-hidden size={17} />
            <input
              aria-label="Search countries"
              aria-activedescendant={`rankings-country-${activeIndex}`}
              aria-autocomplete="list"
              aria-controls="rankings-country-options"
              aria-expanded="true"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeys}
              placeholder="Type a country or code"
              ref={inputRef}
              role="combobox"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear country search"
                onClick={() => setQuery("")}
                type="button"
              >
                <X aria-hidden size={16} />
              </button>
            ) : null}
          </label>
          <div id="rankings-country-options" role="listbox">
            {choices.map((option, index) => {
              const isSelected = (selectedCode ?? "") === option.code;
              return (
                <button
                  aria-selected={isSelected}
                  className={activeIndex === index ? "is-active" : undefined}
                  id={`rankings-country-${index}`}
                  key={option.code || "all"}
                  onClick={() => choose(option.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>
                    {option.code ? (
                      <CountryCode code={option.code} />
                    ) : (
                      <Globe2 aria-hidden size={18} />
                    )}
                  </span>
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.code || "Every federation"}</small>
                  </span>
                  {option.count !== undefined ? (
                    <small>{option.count}</small>
                  ) : null}
                  {isSelected ? <Check aria-hidden size={16} /> : null}
                </button>
              );
            })}
            {choices.length === 1 && query ? (
              <p>No countries match “{query}”.</p>
            ) : null}
          </div>
          <footer>
            USA and Brazil stay pinned first for the fastest jump into the
            deepest fields.
          </footer>
        </div>
      ) : null}
    </div>
  );
}
