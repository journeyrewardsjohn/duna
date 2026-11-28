"use client";

import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  EmptyFirstUse,
  EmptyResults,
  Field,
  FilterChip,
  Input,
  Notice,
  SearchField,
  Textarea,
  useAction,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  bulkDraftAction,
  exportPeopleAction,
  tagPeopleAction,
} from "@/app/(next)/(hq)/people/actions";
import {
  filterRows,
  type ListState,
  listHref,
  type PeopleSegment,
  peopleSegments,
  type PersonRow,
  segmentCounts,
  shortDate,
  sortRows,
  visibleRange,
  WINDOW_THRESHOLD,
} from "./people-model";
import type { PeopleCapabilities } from "./people-capabilities";
import { reportFailure, unwrap } from "./people-result";

/** The row height windowing assumes (matches `--people-row-h` in people.css). */
const ROW_HEIGHT = 76;
const WINDOW_HEIGHT = 640;

function download(csv: string, count: number) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `people-${new Date().toISOString().slice(0, 10)}-${count}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DuplicatePair {
  readonly aId: string;
  readonly bId: string;
  readonly aName: string;
  readonly bName: string;
  readonly reason: string;
}

/**
 * Every person as an object row: what they are to the club in plain words,
 * what needs attention, a debounced search (name, email or phone), segments
 * as shareable addresses, safe bulk actions (tag, export, a message draft:
 * nothing is sent from here), honest counts, keyboard movement, and only
 * the rows in view rendered for a club with thousands of people.
 */
export function PeopleList({
  rows,
  initial,
  timeZone,
  now,
  canWrite,
  canExport,
  canDraft,
  duplicates,
  focusSearch = false,
  capabilities,
}: {
  readonly rows: readonly PersonRow[];
  readonly initial: ListState;
  readonly timeZone: string;
  readonly now: string;
  readonly canWrite: boolean;
  readonly canExport: boolean;
  readonly canDraft: boolean;
  readonly duplicates: readonly DuplicatePair[];
  readonly focusSearch?: boolean;
  /** Features whose backend has landed (people-capabilities.ts). */
  readonly capabilities: Pick<PeopleCapabilities, "import" | "merge" | "tags">;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const today = useMemo(() => new Date(now), [now]);
  const [query, setQuery] = useState(initial.query);
  const [segment, setSegment] = useState<PeopleSegment>(initial.segment);
  const debounced = useDebouncedValue(query);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<"draft" | "tag" | undefined>();
  const searchRef = useRef<HTMLDivElement>(null);

  const state: ListState = useMemo(
    () => ({ segment, query: debounced }),
    [segment, debounced],
  );
  const counts = useMemo(
    () => segmentCounts(rows, today, timeZone),
    [rows, today, timeZone],
  );
  const shown = useMemo(
    () => sortRows(filterRows(rows, state, today, timeZone)),
    [rows, state, today, timeZone],
  );

  // The view is an address: segment and search land in the URL.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.replace(listHref(state), { scroll: false });
  }, [router, state]);

  useEffect(() => {
    if (!focusSearch) return;
    searchRef.current?.querySelector("input")?.focus();
  }, [focusSearch]);

  const segmentLabel =
    peopleSegments.find((entry) => entry.id === segment)?.label ?? "Everyone";
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const allShownSelected =
    shown.length > 0 && shown.every((row) => selected.has(row.id));

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const runExport = (ids?: readonly string[]) => {
    const count = ids ? ids.length : shown.length;
    const juniors = (ids ? selectedRows : shown).filter(
      (row) => row.isJunior,
    ).length;
    void confirm.run({
      tier: "strong",
      title: `Download ${count} ${count === 1 ? "person" : "people"}?`,
      description:
        "A spreadsheet file with each person's name, what they are to the club, plan, credits and contact details.",
      scope: ids
        ? `${count} selected ${count === 1 ? "person" : "people"}`
        : `${count} ${count === 1 ? "person" : "people"} in ${segmentLabel}${
            debounced ? ` matching “${debounced}”` : ""
          }`,
      consequence: `Health values are never in the file.${
        juniors > 0
          ? ` ${juniors} ${juniors === 1 ? "junior is" : "juniors are"} listed without their own contact; the guardian is named instead.`
          : ""
      } Keep the file somewhere only the club can open.`,
      verb: `Download ${count} ${count === 1 ? "person" : "people"}`,
      cancelLabel: "Don't download",
      agentConfirm: `Downloads a file of ${count} people`,
      perform: async () => {
        const result = unwrap(
          await exportPeopleAction(ids ? { ids } : { segment, q: debounced }),
        );
        download(result.csv, result.count);
        return result;
      },
      success: (result) =>
        `Downloaded ${result.count} ${result.count === 1 ? "person" : "people"}`,
      report: reportFailure("hq.people.export_failed"),
    });
  };

  if (rows.length === 0) {
    return (
      <div className="people-first-use">
        <EmptyFirstUse
          action={
            canWrite ? (
              <div className="people-actions">
                <Button href="/people/invite" variant="primary">
                  Add a person
                </Button>
                {capabilities.import ? (
                  <Button href="/people/import" variant="secondary">
                    Import from a file
                  </Button>
                ) : null}
                <Button href="/website" variant="ghost">
                  Share your club page
                </Button>
              </div>
            ) : undefined
          }
          description={
            capabilities.import
              ? "Add your first members, import a list you already have, or share your club page so players can join themselves."
              : "Add your first members, or share your club page so players can join themselves."
          }
          icon="users"
          title="No people yet"
        />
      </div>
    );
  }

  return (
    <div className="people-directory">
      {canWrite && capabilities.merge && duplicates.length > 0 ? (
        <Notice
          action={
            <Button
              href={`/people/merge?a=${encodeURIComponent(duplicates[0]!.aId)}&b=${encodeURIComponent(duplicates[0]!.bId)}`}
              size="sm"
              variant="secondary"
            >
              Review
            </Button>
          }
          className="people-duplicates"
          title={`${duplicates.length} possible ${duplicates.length === 1 ? "duplicate" : "duplicates"}`}
          tone="info"
        >
          {`${duplicates[0]!.aName} and ${duplicates[0]!.bName}: ${duplicates[0]!.reason}`}
        </Notice>
      ) : null}

      <div className="people-tools">
        <div className="people-search" ref={searchRef}>
          <SearchField
            label="Search people"
            onValueChange={setQuery}
            placeholder="Name, email or phone"
            resultCount={shown.length}
            status={debounced !== query ? "loading" : "idle"}
            value={query}
          />
        </div>
        <div aria-label="Segments" className="people-segments" role="group">
          {peopleSegments.map((option) => (
            <FilterChip
              aria-label={`${option.label}, ${counts[option.id]}`}
              key={option.id}
              onPressedChange={(pressed) =>
                setSegment(pressed ? option.id : "everyone")
              }
              pressed={segment === option.id}
            >
              {option.label}
              <span className="people-segment-count">{counts[option.id]}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="people-listhead">
        <Checkbox
          checked={allShownSelected}
          disabled={shown.length === 0}
          label={allShownSelected ? "Clear selection" : "Select all shown"}
          onCheckedChange={(on) =>
            setSelected(
              on === true ? new Set(shown.map((row) => row.id)) : new Set(),
            )
          }
        />
        <p aria-live="polite" className="people-count">
          {shown.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? "person" : "people"}`
            : `${shown.length} of ${rows.length} people`}
          {segment !== "everyone" ? ` · ${segmentLabel}` : ""}
          {debounced ? ` · matching “${debounced}”` : ""}
        </p>
        {canExport ? (
          <Button
            disabled={shown.length === 0}
            onClick={() => runExport()}
            size="sm"
            variant="ghost"
          >
            Export
          </Button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <section aria-label="Selected people" className="people-bulk">
          <p className="people-bulk__count">{`${selected.size} selected`}</p>
          <div className="people-actions">
            {canWrite && capabilities.tags ? (
              <Button
                onClick={() => setDialog("tag")}
                size="sm"
                variant="secondary"
              >
                Tag
              </Button>
            ) : null}
            {canExport ? (
              <Button
                onClick={() => runExport([...selected])}
                size="sm"
                variant="secondary"
              >
                {`Export ${selected.size}`}
              </Button>
            ) : null}
            {canDraft ? (
              <Button
                onClick={() => setDialog("draft")}
                size="sm"
                variant="secondary"
              >
                Start a message draft
              </Button>
            ) : null}
            <Button
              onClick={() => setSelected(new Set())}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <EmptyResults
          clearLabel="Show everyone"
          onClear={() => {
            setQuery("");
            setSegment("everyone");
          }}
          query={debounced || undefined}
        />
      ) : (
        <PeopleRows
          now={today}
          onToggle={toggle}
          rows={shown}
          selected={selected}
          timeZone={timeZone}
        />
      )}

      <BulkDraftDialog
        onDone={() => {
          setDialog(undefined);
          setSelected(new Set());
        }}
        onOpenChange={(open) => setDialog(open ? "draft" : undefined)}
        open={dialog === "draft"}
        people={selectedRows}
      />
      <TagDialog
        onOpenChange={(open) => setDialog(open ? "tag" : undefined)}
        open={dialog === "tag"}
        people={selectedRows}
      />
      {confirm.dialog}
    </div>
  );
}

