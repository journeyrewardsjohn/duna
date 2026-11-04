"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge } from "@duna/ui";
import { ArrowRight, Coins, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type PeopleFilter =
  | "all"
  | "upcoming"
  | "members"
  | "credits"
  | "attention"
  | "minors"
  | "guardians";

const filters: readonly {
  readonly id: PeopleFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "Everyone" },
  { id: "upcoming", label: "Coming up" },
  { id: "members", label: "Active plans" },
  { id: "credits", label: "Has credits" },
  { id: "attention", label: "Retention follow-up" },
  { id: "minors", label: "Junior players" },
  { id: "guardians", label: "Parents & guardians" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function includesQuery(
  person: OperatorWorkspace["people"][number],
  query: string,
): boolean {
  if (!query) return true;
  return [
    person.displayName,
    person.email,
    person.phoneE164,
    person.membershipName,
    ...person.roles,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function matchesFilter(
  person: OperatorWorkspace["people"][number],
  filter: PeopleFilter,
): boolean {
  if (filter === "upcoming") return person.upcomingCount > 0;
  if (filter === "members")
    return Boolean(
      person.membershipStatus &&
      !["cancelled", "expired", "inactive"].includes(person.membershipStatus),
    );
  if (filter === "credits") return person.creditBalance > 0;
  if (filter === "attention") return person.churnRisk.level !== "low";
  if (filter === "minors") return person.isMinor;
  if (filter === "guardians") return person.roles.includes("guardian");
  return true;
}

export function PeopleWorkspace({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const people = useMemo(
    () =>
      workspace.people
        .filter(
          (person) =>
            includesQuery(person, normalizedQuery) &&
            matchesFilter(person, filter),
        )
        .toSorted((left, right) => {
          if (left.churnRisk.level !== right.churnRisk.level) {
            const priority = { high: 0, watch: 1, low: 2 } as const;
            return (
              priority[left.churnRisk.level] - priority[right.churnRisk.level]
            );
          }
          return left.displayName.localeCompare(right.displayName);
        }),
    [filter, normalizedQuery, workspace.people],
  );
  const activePlans = workspace.people.filter((person) =>
    Boolean(
      person.membershipStatus &&
      !["cancelled", "expired", "inactive"].includes(person.membershipStatus),
    ),
  ).length;
  const upcomingPeople = workspace.people.filter(
    (person) => person.upcomingCount > 0,
  ).length;
  const needsAttention = workspace.people.filter(
    (person) => person.churnRisk.level !== "low",
  );
  const recentPurchases = workspace.people
    .flatMap((person) =>
      person.recentPurchases.map((purchase) => ({
        ...purchase,
        personId: person.personId,
        personName: person.displayName,
      })),
    )
    .toSorted((left, right) =>
      right.purchasedAt.localeCompare(left.purchasedAt),
    )
    .slice(0, 5);

  return (
    <div className="people-workspace people-command-center">
      <div className="hq-summary-line" aria-label="People overview">
        <span>
          <strong>{workspace.people.length}</strong> people
        </span>
        <span>
          <strong>{activePlans}</strong> active plans
        </span>
        <span>
          <strong>{upcomingPeople}</strong> with upcoming sessions
        </span>
        <span>
          <strong>{needsAttention.length}</strong> need follow-up
        </span>
      </div>

      <section className="people-command-layout">
        <div className="hq-card people-directory">
          <header className="people-directory__header">
            <label className="people-search">
              <Search aria-hidden size={18} />
              <input
                aria-label="Search people"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email, phone, role, plan…"
                type="search"
                value={query}
              />
            </label>
          </header>
          <div
            className="people-filter-row"
            role="group"
            aria-label="Filter people"
          >
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={filter === item.id ? "active" : undefined}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="people-directory__result-count">
            <strong>{people.length}</strong> of {workspace.people.length} people
            {normalizedQuery ? ` matching “${query.trim()}”` : ""}
          </div>
          <div className="people-directory__list">
            <div
              className="hq-data-scroll"
              tabIndex={0}
              role="region"
              aria-label="People directory"
            >
              <table className="hq-data-table">
                <caption className="sr-only">People directory</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Plan & credits</th>
                    <th scope="col">Upcoming</th>
                    <th scope="col">Last activity</th>
                    <th scope="col">Lifetime spend</th>
                    <th scope="col">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.personId}>
                      <th scope="row">
                        <Link
                          className="hq-person-link"
                          href={`/members/${person.personId}`}
                        >
                          <span className="people-directory__avatar">
                            {person.avatarUrl ? (
                              <img alt="" src={person.avatarUrl} />
                            ) : (
                              initials(person.displayName)
                            )}
                          </span>
                          <span>
                            <strong>{person.displayName}</strong>
                            <small>
                              {person.email ??
                                person.phoneE164 ??
                                "Contact details missing"}
                            </small>
                            <small>
                              {person.roles.join(", ").replaceAll("-", " ")}
                              {person.isMinor ? " · minor" : ""}
                              {person.status !== "active"
                                ? ` · ${person.status}`
                                : ""}
                            </small>
                          </span>
                        </Link>
                      </th>
                      <td>
                        {person.membershipName ?? "No active plan"}
                        <small>{person.creditBalance} credits</small>
                      </td>
                      <td>{person.upcomingCount}</td>
                      <td>
                        {person.churnRisk.lastActivityAt
                          ? formatVenueTime(
                              person.churnRisk.lastActivityAt,
                              workspace.organization.timezone,
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : "No activity"}
                      </td>
                      <td>
                        {formatMoney(
                          person.lifetimeSpendMinor,
                          workspace.organization.currency,
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            person.churnRisk.level === "high"
                              ? "warning"
                              : person.churnRisk.level === "low"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {person.churnRisk.level === "high"
                            ? "Follow up"
                            : person.churnRisk.level === "low"
                              ? "Low risk"
                              : "Review"}
                        </Badge>
                        <small>
                          {person.churnRisk.reasons[0] ??
                            `${person.churnRisk.score}/100 signal`}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {people.length === 0 && (
              <div className="hq-empty people-directory__empty">
                <Search aria-hidden size={22} />
                <strong>No people match this view.</strong>
                <span>Try a different search or remove the active filter.</span>
                <button
                  className="hq-button hq-button--secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  type="button"
                >
                  Show everyone
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="people-command-rail">
          <section className="hq-card people-attention-card">
            <header>
              <span>
                <strong>Follow-up</strong>
              </span>
            </header>
            <div>
              {needsAttention.slice(0, 4).map((person) => (
                <Link
                  href={`/members/${person.personId}`}
                  key={person.personId}
                >
                  <span>{initials(person.displayName)}</span>
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.churnRisk.reasons[0] ??
                        "Relationship needs review"}
                    </small>
                  </span>
                  <ArrowRight aria-hidden size={15} />
                </Link>
              ))}
              {needsAttention.length === 0 && (
                <p>No retention follow-up flagged.</p>
              )}
            </div>
          </section>

          <section className="hq-card people-activity-card">
            <header>
              <Coins aria-hidden size={18} />
              <span>
                <small>Recent money activity</small>
                <strong>Purchases</strong>
              </span>
            </header>
            <div>
              {recentPurchases.map((purchase) => (
                <Link
                  href={`/members/${purchase.personId}`}
                  key={purchase.orderId}
                >
                  <span>
                    <strong>{purchase.personName}</strong>
                    <small>{purchase.description}</small>
                  </span>
                  <strong>
                    {formatMoney(purchase.amountMinor, purchase.currency)}
                  </strong>
                </Link>
              ))}
              {recentPurchases.length === 0 && (
                <p>Paid organization purchases will appear here.</p>
              )}
            </div>
          </section>

          <section className="people-privacy-note">
            <ShieldCheck aria-hidden size={19} />
            <span>
              <strong>Privacy</strong>
              Health summaries appear only after a player grants this
              organization access. Private coach notes never appear to players.
            </span>
          </section>
        </aside>
      </section>
    </div>
  );
}
