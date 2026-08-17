"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  LayoutGrid,
  ListFilter,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type View = "table" | "cards";
type Sort = "name" | "sessions" | "upcoming" | "goal";
type StatusFilter = "all" | "active" | "coaches" | "attention";
type Staff = OperatorWorkspace["staff"][number];

const filters: readonly {
  readonly id: StatusFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "Everyone" },
  { id: "active", label: "Active" },
  { id: "coaches", label: "Coaches" },
  { id: "attention", label: "Needs setup" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function roleName(role: Staff["role"]): string {
  return role.replaceAll("-", " ");
}

function compensationLabel(person: Staff): string {
  if (person.compensationModel === "not-set") return "Needs setup";
  if (person.compensationModel === "hourly") {
    return person.hourlyRateMinor === undefined
      ? "Hourly"
      : `${formatMoney(person.hourlyRateMinor, person.currency)} / hr`;
  }
  if (person.compensationModel === "profit-share") {
    return `${(person.profitShareBps ?? 0) / 100}% share`;
  }
  return `${formatMoney(person.hourlyRateMinor ?? 0, person.currency)} / hr + ${(person.profitShareBps ?? 0) / 100}%`;
}

function needsSetup(person: Staff): boolean {
  return !person.addressComplete || person.compensationModel === "not-set";
}

function Avatar({
  person,
  large = false,
}: {
  readonly person: Staff;
  readonly large?: boolean;
}) {
  return (
    <span className={`team-avatar${large ? " team-avatar--large" : ""}`}>
      {person.avatarUrl ? (
        <img alt="" src={person.avatarUrl} />
      ) : (
        initials(person.displayName)
      )}
      <i data-active={person.active} />
    </span>
  );
}

export function TeamWorkspace({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<View>("table");
  const [sort, setSort] = useState<Sort>("name");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const team = useMemo(() => {
    const matches = workspace.staff.filter((person) => {
      const queryMatch =
        !normalizedQuery ||
        [
          person.displayName,
          person.email,
          person.phoneE164,
          person.role,
          person.workerClassification,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      if (!queryMatch) return false;
      if (filter === "active") return person.active;
      if (filter === "coaches") return person.role === "coach";
      if (filter === "attention") return needsSetup(person);
      return true;
    });
    return matches.toSorted((left, right) => {
      if (sort === "sessions")
        return (
          right.sessionsRun30d - left.sessionsRun30d ||
          left.displayName.localeCompare(right.displayName)
        );
      if (sort === "upcoming")
        return (
          right.upcomingSessions - left.upcomingSessions ||
          left.displayName.localeCompare(right.displayName)
        );
      if (sort === "goal")
        return (
          (right.incomeGoalMinor ?? -1) - (left.incomeGoalMinor ?? -1) ||
          left.displayName.localeCompare(right.displayName)
        );
      return left.displayName.localeCompare(right.displayName);
    });
  }, [filter, normalizedQuery, sort, workspace.staff]);
  const active = workspace.staff.filter((person) => person.active);
  const upcoming = workspace.staff.reduce(
    (sum, person) => sum + person.upcomingSessions,
    0,
  );
  const ready = workspace.staff.filter(
    (person) =>
      person.addressComplete && person.compensationModel !== "not-set",
  ).length;

  return (
    <div className="team-workspace">
      <section className="team-command-metrics" aria-label="Team overview">
        <article className="team-command-metrics__primary">
          <span className="team-command-metrics__icon">
            <UsersRound aria-hidden size={21} />
          </span>
          <span>
            <small>Active team</small>
            <Numeric>{active.length}</Numeric>
          </span>
          <p>
            {workspace.staff.length} connected people across coaching and
            operations.
          </p>
        </article>
        <article>
          <CalendarDays aria-hidden size={19} />
          <span>
            <Numeric>{upcoming}</Numeric>
            <small>upcoming sessions</small>
          </span>
        </article>
        <article>
          <span>
            <Numeric>
              {workspace.staff.reduce(
                (sum, person) => sum + person.sessionsRun30d,
                0,
              )}
            </Numeric>
            <small>sessions · 30 days</small>
          </span>
        </article>
        <article>
          <span>
            <Numeric>{ready}</Numeric>
            <small>profiles ready</small>
          </span>
          <small>role, pay + address</small>
        </article>
      </section>

      <section className="hq-card team-directory">
        <header className="team-directory__header">
          <div>
            <span className="hq-eyebrow">Team directory</span>
            <h2>Who is ready to cover what?</h2>
            <p>
              Search the roster, compare workload, and open the full profile
              when you need to make a change.
            </p>
          </div>
          <Link className="hq-button hq-button--primary" href="/team/invite">
            Invite team member <ArrowRight aria-hidden size={16} />
          </Link>
        </header>

        <div className="team-directory__tools">
          <label className="team-search">
            <Search aria-hidden size={18} />
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, role…"
              type="search"
              value={query}
            />
          </label>
          <label className="team-sort">
            <SlidersHorizontal aria-hidden size={15} />
            <span>Sort</span>
            <select
              aria-label="Sort team"
              onChange={(event) => setSort(event.target.value as Sort)}
              value={sort}
            >
              <option value="name">Name</option>
              <option value="sessions">Sessions · 30d</option>
              <option value="upcoming">Upcoming sessions</option>
              <option value="goal">Income goal</option>
            </select>
          </label>
          <div
            className="team-view-toggle"
            aria-label="Choose directory layout"
          >
            <button
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              type="button"
            >
              <ListFilter aria-hidden size={16} /> Table
            </button>
            <button
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
              type="button"
            >
              <LayoutGrid aria-hidden size={16} /> Cards
            </button>
          </div>
        </div>
        <div
          className="team-filter-row"
          role="tablist"
          aria-label="Filter team"
        >
          {filters.map((item) => (
            <button
              aria-selected={filter === item.id}
              className={filter === item.id ? "active" : undefined}
              key={item.id}
              onClick={() => setFilter(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
          <span>
            <strong>{team.length}</strong> of {workspace.staff.length} people
          </span>
        </div>

        {team.length === 0 ? (
          <div className="hq-empty">
            <strong>No team members match this view.</strong>
            <span>Try clearing the search or changing the filter.</span>
          </div>
        ) : view === "table" ? (
          <div
            className="team-table"
            role="table"
            aria-label="Team performance directory"
          >
            <div className="team-table__heading" role="row">
              <span>Team member</span>
              <span>Role + readiness</span>
              <span>Sessions</span>
              <span>Compensation</span>
              <span>Goal</span>
              <span aria-label="Open profile" />
            </div>
            {team.map((person) => (
              <Link
                href={`/team/${person.personId}`}
                key={person.id}
                role="row"
              >
                <span className="team-table__identity">
                  <Avatar person={person} />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.email ??
                        person.phoneE164 ??
                        "Contact details missing"}
                    </small>
                  </span>
                </span>
                <span>
                  <Badge tone={person.active ? "positive" : "neutral"}>
                    {person.active ? "active" : "inactive"}
                  </Badge>
                  <small>
                    {roleName(person.role)} ·{" "}
                    {person.workerClassification.replaceAll("-", " ")}
                  </small>
                </span>
                <span>
                  <strong>{person.sessionsRun30d}</strong>
                  <small>{person.upcomingSessions} coming up</small>
                </span>
                <span>
                  <strong>{compensationLabel(person)}</strong>
                  <small>Posted earnings not tracked yet</small>
                </span>
                <span>
                  <strong>
                    {person.incomeGoalMinor === undefined
                      ? "No goal"
                      : formatMoney(person.incomeGoalMinor, person.currency)}
                  </strong>
                  <small>
                    {person.incomeGoalPeriod
                      ? `per ${person.incomeGoalPeriod}`
                      : "set a period"}
                  </small>
                </span>
                <ArrowRight aria-hidden size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="team-card-grid">
            {team.map((person) => (
              <Link href={`/team/${person.personId}`} key={person.id}>
                <header>
                  <Avatar large person={person} />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {roleName(person.role)} ·{" "}
                      {person.active ? "Active" : "Inactive"}
                    </small>
                  </span>
                  <ArrowRight aria-hidden size={17} />
                </header>
                <div className="team-card-grid__metrics">
                  <span>
                    <small>Sessions · 30d</small>
                    <strong>{person.sessionsRun30d}</strong>
                  </span>
                  <span>
                    <small>Coming up</small>
                    <strong>{person.upcomingSessions}</strong>
                  </span>
                  <span>
                    <small>Income goal</small>
                    <strong>
                      {person.incomeGoalMinor === undefined
                        ? "—"
                        : formatMoney(person.incomeGoalMinor, person.currency)}
                    </strong>
                  </span>
                </div>
                <footer>
                  <Badge tone={needsSetup(person) ? "warning" : "positive"}>
                    {needsSetup(person) ? "needs setup" : "profile ready"}
                  </Badge>
                  <span>{compensationLabel(person)}</span>
                </footer>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
