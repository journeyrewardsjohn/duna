import { Badge, Numeric } from "@duna/ui";
import { Plus, ScanLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { RatingTrendChart } from "@/components/rating-trend-chart";
import { getServerCaller } from "@/lib/api";
import {
  getMatchResult,
  getMatchTeammates,
  type MatchResult,
} from "@/lib/match-insights";

export const metadata = { title: "Matches" };

export default async function MatchesPage() {
  const caller = await getServerCaller();
  const [dashboard, matches] = await Promise.all([
    caller.player.dashboard(),
    caller.player.matches(),
  ]);
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

      <section className="match-insight-grid">
        <article className="rating-trend-card">
          <header>
            <div>
              <span className="page-eyebrow">Sand Rating history</span>
              <h2>Your rating, match by match.</h2>
            </div>
            <Badge tone="neutral">By played date</Badge>
          </header>
          <RatingTrendChart matches={matches} />
        </article>
        <article className="match-rating-card">
          <Badge tone="positive">{dashboard.player.rating.confidence}</Badge>
          <span>Current Sand Rating</span>
          <Numeric>{dashboard.player.rating.display.toFixed(2)}</Numeric>
          <small>{dashboard.player.rating.discipline.replace("-", " ")}</small>
        </article>
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
        <div className="match-list match-list--page">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} viewerId={viewerId} />
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
