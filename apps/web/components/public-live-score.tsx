"use client";

import type { MatchScoringState } from "@duna/api";
import { Badge, DunaMark, Numeric } from "@duna/ui";
import { Radio, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { refreshLiveMatchAction } from "@/app/live/[matchId]/actions";

export function PublicLiveScore({
  initialMatch,
}: {
  readonly initialMatch: MatchScoringState;
}) {
  const [match, setMatch] = useState(initialMatch);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (match.status !== "live") return;
    const timer = window.setInterval(() => {
      void refreshLiveMatchAction(match.matchId).then((response) => {
        if (response.ok) {
          setMatch(response.match);
          setStale(false);
        } else {
          setStale(true);
        }
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [match.matchId, match.status]);
  const current = match.score.sets[match.score.setIndex] ?? { a: 0, b: 0 };
  return (
    <main className="public-live" data-zone="live">
      <header>
        <DunaMark />
        <Badge tone={match.status === "live" ? "live" : "positive"}>
          <Radio size={12} />{" "}
          {match.status === "live" ? "Live" : match.status.replace("-", " ")}
        </Badge>
        <button
          onClick={() => {
            void navigator.share?.({
              title: `${match.teamA.name} vs ${match.teamB.name}`,
              url: window.location.href,
            });
          }}
          type="button"
        >
          <Share2 size={17} /> Share
        </button>
      </header>
      <section>
        <div className="public-live__meta">
          <span>Connected Duna match</span>
          <strong>{match.venueName}</strong>
          <small>
            Set {match.score.setIndex + 1} ·{" "}
            {stale ? "reconnecting" : "server synchronized"}
          </small>
        </div>
        <div className="public-live__score">
          <article>
            <div>
              {match.teamA.people.map((person) => (
                <span className="avatar" key={person.id}>
                  {person.initials}
                </span>
              ))}
            </div>
            <h1>{match.teamA.name}</h1>
            <Numeric tier="score">{current.a}</Numeric>
            <Badge tone={match.score.serving === "A" ? "positive" : "neutral"}>
              {match.score.serving === "A" ? "Serving" : "Receiving"}
            </Badge>
          </article>
          <span>VS</span>
          <article>
            <div>
              {match.teamB.people.map((person) => (
                <span className="avatar" key={person.id}>
                  {person.initials}
                </span>
              ))}
            </div>
            <h1>{match.teamB.name}</h1>
            <Numeric tier="score">{current.b}</Numeric>
            <Badge tone={match.score.serving === "B" ? "positive" : "neutral"}>
              {match.score.serving === "B" ? "Serving" : "Receiving"}
            </Badge>
          </article>
        </div>
        <div className="public-live__sets">
          {match.score.sets.map((set, index) => (
            <span
              className={index === match.score.setIndex ? "active" : undefined}
              key={index}
            >
              <small>SET {index + 1}</small>
              <Numeric tier="table">
                {set.a}–{set.b}
              </Numeric>
            </span>
          ))}
        </div>
      </section>
      <footer>
        Live view updates automatically. The rating changes only after both
        sides confirm the result.
      </footer>
    </main>
  );
}
