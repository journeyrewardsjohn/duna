"use client";

import { Button, Sheet, SheetContent } from "@duna/ui/tideline";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import { type SearchState, whereText } from "./search-query";
import { WherePicker } from "./where-picker";
import { WhatPicker, WhenPicker } from "./when-what-pickers";

export type Field = "where" | "when" | "what";

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
      const card = element?.closest(".site-search");
      if (card && !card.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [field, onClose]);
  return (
    <div
      aria-label={FIELD_LABELS[field]}
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

export interface SearchPickersProps {
  readonly phone: boolean;
  readonly state: SearchState;
  readonly setState: Dispatch<SetStateAction<SearchState>>;
  /** The desktop panel's field, if one is open. */
  readonly open: Field | null;
  readonly setOpen: (field: Field | null) => void;
  readonly close: () => void;
  readonly sheetOpen: boolean;
  readonly setSheetOpen: (open: boolean) => void;
  readonly submit: () => void;
}

/**
 * The search card's pickers: the desktop panel under the card and the phone
 * sheet. Their own module, loaded after the first screen settles or on the
 * first press of a row (`SearchCard`), so the home page's first view does
 * not carry the place search, the calendar and the sheet.
 */
export function SearchPickers({
  phone,
  state,
  setState,
  open,
  setOpen,
  close,
  sheetOpen,
  setSheetOpen,
  submit,
}: SearchPickersProps) {
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
    <>
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
    </>
  );
}
