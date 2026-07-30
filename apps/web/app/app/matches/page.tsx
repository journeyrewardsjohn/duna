import { Badge, Numeric } from "@duna/ui";
import { Plus, ScanLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Matches" };

export default async function MatchesPage() {
  const caller = await getServerCaller();
  const [dashboard, matches] = await Promise.all([
    caller.player.dashboard(),
    caller.player.matches(),
  ]);
  const form = matches.slice(0, 10).map((match) => {
    const playerOnA = match.teamA.some(
      (person) => person.id === dashboard.player.id,
    );
    return (playerOnA && match.winner === "A") ||
      (!playerOnA && match.winner === "B")
      ? "W"
      : "L";
  });
  const ratingMovement = matches
    .slice(0, 10)
    .reduce((total, match) => total + match.ratingDelta, 0);
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
        <article className="match-form-card">
          <div>
            <span className="page-eyebrow">Last 10</span>
            <h2>Form line</h2>
          </div>
          <div className="form-line">
            {form.map((result, index) => (
              <span className={result === "W" ? "win" : "loss"} key={index}>
                {result}
              </span>
            ))}
            {form.length === 0 && <span>—</span>}
          </div>
          <p>
            <TrendingUp aria-hidden size={17} />{" "}
            <strong>
              {ratingMovement > 0 ? "+" : ""}
              {ratingMovement.toFixed(2)}
            </strong>{" "}
            across your connected match history.
          </p>
        </article>
        <article className="partner-card">
          <span className="page-eyebrow">Partner chemistry</span>
          <div>
            <span className="avatar">—</span>
            <span>
              <h2>Awaiting connected matches</h2>
              <p>Partnership insights appear after verified shared results.</p>
            </span>
            <Numeric>—</Numeric>
          </div>
        </article>
        <article className="match-rating-card">
          <Badge tone="positive">{dashboard.player.rating.confidence}</Badge>
          <span>Current Sand Rating</span>
          <Numeric>{dashboard.player.rating.display.toFixed(2)}</Numeric>
          <small>{dashboard.player.rating.discipline.replace("-", " ")}</small>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">All disciplines</span>
            <h2>Match history</h2>
          </div>
          <div className="segmented-control">
            <button className="active">Beach 2s</button>
            <button>4s</button>
            <button>All</button>
          </div>
        </div>
        <div className="match-list match-list--page">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
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
