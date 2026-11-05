"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  LayoutGrid,
  ListFilter,
  Search,
  SlidersHorizontal,
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
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
  const pageCount = Math.max(1, Math.ceil(team.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleTeam = team.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
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
      <div className="hq-summary-line" aria-label="Team overview">
        <span>
          <strong>{active.length}</strong> active staff
        </span>
        <span>
          <strong>{upcoming}</strong> upcoming sessions
        </span>
        <span>
          <strong>
            {workspace.staff.reduce(
              (sum, person) => sum + person.sessionsRun30d,
              0,
            )}
          </strong>{" "}
          sessions · 30 days
        </span>
        <span>
          <strong>{ready}</strong> profiles ready
        </span>
      </div>

      <section className="hq-card team-directory">
        <div className="team-directory__tools">
          <label className="team-search">
            <Search aria-hidden size={18} />
            <input
              aria-label="Search staff"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
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
              onChange={(event) => {
                setSort(event.target.value as Sort);
                setPage(0);
              }}
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
        <div className="team-filter-row" role="group" aria-label="Filter team">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.id}
              className={filter === item.id ? "active" : undefined}
              key={item.id}
              onClick={() => {
                setFilter(item.id);
                setPage(0);
              }}
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
            className="hq-data-scroll"
            role="region"
            aria-label="Staff directory"
            tabIndex={0}
          >
            <table className="hq-data-table team-data-table">
              <caption className="sr-only">Staff directory</caption>
              <thead>
                <tr>
                  <th scope="col">Staff member</th>
                  <th scope="col">Role & status</th>
                  <th scope="col">Sessions · 30d</th>
                  <th scope="col">Compensation</th>
                  <th scope="col">Income goal</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTeam.map((person) => (
                  <tr key={person.id}>
                    <th scope="row">
                      <Link
                        className="team-table__identity"
                        href={`/team/${person.personId}`}
                      >
                        <Avatar person={person} />
                        <span>
                          <strong>{person.displayName}</strong>
                          <small>
                            {person.email ??
                              person.phoneE164 ??
                              "Contact details missing"}
                          </small>
                        </span>
                      </Link>
                    </th>
                    <td>
                      <span>
                        {person.isOwner
                          ? "Owner · Director"
                          : roleName(person.role)}
                      </span>
                      <small>
                        {person.workerClassification.replaceAll("-", " ")}
                      </small>
                      <Badge tone={person.active ? "positive" : "neutral"}>
                        {person.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td>
                      {person.sessionsRun30d}
                      <small>{person.upcomingSessions} upcoming</small>
                    </td>
                    <td>
                      {compensationLabel(person)}
                      <small>Posted earnings not tracked yet</small>
                    </td>
                    <td>
                      {person.incomeGoalMinor === undefined
                        ? "Not set"
                        : formatMoney(person.incomeGoalMinor, person.currency)}
                      {person.incomeGoalPeriod && (
                        <small>per {person.incomeGoalPeriod}</small>
                      )}
                    </td>
                    <td>
                      <Link
                        href={`/team/${person.personId}`}
                        aria-label={`Manage ${person.displayName}`}
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="team-card-grid">
            {visibleTeam.map((person) => (
              <Link href={`/team/${person.personId}`} key={person.id}>
                <header>
                  <Avatar large person={person} />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.isOwner
                        ? "Owner · Director"
                        : roleName(person.role)}{" "}
                      · {person.active ? "Active" : "Inactive"}
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
        <footer className="hq-directory-pagination">
          <label>
            Rows per page{" "}
            <select
              aria-label="Staff rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span aria-live="polite">
            {team.length ? currentPage * pageSize + 1 : 0}–
            {Math.min((currentPage + 1) * pageSize, team.length)} of{" "}
            {team.length}
          </span>
          <button
            type="button"
            aria-label="Previous staff page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next staff page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </footer>
      </section>
    </div>
  );
}
