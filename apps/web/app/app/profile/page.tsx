import { demoMatches, demoPeople, demoPlayer } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Check,
  MapPin,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { RatingOrbit } from "@/components/rating-orbit";

export const metadata = { title: "Mara Lewis" };

export default function ProfilePage() {
  return (
    <main className="standard-page profile-page">
      <section className="profile-hero">
        <div className="profile-hero__identity">
          <span className="profile-avatar">ML</span>
          <div>
            <div className="profile-hero__badges">
              <Badge tone="positive">Duna+</Badge>
              <Badge>Claimed profile</Badge>
            </div>
            <h1>{demoPlayer.displayName}</h1>
            <p>
              @{demoPlayer.handle} · <MapPin aria-hidden size={14} />{" "}
              {demoPlayer.homeMarket}
            </p>
          </div>
        </div>
        <button className="secondary-action">
          <Share2 aria-hidden size={17} /> Share profile
        </button>
        <div className="profile-hero__rating">
          <RatingOrbit
            confidence={demoPlayer.rating.confidence}
            delta={demoPlayer.rating.delta}
            value={demoPlayer.rating.display}
          />
        </div>
        <div className="profile-hero__summary">
          <article>
            <small>Current band</small>
            <strong>A</strong>
            <span>4.00–4.99</span>
          </article>
          <article>
            <small>South Bay</small>
            <Numeric>#42</Numeric>
            <span>Top 9%</span>
          </article>
          <article>
            <small>Career matches</small>
            <Numeric>84</Numeric>
            <span>68% verified live</span>
          </article>
          <article>
            <small>Win rate</small>
            <Numeric>61%</Numeric>
            <span>+7% last 90 days</span>
          </article>
        </div>
      </section>

      <section className="profile-grid">
        <article className="progression-card">
          <div className="panel-heading">
            <div>
              <span className="page-eyebrow">Last 12 months</span>
              <h2>Rating progression</h2>
            </div>
            <div className="segmented-control">
              <button className="active">1Y</button>
              <button>All</button>
            </div>
          </div>
          <div
            className="rating-chart"
            aria-label="Rating rose from 4.08 to 4.62"
          >
            <div className="rating-chart__grid">
              {[5, 4.5, 4, 3.5].map((value) => (
                <span key={value}>
                  <Numeric>{value.toFixed(1)}</Numeric>
                </span>
              ))}
            </div>
            <svg aria-hidden viewBox="0 0 800 240" preserveAspectRatio="none">
              <path
                className="rating-chart__area"
                d="M0 190 C70 175,100 184,150 160 S240 138,290 148 S380 100,430 115 S520 90,570 76 S660 55,720 64 S760 35,800 42 L800 240 L0 240 Z"
              />
              <path
                className="rating-chart__line"
                d="M0 190 C70 175,100 184,150 160 S240 138,290 148 S380 100,430 115 S520 90,570 76 S660 55,720 64 S760 35,800 42"
              />
              <circle cx="800" cy="42" r="7" />
            </svg>
            <div className="rating-chart__labels">
              <span>Aug</span>
              <span>Nov</span>
              <span>Feb</span>
              <span>May</span>
              <span>Jul</span>
            </div>
          </div>
        </article>

        <article className="chemistry-card">
          <span className="page-eyebrow">Partner chemistry</span>
          <h2>You make each other better.</h2>
          <div className="chemistry-card__partner">
            <span className="avatar">TP</span>
            <span>
              <strong>Theo Park</strong>
              <small>27 shared matches</small>
            </span>
            <Numeric>+0.14</Numeric>
          </div>
          <div className="chemistry-card__stats">
            <div>
              <small>Win rate</small>
              <Numeric>68%</Numeric>
            </div>
            <div>
              <small>Vs expected</small>
              <Numeric>+7.2%</Numeric>
            </div>
          </div>
          <Link href="/players/theopark">
            Open partnership card <ArrowRight aria-hidden size={15} />
          </Link>
        </article>
      </section>

      <section className="profile-achievements">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Earned on sand</span>
            <h2>Moments</h2>
          </div>
        </div>
        <div>
          <article>
            <span>
              <Trophy aria-hidden />
            </span>
            <strong>Summer Open winner</strong>
            <small>July 2026 · Hermosa Beach</small>
          </article>
          <article>
            <span>
              <Sparkles aria-hidden />
            </span>
            <strong>Reliable → Locked</strong>
            <small>Rating confidence milestone</small>
          </article>
          <article>
            <span>
              <Users aria-hidden />
            </span>
            <strong>Pickup regular</strong>
            <small>Hosted or joined 25 runs</small>
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
            {demoMatches.slice(0, 2).map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
        <div className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="page-eyebrow">Frequent opponents</span>
              <h2>Your circuit</h2>
            </div>
          </div>
          <div className="opponent-list">
            {demoPeople.slice(1, 4).map((person, index) => (
              <Link href={`/players/${person.handle}`} key={person.id}>
                <span className="avatar">{person.initials}</span>
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{12 - index * 2} matches</small>
                </span>
                <Numeric>{person.rating.display.toFixed(2)}</Numeric>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="duna-plus-panel">
        <div>
          <Badge tone="positive">Your Duna+</Badge>
          <h2>Depth without competitive advantage.</h2>
          <p>
            You get richer history, partner chemistry, insights, themes, and no
            platform fees. Your rating, eligibility, and network stay exactly as
            fair as everyone else’s.
          </p>
        </div>
        <ul>
          <li>
            <Check aria-hidden size={16} /> $18.72 saved in fees
          </li>
          <li>
            <Check aria-hidden size={16} /> 2 guest passes available
          </li>
          <li>
            <Check aria-hidden size={16} /> All-time history unlocked
          </li>
        </ul>
        <Link href="/app/settings">Manage Duna+</Link>
      </section>
    </main>
  );
}
