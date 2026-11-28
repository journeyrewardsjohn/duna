"use client";

import {
  Button,
  ErrorState,
  FilterChip,
  OfflineBanner,
  Segmented,
  useDebouncedCallback,
} from "@duna/ui/tideline";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { MapArea, MapPoint } from "./discover-map";
import type { DiscoverResults, ResultRow } from "./results";
import { ResultItem, type RowHandlers } from "./result-list";
import { DiscoverSearchBar } from "./search-bar";
import {
  DEFAULT_DISCOVER_STATE,
  discoverHref,
  type DiscoverState,
  discoverTitle,
  WHAT_OPTIONS,
  whenLabel,
  widerRadius,
} from "./search-state";

const DiscoverMap = dynamic(() => import("./discover-map"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="dv-map dv-map--waiting" />,
});

/** Side by side from here; below it a list / map switch and a sheet. */
const WIDE = "(min-width: 1024px)";

function useWide() {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => matchMedia(WIDE).matches,
    () => false,
  );
}

type Detent = "peek" | "half" | "full";
const DETENTS: readonly Detent[] = ["peek", "half", "full"];
const DETENT_WORDS: Record<Detent, string> = {
  peek: "collapsed",
  half: "half open",
  full: "open",
};

export interface DiscoverViewProps {
  readonly state: DiscoverState;
  readonly results: DiscoverResults;
  /** `/discover` on the site, `/app/discover` signed in. */
  readonly basePath: string;
  /** Set when the feed failed: the error with its reference. */
  readonly failure?: { readonly reference: string };
}

function summaryLine(state: DiscoverState, results: DiscoverResults) {
  const count = `${results.count} ${results.count === 1 ? "result" : "results"}`;
  const area =
    results.radiusMiles !== undefined
      ? ` within ${results.radiusMiles} mi of ${results.whereText}`
      : "";
  return `${count}${area} · ${whenLabel(state.when, state.time)}`;
}

/**
 * Find a game: the search bar, the results grouped by day then time, and
 * the map beside them (phones: a list / map switch, the list in a sheet
 * over the map). Every change is an address, pushed without a full reload:
 * shareable, and the back button walks back through searches.
 */
