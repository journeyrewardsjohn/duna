import { demoMatches, demoPlayer } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, Plus, ScanLine, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";

export const metadata = { title: "Matches" };

export default function MatchesPage() {
  return (
    <main className="standard-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">84 verified results</span>
          <h1>Your matches.</h1>
          <p>
            Every result, rating explanation, partner record, and point that
            moved you.
          </p>
        </div>
        <div className="player-welcome__actions">
          <button className="secondary-action">
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
            {["W", "W", "L", "W", "W", "W", "L", "W", "W", "W"].map(
              (result, index) => (
                <span className={result === "W" ? "win" : "loss"} key={index}>
                  {result}
                </span>
              ),
            )}
          </div>
          <p>
            <TrendingUp aria-hidden size={17} /> <strong>+0.21</strong> across
            your last ten verified matches.
          </p>
        </article>
        <article className="partner-card">
          <span className="page-eyebrow">Best chemistry · 27 matches</span>
          <div>
            <span className="avatar">TP</span>
            <span>
              <h2>Theo Park</h2>
              <p>68% win rate · +0.14 partnership lift</p>
            </span>
            <Numeric>4.44</Numeric>
          </div>
          <Link href="/players/theopark">
            View partnership <ArrowRight aria-hidden size={15} />
          </Link>
        </article>
        <article className="match-rating-card">
          <Badge tone="positive">{demoPlayer.rating.confidence}</Badge>
          <span>Current Sand Rating</span>
          <Numeric>{demoPlayer.rating.display.toFixed(2)}</Numeric>
          <small>52-week peak 4.68</small>
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
          {[...demoMatches, ...demoMatches].map((match, index) => (
            <MatchCard key={`${match.id}-${index}`} match={match} />
          ))}
        </div>
      </section>
    </main>
  );
}
