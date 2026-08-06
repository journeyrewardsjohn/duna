import { formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { MatchConfirmation } from "@/components/match-confirmation";
import { MatchHistoryControls } from "@/components/match-history-controls";
import { PredictionMarketDetail } from "@/components/prediction-market";
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
  const [match, videos, predictionMarket, predictionWallet] = await Promise.all(
    [
      caller.player.matchById({ matchId: id }),
      caller.public.videos({ matchId: id }).catch(() => []),
      caller.public
        .matchPredictionMarket({ matchId: id })
        .catch(() => undefined),
      caller.player.predictionWallet().catch(() => undefined),
    ],
  );
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
        <h1>{match.eventName ?? match.venueName}</h1>
        <div className="match-detail__context">
          <span>
            <MapPin aria-hidden size={15} /> {match.venueName}
          </span>
          {match.roundLabel && <span>{match.roundLabel}</span>}
          {match.formatSummary && <span>{match.formatSummary}</span>}
          {match.eventSlug && (
            <Link href={`/events/${match.eventSlug}`}>Event details</Link>
          )}
          {match.sourceUrl && (
            <a href={match.sourceUrl} rel="noreferrer" target="_blank">
              Official source <ExternalLink aria-hidden size={13} />
            </a>
          )}
        </div>
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
                <Numeric key={`a-${index}`} tier="block">
                  {score}
                </Numeric>
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
                <Numeric key={`b-${index}`} tier="block">
                  {score}
                </Numeric>
              ))}
            </div>
          </article>
        </div>
      </section>
      {videos.length > 0 && (
        <DunaVideoGallery
          description="Choose between every public player angle for this match."
          title={
            videos.some((video) => video.status === "live")
              ? "Watch this match live."
              : "Match replays."
          }
          videos={videos}
        />
      )}
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
        {match.prediction && (
          <article
            className={
              match.prediction.outcome === "upset"
                ? "match-detail__prediction match-detail__prediction--upset"
                : "match-detail__prediction"
            }
          >
            <Sparkles aria-hidden size={21} />
            <span>
              <strong>
                {match.prediction.outcome === "upset"
                  ? "Upset"
                  : match.prediction.outcome === "predicted"
                    ? "Predicted result"
                    : "Even matchup"}
              </strong>
              <small>
                {match.prediction.teamA.toFixed(0)}% /{" "}
                {match.prediction.teamB.toFixed(0)}% pre-match
              </small>
            </span>
          </article>
        )}
      </section>
      {predictionMarket && (
        <PredictionMarketDetail
          market={predictionMarket}
          returnTo={`/app/matches/${id}`}
          target={{ kind: "match", matchId: id }}
          wallet={predictionWallet}
        />
      )}
      <section className="match-detail__players">
        {(
          [
            ["A", match.teamA],
            ["B", match.teamB],
          ] as const
        ).map(([side, players]) => (
          <article key={side}>
            <header>
              <span>Team {side}</span>
              {match.winner === side && <Badge tone="positive">Winner</Badge>}
            </header>
            {players.map((player) => (
              <div key={player.id}>
                <span className="avatar">{player.initials}</span>
                <span>
                  <strong>{player.displayName}</strong>
                  <small>
                    @{player.handle} · {player.homeMarket}
                  </small>
                </span>
                <Numeric tier="table">
                  {player.rating.display.toFixed(2)}
                </Numeric>
              </div>
            ))}
          </article>
        ))}
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
