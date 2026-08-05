"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarCheck2,
  CircleAlert,
  Coins,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type PeopleFilter =
  "all" | "upcoming" | "members" | "credits" | "attention" | "minors";

const filters: readonly {
  readonly id: PeopleFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "Everyone" },
  { id: "upcoming", label: "Coming up" },
  { id: "members", label: "Active plans" },
  { id: "credits", label: "Has credits" },
  { id: "attention", label: "Needs attention" },
  { id: "minors", label: "Minors" },
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
      <section className="people-command-metrics" aria-label="People overview">
        <article className="people-command-metrics__primary">
          <span className="people-command-metrics__icon">
            <UsersRound aria-hidden size={21} />
          </span>
          <span>
            <small>Connected people</small>
            <Numeric>{workspace.people.length}</Numeric>
          </span>
          <p>Every relationship, purchase, session, balance, and note.</p>
        </article>
        <article>
          <UserRoundCheck aria-hidden size={20} />
          <span>
            <Numeric>{activePlans}</Numeric>
            <small>active plans</small>
          </span>
        </article>
        <article>
          <CalendarCheck2 aria-hidden size={20} />
          <span>
            <Numeric>{upcomingPeople}</Numeric>
            <small>coming up</small>
          </span>
        </article>
        <article>
          <CircleAlert aria-hidden size={20} />
          <span>
            <Numeric>{needsAttention.length}</Numeric>
            <small>need attention</small>
          </span>
        </article>
      </section>

      <section className="people-command-layout">
        <div className="hq-card people-directory">
          <header className="people-directory__header">
            <div>
              <span className="hq-eyebrow">Find anyone fast</span>
              <h2>People directory</h2>
              <p>
                Open a person to see their full relationship with your
                organization and take care of the next job.
              </p>
            </div>
            <label className="people-search">
              <Search aria-hidden size={18} />
              <input
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email, phone, role, plan…"
                type="search"
                value={query}
              />
              <kbd>⌘ K</kbd>
            </label>
          </header>
          <div
            className="people-filter-row"
            role="tablist"
            aria-label="Filter people"
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
          </div>
          <div className="people-directory__result-count">
            <strong>{people.length}</strong> of {workspace.people.length} people
            {normalizedQuery ? ` matching “${query.trim()}”` : ""}
          </div>
          <div className="people-directory__list">
            {people.map((person) => (
              <Link href={`/members/${person.personId}`} key={person.personId}>
                <span className="people-directory__avatar">
                  {person.avatarUrl ? (
                    <img alt="" src={person.avatarUrl} />
                  ) : (
                    initials(person.displayName)
                  )}
                  <i data-state={person.status} />
                </span>
                <span className="people-directory__identity">
                  <strong>{person.displayName}</strong>
                  <small>
                    {person.email ??
                      person.phoneE164 ??
                      "Contact details missing"}
                  </small>
                  <span>
                    {person.roles.slice(0, 2).map((role) => (
                      <em key={role}>{role.replaceAll("-", " ")}</em>
                    ))}
                    {person.isMinor && <em>minor</em>}
                  </span>
                </span>
                <span className="people-directory__relationship">
                  <small>Relationship</small>
                  <strong>{person.membershipName ?? "No active plan"}</strong>
                  <span>
                    {person.creditBalance} credits · {person.upcomingCount}{" "}
                    upcoming
                  </span>
                </span>
                <span className="people-directory__activity">
                  <small>Last activity</small>
                  <strong>
                    {person.churnRisk.lastActivityAt
                      ? formatVenueTime(
                          person.churnRisk.lastActivityAt,
                          workspace.organization.timezone,
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      : "No activity yet"}
                  </strong>
                  <span>
                    {formatMoney(
                      person.lifetimeSpendMinor,
                      workspace.organization.currency,
                    )}{" "}
                    lifetime
                  </span>
                </span>
                <span className="people-directory__signal">
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
                      ? "follow up"
                      : person.churnRisk.level}
                  </Badge>
                  <small>{person.churnRisk.score}/100 signal</small>
                </span>
                <ArrowRight
                  aria-hidden
                  className="people-directory__arrow"
                  size={18}
                />
              </Link>
            ))}
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
              <span className="people-command-rail__mark">
                <Sparkles aria-hidden size={17} />
              </span>
              <span>
                <small>Duna signal</small>
                <strong>Worth your attention</strong>
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
                <p>Everyone has a healthy recent relationship signal.</p>
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
              <strong>Private by design</strong>
              Health summaries appear only after a player grants this
              organization access. Private coach notes never appear to players.
            </span>
          </section>
        </aside>
      </section>
    </div>
  );
}
