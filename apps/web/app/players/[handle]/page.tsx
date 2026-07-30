import { demoMatches, demoPeople } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import { MapPin, Share2, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchCard } from "@/components/match-card";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function PublicPlayerPage({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const player = demoPeople.find((person) => person.handle === handle);
  if (!player) notFound();
  return (
    <main className="public-detail">
      <SiteHeader />
      <section className="public-profile-hero">
        <div className="public-profile-hero__dune" />
        <div className="public-profile-hero__identity">
          <span className="profile-avatar">{player.initials}</span>
          <div>
            <Badge>Claimed profile</Badge>
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
            <small>Current band</small>
            <strong>A</strong>
            <span>Beach 2s</span>
          </article>
          <article>
            <small>Percentile</small>
            <Numeric>{player.rating.percentile ?? 86}%</Numeric>
            <span>South Bay</span>
          </article>
          <article>
            <small>Verified matches</small>
            <Numeric>46</Numeric>
            <span>All time</span>
          </article>
          <article>
            <small>Win rate</small>
            <Numeric>61%</Numeric>
            <span>Last 12 months</span>
          </article>
        </div>
        <div className="dashboard-two-column">
          <section className="dashboard-section">
            <div className="dashboard-section__heading">
              <div>
                <span className="page-eyebrow">Public history</span>
                <h2>Recent matches</h2>
              </div>
            </div>
            <div className="match-list">
              {demoMatches.slice(0, 2).map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
          <section className="public-method-note">
            <span className="page-eyebrow">Trust the number</span>
            <h2>Every movement has a reason.</h2>
            <p>
              Duna stores the expected result, actual result, responsibility,
              confidence, and verification weight at the moment a rating
              changes.
            </p>
            <a href="/methodology">Read the methodology</a>
          </section>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