/** The rows: all of them, or only those in view when there are many. */
function PeopleRows({
  rows,
  selected,
  onToggle,
  timeZone,
  now,
}: {
  readonly rows: readonly PersonRow[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string, on: boolean) => void;
  readonly timeZone: string;
  readonly now: Date;
}) {
  const windowed = rows.length > WINDOW_THRESHOLD;
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number>();
  const range = windowed
    ? visibleRange({
        scrollTop,
        viewportHeight: WINDOW_HEIGHT,
        rowHeight: ROW_HEIGHT,
        count: rows.length,
      })
    : { start: 0, end: rows.length };

  // Keyboard movement: after the window moves, focus the wanted row.
  useEffect(() => {
    if (focusIndex === undefined) return;
    const link = scroller.current?.querySelector<HTMLElement>(
      `[data-row-index="${focusIndex}"] .people-row__name`,
    );
    link?.focus();
  }, [focusIndex, range.start]);

  const move = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-row-index]");
    if (!item) return;
    const index = Number(item.dataset.rowIndex);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else if (
      event.key === " " &&
      target.classList.contains("people-row__name")
    ) {
      event.preventDefault();
      const row = rows[index];
      if (row) onToggle(row.id, !selected.has(row.id));
      return;
    }
    if (next === undefined) return;
    event.preventDefault();
    if (windowed && scroller.current) {
      const top = next * ROW_HEIGHT;
      const view = scroller.current;
      if (top < view.scrollTop) view.scrollTop = top;
      else if (top + ROW_HEIGHT > view.scrollTop + view.clientHeight)
        view.scrollTop = top + ROW_HEIGHT - view.clientHeight;
      setScrollTop(view.scrollTop);
    }
    setFocusIndex(next);
  };

  return (
    <div
      className="people-scroller"
      data-windowed={windowed || undefined}
      onScroll={
        windowed
          ? (event) => setScrollTop(event.currentTarget.scrollTop)
          : undefined
      }
      ref={scroller}
    >
      <ul
        aria-label="People"
        className="people-rows"
        onKeyDown={move}
        style={
          windowed
            ? {
                paddingBlockStart: range.start * ROW_HEIGHT,
                paddingBlockEnd: (rows.length - range.end) * ROW_HEIGHT,
              }
            : undefined
        }
      >
        {rows.slice(range.start, range.end).map((row, offset) => {
          const index = range.start + offset;
          return (
            <li
              aria-posinset={index + 1}
              aria-setsize={rows.length}
              className="people-row"
              data-row-index={index}
              data-selected={selected.has(row.id) || undefined}
              key={row.id}
            >
              <Checkbox
                aria-label={`Select ${row.name}`}
                checked={selected.has(row.id)}
                className="people-row__check"
                onCheckedChange={(on) => onToggle(row.id, on === true)}
              />
              <Avatar name={row.name} size="md" src={row.avatarUrl} />
              <div className="people-row__text">
                <Link className="people-row__name" href={`/people/${row.id}`}>
                  {row.name}
                </Link>
                <span className="people-row__relation">{row.relation}</span>
              </div>
              <div className="people-row__chips">
                {row.isJunior ? <Chip kind="taxonomy">Junior</Chip> : null}
                {row.attention.slice(0, 2).map((item) => (
                  <Chip key={item.kind} tone={item.tone}>
                    {item.label}
                  </Chip>
                ))}
                {row.attention.length > 2 ? (
                  <Chip>{`+${row.attention.length - 2} more`}</Chip>
                ) : null}
              </div>
              <div className="people-row__seen">
                <span className="people-row__meta">
                  {row.upcoming > 0
                    ? `${row.upcoming} coming up`
                    : "Nothing booked"}
                </span>
                <span className="people-row__meta">
                  {row.lastSeenAt
                    ? `Seen ${shortDate(row.lastSeenAt, timeZone, now)}`
                    : "Not seen yet"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One draft for several adults, saved in Inbox for review. Juniors are left
 * out (Inbox writes to their guardian). Nothing is sent from here.
 */
function BulkDraftDialog({
  open,
  onOpenChange,
  people,
  onDone,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly people: readonly PersonRow[];
  readonly onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const adults = people.filter(
    (row) => !row.isJunior && Boolean(row.email || row.phone),
  );
  const left = people.length - adults.length;
  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await bulkDraftAction({
          personIds: people.map((row) => row.id),
          subject,
          body,
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: (result) =>
          `${result.drafted} ${result.drafted === 1 ? "draft is" : "drafts are"} waiting in Inbox`,
        error: "The drafts weren't saved. Nothing was sent.",
      },
      report: reportFailure("hq.people.bulk_draft_failed"),
      onSuccess: () => {
        setSubject("");
        setBody("");
        onDone();
      },
    },
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        description="Each person gets their own draft in Inbox. You review and send them there; nothing is sent from People."
        title="Start a message draft"
      >
        <form
          className="people-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim() && adults.length > 0) void save.run();
          }}
        >
          <p className="people-quiet">
            {`For ${adults.length} ${adults.length === 1 ? "person" : "people"}`}
            {left > 0
              ? `. ${left} left out: juniors are written to through their guardian in Inbox, and people without an email or mobile can't get a message.`
              : "."}
          </p>
          <Field label="Subject" optional>
            <Input
              maxLength={180}
              onChange={(event) => setSubject(event.currentTarget.value)}
              value={subject}
            />
          </Field>
          <Field label="Message">
            <Textarea
              maxLength={8000}
              onChange={(event) => setBody(event.currentTarget.value)}
              required
              rows={5}
              value={body}
            />
          </Field>
          {save.error ? (
            <Notice role="alert" tone="danger" title="Not saved">
              {(save.error as { userMessage?: string }).userMessage ??
                "The drafts weren't saved. Nothing was sent."}
            </Notice>
          ) : null}
          <div className="people-actions">
            <Button
              disabled={!body.trim() || adults.length === 0}
              loading={save.showPending}
              type="submit"
              variant="primary"
            >
              {`Save ${adults.length} ${adults.length === 1 ? "draft" : "drafts"} in Inbox`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Tags selected people (the tag store is "Needs API": it says so honestly). */
function TagDialog({
  open,
  onOpenChange,
  people,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly people: readonly PersonRow[];
}) {
  const [tag, setTag] = useState("");
  const save = useAction(
    async () =>
      unwrap(
        await tagPeopleAction({
          personIds: people.map((row) => row.id),
          tag: tag.trim(),
        }),
      ),
    {
      messages: { success: "Tagged" },
      report: reportFailure("hq.people.tag_failed"),
    },
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        description={`A tag groups people for a segment or an audience. ${people.length} selected.`}
        title="Tag people"
      >
        <form
          className="people-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (tag.trim()) void save.run();
          }}
        >
          <Field label="Tag">
            <Input
              maxLength={40}
              onChange={(event) => setTag(event.currentTarget.value)}
              placeholder="Beach league 2027"
              value={tag}
            />
          </Field>
          {save.error ? (
            <Notice role="status" tone="info" title="Not available yet">
              {(save.error as { userMessage?: string }).userMessage ??
                "Tagging isn't available yet. Nothing was changed."}
            </Notice>
          ) : null}
          <div className="people-actions">
            <Button
              disabled={!tag.trim()}
              loading={save.showPending}
              type="submit"
              variant="primary"
            >
              {`Tag ${people.length} ${people.length === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
