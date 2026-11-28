import type { MatchSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { Plus, ScanLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { DatePillFilter } from "@/components/date-pill-filter";
import { MatchCard } from "@/components/match-card";
import { MatchPerformanceAnalytics } from "@/components/match-performance-analytics";
import { getServerCaller } from "@/lib/api";
import {
  getMatchResult,
  getMatchTeammates,
  type MatchResult,
} from "@/lib/match-insights";
import {
  datePillDays,
  instantIsoDay,
  isoDay,
  parseIsoDay,
} from "@/lib/date-filter";

export const metadata = { title: "Matches" };

const MATCH_TIME_ZONE = "America/Los_Angeles";

interface MatchDayGroup {
  readonly key: string;
  readonly day: string;
  readonly weekday: string;
  readonly matches: readonly MatchSummary[];
}

interface MatchMonthGroup {
  readonly key: string;
  readonly label: string;
  readonly days: readonly MatchDayGroup[];
}

function datePart(value: string, type: "year" | "month" | "day") {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: MATCH_TIME_ZONE,
  })
    .formatToParts(new Date(value))
    .find((part) => part.type === type)?.value;
}

function formatMatchDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MATCH_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

function groupMatchHistory(matches: readonly MatchSummary[]) {
  const months = new Map<
    string,
    {
      label: string;
      days: Map<
        string,
        Omit<MatchDayGroup, "matches"> & { matches: MatchSummary[] }
      >;
    }
  >();

  for (const match of [...matches].sort(
    (left, right) =>
      new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime(),
  )) {
    const year = datePart(match.playedAt, "year") ?? "";
    const month = datePart(match.playedAt, "month") ?? "";
    const day = datePart(match.playedAt, "day") ?? "";
    const monthKey = `${year}-${month}`;
    const dayKey = `${monthKey}-${day}`;
    const monthGroup = months.get(monthKey) ?? {
      label: formatMatchDate(match.playedAt, {
        month: "long",
        year: "numeric",
      }),
      days: new Map(),
    };
    const dayGroup = monthGroup.days.get(dayKey) ?? {
      key: dayKey,
      day,
      weekday: formatMatchDate(match.playedAt, {
        weekday: "short",
      }),
      matches: [],
    };
    dayGroup.matches.push(match);
    monthGroup.days.set(dayKey, dayGroup);
    months.set(monthKey, monthGroup);
  }

  return [...months.entries()].map<MatchMonthGroup>(([key, group]) => ({
    key,
    label: group.label,
    days: [...group.days.values()],
  }));
}

