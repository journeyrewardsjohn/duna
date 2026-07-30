import { Badge, Numeric } from "@duna/ui";
import { MapPin, Share2, UserPlus } from "lucide-react";
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
  const player = await caller.public
    .playerProfile({ handle })
    .catch(() => undefined);
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
            <small>Market</small>
            <strong>{player.homeMarket.split(",")[0]}</strong>
            <span>Public profile</span>
          </article>
          <article>
            <small>Profile state</small>
            <strong>Claimed</strong>
            <span>One Duna identity</span>
          </article>
        </div>
        <div className="dashboard-two-column">
          <section className="public-method-note">
            <span className="page-eyebrow">Privacy by design</span>
            <h2>Match details stay with the player.</h2>
            <p>
              This public profile shows the portable rating and identity details
              the player has chosen to share. Connected match history remains
              private unless the player publishes it.
            </p>
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
