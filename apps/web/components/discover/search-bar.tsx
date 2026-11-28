"use client";

import {
  Button,
  Icon,
  type IconName,
  Sheet,
  SheetContent,
} from "@duna/ui/tideline";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { WhereChoice } from "../site/search/search-query";
import { WherePicker } from "../site/search/where-picker";
import { DiscoverWhatPicker, DiscoverWhenPicker } from "./pickers";
import {
  type DiscoverState,
  type DiscoverWhere,
  whatLabel,
  whenLabel,
  whereLabel,
} from "./search-state";

type Field = "where" | "when" | "what";

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
      const bar = element?.closest(".dv-bar");
      if (bar && !bar.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [field, onClose]);
  return (
    <div
      aria-label={FIELDS.find((item) => item.id === field)!.label}
      className="dv-bar__panel td-rise td-rise--short"
      data-field={field}
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
        <div className="dv-bar__panel-foot">
          <Button onClick={onClose} size="sm" variant="secondary">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Where · When · What, carried from the home page. On wide screens three
 * fields side by side, each opening its picker under the bar; on phones one
 * summary that opens a full-height sheet with the three stacked and a
 * sticky "Show results". The page owns the state (it is the address): this
 * bar proposes changes through `onChange`.
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

  const where = (apply: (where: DiscoverWhere) => void, autoFocus: boolean) => (
    <WherePicker
      autoFocus={autoFocus}
      initialText={state.where.kind === "text" ? state.where.text : ""}
      label="Where do you want to play?"
      onChoose={(choice) => apply(whereFromChoice(choice))}
      onDismiss={close}
    />
  );

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
            onClick={() => setSheet(true)}
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
              onClick={() =>
                setOpen((current) => (current === field.id ? null : field.id))
              }
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
      {open && !phone ? (
        <Panel field={open} onClose={close}>
          {open === "where"
            ? where((next) => {
                onChange({ ...state, where: next, radius: null });
                setOpen("when");
              }, true)
            : null}
          {open === "when" ? (
            <DiscoverWhenPicker
              onTime={(time) => onChange({ ...state, time })}
              onWhen={(when) => onChange({ ...state, when })}
              time={state.time}
              when={state.when}
            />
          ) : null}
          {open === "what" ? (
            <DiscoverWhatPicker
              onSurface={(surface) => onChange({ ...state, surface })}
              onWhat={(what) => onChange({ ...state, what })}
              surface={state.surface}
              what={state.what}
            />
          ) : null}
        </Panel>
      ) : null}
      <Sheet onOpenChange={setSheet} open={sheet}>
        <SheetContent
          className="dv-sheet-search"
          closeLabel="Close search"
          title="Find a game"
        >
          <section aria-label="Where" className="dv-sheet-search__section">
            <p className="site-label">Where</p>
            <p className="dv-sheet-search__current">
              {draft.where.kind === "text"
                ? draft.where.text
                : whereLabel(draft.where)}
            </p>
            {sheet
              ? where(
                  (next) =>
                    setDraft((current) => ({
                      ...current,
                      where: next,
                      radius: null,
                    })),
                  false,
                )
              : null}
          </section>
          <section aria-label="When" className="dv-sheet-search__section">
            <DiscoverWhenPicker
              onTime={(time) => setDraft((current) => ({ ...current, time }))}
              onWhen={(when) => setDraft((current) => ({ ...current, when }))}
              time={draft.time}
              when={draft.when}
            />
          </section>
          <section aria-label="What" className="dv-sheet-search__section">
            <DiscoverWhatPicker
              onSurface={(surface) =>
                setDraft((current) => ({ ...current, surface }))
              }
              onWhat={(what) => setDraft((current) => ({ ...current, what }))}
              surface={draft.surface}
              what={draft.what}
            />
          </section>
          <div className="dv-sheet-search__foot">
            <Button
              block
              onClick={() => {
                setSheet(false);
                onChange(draft);
              }}
              variant="primary"
            >
              Show results
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