export default async function MatchesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly date?: string }>;
}) {
  const caller = await getServerCaller();
  const [{ date }, dashboard, allMatches] = await Promise.all([
    searchParams,
    caller.player.dashboard(),
    caller.player.matches(),
  ]);
  const selectedDate = parseIsoDay(date);
  const matches = selectedDate
    ? allMatches.filter(
        (match) =>
          instantIsoDay(match.playedAt, MATCH_TIME_ZONE) === selectedDate,
      )
    : allMatches;
  const calendarAnchor =
    selectedDate ??
    (allMatches[0]
      ? instantIsoDay(allMatches[0].playedAt, MATCH_TIME_ZONE)
      : undefined) ??
    isoDay();
  const calendarDays = datePillDays(calendarAnchor);
  const viewerId = dashboard.player.id;
  const resultByMatch = new Map(
    matches.map(
      (match) => [match.id, getMatchResult(match, viewerId)] as const,
    ),
  );
  const form = matches
    .slice(0, 10)
    .map((match) => resultByMatch.get(match.id) ?? "unknown");
  const ratingMovement = matches
    .slice(0, 10)
    .reduce((total, match) => total + match.ratingDelta, 0);
  const verifiedResults = matches
    .map((match) => resultByMatch.get(match.id) ?? "unknown")
    .filter(
      (result): result is Exclude<MatchResult, "unknown"> =>
        result !== "unknown",
    );
  const wins = verifiedResults.filter((result) => result === "win").length;
  const losses = verifiedResults.length - wins;
  const winRate =
    verifiedResults.length === 0 ? 0 : (wins / verifiedResults.length) * 100;
  const partners = new Map<
    string,
    {
      displayName: string;
      initials: string;
      matches: number;
      wins: number;
      losses: number;
    }
  >();
  for (const match of matches) {
    const result = resultByMatch.get(match.id) ?? "unknown";
    for (const teammate of getMatchTeammates(match, viewerId)) {
      const current = partners.get(teammate.id) ?? {
        displayName: teammate.displayName,
        initials: teammate.initials,
        matches: 0,
        wins: 0,
        losses: 0,
      };
      current.matches += 1;
      if (result === "win") current.wins += 1;
      if (result === "loss") current.losses += 1;
      partners.set(teammate.id, current);
    }
  }
  const topPartner = [...partners.values()].sort(
    (a, b) => b.matches - a.matches || b.wins - a.wins,
  )[0];
  const matchHistory = groupMatchHistory(matches);
  return (
    <main className="standard-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">
            {matches.length} connected{" "}
            {matches.length === 1 ? "result" : "results"}
          </span>
          <h1>Your matches.</h1>
          <p>
            Every result, rating explanation, partner record, and point that
            moved you.
          </p>
        </div>
        <div className="player-welcome__actions">
          <button
            className="secondary-action"
            disabled
            title="Scoresheet OCR activates with the configured media and AI providers."
          >
            <ScanLine aria-hidden size={17} /> Scan scoresheet
          </button>
          <Link className="primary-action" href="/app/score">
            <Plus aria-hidden size={18} /> Record match
          </Link>
        </div>
      </section>

      <DatePillFilter
        allHref="/app/matches"
        dates={calendarDays}
        eyebrow="Quick date"
        hrefForDate={(nextDate) => `/app/matches?date=${nextDate}`}
        selectedDate={selectedDate}
        title="Match calendar"
      />

      <MatchPerformanceAnalytics
        confidence={dashboard.player.rating.confidence}
        currentRating={dashboard.player.rating.display}
        discipline={dashboard.player.rating.discipline}
        matches={matches}
        viewerId={viewerId}
      />

      <section
        className="match-quick-insights"
        aria-label="Recent match insights"
      >
        <article className="match-form-card">
          <div>
            <span className="page-eyebrow">Last 10</span>
            <h2>Form line</h2>
          </div>
          <div className="form-line">
            {form.map((result, index) => {
              const label =
                result === "win" ? "W" : result === "loss" ? "L" : "—";
              return (
                <span className={result} key={index}>
                  {label}
                </span>
              );
            })}
            {form.length === 0 && <span>—</span>}
          </div>
          <p>
            <TrendingUp aria-hidden size={17} />{" "}
            <strong>
              {ratingMovement > 0 ? "+" : ""}
              {ratingMovement.toFixed(2)}
            </strong>{" "}
            across your last {Math.min(matches.length, 10)} matches.
          </p>
          <div className="match-form-card__record">
            <span>
              <strong>{wins}</strong> wins
            </span>
            <span>
              <strong>{losses}</strong> losses
            </span>
            <span>
              <strong>{winRate.toFixed(0)}%</strong> win rate
            </span>
          </div>
        </article>
        <article className="partner-card">
          <span className="page-eyebrow">Partner chemistry</span>
          <div>
            <span className="avatar">{topPartner?.initials ?? "—"}</span>
            <span>
              <h2>{topPartner?.displayName ?? "No connected partner yet"}</h2>
              <p>
                {topPartner
                  ? `${topPartner.wins}–${topPartner.losses} together`
                  : "Partnership insights appear after a shared result."}
              </p>
            </span>
            <Numeric>{topPartner?.matches ?? "—"}</Numeric>
          </div>
          {topPartner && (
            <small>
              {topPartner.matches} shared{" "}
              {topPartner.matches === 1 ? "match" : "matches"}
            </small>
          )}
        </article>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">All disciplines</span>
            <h2>Match history</h2>
          </div>
          <Badge tone="neutral">{matches.length} connected results</Badge>
        </div>
        <div className="match-history-groups">
          {matchHistory.map((month) => (
            <section className="match-history-month" key={month.key}>
              <header className="match-history-month__header">
                <h3>{month.label}</h3>
                <span>
                  {month.days.reduce(
                    (total, day) => total + day.matches.length,
                    0,
                  )}{" "}
                  results
                </span>
              </header>
              <div className="match-history-month__days">
                {month.days.map((day) => (
                  <section className="match-history-day" key={day.key}>
                    <div className="match-history-day__marker" aria-hidden>
                      <span>{day.weekday}</span>
                      <strong>{day.day}</strong>
                      {day.matches.length > 1 && (
                        <small>{day.matches.length} matches</small>
                      )}
                    </div>
                    <div className="match-history-day__matches">
                      {day.matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          variant="timeline"
                          viewerId={viewerId}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
          {matches.length === 0 && (
            <article className="empty-state">
              <h3>No connected matches yet.</h3>
              <p>
                Record or confirm a result and its full rating explanation will
                appear here.
              </p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
