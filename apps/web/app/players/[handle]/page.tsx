import { Badge, Numeric } from "@duna/ui";
import {
  ExternalLink,
  Globe2,
  MapPin,
  Share2,
  TrendingUp,
  Trophy,
  UserPlus,
} from "lucide-react";
import { notFound } from "next/navigation";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export default async function PublicPlayerPage({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const caller = await getServerCaller();
  const [player, performance] = await Promise.all([
    caller.public.playerProfile({ handle }).catch(() => undefined),
    caller.public.playerPerformance({ handle }).catch(() => undefined),
  ]);
  if (!player) notFound();
  const wins =
    performance?.history.filter((event) => event.actualResult === 1).length ??
    0;
  const losses = (performance?.history.length ?? 0) - wins;
  return (
    <main className="public-detail">
      <SiteHeader />
      <section className="public-profile-hero">
        <div className="public-profile-hero__dune" />
        <div className="public-profile-hero__identity">
          <span
            className="profile-avatar"
            style={
              player.avatarUrl
                ? { backgroundImage: `url("${player.avatarUrl}")` }
                : undefined
            }
          >
            {player.avatarUrl ? null : player.initials}
          </span>
          <div>
            <div className="profile-badge-row">
              <Badge>
                {player.profileClaimStatus === "unclaimed"
                  ? "Unclaimed profile"
                  : "Claimed profile"}
              </Badge>
              {player.isProfessional && (
                <Badge tone="positive">
                  <Trophy aria-hidden size={12} /> Professional
                </Badge>
              )}
              {performance?.worldRanking && (
                <Badge tone="warning">
                  <Globe2 aria-hidden size={12} /> World #
                  {performance.worldRanking.rank}
                </Badge>
              )}
            </div>
            <h1>{player.displayName}</h1>
            <p>
              @{player.handle} · <MapPin aria-hidden size={14} />{" "}
              {player.homeMarket}
            </p>
          </div>
        </div>
        <div className="public-profile-hero__actions">
          <button>
            <UserPlus aria-hidden size={17} /> Follow
          </button>
          <button>
            <Share2 aria-hidden size={17} /> Share
          </button>
        </div>
        <RatingOrbit
          confidence={player.rating.confidence}
          delta={player.rating.delta}
          value={player.rating.display}
        />
      </section>
      <section className="public-profile-body">
        <div className="profile-summary-grid">
          <article>
            <small>Sand Rating</small>
            <Numeric>{player.rating.display.toFixed(2)}</Numeric>
            <span>{player.rating.discipline.replace("-", " ")}</span>
          </article>
          <article>
            <small>Confidence</small>
            <strong>{player.rating.confidence}</strong>
            <span>Verification-weighted</span>
          </article>
          <article>
            <small>Record</small>
            <strong>
              {wins}–{losses}
            </strong>
            <span>{performance?.history.length ?? 0} rated matches</span>
          </article>
          <article>
            <small>Profile state</small>
            <strong>
              {player.profileClaimStatus === "unclaimed"
                ? "Unclaimed"
                : "Claimed"}
            </strong>
            <span>{performance?.sources.length ?? 0} connected sources</span>
          </article>
        </div>
        {performance?.worldRanking && (
          <section className="pro-ranking-strip">
            <span>
              <Globe2 aria-hidden size={21} />
              <small>Volleyball World ranking</small>
              <strong>#{performance.worldRanking.rank}</strong>
            </span>
            <span>
              <small>Points</small>
              <Numeric>{performance.worldRanking.points.toFixed(0)}</Numeric>
            </span>
            <span>
              <small>Published</small>
              <strong>{performance.worldRanking.rankingDate}</strong>
            </span>
            <a href="/pro">
              Follow the pro tour <ExternalLink aria-hidden size={14} />
            </a>
          </section>
        )}
        <section className="profile-performance-grid">
          <div className="profile-rating-history">
            <header>
              <div>
                <span className="page-eyebrow">Rating history</span>
                <h2>Every move, explained.</h2>
              </div>
              <TrendingUp aria-hidden size={24} />
            </header>
            <div className="rating-history-track" aria-hidden>
              {(performance?.history ?? [])
                .slice()
                .reverse()
                .map((event) => (
                  <i
                    key={event.id}
                    style={{
                      height: `${Math.max(12, (event.afterDisplay / 8) * 100)}%`,
                    }}
                    title={event.afterDisplay.toFixed(2)}
                  />
                ))}
            </div>
            {(performance?.history.length ?? 0) === 0 && (
              <p className="profile-empty">
                This player has no approved rating events yet.
              </p>
            )}
          </div>
          <aside className="profile-source-card">
            <span className="page-eyebrow">Provenance</span>
            <h2>Connected records</h2>
            {(performance?.sources ?? []).map((source) => (
              <a
                href={source.profileUrl}
                key={source.id}
                rel="noreferrer"
                target="_blank"
              >
                <span>
                  <strong>{source.source}</strong>
                  <small>
                    {source.externalMatchCount
                      ? `${source.externalMatchCount} source matches`
                      : "Profile connected"}
                  </small>
                </span>
                <ExternalLink aria-hidden size={15} />
              </a>
            ))}
            {(performance?.sources.length ?? 0) === 0 && (
              <p>No external records are connected.</p>
            )}
          </aside>
        </section>
        <section className="public-match-history">
          <header>
            <div>
              <span className="page-eyebrow">Match history</span>
              <h2>Results behind the rating.</h2>
            </div>
            <Badge>{performance?.history.length ?? 0}</Badge>
          </header>
          <div>
            {(performance?.history ?? []).map((event) => {
              const side = event.participants.find(
                (participant) => participant.personId === player.id,
              )?.side;
              const team = (teamSide: "A" | "B") =>
                event.participants
                  .filter((participant) => participant.side === teamSide)
                  .map((participant) => participant.name)
                  .join(" / ");
              return (
                <article key={event.id}>
                  <span
                    className={
                      event.actualResult === 1
                        ? "match-result match-result--win"
                        : "match-result match-result--loss"
                    }
                  >
                    {event.actualResult === 1 ? "W" : "L"}
                  </span>
                  <div>
                    <small>{event.matchTitle}</small>
                    <strong>
                      {team(side ?? "A")} vs. {team(side === "B" ? "A" : "B")}
                    </strong>
                    <span>
                      {event.sets.map((set) => `${set.a}–${set.b}`).join(" · ")}
                    </span>
                  </div>
                  <div className="match-rating-result">
                    <small>
                      {(event.expectedWinProbability * 100).toFixed(0)}%
                      expected
                    </small>
                    <strong className={event.delta >= 0 ? "up" : "down"}>
                      {event.delta >= 0 ? "+" : ""}
                      {event.delta.toFixed(2)}
                    </strong>
                    <Numeric>{event.afterDisplay.toFixed(2)}</Numeric>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="public-method-note">
          <span className="page-eyebrow">Trust the number</span>
          <h2>Imported evidence is never silently accepted.</h2>
          <p>
            Duna stores source provenance, identity mapping, expected result,
            actual result, score margin, and verification weight for each
            approved movement.
          </p>
          <a href="/methodology">Read the methodology</a>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
