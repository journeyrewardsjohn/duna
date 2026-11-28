"use client";

import { report } from "@duna/observability";
import {
  Button,
  ClubMark,
  Icon,
  type IconName,
  useAsyncSearch,
} from "@duna/ui/tideline";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { siteLinks } from "../links";
import { fuzzyScore } from "./fuzzy";
import {
  type DunaVenue,
  fetchPlaceDetails,
  fetchPlaceSuggestions,
  loadDunaVenues,
  newPlacesSession,
  PLACES_MIN_LENGTH,
  type PlaceSuggestion,
  PlacesNotConfiguredError,
  PlacesRateLimitedError,
  readRecentPlaces,
  rememberPlace,
  SearchRequestError,
} from "./places";
import type { WhereChoice } from "./search-query";

/** Typing pauses this long before Places is asked (spec 2.3). */
export const WHERE_DEBOUNCE_MS = 120;
const MAX_DUNA_RESULTS = 5;

type Option =
  | { id: string; group: string; kind: "near-me" }
  | { id: string; group: string; kind: "anywhere" }
  | {
      id: string;
      group: string;
      kind: "chosen";
      choice: Extract<WhereChoice, { kind: "place" }>;
    }
  | { id: string; group: string; kind: "venue"; venue: DunaVenue }
  | { id: string; group: string; kind: "place"; place: PlaceSuggestion };

function venueChoice(
  venue: DunaVenue,
): Extract<WhereChoice, { kind: "place" }> {
  return {
    kind: "place",
    label: venue.name,
    address: [venue.city, venue.region].filter(Boolean).join(", "),
    latitude: venue.latitude,
    longitude: venue.longitude,
    source: "duna",
    venueId: venue.id,
  };
}

function optionText(option: Option): {
  title: string;
  detail?: string;
  icon: IconName;
} {
  switch (option.kind) {
    case "near-me":
      return {
        title: "Near me",
        detail: "Uses your location once",
        icon: "locate",
      };
    case "anywhere":
      return { title: "Anywhere", icon: "map" };
    case "chosen":
      return {
        title: option.choice.label,
        detail: option.choice.address,
        icon: option.choice.source === "duna" ? "venue" : "pin",
      };
    case "venue":
      return {
        title: option.venue.name,
        detail: [
          option.venue.courtCount
            ? `${option.venue.courtCount} ${option.venue.courtCount === 1 ? "court" : "courts"}`
            : null,
          [option.venue.city, option.venue.region].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
        icon: "venue",
      };
    case "place":
      return {
        title: option.place.mainText,
        detail: option.place.secondaryText,
        icon: "pin",
      };
  }
}

/** Bold the part of a title that matches what was typed. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query
    ? text.toLowerCase().indexOf(query.trim().toLowerCase())
    : -1;
  if (at < 0) return <>{text}</>;
  const end = at + query.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}

interface WherePickerProps {
  readonly onChoose: (choice: WhereChoice) => void;
  /** Escape: close the picker and return focus to its row. */
  readonly onDismiss?: () => void;
  readonly autoFocus?: boolean;
  /**
   * `search` (home and discovery): Near me and Anywhere, and nothing found
   * links to `/add-score`. `flow` (the add-a-score flow): places only, and
   * "I can't find it" adds the typed place as a new court.
   */
  readonly mode?: "search" | "flow";
  /** Text to start with (a search that found nothing, carried over). */
  readonly initialText?: string;
  /** In `flow` mode: add what was typed as a place Duna doesn't know. */
  readonly onAddPlace?: (text: string) => void;
  /** The input's accessible name. */
  readonly label?: string;
  readonly placeholder?: string;
}

/**
 * Where (spec 2.3): a combobox. Empty, it offers Near me (location is asked
 * for only on that tap), Anywhere, recent places and popular Duna venues.
 * Typing (120 ms debounce) lists Duna's own clubs and courts first (typo
 * tolerant), then Places. Nothing found offers to add the court and a score.
 * Without a Places key, Duna's venues still show with one line saying so.
 */
