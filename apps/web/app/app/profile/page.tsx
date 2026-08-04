import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, Check, MapPin, Settings, Share2 } from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { RatingOrbit } from "@/components/rating-orbit";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const caller = await getServerCaller();
  const [dashboard, matches, people] = await Promise.all([
    caller.player.dashboard(),
    caller.player.matches(),
    caller.public.players({ limit: 4 }),
  ]);
  const player = dashboard.player;
  return (
    <main className="standard-page profile-page">
      <section className="profile-hero">
        <div className="profile-hero__identity">
          <span className="profile-avatar">{player.initials}</span>
          <div>
            <div className="profile-hero__badges">
              <Badge>Claimed profile</Badge>
            </div>
            <h1>{player.displayName}</h1>
            <p>
              @{player.handle} · <MapPin aria-hidden size={14} />{" "}
              {player.homeMarket}
            </p>
          </div>
        </div>
        <div className="profile-hero__actions">
          <Link className="primary-action" href="/app/settings#profile">
            <Settings aria-hidden size={17} /> Edit profile
          </Link>
          <button className="secondary-action">
            <Share2 aria-hidden size={17} /> Share profile
          </button>
        </div>
        <div className="profile-hero__rating">
          <RatingOrbit
            confidence={player.rating.confidence}
            delta={player.rating.delta}
            value={player.rating.display}
          />
        </div>
        <div className="profile-hero__summary">
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
            <small>Connected matches</small>
            <Numeric>{matches.length}</Numeric>
            <span>Available in this account</span>
          </article>
          <article>
            <small>Home market</small>
            <strong>{player.homeMarket.split(",")[0]}</strong>
            <span>Travel mode ready</span>
          </article>
        </div>
      </section>

      <section className="profile-grid">
        <article className="progression-card">
          <div className="panel-heading">
            <div>
              <span className="page-eyebrow">Connected history</span>
              <h2>Rating progression</h2>
            </div>
            <div className="segmented-control">
              <button className="active">1Y</button>
              <button>All</button>
            </div>
          </div>
          <div className="rating-chart empty-state">
            <h3>Progression is waiting for rating events.</h3>
            <p>
              The chart will render from immutable rating movements once
              connected match history is available.
            </p>
          </div>
        </article>

        <article className="chemistry-card">
          <span className="page-eyebrow">Partner chemistry</span>
          <h2>You make each other better.</h2>
          <div className="chemistry-card__partner">
            <span className="avatar">—</span>
            <span>
              <strong>No computed partner yet</strong>
              <small>Verified shared matches are required</small>
            </span>
            <Numeric>—</Numeric>
          </div>
          <div className="chemistry-card__stats">
            <div>
              <small>Win rate</small>
              <Numeric>—</Numeric>
            </div>
            <div>
              <small>Vs expected</small>
              <Numeric>—</Numeric>
            </div>
          </div>
          <Link href="/app/matches">
            Open match history <ArrowRight aria-hidden size={15} />
          </Link>
        </article>
      </section>

      <section className="profile-achievements">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Account state</span>
            <h2>Portable identity</h2>
          </div>
        </div>
        <div>
          <article>
            <strong>One player record</strong>
            <small>Across every connected organization</small>
          </article>
          <article>
            <strong>{player.rating.confidence} confidence</strong>
            <small>Derived from verified rating inputs</small>
          </article>
          <article>
            <strong>Privacy controlled</strong>
            <small>Public fields stay separate from private history</small>
          </article>
        </div>
      </section>

      <section className="dashboard-two-column">
        <div className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="page-eyebrow">Latest</span>
              <h2>Recent matches</h2>
            </div>
          </div>
          <div className="match-list">
            {matches.slice(0, 2).map((match) => (
              <MatchCard key={match.id} match={match} viewerId={player.id} />
            ))}
            {matches.length === 0 && (
              <article className="empty-state">
                <p>No connected match history yet.</p>
              </article>
            )}
          </div>
        </div>
        <div className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="page-eyebrow">Public community</span>
              <h2>Players to explore</h2>
            </div>
          </div>
          <div className="opponent-list">
            {people
              .filter((person) => person.id !== player.id)
              .slice(0, 3)
              .map((person) => (
                <Link href={`/players/${person.handle}`} key={person.id}>
                  <span className="avatar">{person.initials}</span>
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>{person.homeMarket}</small>
                  </span>
                  <Numeric>{person.rating.display.toFixed(2)}</Numeric>
                </Link>
              ))}
          </div>
        </div>
      </section>

      <section className="duna-plus-panel">
        <div>
          <Badge>Duna+ preview</Badge>
          <h2>Depth without competitive advantage.</h2>
          <p>
            You get richer history, partner chemistry, insights, themes, and no
            platform fees. Your rating, eligibility, and network stay exactly as
            fair as everyone else’s.
          </p>
        </div>
        <ul>
          <li>
            <Check aria-hidden size={16} /> Capped booking fees can be waived
          </li>
          <li>
            <Check aria-hidden size={16} /> Deeper private history and insights
          </li>
          <li>
            <Check aria-hidden size={16} /> No rating or eligibility advantage
          </li>
        </ul>
        <Link href="/app/settings">Manage Duna+</Link>
      </section>
    </main>
  );
}
