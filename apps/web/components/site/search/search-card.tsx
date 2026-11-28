"use client";

import {
  Button,
  Icon,
  type IconName,
  Sheet,
  SheetContent,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_SEARCH,
  discoveryHref,
  type SearchState,
  whatText,
  whenText,
  whereText,
} from "./search-query";
import { WherePicker } from "./where-picker";
import { WhatPicker, WhenPicker } from "./when-what-pickers";

type Field = "where" | "when" | "what";

const PHONE_QUERY = "(max-width: 640px)";

function usePhone() {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(PHONE_QUERY);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

const FIELDS: ReadonlyArray<{ id: Field; label: string; icon: IconName }> = [
  { id: "where", label: "Where", icon: "pin" },
  { id: "when", label: "When", icon: "schedule" },
  { id: "what", label: "What", icon: "ball" },
];

function Row({
  field,
  value,
  placeholder,
  expanded,
  onOpen,
}: {
  readonly field: (typeof FIELDS)[number];
  readonly value: string;
  readonly placeholder: boolean;
  readonly expanded: boolean;
  readonly onOpen: (field: Field) => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className="site-search__row"
      data-field={field.id}
      onClick={() => onOpen(field.id)}
      type="button"
    >
      <Icon name={field.icon} size="control" />
      <span className="site-search__key">{field.label}</span>
      <span
        className="site-search__value"
        data-placeholder={placeholder || undefined}
      >
        {value}
      </span>
    </button>
  );
}

function Panel({
  field,
  children,
  onClose,
}: {
  readonly field: Field;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (field !== "where") {
      element?.querySelector<HTMLElement>("button, input")?.focus();
    }
    const outside = (event: PointerEvent) => {
      const card = element?.closest(".site-search");
      if (card && !card.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [field, onClose]);
  return (
    <div
      aria-label={FIELDS.find((item) => item.id === field)!.label}
      className="site-search__panel td-rise td-rise--short"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      ref={panel}
      role="dialog"
    >
      {children}
      {field === "where" ? null : (
        <div className="site-search__panel-foot">
          <Button onClick={onClose} size="sm" variant="secondary">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The home page's primary action: Where · When · What as three stacked rows
 * (labels always visible), then Search. On desktop each row opens its
 * picker under the card; on a phone the search is a full-screen sheet with
 * the three stacked and a sticky Search. Submitting opens the discovery page
 * with the parameters it already reads. Without script the form still
 * submits and lands on discovery for this week, anywhere.
 */
export function SearchCard() {
  const router = useRouter();
  const phone = usePhone();
  const [state, setState] = useState<SearchState>(DEFAULT_SEARCH);
  const [open, setOpen] = useState<Field | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rows = useRef<HTMLDivElement>(null);

  const close = () => {
    const was = open;
    setOpen(null);
    if (was) {
      rows.current
        ?.querySelector<HTMLButtonElement>(`[data-field="${was}"]`)
        ?.focus();
    }
  };

  const openField = (field: Field) => {
    if (phone) {
      setSheetOpen(true);
      return;
    }
    setOpen((current) => (current === field ? null : field));
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSheetOpen(false);
    setOpen(null);
    router.push(discoveryHref(state));
  };

  const where = (
    <WherePicker
      autoFocus
      onChoose={(choice) => {
        setState((current) => ({ ...current, where: choice }));
        if (!phone) {
          setOpen("when");
        }
      }}
      onDismiss={close}
    />
  );
  const when = (
    <WhenPicker
      onChange={(next) => setState((current) => ({ ...current, when: next }))}
      value={state.when}
    />
  );
  const what = (
    <WhatPicker
      onSurface={(surface) => setState((current) => ({ ...current, surface }))}
      onWhat={(next) => setState((current) => ({ ...current, what: next }))}
      surface={state.surface}
      what={state.what}
    />
  );

  return (
    <div className="site-search" id="search">
      <form
        action="/discover/results"
        aria-label="Find a game"
        method="get"
        onSubmit={submit}
        role="search"
      >
        <input name="where" type="hidden" value="anywhere" />
        <input name="when" type="hidden" value="next-7-days" />
        <input name="what" type="hidden" value="for-you" />
        <div className="site-search__rows" ref={rows}>
          {FIELDS.map((field) => (
            <Row
              expanded={phone ? sheetOpen : open === field.id}
              field={field}
              key={field.id}
              onOpen={openField}
              placeholder={
                field.id === "what" &&
                state.what.length === 0 &&
                state.surface === "any"
              }
              value={
                field.id === "where"
                  ? whereText(state.where)
                  : field.id === "when"
                    ? whenText(state.when)
                    : whatText(state)
              }
            />
          ))}
        </div>
        <div className="site-search__go">
          <span className="site-meta">
            Open games, clinics, leagues and courts
          </span>
          <Button
            icon={<Icon name="search" size="inline" />}
            type="submit"
            variant="primary"
          >
            Search
          </Button>
        </div>
      </form>
      {open && !phone ? (
        <Panel field={open} onClose={close}>
          {open === "where" ? where : open === "when" ? when : what}
        </Panel>
      ) : null}
      <Sheet onOpenChange={setSheetOpen} open={sheetOpen}>
        <SheetContent
          className="site-search-sheet"
          closeLabel="Close search"
          title="Find a game"
        >
          <section aria-label="Where" className="site-search-sheet__section">
            <p className="site-label">Where</p>
            <p className="site-search-sheet__current">
              {whereText(state.where)}
            </p>
            {sheetOpen ? (
              <WherePicker
                onChoose={(choice) =>
                  setState((current) => ({ ...current, where: choice }))
                }
              />
            ) : null}
          </section>
          <section aria-label="When" className="site-search-sheet__section">
            <p className="site-label">When</p>
            {when}
          </section>
          <section aria-label="What" className="site-search-sheet__section">
            {what}
          </section>
          <div className="site-search-sheet__foot">
            <Button block onClick={() => submit()} variant="primary">
              Search
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
