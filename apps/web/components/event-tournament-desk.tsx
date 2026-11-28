"use client";

import type { TournamentCompetitionSnapshot } from "@duna/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CompetitionDivision = TournamentCompetitionSnapshot["divisions"][number];
type CompetitionRound = CompetitionDivision["rounds"][number];

function scoreLabel(
  score: CompetitionDivision["matches"][number]["score"],
): string | undefined {
  if (!score?.sets.length) return undefined;
  return score.sets.map(([left, right]) => `${left}–${right}`).join(" · ");
}

function roundLabel(round: CompetitionRound): string {
  return round.label.includes(" · round ")
    ? round.label.replace(" · round ", " R")
    : round.label;
}

function CompetitionMatchCard({
  match,
}: {
  readonly match: CompetitionDivision["matches"][number];
}) {
  const complete = Boolean(match.completedAt || match.winnerTeamId);
  const live = match.status === "live" || match.score?.status === "live";
  const score = scoreLabel(match.score);
  return (
    <article
      className={`tournament-desk__match ${
        complete ? "tournament-desk__match--complete" : ""
      } ${live ? "tournament-desk__match--live" : ""}`}
    >
      <span className="tournament-desk__match-status">
        {live ? "Live" : complete ? "Final" : (match.courtName ?? "Upcoming")}
      </span>
      {match.heat ? (
        <div className="tournament-desk__heat">
          {match.heat.participants.length ? (
            match.heat.participants.map((participant) => (
              <div
                className={
                  participant.advances
                    ? "tournament-desk__team tournament-desk__team--winner"
                    : "tournament-desk__team"
                }
                key={participant.team.id}
              >
                <span className="tournament-desk__seed">
                  {participant.rank}
                </span>
                <strong>{participant.team.name}</strong>
                <b>{participant.points}</b>
              </div>
            ))
          ) : (
            <p>Qualifiers appear when the prior round closes.</p>
          )}
        </div>
      ) : (
        <>
          <div
            className={
              match.winnerTeamId === match.teamA?.id
                ? "tournament-desk__team tournament-desk__team--winner"
                : "tournament-desk__team"
            }
          >
            <span className="tournament-desk__seed">
              {match.teamA?.seed ?? "–"}
            </span>
            <strong>{match.teamA?.name ?? "To be decided"}</strong>
          </div>
          <div
            className={
              match.winnerTeamId === match.teamB?.id
                ? "tournament-desk__team tournament-desk__team--winner"
                : "tournament-desk__team"
            }
          >
            <span className="tournament-desk__seed">
              {match.teamB?.seed ?? "–"}
            </span>
            <strong>{match.teamB?.name ?? "To be decided"}</strong>
          </div>
        </>
      )}
      <footer>
        <span>
          {match.heat
            ? `${match.heat.durationMinutes} minutes · top ${match.heat.advanceCount} advance`
            : (score ?? (match.scheduledAt ? "Scheduled" : "Awaiting court"))}
        </span>
        {match.courtName && <span>{match.courtName}</span>}
      </footer>
    </article>
  );
}

