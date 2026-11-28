"use client";

import { formatMoney } from "@duna/core";
import {
  EmptyResults,
  FilterChip,
  riseClassName,
  rallyStyle,
} from "@duna/ui/tideline";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { GroupStatus } from "./group-status";
import { SessionSheet, type SessionPermissions } from "./session-sheet";
import {
  sessionMatches,
  type SessionFilter,
  type SessionView,
} from "./session-model";

const filters: readonly {
  readonly id: SessionFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "at-risk", label: "At risk" },
  { id: "full", label: "Full" },
  { id: "confirmed", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled" },
];

/**
 * A list of sessions (an offering's Sessions tab, or the area's "At risk
 * this week"): each with its state in the shared words, who and how many
 * are booked, the decision time and, for people who may see money, what is
 * at stake. A row opens the session as a side panel; `?session=` opens one
 * directly.
 */
export function SessionList({
  sessions,
  allSessions,
  permissions,
  now,
  currency,
  showTitle = false,
  showFilters = true,
  label,
  shareUrls,
}: {
  readonly sessions: readonly SessionView[];
  /** Every session the merge picker may offer (defaults to `sessions`). */
  readonly allSessions?: readonly SessionView[];
  readonly permissions: SessionPermissions;
  readonly now: string;
  readonly currency: string;
  /** Area lists show which offering each session belongs to. */
  readonly showTitle?: boolean;
  readonly showFilters?: boolean;
  readonly label: string;
  /** The public booking link per offering id. */
  readonly shareUrls?: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<SessionFilter>("all");
  const openId = params.get("session");
  const shown = useMemo(
    () => sessions.filter((session) => sessionMatches(session, filter)),
    [sessions, filter],
  );
  const pool = allSessions ?? sessions;
  const open = pool.find((session) => session.id === openId) ?? null;
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("session", id);
    else next.delete("session");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  const nowDate = new Date(now);
  return (
    <div className="pt-sessions">
      {showFilters ? (
        <div aria-label="Show sessions" className="pt-filters" role="group">
          {filters.map((entry) => (
            <FilterChip
              key={entry.id}
              onPressedChange={() => setFilter(entry.id)}
              pressed={filter === entry.id}
            >
              {entry.label}
            </FilterChip>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <EmptyResults
          clearLabel="Show all sessions"
          onClear={() => setFilter("all")}
          query={filters.find((entry) => entry.id === filter)?.label}
        />
      ) : (
        <ul aria-label={label} className="pt-session-list">
          {shown.map((session, index) => {
            const started =
              new Date(session.startsAt).getTime() <= nowDate.getTime();
            const running =
              started &&
              new Date(session.endsAt).getTime() > nowDate.getTime() &&
              session.state !== "cancelled-club" &&
              session.state !== "cancelled-low";
            const stake =
              permissions.money && session.atStakeCredits !== undefined
                ? [
                    session.atStakeCredits > 0
                      ? `${session.atStakeCredits} credits`
                      : undefined,
                    session.atStakeMinor
                      ? formatMoney(session.atStakeMinor, currency)
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : undefined;
            return (
              <li
                className={riseClassName()}
                key={session.id}
                style={rallyStyle(index)}
              >
                <button
                  aria-label={`${session.title}, ${session.startLabel}. ${session.status}${session.line ? `. ${session.line}` : ""}. ${session.booked} of ${session.capacity} booked.`}
                  className="pt-session"
                  onClick={() => setOpen(session.id)}
                  type="button"
                >
                  <span className="pt-session__when">{session.startLabel}</span>
                  <span className="pt-session__what">
                    {showTitle ? (
                      <span className="pt-session__title">{session.title}</span>
                    ) : null}
                    <span className="pt-session__staff">{session.staff}</span>
                    {session.coachNames.length > 0 ? (
                      <span className="pt-quiet">
                        {session.coachNames.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="pt-session__count pt-num">
                    {`${session.booked} of ${session.capacity}`}
                  </span>
                  {stake ? (
                    <span className="pt-session__stake pt-num">{stake}</span>
                  ) : null}
                  <GroupStatus
                    compact
                    running={running}
                    status={session.status}
                    tone={session.display.tone}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <SessionSheet
        currency={currency}
        now={now}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        open={Boolean(open)}
        permissions={permissions}
        sameOffering={pool.filter(
          (candidate) => candidate.catalogItemId === open?.catalogItemId,
        )}
        session={open}
        shareUrl={
          open?.catalogItemId ? shareUrls?.[open.catalogItemId] : undefined
        }
      />
    </div>
  );
}
