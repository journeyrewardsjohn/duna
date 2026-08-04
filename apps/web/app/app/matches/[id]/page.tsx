import { formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { ArrowLeft, Radio, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MatchConfirmation } from "@/components/match-confirmation";
import { MatchHistoryControls } from "@/components/match-history-controls";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Match result" };

function percentage(value: number | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : undefined;
}

function ratingExplanation(match: {
  readonly ratingDelta: number;
  readonly ratingImpact?: "sand-rating" | "history-only";
  readonly ratingExplanation?: {
    readonly expectedWinProbability?: number;
    readonly actualResult?: number;
    readonly pointShare?: number;
    readonly responsibilityWeight?: number;
  };
}) {
  if (match.ratingImpact === "history-only") {
    return {
      title: "Saved to history, not used for rating.",
      body: "This result remains part of your match record but does not affect your Sand Rating.",
    };
  }
  const evidence = match.ratingExplanation;
  if (!evidence) {
    return {
      title:
        match.ratingDelta > 0
          ? "This performance beat the model’s expectation."
          : match.ratingDelta < 0
            ? "This performance landed below the model’s expectation."
            : "This result matched the model’s expectation.",
      body: "Opponent strength, partner strength, score margin, recency, and rating confidence are evaluated together.",
    };
  }
  const expected = percentage(evidence.expectedWinProbability);
  const actual = percentage(evidence.actualResult);
  const pointShare = percentage(evidence.pointShare);
  const responsibility = percentage(evidence.responsibilityWeight);
  const betterThanExpected =
    typeof evidence.expectedWinProbability === "number" &&
    typeof evidence.actualResult === "number" &&
    evidence.actualResult >= evidence.expectedWinProbability;
  const details = [
    expected ? `Your team entered with a ${expected} expected win chance.` : "",
    pointShare ? `You won ${pointShare} of the points scored.` : "",
    actual
      ? `Set results and score margin produced a ${actual} performance result.`
      : "",
    responsibility
      ? `Your individual responsibility weight was ${responsibility}; partner strength is already included in the team expectation.`
      : "Partner strength is included in the team expectation.",
  ].filter(Boolean);
  return {
    title: betterThanExpected
      ? "You performed above the pre-match expectation."
      : "You performed below the pre-match expectation.",
    body: details.join(" "),
  };
}

export default async function MatchPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getServerCaller();
  const match = await caller.player.matchById({ matchId: id });
  const explanation = ratingExplanation(match);
  return (
    <main className="standard-page match-detail">
      <header className="match-detail__header">
        <Link href="/app/matches">
          <ArrowLeft aria-hidden size={18} /> Matches
        </Link>
        <div>
          <Badge
            tone={
              match.status === "verified"
                ? "positive"
                : match.status === "disputed"
                  ? "warning"
                  : "neutral"
            }
          >
            {match.status?.replace("-", " ") ?? match.verification}
          </Badge>
          {match.recordingMode === "live" && (
            <Link href={`/live/${match.id}`}>
              <Radio aria-hidden size={16} /> Live view
            </Link>
          )}
        </div>
      </header>
      <section className="match-detail__hero">
        <span className="page-eyebrow">
          {formatVenueTime(match.playedAt, "America/Los_Angeles", "en-US", {
            dateStyle: "full",
          })}
        </span>
        <h1>{match.venueName}</h1>
        <div className="match-detail__score">
          <article className={match.winner === "A" ? "winner" : undefined}>
            <div>
              {match.teamA.map((player) => (
                <span className="avatar" key={player.id}>
                  {player.initials}
                </span>
              ))}
            </div>
            <h2>
              {match.teamA.map((player) => player.displayName).join(" / ")}
            </h2>
            <div>
              {match.score.map(([score], index) => (
                <Numeric key={`a-${index}`}>{score}</Numeric>
              ))}
            </div>
          </article>
          <span>VS</span>
          <article className={match.winner === "B" ? "winner" : undefined}>
            <div>
              {match.teamB.map((player) => (
                <span className="avatar" key={player.id}>
                  {player.initials}
                </span>
              ))}
            </div>
            <h2>
              {match.teamB.map((player) => player.displayName).join(" / ")}
            </h2>
            <div>
              {match.score.map(([, score], index) => (
                <Numeric key={`b-${index}`}>{score}</Numeric>
              ))}
            </div>
          </article>
        </div>
      </section>
      <section className="match-detail__insight">
        <article>
          <TrendingUp aria-hidden size={21} />
          <span>
            <strong>
              {match.ratingImpact === "history-only"
                ? "History only"
                : `${match.ratingDelta > 0 ? "+" : ""}${match.ratingDelta.toFixed(2)}`}
            </strong>
            <small>
              {match.ratingImpact === "history-only"
                ? "No Sand Rating movement"
                : typeof match.ratingBefore === "number" &&
                    typeof match.ratingAfter === "number"
                  ? `${match.ratingBefore.toFixed(2)} → ${match.ratingAfter.toFixed(2)}`
                  : "Your Sand Rating movement"}
            </small>
          </span>
        </article>
        <article>
          <ShieldCheck aria-hidden size={21} />
          <span>
            <strong>{match.verification.replace("-", " ")}</strong>
            <small>Verification basis</small>
          </span>
        </article>
      </section>
      <section className="match-detail__rating-story">
        <div>
          <span className="page-eyebrow">Why your rating moved</span>
          <h2>{explanation.title}</h2>
          <p>{explanation.body}</p>
        </div>
        <dl>
          <div>
            <dt>Pre-match chance</dt>
            <dd>
              {percentage(match.ratingExplanation?.expectedWinProbability) ??
                "Not available"}
            </dd>
          </div>
          <div>
            <dt>Point share</dt>
            <dd>
              {percentage(match.ratingExplanation?.pointShare) ??
                "Not available"}
            </dd>
          </div>
          <div>
            <dt>Your weighting</dt>
            <dd>
              {percentage(match.ratingExplanation?.responsibilityWeight) ??
                "Not available"}
            </dd>
          </div>
        </dl>
      </section>
      <MatchConfirmation
        confirmationRequired={Boolean(match.confirmationRequired)}
        matchId={match.id}
        ratingImpact={match.ratingImpact ?? "sand-rating"}
        status={match.status ?? "complete"}
      />
      <MatchHistoryControls match={match} />
    </main>
  );
}
