import { formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { ArrowLeft, Radio, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchConfirmation } from "@/components/match-confirmation";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Match result" };

export default async function MatchPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caller = await getServerCaller();
  const match = await caller.player
    .matchById({ matchId: id })
    .catch(() => undefined);
  if (!match) notFound();
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
          <Link href={`/live/${match.id}`}>
            <Radio aria-hidden size={16} /> Live view
          </Link>
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
              {match.ratingDelta > 0 ? "+" : ""}
              {match.ratingDelta.toFixed(2)}
            </strong>
            <small>Your Sand Rating movement</small>
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
      <MatchConfirmation
        confirmationRequired={Boolean(match.confirmationRequired)}
        matchId={match.id}
        status={match.status ?? "complete"}
      />
    </main>
  );
}