export function EventTournamentDesk({
  snapshot,
}: {
  readonly snapshot: TournamentCompetitionSnapshot;
}) {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState(snapshot.divisions[0]?.id);
  const division =
    snapshot.divisions.find((candidate) => candidate.id === divisionId) ??
    snapshot.divisions[0];
  const competitionRounds = useMemo(
    () =>
      division?.format.startsWith("kob-")
        ? division.rounds
        : (division?.rounds.filter((round) => round.bracket !== "pool") ?? []),
    [division],
  );
  const [roundKey, setRoundKey] = useState(competitionRounds[0]?.key);
  const activeRoundKey = competitionRounds.some(
    (round) => round.key === roundKey,
  )
    ? roundKey
    : competitionRounds[0]?.key;
  const hasLiveDivision = snapshot.divisions.some((candidate) =>
    Boolean(candidate.liveAt),
  );
  useEffect(() => {
    if (!hasLiveDivision) return;
    const refresh = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(refresh);
  }, [hasLiveDivision, router]);
  if (!division) return null;
  return (
    <section className="event-public__section tournament-desk" id="tournament">
      <header>
        <div>
          <span className="section__eyebrow">
            {division.liveAt ? "Live tournament desk" : "Tournament desk"}
          </span>
          <h2>
            {division.liveAt
              ? "Follow every point forward."
              : "The field is set."}
          </h2>
          <p>
            Pools, results, courts, and the live path through this division.
          </p>
        </div>
        <span
          className={
            division.liveAt
              ? "tournament-desk__live"
              : "tournament-desk__version"
          }
        >
          {division.liveAt ? "Live" : `Draw v${division.competitionVersion}`}
        </span>
      </header>

      {snapshot.divisions.length > 1 && (
        <div
          aria-label="Tournament divisions"
          className="tournament-desk__division-tabs"
          role="tablist"
        >
          {snapshot.divisions.map((candidate) => (
            <button
              aria-selected={candidate.id === division.id}
              key={candidate.id}
              onClick={() => {
                setDivisionId(candidate.id);
                setRoundKey(
                  candidate.format.startsWith("kob-")
                    ? candidate.rounds[0]?.key
                    : candidate.rounds.find((round) => round.bracket !== "pool")
                        ?.key,
                );
              }}
              role="tab"
              type="button"
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}

      {division.pools.length > 0 && (
        <div className="tournament-desk__pools">
          {division.pools.map((pool) => (
            <article className="tournament-desk__pool" key={pool.key}>
              <header>
                <strong>Pool {pool.key}</strong>
                <span>
                  {pool.completedMatches}/{pool.matchCount} played
                </span>
              </header>
              <ol>
                {pool.standings.map((standing, index) => (
                  <li key={standing.team.id}>
                    <span>{index + 1}</span>
                    <strong>{standing.team.name}</strong>
                    <small>
                      {standing.wins}–{standing.losses}
                    </small>
                  </li>
                ))}
              </ol>
              <p>Live table. Final tiebreaks are confirmed by the director.</p>
            </article>
          ))}
        </div>
      )}

      {division.kobStandings?.length ? (
        <article className="tournament-desk__kob-board">
          <header>
            <span>
              <small>Individual points</small>
              <strong>{division.kobStandings.at(-1)!.name}</strong>
            </span>
            <b>{division.kobStandings.at(-1)!.complete ? "Final" : "Live"}</b>
          </header>
          <ol>
            {division.kobStandings.at(-1)!.players.map((player) => (
              <li key={player.personId}>
                <span>{player.rank}</span>
                <strong>{player.name}</strong>
                <small>{player.wins} wins</small>
                <b>{player.points}</b>
              </li>
            ))}
          </ol>
          <p>
            Rally points stay with the athlete as partners rotate. The advance
            line follows the saved round blueprint.
          </p>
        </article>
      ) : null}

      {competitionRounds.length > 0 ? (
        <>
          <div
            aria-label="Bracket rounds"
            className="tournament-desk__round-tabs"
            role="tablist"
          >
            {competitionRounds.map((round) => (
              <button
                aria-selected={round.key === activeRoundKey}
                key={round.key}
                onClick={() => setRoundKey(round.key)}
                role="tab"
                type="button"
              >
                {roundLabel(round)}
              </button>
            ))}
          </div>
          <div
            className="tournament-desk__bracket"
            role="region"
            aria-label={`${division.name} bracket`}
          >
            {competitionRounds.map((round) => (
              <section
                data-active={round.key === activeRoundKey}
                className="tournament-desk__round"
                key={round.key}
              >
                <h3>{roundLabel(round)}</h3>
                <div>
                  {round.matches.map((match) => (
                    <CompetitionMatchCard key={match.id} match={match} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="tournament-desk__empty">
          The draw will appear here as soon as the director creates it.
        </div>
      )}
    </section>
  );
}
