"use client";

import { Icon, type IconName } from "@duna/ui/tideline";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { firstViewSettled } from "../site/first-view";
import type { WhereChoice } from "../site/search/search-query";
import {
  type DiscoverState,
  type DiscoverWhere,
  whatLabel,
  whenLabel,
  whereLabel,
} from "./search-state";

export type Field = "where" | "when" | "what";

const loadPickers = () => import("./search-bar-pickers");
const DiscoverBarPickers = lazy(() =>
  loadPickers().then((module) => ({ default: module.DiscoverBarPickers })),
);

const PHONE = "(max-width: 760px)";

function usePhone() {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia(PHONE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => matchMedia(PHONE).matches,
    () => false,
  );
}

export function whereFromChoice(choice: WhereChoice): DiscoverWhere {
  if (choice.kind === "anywhere") return { kind: "anywhere" };
  if (choice.kind === "near-me") {
    return {
      kind: "near-me",
      latitude: choice.latitude,
      longitude: choice.longitude,
    };
  }
  return {
    kind: "place",
    label: choice.label,
    ...(choice.address ? { address: choice.address } : {}),
    latitude: choice.latitude,
    longitude: choice.longitude,
    ...(choice.venueId ? { venueId: choice.venueId } : {}),
  };
}

const FIELDS: ReadonlyArray<{ id: Field; label: string; icon: IconName }> = [
  { id: "where", label: "Where", icon: "pin" },
  { id: "when", label: "When", icon: "schedule" },
  { id: "what", label: "What", icon: "ball" },
];

/**
 * Where · When · What, carried from the home page. On wide screens three
 * fields side by side, each opening its picker under the bar; on phones one
 * summary that opens a full-height sheet with the three stacked and a
 * sticky "Show results". The page owns the state (it is the address): this
 * bar proposes changes through `onChange`. The pickers live in
 * `DiscoverBarPickers`, loaded after the first screen.
 */
export function DiscoverSearchBar({
  state,
  whereText,
  onChange,
  pending,
}: {
  readonly state: DiscoverState;
  /** What Where says after free text was understood. */
  readonly whereText: string;
  readonly onChange: (next: DiscoverState) => void;
  readonly pending: boolean;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState<Field | null>(null);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState(state);
  const fields = useRef<HTMLDivElement>(null);
  // The pickers' script (place search, calendar, sheet) is fetched after the
  // first screen settles; the press that opens one also starts the fetch.
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

  useEffect(() => setDraft(state), [state]);

  const close = () => {
    const was = open;
    setOpen(null);
    if (was) {
      fields.current
        ?.querySelector<HTMLButtonElement>(`[data-field="${was}"]`)
        ?.focus();
    }
  };

  const values: Record<Field, string> = {
    where: state.where.kind === "text" ? whereText : whereLabel(state.where),
    when: whenLabel(state.when, state.time),
    what: whatLabel(state),
  };

  return (
    <div className="dv-bar" data-pending={pending || undefined}>
      <div
        className="dv-bar__fields"
        ref={fields}
        role="group"
        aria-label="Search"
      >
        {phone ? (
          <button
            aria-expanded={sheet}
            aria-haspopup="dialog"
            className="dv-bar__summary"
            onClick={() => {
              setPickersWanted(true);
              setSheet(true);
            }}
            type="button"
          >
            <Icon name="search" size="control" />
            <span className="dv-bar__summary-text">
              <span className="dv-bar__summary-where">{values.where}</span>
              <span className="dv-bar__summary-rest">
                {values.when} · {values.what}
              </span>
            </span>
            <span className="dv-bar__edit">Edit</span>
          </button>
        ) : (
          FIELDS.map((field) => (
            <button
              aria-expanded={open === field.id}
              aria-haspopup="dialog"
              aria-label={`${field.label}: ${values[field.id]}`}
              className="dv-bar__field"
              data-field={field.id}
              key={field.id}
              onClick={() => {
                setPickersWanted(true);
                setOpen((current) => (current === field.id ? null : field.id));
              }}
              type="button"
            >
              <Icon name={field.icon} size="control" />
              <span className="dv-bar__key">{field.label}</span>
              <span className="dv-bar__value">{values[field.id]}</span>
            </button>
          ))
        )}
      </div>
      <span aria-hidden="true" className="dv-bar__progress" />
      {pickersWanted ? (
        <Suspense fallback={null}>
          <DiscoverBarPickers
            close={close}
            draft={draft}
            onChange={onChange}
            open={open}
            phone={phone}
            setDraft={setDraft}
            setOpen={setOpen}
            setSheet={setSheet}
            sheet={sheet}
            state={state}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
