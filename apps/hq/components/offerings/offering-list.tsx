"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { report } from "@duna/observability";
import {
  Button,
  Chip,
  EmptyResults,
  FilterChip,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SEARCH_DEBOUNCE_MS,
  SearchField,
  Segmented,
  rallyStyle,
  riseClassName,
  useAction,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  duplicateOfferingAction,
  setOfferingStatusAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import {
  OFFERING_KINDS,
  type OfferingKindId,
  type OfferingStatus,
} from "./offering-model";

/** One offering as a row: everything the list needs, already in words. */
export interface OfferingRow {
  readonly id: string;
  readonly title: string;
  readonly kind: OfferingKindId;
  readonly kindLabel: string;
  readonly subtypeLabel: string;
  readonly status: OfferingStatus;
  readonly statusLabel: string;
  /** Only for people who may see money. */
  readonly price?: string;
  readonly schedule: string;
  readonly group?: string;
  readonly inherited?: boolean;
  /** Blocking things to do before it can go live. */
  readonly missing: readonly string[];
  readonly customers?: number;
}

type StateFilter = "current" | "active" | "draft" | "archived";

const stateFilters: readonly { value: StateFilter; label: string }[] = [
  { value: "current", label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

/**
 * Every offering as an object row (ia-hq.md "Offerings"): kind, name, price
 * in plain words, schedule, the group rule in one phrase, Draft / Live /
 * Archived and what is missing. Kinds are in-page filters (the old type
 * pages land here with `?kind=`), search waits for typing to pause, and each
 * row has Duplicate and Archive.
 */
export function OfferingList({
  rows,
  canWrite,
}: {
  readonly rows: readonly OfferingRow[];
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();
  const kind = (params.get("kind") ?? "all") as OfferingKindId | "all";
  const [state, setState] = useState<StateFilter>(
    (params.get("state") as StateFilter | null) ?? "current",
  );
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const failed = (error: unknown) =>
    void report(error, { event: "hq.offerings.row_action_failed" });

  const setKind = (next: OfferingKindId | "all") => {
    const search = new URLSearchParams(params.toString());
    if (next === "all") search.delete("kind");
    else search.set("kind", next);
    const text = search.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };

  const shown = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (kind === "all" || row.kind === kind) &&
        (state === "current"
          ? row.status !== "archived"
          : row.status === state) &&
        (!needle ||
          row.title.toLowerCase().includes(needle) ||
          row.subtypeLabel.toLowerCase().includes(needle)),
    );
  }, [rows, kind, state, debounced]);

  const duplicate = useAction(
    async ({ idempotencyKey }, itemId: string) =>
      unwrap(await duplicateOfferingAction({ itemId, idempotencyKey })),
    {
      messages: { success: "Draft copy made", error: "The copy wasn't made." },
      report: failed,
      onSuccess: (result) =>
        router.push(hqHref("offering", { itemId: result.id })),
    },
  );

  const archive = (row: OfferingRow) =>
    void confirm
      .run({
        tier: "undo",
        title: `${row.title} archived`,
        undoneMessage: `${row.title} is back as a draft`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await setOfferingStatusAction({
              itemId: row.id,
              status: "archived",
              idempotencyKey,
            }),
          ),
        reverse: async () =>
          unwrap(
            await setOfferingStatusAction({
              itemId: row.id,
              status: "draft",
              idempotencyKey: crypto.randomUUID(),
            }),
          ),
        onUndone: () => router.refresh(),
        report: failed,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <div className="of-list">
      <div className="of-list__tools">
        <div aria-label="Kind" className="pt-filters" role="group">
          <FilterChip
            onPressedChange={() => setKind("all")}
            pressed={kind === "all"}
          >
            All kinds
          </FilterChip>
          {OFFERING_KINDS.map((entry) => (
            <FilterChip
              key={entry.id}
              onPressedChange={() => setKind(entry.id)}
              pressed={kind === entry.id}
            >
              {entry.label}
            </FilterChip>
          ))}
        </div>
        <div className="of-list__search">
          <SearchField
            label="Search offerings"
            onValueChange={setQuery}
            placeholder="Search by name"
            resultCount={shown.length}
            status={
              debounced.trim()
                ? shown.length > 0
                  ? "success"
                  : "empty"
                : "idle"
            }
            value={query}
          />
          <Segmented
            aria-label="Show"
            onValueChange={(value) => setState(value as StateFilter)}
            options={stateFilters}
            value={state}
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyResults
          clearLabel="Show every offering"
          onClear={() => {
            setQuery("");
            setState("current");
            setKind("all");
          }}
          query={debounced.trim() || undefined}
        />
      ) : (
        <ul aria-label="Offerings" className="of-rows">
          {shown.map((row, index) => (
            <li
              className={riseClassName()}
              key={row.id}
              style={rallyStyle(index)}
            >
              <div className="of-row">
                <Link
                  className="of-row__main"
                  href={hqHref("offering", { itemId: row.id })}
                >
                  <span className="of-row__title">{row.title}</span>
                  <span className="of-row__meta">
                    {[row.subtypeLabel, row.schedule].join(" · ")}
                  </span>
                  {row.group ? (
                    <span className="of-row__meta">
                      {row.inherited
                        ? `${row.group} · club default`
                        : row.group}
                    </span>
                  ) : null}
                  {row.missing.length > 0 && row.status === "draft" ? (
                    <span className="of-row__missing">
                      <Icon name="alert" size="inline" />
                      {`Before it goes live: ${row.missing.join("; ")}`}
                    </span>
                  ) : null}
                </Link>
                {row.price !== undefined ? (
                  <span className="of-row__price">{row.price}</span>
                ) : null}
                <span className="of-row__state">
                  <Chip
                    tone={
                      row.status === "active"
                        ? "positive"
                        : row.status === "draft"
                          ? "info"
                          : undefined
                    }
                  >
                    {row.statusLabel}
                  </Chip>
                </span>
                {canWrite ? (
                  <Menu
                    onAction={(value) => {
                      if (value === "duplicate") void duplicate.run(row.id);
                      if (value === "archive") archive(row);
                    }}
                  >
                    <MenuTrigger
                      aria-label={`More for ${row.title}`}
                      iconOnly
                      variant="ghost"
                    >
                      <Icon name="more" />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem value="duplicate">Duplicate</MenuItem>
                      {row.status !== "archived" ? (
                        <MenuItem value="archive">Archive</MenuItem>
                      ) : null}
                    </MenuContent>
                  </Menu>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {confirm.dialog}
    </div>
  );
}

/** A club with no offerings: start from a template. */
export function OfferingsFirstUse({
  canWrite,
}: {
  readonly canWrite: boolean;
}) {
  return (
    <div className="of-first">
      <p className="of-lead">
        Nothing here yet. Start from one of these; you can change everything
        after.
      </p>
      <ul className="of-first__grid">
        {OFFERING_KINDS.map((kind) => (
          <li className="of-first__kind" key={kind.id}>
            <Icon name={kind.icon} />
            <span className="of-row__title">{kind.label}</span>
            <span className="pt-quiet">{kind.description}</span>
            {canWrite ? (
              <Button
                href={`${hqHref("offeringCreate")}?kind=${kind.id}`}
                size="sm"
                variant="secondary"
              >
                {`New ${kind.noun}`}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
