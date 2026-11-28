"use client";

import { buttonClassName, Icon, type IconName } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { firstViewSettled } from "../first-view";
import {
  DEFAULT_SEARCH,
  discoveryHref,
  type SearchState,
  whatText,
  whenText,
  whereText,
} from "./search-query";
import type { Field } from "./search-pickers";

const loadPickers = () => import("./search-pickers");
const SearchPickers = lazy(() =>
  loadPickers().then((module) => ({ default: module.SearchPickers })),
);

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

/**
 * The home page's primary action: Where · When · What as three stacked rows
 * (labels always visible), then Search. On desktop each row opens its
 * picker under the card; on a phone the search is a full-screen sheet with
 * the three stacked and a sticky Search. Submitting opens the discovery page
 * (`/discover`) with the parameters it reads. Without script the form still
 * submits and lands on discovery for this week, anywhere. The pickers live
 * in `SearchPickers`, loaded after the first screen.
 */
export function SearchCard() {
  const router = useRouter();
  const phone = usePhone();
  const [state, setState] = useState<SearchState>(DEFAULT_SEARCH);
  const [open, setOpen] = useState<Field | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rows = useRef<HTMLDivElement>(null);
  // The pickers' script (place search, calendar, sheet) is fetched after the
  // first screen settles, or when a row is first pressed; the press that
  // opens a row also starts the fetch (first-view settles on pointerdown).
  const [pickersWanted, setPickersWanted] = useState(false);
  useEffect(() => {
    let live = true;
    void firstViewSettled()
      .then(loadPickers)
      .then(() => {
        if (live) setPickersWanted(true);
      });
    return () => {
      live = false;
    };
  }, []);

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
    setPickersWanted(true);
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

  return (
    <div className="site-search" id="search">
      <form
        action="/discover"
        aria-label="Find a game"
        method="get"
        onSubmit={submit}
        role="search"
      >
        <input name="when" type="hidden" value="week" />
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
          <button
            className={buttonClassName({ variant: "primary" })}
            type="submit"
          >
            <span className="td-btn__icon td-btn__icon--start">
              <Icon name="search" size="inline" />
            </span>
            <span className="td-btn__label">Search</span>
          </button>
        </div>
      </form>
      {pickersWanted ? (
        <Suspense fallback={null}>
          <SearchPickers
            close={close}
            open={open}
            phone={phone}
            setOpen={setOpen}
            setSheetOpen={setSheetOpen}
            setState={setState}
            sheetOpen={sheetOpen}
            state={state}
            submit={submit}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