export function WherePicker({
  onChoose,
  onDismiss,
  autoFocus,
  mode = "search",
  initialText = "",
  onAddPlace,
  label = "Where",
  placeholder = "A beach, a gym, a city",
}: WherePickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  // One provider session per open picker (its billing model); renewed after
  // a place is chosen.
  const session = useRef<string>("");
  const [venues, setVenues] = useState<DunaVenue[]>([]);
  const [recent, setRecent] = useState<ReturnType<typeof readRecentPlaces>>([]);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    reference?: string;
  } | null>(null);
  const search = useAsyncSearch<PlaceSuggestion>({
    search: (query, signal) => {
      session.current ||= newPlacesSession();
      return fetchPlaceSuggestions(query, signal, session.current);
    },
    debounceMs: WHERE_DEBOUNCE_MS,
    minLength: PLACES_MIN_LENGTH,
    getKey: (place) => place.placeId,
  });

  useEffect(() => {
    let alive = true;
    setRecent(readRecentPlaces());
    void loadDunaVenues().then((list) => {
      if (alive) setVenues(list);
    });
    if (autoFocus) inputRef.current?.focus();
    return () => {
      alive = false;
    };
  }, [autoFocus]);

  // A search that found nothing arrives with its text: look it up once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialText.trim()) return;
    seeded.current = true;
    search.setQuery(initialText);
  }, [initialText, search]);

  const placesOff = search.error instanceof PlacesNotConfiguredError;
  const placesBusy = search.error instanceof PlacesRateLimitedError;
  const placesFailed = search.status === "error" && !placesOff && !placesBusy;
  const failureReference = useMemo(() => {
    if (!placesFailed) return undefined;
    const reference =
      search.error instanceof SearchRequestError
        ? search.error.reference
        : undefined;
    return report(search.error, {
      event: "site.search.places.failed",
      level: "warning",
      reference,
      tags: { surface: "home-search" },
    });
  }, [placesFailed, search.error]);

  const typed = text.trim();
  const options = useMemo<Option[]>(() => {
    if (!typed && mode === "flow") {
      return [
        ...recent.map((choice, index): Option => ({
          id: `recent-${index}`,
          group: "Recent",
          kind: "chosen",
          choice,
        })),
      ];
    }
    if (!typed) {
      const popular = [...venues]
        .sort((left, right) => right.courtCount - left.courtCount)
        .slice(0, 3);
      return [
        { id: "near-me", group: "", kind: "near-me" },
        { id: "anywhere", group: "", kind: "anywhere" },
        ...recent.map((choice, index): Option => ({
          id: `recent-${index}`,
          group: "Recent",
          kind: "chosen",
          choice,
        })),
        ...popular.map((venue): Option => ({
          id: `popular-${venue.id}`,
          group: "Popular on Duna",
          kind: "venue",
          venue,
        })),
      ];
    }
    const duna = venues
      .map((venue) => ({
        venue,
        score: Math.max(
          fuzzyScore(typed, venue.name),
          fuzzyScore(typed, `${venue.city} ${venue.region}`) - 5,
        ),
      }))
      .filter((match) => match.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_DUNA_RESULTS)
      .map(({ venue }): Option => ({
        id: `duna-${venue.id}`,
        group: "On Duna",
        kind: "venue",
        venue,
      }));
    const places = (placesOff || placesBusy ? [] : search.results).map(
      (place): Option => ({
        id: `place-${place.placeId}`,
        group: "Places",
        kind: "place",
        place,
      }),
    );
    // Duna's own clubs and courts always come first.
    return [...duna, ...places];
  }, [typed, venues, recent, search.results, placesOff, placesBusy, mode]);

  useEffect(() => setActive(0), [typed]);

  const settled =
    typed.length >= PLACES_MIN_LENGTH &&
    (search.status === "empty" ||
      search.status === "success" ||
      placesOff ||
      placesBusy);
  const nothingFound = settled && options.length === 0;

  async function choose(option: Option) {
    setNotice(null);
    if (option.kind === "anywhere") return onChoose({ kind: "anywhere" });
    if (option.kind === "near-me") {
      if (!("geolocation" in navigator)) {
        setNotice({
          text: "This browser can’t share a location. Type a place instead.",
        });
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false);
          onChoose({
            kind: "near-me",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          setLocating(false);
          setNotice({
            text: "Location is off for Duna in this browser, so we can’t search near you. Type a place instead.",
          });
          inputRef.current?.focus();
        },
        { maximumAge: 300_000, timeout: 10_000 },
      );
      return;
    }
    if (option.kind === "chosen") {
      rememberPlace(option.choice);
      return onChoose(option.choice);
    }
    if (option.kind === "venue") {
      const choice = venueChoice(option.venue);
      rememberPlace(choice);
      return onChoose(choice);
    }
    try {
      const choice = await fetchPlaceDetails(option.place, session.current);
      session.current = "";
      rememberPlace(choice);
      onChoose(choice);
    } catch (error) {
      if (error instanceof PlacesRateLimitedError) {
        setNotice({ text: error.message });
        return;
      }
      const reference = report(error, {
        event: "site.search.place-details.failed",
        level: "warning",
        reference:
          error instanceof SearchRequestError ? error.reference : undefined,
        tags: { surface: "home-search" },
      });
      setNotice({
        text: "We couldn’t open that place. Try another, or try again.",
        reference,
      });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (options.length ? (index + 1) % options.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        options.length ? (index - 1 + options.length) % options.length : 0,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) void choose(option);
      else search.submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDismiss?.();
    }
  }

  const activeId = options[active]
    ? `${listId}-${options[active].id}`
    : undefined;
  let lastGroup = "";

  return (
    <div className="site-where">
      <label className="site-where__field">
        <Icon name="search" size="control" />
        <span className="td-sr">{label}</span>
        <input
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => {
            setText(event.target.value);
            search.setQuery(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          type="text"
          value={text}
        />
      </label>
      {placesOff ? (
        <p className="site-where__line">
          Place search is off right now. Clubs and courts on Duna still show.
        </p>
      ) : null}
      {placesBusy ? (
        <p className="site-where__line" role="status">
          Lots of searches just now. Try again in a few seconds. Clubs and
          courts on Duna still show.
        </p>
      ) : null}
      {placesFailed ? (
        <p className="site-where__line" role="status">
          Place search didn’t answer.{" "}
          {failureReference ? <>Reference {failureReference}. </> : null}
          <button
            className="site-textbutton"
            onClick={() => search.submit()}
            type="button"
          >
            Try again
          </button>
        </p>
      ) : null}
      {notice ? (
        <p className="site-where__line" role="status">
          {notice.text}
          {notice.reference ? <> Reference {notice.reference}.</> : null}
        </p>
      ) : null}
      <ul
        aria-label="Places"
        className="site-where__list"
        id={listId}
        role="listbox"
      >
        {options.map((option, index) => {
          const { title, detail, icon } = optionText(option);
          const heading =
            option.group && option.group !== lastGroup ? option.group : null;
          lastGroup = option.group;
          return (
            <li key={option.id} role="presentation">
              {heading ? (
                <span
                  className="site-label site-where__group"
                  role="presentation"
                >
                  {heading}
                </span>
              ) : null}
              <div
                aria-selected={index === active}
                className="site-where__option"
                id={`${listId}-${option.id}`}
                onClick={() => void choose(option)}
                onMouseMove={() => setActive(index)}
                role="option"
                tabIndex={-1}
              >
                <span aria-hidden="true" className="site-where__icon">
                  {option.kind === "venue" ? (
                    <ClubMark decorative name={option.venue.name} size={36} />
                  ) : (
                    <Icon name={icon} size="control" />
                  )}
                </span>
                <span className="site-where__text">
                  <span className="site-where__title">
                    {option.kind === "near-me" && locating ? (
                      "Finding you…"
                    ) : (
                      <Highlight query={typed} text={title} />
                    )}
                  </span>
                  {detail ? (
                    <span className="site-where__detail">{detail}</span>
                  ) : null}
                </span>
                {option.group === "On Duna" ||
                option.group === "Popular on Duna" ? (
                  <span className="site-where__badge">Duna</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {options.some((option) => option.kind === "place") ? (
        <p className="site-where__line site-where__attribution">
          Powered by Google
        </p>
      ) : null}
      {mode === "flow" && typed.length >= 2 && !nothingFound && onAddPlace ? (
        <p className="site-where__line">
          <button
            className="site-textbutton"
            onClick={() => onAddPlace(typed)}
            type="button"
          >
            I can’t find it: add this place
          </button>
        </p>
      ) : null}
      {search.status === "loading" && options.length === 0 ? (
        <p className="site-where__line" role="status">
          Looking for “{typed}”…
        </p>
      ) : null}
      {nothingFound ? (
        <div className="site-where__empty" role="status">
          {mode === "flow" ? (
            <>
              <p>
                <strong>We couldn’t find “{typed}”.</strong> Add it as a new
                court: we check new courts before they’re listed for everyone.
              </p>
              <Button
                onClick={() => onAddPlace?.(typed)}
                size="sm"
                variant="primary"
              >
                Add “{typed}” as a new court
              </Button>
            </>
          ) : (
            <>
              <p>
                <strong>We couldn’t find “{typed}”.</strong> Played somewhere we
                don’t know yet? Add the court and your score.
              </p>
              <Button
                href={`${siteLinks.addScore}?where=${encodeURIComponent(typed)}`}
                size="sm"
                variant="secondary"
              >
                Add the court and a score
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
