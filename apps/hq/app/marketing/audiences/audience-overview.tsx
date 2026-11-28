"use client";

import {
  AvatarStack,
  Badge,
  EmptyState,
  ProgressBar,
  StatCard,
  buttonClassName,
} from "@duna/ui";
import {
  ArrowUpRight,
  Filter,
  Layers3,
  Plus,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type AudienceSummary = {
  readonly id: string;
  readonly name: string;
  readonly mode: "static" | "dynamic" | "hybrid";
  readonly status: "active" | "archived";
  readonly revision: number;
  readonly estimatedSize: number;
  readonly projectionStatus: "complete" | "partial" | "unavailable";
  readonly unavailableFactKeys: readonly string[];
  readonly updatedAt: string;
  readonly members: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
  }[];
};

function modeLabel(mode: AudienceSummary["mode"]): string {
  if (mode === "dynamic") return "Live rules";
  if (mode === "hybrid") return "Rules + people";
  return "Selected people";
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function AudienceOverview({
  audiences,
  candidateCount,
}: {
  readonly audiences: readonly AudienceSummary[];
  readonly candidateCount: number;
}) {
  const [query, setQuery] = useState("");
  const active = audiences.filter((audience) => audience.status === "active");
  const live = active.filter((audience) => audience.mode !== "static");
  const savedMemberships = active.reduce(
    (total, audience) => total + audience.estimatedSize,
    0,
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return audiences;
    return audiences.filter((audience) =>
      [
        audience.name,
        audience.mode,
        audience.status,
        audience.projectionStatus,
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [audiences, query]);

  return (
    <div className="audience-overview">
      <section
        className="audience-overview__stats"
        aria-label="Audience totals"
      >
        <StatCard
          icon={<Target aria-hidden size={17} />}
          label="Total audiences"
          value={audiences.length}
        />
        <StatCard
          icon={<Layers3 aria-hidden size={17} />}
          label="Active audiences"
          value={active.length}
        />
        <StatCard
          icon={<UsersRound aria-hidden size={17} />}
          label="Saved audience memberships"
          value={savedMemberships.toLocaleString()}
        />
        <StatCard
          icon={<Filter aria-hidden size={17} />}
          label="Live rule audiences"
          value={live.length}
        />
      </section>

      {audiences.length ? (
        <section className="audience-overview__workspace">
          <div className="audience-overview__toolbar">
            <label>
              <Search aria-hidden size={18} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search audiences"
                type="search"
                value={query}
              />
            </label>
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "audience" : "audiences"}
            </span>
          </div>
          <div className="audience-overview__table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Audience</th>
                  <th scope="col">Definition</th>
                  <th scope="col">Size</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Status</th>
                  <th aria-label="Actions" scope="col" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((audience) => {
                  const share = candidateCount
                    ? Math.round(
                        (audience.estimatedSize / candidateCount) * 100,
                      )
                    : 0;
                  return (
                    <tr key={audience.id}>
                      <td data-label="Audience">
                        <Link href={`/audiences/${audience.id}`}>
                          <strong>{audience.name}</strong>
                          <span>
                            Revision {audience.revision} ·{" "}
                            {modeLabel(audience.mode)}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Definition">
                        <Badge>{modeLabel(audience.mode)}</Badge>
                        {audience.unavailableFactKeys.length > 0 && (
                          <small>
                            {audience.unavailableFactKeys.length} fact
                            {audience.unavailableFactKeys.length === 1
                              ? ""
                              : "s"}{" "}
                            pending
                          </small>
                        )}
                      </td>
                      <td data-label="Size">
                        <div className="audience-overview__size">
                          <AvatarStack
                            people={audience.members.map((member) => ({
                              name: member.displayName,
                              ...(member.avatarUrl
                                ? { src: member.avatarUrl }
                                : {}),
                            }))}
                            total={audience.estimatedSize}
                          />
                          <span>
                            <strong>
                              {audience.estimatedSize.toLocaleString()}
                            </strong>
                            <small>{share}% of eligible people</small>
                          </span>
                        </div>
                        <ProgressBar
                          label={`${audience.name} organization reach`}
                          value={share}
                        />
                      </td>
                      <td data-label="Updated">
                        <time dateTime={audience.updatedAt}>
                          {dateLabel(audience.updatedAt)}
                        </time>
                      </td>
                      <td data-label="Status">
                        <Badge
                          tone={
                            audience.status === "archived"
                              ? "neutral"
                              : audience.projectionStatus === "complete"
                                ? "positive"
                                : "warning"
                          }
                        >
                          {audience.status === "archived"
                            ? "Archived"
                            : audience.projectionStatus === "complete"
                              ? "Ready"
                              : "Partial"}
                        </Badge>
                      </td>
                      <td>
                        <Link
                          aria-label={`Open ${audience.name}`}
                          className="audience-overview__open"
                          href={`/audiences/${audience.id}`}
                        >
                          <ArrowUpRight aria-hidden size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="audience-overview__no-results">
                No audiences match “{query}”.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="audience-overview__table">
          <EmptyState
            action={
              <Link
                className={buttonClassName({ size: "large" })}
                href="/audiences/create"
              >
                <Plus aria-hidden size={18} /> Create your first audience
              </Link>
            }
            description="Start with a hand-picked roster or a live rule. Duna will show the projected size before anything is saved."
            icon={<UsersRound aria-hidden size={23} />}
            title="Build a reusable group of people"
          />
        </section>
      )}
    </div>
  );
}
