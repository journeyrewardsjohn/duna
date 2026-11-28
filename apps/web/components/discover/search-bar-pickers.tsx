"use client";

import { Button, Sheet, SheetContent } from "@duna/ui/tideline";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import { WherePicker } from "../site/search/where-picker";
import { DiscoverWhatPicker, DiscoverWhenPicker } from "./pickers";
import { type Field, whereFromChoice } from "./search-bar";
import {
  type DiscoverState,
  type DiscoverWhere,
  whereLabel,
} from "./search-state";

const FIELD_LABELS: Record<Field, string> = {
  where: "Where",
  when: "When",
  what: "What",
};

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
      aria-label={FIELD_LABELS[field]}
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

export interface DiscoverBarPickersProps {
  readonly phone: boolean;
  readonly state: DiscoverState;
  readonly onChange: (next: DiscoverState) => void;
  /** The wide-screen panel's field, if one is open. */
  readonly open: Field | null;
  readonly setOpen: (field: Field | null) => void;
  readonly close: () => void;
  readonly sheet: boolean;
  readonly setSheet: (open: boolean) => void;
  readonly draft: DiscoverState;
  readonly setDraft: Dispatch<SetStateAction<DiscoverState>>;
}

/**
 * The search bar's pickers: the wide-screen panel and the phone sheet. Their
 * own module, loaded after the first screen settles or on the first press
 * (`DiscoverSearchBar`), so the page's first view does not carry the place
 * search, the calendar and the sheet.
 */
export function DiscoverBarPickers({
  phone,
  state,
  onChange,
  open,
  setOpen,
  close,
  sheet,
  setSheet,
  draft,
  setDraft,
}: DiscoverBarPickersProps) {
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
    <>
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
    </>
  );
}