export function DiscoverView({
  state,
  results,
  basePath,
  failure,
}: DiscoverViewProps) {
  const router = useRouter();
  const wide = useWide();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(state);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detent, setDetent] = useState<Detent>("half");
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);

  // The map and the day headings sit under the sticky search: keep its
  // height in a variable so nothing hides behind it.
  useEffect(() => {
    const element = stick.current;
    if (!element || !root.current) return;
    const observer = new ResizeObserver(() =>
      root.current?.style.setProperty(
        "--dv-stick-h",
        `${element.offsetHeight}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The server's answer is the truth once it lands.
  useEffect(() => setShown(state), [state]);

  const push = useCallback(
    (next: DiscoverState) => {
      startTransition(() => {
        router.push(discoverHref(next, basePath), { scroll: false });
      });
    },
    [basePath, router],
  );
  // Several quick changes (chips pressed in a row) become one search and
  // one step in the history.
  const pushSoon = useDebouncedCallback(push);

  const change = (next: DiscoverState, now = false) => {
    setShown(next);
    setSelectedId(null);
    if (now) {
      pushSoon.cancel();
      push(next);
    } else {
      pushSoon(next);
    }
  };

  const rows = useMemo<ResultRow[]>(
    () => [...results.days.flatMap((day) => day.rows), ...results.places],
    [results],
  );
  const points = useMemo<MapPoint[]>(
    () =>
      rows.flatMap((row) =>
        row.latitude !== undefined && row.longitude !== undefined
          ? [
              {
                id: row.id,
                latitude: row.latitude,
                longitude: row.longitude,
                title: row.title,
                live: row.live,
              },
            ]
          : [],
      ),
    [rows],
  );

  const mapView = shown.view === "map";
  const mapWanted = wide || mapView;

  const select = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const row = list.current?.querySelector<HTMLElement>(
      `[data-row="${CSS.escape(id)}"]`,
    );
    row?.scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    if (!wide && detent === "peek") setDetent("half");
  };

  const handlers: RowHandlers = {
    hoveredId,
    selectedId,
    onHover: setHoveredId,
    onSelect: setSelectedId,
  };

  const searchArea = (area: MapArea) =>
    change(
      {
        ...shown,
        where: {
          kind: "place",
          label: "the map area",
          latitude: area.latitude,
          longitude: area.longitude,
        },
        radius: area.radiusMiles,
      },
      true,
    );

  // The sheet: a handle that drags between three heights; a tap or Enter
  // moves to the next one. It settles without overshoot.
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = { y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const delta = event.clientY - start.y;
    const at = DETENTS.indexOf(detent);
    if (Math.abs(delta) < 12) {
      setDetent(DETENTS[(at + 1) % DETENTS.length]!);
      return;
    }
    const steps = Math.max(1, Math.round(Math.abs(delta) / 160));
    const next = delta < 0 ? at + steps : at - steps;
    setDetent(DETENTS[Math.min(DETENTS.length - 1, Math.max(0, next))]!);
  };

  const empty = results.count === 0 && !failure;
  const wider =
    results.radiusMiles !== undefined ? widerRadius(results.radiusMiles) : null;
  const addScoreHref = `/add-score${
    shown.where.kind === "place" || shown.where.kind === "text"
      ? `?where=${encodeURIComponent(
          shown.where.kind === "place" ? shown.where.label : shown.where.text,
        )}`
      : ""
  }`;
  const listKey = discoverHref({ ...state, view: "list" }, basePath);

  let index = 0;
  const body = (
    <div
      aria-busy={pending || undefined}
      className="dv-list"
      data-pending={pending || undefined}
      ref={list}
    >
      <p aria-live="polite" className="dv-list__summary" role="status">
        {failure ? "Results didn't load" : summaryLine(state, results)}
        {results.resolvedFrom ? (
          <span className="dv-list__resolved">
            {" "}
            · for “{results.resolvedFrom}”
          </span>
        ) : null}
      </p>
      {failure ? (
        <ErrorState
          message="Something went wrong on our side, not yours. Try again in a moment. If it keeps happening, send Duna support the reference."
          onRetry={() => router.refresh()}
          reference={failure.reference}
          title="Games didn't load"
        />
      ) : null}
      {empty ? (
        <section aria-labelledby="dv-empty-title" className="dv-empty">
          <h2 className="dv-empty__title" id="dv-empty-title">
            No games match {results.whereText === "Anywhere" ? "" : "in "}
            {results.whereText === "Anywhere"
              ? "anywhere"
              : results.whereText}{" "}
            {whenLabel(state.when, state.time).toLowerCase()}.
          </h2>
          <p className="dv-empty__lead">Widen the search in one tap:</p>
          <div className="dv-empty__actions">
            {state.when.kind !== "preset" ||
            state.when.preset !== "any" ||
            state.time ? (
              <Button
                onClick={() =>
                  change(
                    {
                      ...shown,
                      when: { kind: "preset", preset: "any" },
                      time: null,
                    },
                    true,
                  )
                }
                size="sm"
                variant="secondary"
              >
                Search any time
              </Button>
            ) : null}
            {wider ? (
              <Button
                onClick={() => change({ ...shown, radius: wider }, true)}
                size="sm"
                variant="secondary"
              >
                Widen to {wider} mi
              </Button>
            ) : null}
            {state.what.length > 0 || state.surface !== "any" ? (
              <Button
                onClick={() =>
                  change({ ...shown, what: [], surface: "any" }, true)
                }
                size="sm"
                variant="secondary"
              >
                Show every kind of game
              </Button>
            ) : null}
            {state.where.kind !== "anywhere" ? (
              <Button
                onClick={() =>
                  change(
                    { ...shown, where: { kind: "anywhere" }, radius: null },
                    true,
                  )
                }
                size="sm"
                variant="secondary"
              >
                Search anywhere
              </Button>
            ) : null}
          </div>
          {results.nearby.length > 0 ? (
            <>
              <h3 className="site-label dv-empty__nearby">
                Nearest to {results.whereText}
              </h3>
              <ul className="dv-rows">
                {results.nearby.map((row, at) => (
                  <ResultItem
                    handlers={handlers}
                    index={at}
                    key={row.id}
                    row={row}
                    session={Boolean(row.startsAt)}
                  />
                ))}
              </ul>
            </>
          ) : null}
          <p className="dv-empty__score">
            Played somewhere we don’t list?{" "}
            <a className="site-textbutton" href={addScoreHref}>
              Add a score
            </a>
          </p>
        </section>
      ) : null}
      <div className="dv-groups" key={listKey}>
        {results.days.map((day) => (
          <section
            aria-labelledby={`dv-day-${day.date}`}
            className="dv-day"
            key={day.date}
          >
            <h2 className="dv-day__title" id={`dv-day-${day.date}`}>
              {day.label}
            </h2>
            <ul className="dv-rows">
              {day.rows.map((row) => (
                <ResultItem
                  handlers={handlers}
                  index={index++}
                  key={row.id}
                  row={row}
                  session
                />
              ))}
            </ul>
          </section>
        ))}
        {results.places.length > 0 ? (
          <section aria-labelledby="dv-places" className="dv-day">
            <h2 className="dv-day__title" id="dv-places">
              Courts, clubs and coaches
            </h2>
            <ul className="dv-rows">
              {results.places.map((row) => (
                <ResultItem
                  handlers={handlers}
                  index={index++}
                  key={row.id}
                  row={row}
                  session={false}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <aside aria-label="About this search" className="dv-notes">
        <div className="dv-note">
          <p className="dv-note__title">Not seeing your court?</p>
          <p>
            Add where you played and your score. We check new courts before
            they’re listed for everyone.
          </p>
          <a className="site-textbutton" href={addScoreHref}>
            Add a court and a score
          </a>
        </div>
        <details className="dv-note">
          <summary className="dv-note__title">How this search works</summary>
          <p>
            Duna lists sessions, courts, clubs and coaches that clubs publish on
            Duna. Times are local to the game. Near a place, the search starts
            close and widens until it finds a few results; prices include the
            service fee (Premium members pay none). Light comes from the sun at
            that place and hour; we show weather only where we have it.
          </p>
        </details>
      </aside>
    </div>
  );

  return (
    <div
      className="dv"
      data-view={mapView ? "map" : "list"}
      data-wide={wide || undefined}
      ref={root}
    >
      <OfflineBanner writes="refused" />
      <header className="dv-head">
        <h1 className="dv-head__title">
          {results.resolvedFrom
            ? `Games near ${results.whereText}`
            : discoverTitle(state)}
        </h1>
      </header>
      <div className="dv-stick" ref={stick}>
        <DiscoverSearchBar
          onChange={(next) => change(next, true)}
          pending={pending}
          state={shown}
          whereText={results.whereText}
        />
        <div className="dv-filters">
          <div aria-label="Quick filters" className="dv-chips" role="group">
            {WHAT_OPTIONS.map((option) => (
              <FilterChip
                key={option.id}
                onPressedChange={(pressed) =>
                  change({
                    ...shown,
                    what: pressed
                      ? WHAT_OPTIONS.map((item) => item.id).filter(
                          (id) => id === option.id || shown.what.includes(id),
                        )
                      : shown.what.filter((id) => id !== option.id),
                  })
                }
                pressed={shown.what.includes(option.id)}
              >
                {option.label}
              </FilterChip>
            ))}
            {shown.what.length > 0 ? (
              <button
                className="site-textbutton dv-chips__clear"
                onClick={() => change({ ...shown, what: [] }, true)}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
          <Segmented
            aria-label="Show results as"
            className="dv-switch"
            onValueChange={(value) =>
              change({ ...shown, view: value === "map" ? "map" : "list" }, true)
            }
            options={[
              { value: "list", label: "List" },
              { value: "map", label: "Map" },
            ]}
            value={shown.view}
          />
        </div>
      </div>
      <div className="dv-body">
        {wide || !mapView ? (
          body
        ) : (
          <div
            aria-label={`Results sheet, ${DETENT_WORDS[detent]}`}
            className="dv-sheet"
            data-detent={detent}
            role="region"
          >
            <button
              aria-label={`Results: ${DETENT_WORDS[detent]}. Tap to change`}
              className="dv-sheet__handle"
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setDetent(DETENTS[Math.min(2, DETENTS.indexOf(detent) + 1)]!);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setDetent(DETENTS[Math.max(0, DETENTS.indexOf(detent) - 1)]!);
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerDown={onHandleDown}
              onPointerUp={onHandleUp}
              type="button"
            >
              <span aria-hidden="true" className="dv-sheet__grabber" />
            </button>
            <div className="dv-sheet__body">{body}</div>
          </div>
        )}
        <div className="dv-mapcol" data-shown={mapWanted || undefined}>
          {mapWanted ? (
            <DiscoverMap
              feature="The discovery map"
              hoveredId={hoveredId}
              label="Map of results. The list has the same results."
              onHover={setHoveredId}
              onSearchArea={searchArea}
              onSelect={select}
              origin={results.origin}
              points={points}
              radiusMiles={results.radiusMiles}
              selectedId={selectedId}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_DISCOVER_STATE };
