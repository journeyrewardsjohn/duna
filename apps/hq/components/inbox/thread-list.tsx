"use client";

import type { ConciergeThreadSummary } from "@duna/api";
import { Icon, type IconName } from "@duna/ui/icons";
import {
  Avatar,
  Badge,
  Button,
  Chip,
  EmptyResults,
  EmptyState,
  riseClassName,
  rallyStyle,
  SearchField,
  Select,
  useDebouncedCallback,
  usePendingNavigation,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  filterLabels,
  type InboxFilter,
  inboxHref,
  type InboxState,
  kindLabels,
  listTime,
  THREAD_KINDS,
  type ThreadKind,
} from "./inbox-model";

const kindIcons: Record<ThreadKind, IconName> = {
  lesson: "lesson",
  match: "score",
  tournament: "tournament",
  league: "league",
  club: "users",
  duna: "info",
};

/**
 * The thread list: the queue filters, search, kind, and one row per thread
 * with its face, what it is about, the last line and the unread count. The
 * address holds the state, so a filtered list can be shared and Back works.
 */
export function ThreadList({
  state,
  threads,
  counts,
  showMuted,
  timeZone,
  now,
}: {
  readonly state: InboxState;
  readonly threads: readonly ConciergeThreadSummary[];
  readonly counts: {
    readonly all: number;
    readonly unread: number;
    readonly families: number;
  };
  readonly showMuted: boolean;
  readonly timeZone: string;
  readonly now: string;
}) {
  const router = useRouter();
  const navigation = usePendingNavigation(router.replace);
  const [query, setQuery] = useState(state.q);
  useEffect(() => setQuery(state.q), [state.q]);
  const search = useDebouncedCallback((value: string) => {
    navigation.navigate(inboxHref(state, { q: value.trim() || undefined }));
  });
  const filters = (
    ["all", "mine", "unassigned", "unread", "families", "muted"] as const
  ).filter((filter) => filter !== "muted" || showMuted);
  const countFor: Partial<Record<InboxFilter, number>> = {
    all: counts.all,
    unread: counts.unread,
    families: counts.families,
  };
  const at = new Date(now);
  return (
    <div className="inbox-list">
      <div className="inbox-list__tools">
        <SearchField
          label="Search conversations"
          onSubmit={() => search.flush?.()}
          onValueChange={(value) => {
            setQuery(value);
            search(value);
          }}
          placeholder="Search people, sessions, events"
          stale={navigation.pending}
          status={navigation.pending ? "loading" : "idle"}
          value={query}
        />
        <nav aria-label="Filter conversations" className="inbox-filters">
          {filters.map((filter) => (
            <Link
              aria-current={state.filter === filter ? "page" : undefined}
              className="inbox-filter"
              href={inboxHref(state, {
                filter,
                thread: undefined,
                person: undefined,
                proposal: undefined,
              })}
              key={filter}
              scroll={false}
            >
              {filterLabels[filter]}
              {countFor[filter] ? (
                <span className="inbox-filter__count">{countFor[filter]}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="inbox-list__kind">
          <Select
            aria-label="Kind of conversation"
            onValueChange={(value) =>
              navigation.navigate(
                inboxHref(state, {
                  kind: value && value !== "any" ? value : undefined,
                }),
              )
            }
            options={[
              { value: "any", label: "Every kind" },
              ...THREAD_KINDS.map((kind) => ({
                value: kind,
                label: kindLabels[kind],
              })),
            ]}
            value={state.kind ?? "any"}
          />
        </div>
      </div>
      {threads.length === 0 ? (
        <div className="inbox-list__empty">
          {state.q || state.kind ? (
            <EmptyResults
              clearLabel="Clear search and kind"
              onClear={() =>
                navigation.navigate(
                  inboxHref(state, { q: undefined, kind: undefined }),
                )
              }
              query={state.q || undefined}
            />
          ) : state.filter === "unread" ? (
            <EmptyState
              description="Every conversation has been read by your team."
              icon="success"
              title="You're all caught up"
            />
          ) : state.filter === "mine" ? (
            <EmptyState
              description="Assign a conversation to yourself from its menu, or a teammate hands one to you."
              icon="user-plus"
              title="Nothing assigned to you"
            />
          ) : state.filter === "unassigned" ? (
            <EmptyState
              description="Every conversation has someone looking after it."
              icon="success"
              title="Nothing unassigned"
            />
          ) : state.filter === "families" ? (
            <EmptyState
              description="Conversations with a junior and their guardian appear here."
              icon="junior-guardian"
              title="No family conversations"
            />
          ) : (
            <EmptyState
              actions={
                <Button
                  href={inboxHref(state, { compose: "new" })}
                  size="sm"
                  variant="primary"
                >
                  New message
                </Button>
              }
              description="Write to everyone at the club, a session's players, a league or one person. Replies come back here."
              icon="thread"
              title="No conversations yet"
            />
          )}
        </div>
      ) : (
        <ul
          aria-label="Conversations"
          className="inbox-rows"
          data-stale={navigation.pending || undefined}
        >
          {threads.map((thread, index) => {
            const active = thread.conversationId === state.thread;
            const unread = thread.unreadCount > 0;
            return (
              <li
                className={riseClassName({ short: true })}
                key={thread.conversationId}
                style={rallyStyle(index)}
              >
                <Link
                  aria-current={active ? "true" : undefined}
                  className="inbox-row"
                  data-unread={unread || undefined}
                  href={inboxHref(state, {
                    thread: thread.conversationId,
                    compose: undefined,
                    person: undefined,
                    proposal: undefined,
                  })}
                  scroll={false}
                >
                  <span className="inbox-row__face">
                    <Avatar
                      decorative
                      kind={
                        thread.kind === "club" || thread.kind === "duna"
                          ? "club"
                          : "person"
                      }
                      name={thread.title}
                      size="md"
                    />
                    <span
                      aria-hidden="true"
                      className="inbox-row__kind"
                      data-kind={thread.kind}
                    >
                      <Icon name={kindIcons[thread.kind]} size="chip" />
                    </span>
                  </span>
                  <span className="inbox-row__main">
                    <span className="inbox-row__top">
                      <span className="inbox-row__title">{thread.title}</span>
                      {thread.lastMessageAt ? (
                        <time
                          className="inbox-row__time"
                          dateTime={thread.lastMessageAt}
                        >
                          {listTime(thread.lastMessageAt, timeZone, at)}
                        </time>
                      ) : null}
                    </span>
                    <span className="inbox-row__meta">
                      <span className="inbox-row__about">
                        {kindLabels[thread.kind]}
                        {thread.context?.status
                          ? ` · ${thread.context.status}`
                          : ""}
                        {` · ${thread.participantCount} ${thread.participantCount === 1 ? "person" : "people"}`}
                      </span>
                      {thread.minorPresent ? (
                        <Chip kind="taxonomy">
                          <Icon name="junior-guardian" size="chip" /> Family
                        </Chip>
                      ) : null}
                    </span>
                    <span className="inbox-row__bottom">
                      <span className="inbox-row__preview">
                        {thread.lastMessagePreview ?? "No messages yet"}
                      </span>
                      {unread ? (
                        <Badge
                          label={
                            thread.unreadCount === 1
                              ? "unread message"
                              : "unread messages"
                          }
                        >
                          {thread.unreadCount}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
