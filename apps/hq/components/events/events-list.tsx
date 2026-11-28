"use client";

import { Icon } from "@duna/ui/icons";
import { report } from "@duna/observability";
import {
  Button,
  Chip,
  EmptyFirstUse,
  EmptyResults,
  FilterChip,
  OfflineBanner,
  Progress,
  SEARCH_DEBOUNCE_MS,
  SearchField,
  Segmented,
  rallyStyle,
  riseClassName,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { approveTicketAction } from "@/app/(next)/(hq)/events/actions";
import { PageHeader, PageSection } from "../shell/page-header";
import { unwrap } from "../money/money-action-result";
import type { TicketApprovalRow } from "./events-data";
import {
  EVENT_SEGMENTS,
  KIND_ICON,
  KIND_LABEL,
  defaultSegment,
  parseEventType,
  parseSegment,
  rowsFor,
  type EventKind,
  type EventRow,
  type EventSegment,
} from "./events-model";

/**
 * The Events list (H-EVENTS): what is live now, what is coming, what has
 * finished and what is still a draft, each a list of object rows. The type
 * is an in-page filter (the old type pages and Leagues land here with
 * `?type=`); search waits for typing to pause. One primary action: Create.
 */
export function EventsList({
  rows,
  approvals,
  organization,
  canCreate,
}: {
  readonly rows: readonly EventRow[];
  readonly approvals: readonly TicketApprovalRow[];
  readonly organization: string;
  readonly canCreate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = parseEventType(params.get("type") ?? undefined);
  const [segment, setSegment] = useState<EventSegment>(
    parseSegment(params.get("view")) ?? defaultSegment(rows),
  );
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const setParam = (name: string, value: string | undefined) => {
    const search = new URLSearchParams(params.toString());
    if (value) search.set(name, value);
    else search.delete(name);
    const text = search.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };

  const kinds = useMemo(
    () =>
      (Object.keys(KIND_LABEL) as EventKind[]).filter(
        (entry) => entry === kind || rows.some((row) => row.kind === entry),
      ),
    [rows, kind],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        EVENT_SEGMENTS.map((entry) => [
          entry.value,
          rowsFor(rows, entry.value, kind ? { kind } : {}).length,
        ]),
      ) as Record<EventSegment, number>,
    [rows, kind],
  );
  const shown = useMemo(
    () =>
      rowsFor(rows, segment, {
        ...(kind ? { kind } : {}),
        query: debounced,
      }),
    [rows, segment, kind, debounced],
  );
  const groups = useMemo(() => {
    const byDay: { day: string; rows: EventRow[] }[] = [];
    for (const row of shown) {
      const group = byDay.find((entry) => entry.day === row.day);
      if (group) group.rows.push(row);
      else byDay.push({ day: row.day, rows: [row] });
    }
    return byDay;
  }, [shown]);

  const title = kind === "league" ? "Leagues" : "Events";
  const createHref =
    kind === "league" ? "/events/create?type=league" : "/events/create";
  const filtered = Boolean(kind || debounced.trim());

  return (
    <>
      <PageHeader
        actions={
          canCreate ? (
            // The event studio is not rebuilt yet: a full page load.
            <Button
              href={createHref}
              icon={<Icon name="plus" size="control" />}
              variant="primary"
            >
              {kind === "league" ? "Create league" : "Create event"}
            </Button>
          ) : undefined
        }
        description={`Tournaments, leagues and sessions ${organization} runs.`}
        subnav={
          <div className="ev-filters">
            <Segmented
              aria-label="Events to show"
              onValueChange={(value) => {
                setSegment(value as EventSegment);
                setParam("view", value as string);
              }}
              options={EVENT_SEGMENTS.map((entry) => ({
                value: entry.value,
                label: counts[entry.value]
                  ? `${entry.label} ${counts[entry.value]}`
                  : entry.label,
              }))}
              value={segment}
            />
            <div className="ev-filters__row">
              <div className="ev-filters__search">
                <SearchField
                  label="Search events"
                  onValueChange={setQuery}
                  placeholder="Search by name or place"
                  resultCount={shown.length}
                  value={query}
                />
              </div>
              {kinds.length > 1 || kind ? (
                <div aria-label="Type" className="ev-filters__row" role="group">
                  <FilterChip
                    onPressedChange={() => setParam("type", undefined)}
                    pressed={!kind}
                  >
                    All types
                  </FilterChip>
                  {kinds.map((entry) => (
                    <FilterChip
                      key={entry}
                      onPressedChange={() => setParam("type", entry)}
                      pressed={kind === entry}
                    >
                      {entry === "league" ? "Leagues" : KIND_LABEL[entry]}
                    </FilterChip>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        }
        title={title}
      />
      <OfflineBanner writes="refused" />
      {approvals.length > 0 ? <TicketApprovals approvals={approvals} /> : null}
      {rows.length === 0 ? (
        <EmptyFirstUse
          action={
            canCreate ? (
              <Button href="/events/create" variant="primary">
                Create your first event
              </Button>
            ) : (
              <p className="ev-quiet">An owner or a director can create one.</p>
            )
          }
          description="A tournament, a league or a clinic: build it, open registration, run it on the day."
          icon="tournament"
          title="No events yet"
        />
      ) : shown.length === 0 ? (
        filtered ? (
          <EmptyResults
            onClear={() => {
              setQuery("");
              setParam("type", undefined);
            }}
            query={debounced || (kind ? KIND_LABEL[kind] : undefined)}
          />
        ) : (
          <p className="ev-quiet">{emptyWords[segment]}</p>
        )
      ) : (
        groups.map((group, groupIndex) => (
          <section
            aria-label={group.day}
            className={`ev-day ${riseClassName()}`}
            key={group.day}
            style={rallyStyle(groupIndex)}
          >
            <h2 className="ev-day__title">{group.day}</h2>
            <ul className="ev-rows">
              {group.rows.map((row) => (
                <EventRowItem key={row.id} row={row} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

const emptyWords: Readonly<Record<EventSegment, string>> = {
  live: "Nothing is in play right now.",
  upcoming: "Nothing coming up. Create an event or publish a draft.",
  past: "No finished events yet.",
  drafts: "No drafts. Everything is published.",
};

function EventRowItem({ row }: { readonly row: EventRow }) {
  return (
    <li className="ev-row" data-live={row.live || undefined}>
      <Link className="ev-row__link" href={row.href}>
        <span className="ev-row__main">
          <span className="ev-row__title">{row.title}</span>
          <span className="ev-row__meta">
            <span>
              <Icon name={KIND_ICON[row.kind]} size="inline" /> {row.kindLabel}
            </span>
            <span>{row.when}</span>
            {row.venue ? <span>{row.venue}</span> : null}
          </span>
        </span>
        <span className="ev-row__side">
          <Chip tone={row.tone}>{row.statusLabel}</Chip>
          {row.segment !== "drafts" ? (
            <span className="ev-fill">
              <span className="ev-num">
                {row.entries} of {row.capacity}
              </span>
              <Progress
                aria-label={`${row.entries} of ${row.capacity} places taken`}
                max={Math.max(1, row.capacity)}
                value={Math.min(row.entries, row.capacity)}
              />
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * Tickets that were paid for and wait for a person to issue them. Approving
 * is the owner's (payments:write): a confirmation that says who paid what.
 */
export function TicketApprovals({
  approvals,
}: {
  readonly approvals: readonly TicketApprovalRow[];
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [done, setDone] = useState<readonly string[]>([]);
  return (
    <PageSection
      aside={
        <Chip kind="metric" value={approvals.length - done.length}>
          Waiting
        </Chip>
      }
      flush
      id="ticket-approvals"
      title="Tickets to approve"
    >
      <p className="ev-quiet ev-pad">
        These were paid for. A ticket can't be used until someone approves it.
      </p>
      <ul className="ev-list">
        {approvals.map((approval) => {
          const id = `${approval.orderId}:${approval.ticketTypeId}`;
          const approved = done.includes(id);
          return (
            <li className="ev-item" key={id}>
              <span className="ev-item__main">
                <span className="ev-item__title">
                  {approval.buyer} · {approval.ticket}
                </span>
                <span className="ev-quiet">
                  {approval.event} · {approval.quantity}{" "}
                  {approval.quantity === 1 ? "ticket" : "tickets"} ·{" "}
                  {approval.total} · paid {approval.purchased}
                </span>
              </span>
              <span className="ev-item__side">
                {approved ? (
                  <Chip tone="positive">Approved</Chip>
                ) : (
                  <Button
                    onClick={() =>
                      void confirm
                        .run({
                          tier: "confirm",
                          title: `Approve ${approval.buyer}'s ${approval.quantity === 1 ? "ticket" : "tickets"}?`,
                          description: `${approval.quantity} × ${approval.ticket} for ${approval.event}. They were paid ${approval.total}; approving issues them.`,
                          affected: `${approval.buyer} can use ${approval.quantity === 1 ? "it" : "them"} at once.`,
                          verb: `Approve ${approval.quantity === 1 ? "ticket" : `${approval.quantity} tickets`}`,
                          cancelLabel: "Not now",
                          agentConfirm: `Approves ${approval.quantity} ${approval.ticket} for ${approval.buyer}`,
                          perform: async ({ idempotencyKey }) =>
                            unwrap(
                              await approveTicketAction({
                                orderId: approval.orderId,
                                ticketTypeId: approval.ticketTypeId,
                                sessionId: approval.sessionId,
                                idempotencyKey,
                              }),
                            ),
                          success: `${approval.buyer}'s tickets are issued`,
                          report: (error) =>
                            void report(error, {
                              event: "hq.events.approve_failed",
                            }),
                        })
                        .then((outcome) => {
                          if (outcome.status === "done") {
                            setDone((current) => [...current, id]);
                            router.refresh();
                          }
                        })
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Approve
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </PageSection>
  );
}
