import { demoEvents, demoPeople } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  MapPin,
  Radio,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <main className="marketing">
      <SiteHeader />

      <section className="hero">
        <div className="hero__noise" />
        <div className="hero__glow" />
        <div className="hero__content">
          <Badge tone="live">
            <Radio aria-hidden size={12} /> 14 courts live near you
          </Badge>
          <h1>
            Your game.
            <br />
            <span>All of it.</span>
          </h1>
          <p>
            Know your level. Find your people. Book the court, enter the draw,
            keep score, and carry every match with you.
          </p>
          <div className="hero__actions">
            <Link className="hero__primary" href="/app">
              Find your game <ArrowRight aria-hidden size={18} />
            </Link>
            <Link className="hero__secondary" href="/app/profile">
              See your Sand Rating
            </Link>
          </div>
          <div className="hero__proof">
            <div>
              <Numeric>24,892</Numeric>
              <span>rated players</span>
            </div>
            <div>
              <Numeric>1.2M</Numeric>
              <span>rallies recorded</span>
            </div>
            <div>
              <Numeric>92 sec</Numeric>
              <span>fastest purse payout</span>
            </div>
          </div>
        </div>

        <div className="hero__visual" aria-label="Live beach volleyball court">
          <div className="hero-court">
            <div className="hero-court__horizon" />
            <div className="hero-court__sun" />
            <div className="hero-court__sand">
              <div className="hero-court__line hero-court__line--left" />
              <div className="hero-court__line hero-court__line--right" />
              <div className="hero-court__line hero-court__line--back" />
              <div className="hero-court__net" />
              <span className="hero-court__player hero-court__player--one" />
              <span className="hero-court__player hero-court__player--two" />
              <span className="hero-court__player hero-court__player--three" />
              <span className="hero-court__ball" />
            </div>
          </div>
          <div className="hero-live-card">
            <div>
              <Badge tone="live">Live</Badge>
              <span>Court 4 · Set 3</span>
            </div>
            <div className="hero-live-card__score">
              <span>Mara / Theo</span>
              <Numeric>13</Numeric>
              <span>Noa / Elena</span>
              <Numeric>11</Numeric>
            </div>
            <small>Next side switch at 15</small>
          </div>
          <div className="hero-rating-card">
            <RatingOrbit
              compact
              confidence="Locked"
              delta={0.08}
              value={4.62}
            />
            <div>
              <span>Moved after the win</span>
              <strong className="duna-numeric">+0.08</strong>
              <small>Expected 44% · verified live</small>
            </div>
          </div>
        </div>
      </section>

      <section className="market-ribbon">
        <div>
          <MapPin aria-hidden size={16} />
          <span>South Bay is live</span>
        </div>
        <p>
          <Numeric>526</Numeric> players · <Numeric>7</Numeric> recurring runs ·
          consumer network unlocked
        </p>
        <Link href="/app/discover">Explore South Bay</Link>
      </section>

      <section className="section section--events">
        <div className="section__heading">
          <div>
            <span className="section__eyebrow">Happening on sand</span>
            <h2>Your next game is closer than you think.</h2>
          </div>
          <Link href="/app/discover">
            Explore everything <ArrowRight aria-hidden size={16} />
          </Link>
        </div>
        <div className="event-grid">
          {demoEvents.slice(0, 4).map((event, index) => (
            <EventCard event={event} featured={index === 0} key={event.id} />
          ))}
        </div>
      </section>

      <section className="section rating-story">
        <div className="rating-story__copy">
          <span className="section__eyebrow">
            One number. A lifetime of play.
          </span>
          <h2>
            A rating that knows the difference between winning and playing well.
          </h2>
          <p>
            Duna reads the whole match—who you played, who stood beside you,
            every point, and how the result was verified. Then it shows exactly
            why you moved.
          </p>
          <ul>
            <li>
              <Check aria-hidden size={17} />
              Rally-aware, doubles-native math
            </li>
            <li>
              <Check aria-hidden size={17} />
              Built from verified results, never vanity inputs
            </li>
            <li>
              <Check aria-hidden size={17} />
              Your identity and history travel with you
            </li>
          </ul>
          <Link href="/methodology">
            How the Sand Rating works <ArrowRight aria-hidden size={16} />
          </Link>
        </div>
        <div className="rating-story__visual">
          <div className="rating-story__orbit">
            <RatingOrbit confidence="Locked" delta={0.08} value={4.62} />
          </div>
          <div className="rating-story__ladder">
            {demoPeople.slice(0, 4).map((person, index) => (
              <div key={person.id}>
                <Numeric>{String(index + 1).padStart(2, "0")}</Numeric>
                <span className="avatar">{person.initials}</span>
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{person.homeMarket.split(",")[0]}</small>
                </span>
                <Numeric>{person.rating.display.toFixed(2)}</Numeric>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section moments">
        <div className="section__heading">
          <div>
            <span className="section__eyebrow">The whole loop</span>
            <h2>From “who’s playing?” to paid before you leave.</h2>
          </div>
        </div>
        <div className="moments__grid">
          <article>
            <span className="moments__icon">
              <Users aria-hidden />
            </span>
            <p>01</p>
            <h3>Find the right run</h3>
            <span>
              Pickup, coaching, open play, leagues, and tournaments—all filtered
              to your level and your city.
            </span>
          </article>
          <article>
            <span className="moments__icon">
              <Trophy aria-hidden />
            </span>
            <p>02</p>
            <h3>Make every point count</h3>
            <span>
              Score live or record in seconds. Offline courts sync honestly when
              service returns.
            </span>
          </article>
          <article>
            <span className="moments__icon">
              <Sparkles aria-hidden />
            </span>
            <p>03</p>
            <h3>Keep the moment</h3>
            <span>
              Rating movement, match story, and a recap card made to share
              before the sand is out of your shoes.
            </span>
          </article>
          <article>
            <span className="moments__icon">
              <CircleDollarSign aria-hidden />
            </span>
            <p>04</p>
            <h3>Get paid at the beach</h3>
            <span>
              Purses land in Duna Wallet the moment the bracket closes. No
              checks. No chase.
            </span>
          </article>
        </div>
      </section>

      <section className="operator-callout">
        <div className="operator-callout__visual">
          <div className="operator-callout__topbar">
            <span>DUNA HQ</span>
            <Badge tone="positive">All systems synced</Badge>
          </div>
          <div className="operator-callout__metrics">
            <div>
              <small>Today’s revenue</small>
              <Numeric>$8,420</Numeric>
              <span>+18%</span>
            </div>
            <div>
              <small>Court utilization</small>
              <Numeric>82%</Numeric>
              <span>+6%</span>
            </div>
            <div>
              <small>Check-ins</small>
              <Numeric>146/168</Numeric>
              <span>87%</span>
            </div>
          </div>
          <div className="operator-callout__schedule">
            <span>1:00</span>
            <strong>Sunset Open — Qualifier</strong>
            <small>Courts 1–6 · 32 teams · $1,500 purse</small>
            <Badge tone="live">Live soon</Badge>
          </div>
        </div>
        <div className="operator-callout__copy">
          <Badge>For clubs, coaches + facilities</Badge>
          <h2>Run the whole beach from one place.</h2>
          <p>
            Scheduling, memberships, payments, Tap to Pay, leagues, ticketing,
            staff, messaging, reporting, and the player network that fills it
            all.
          </p>
          <p className="operator-callout__promise">
            Coaches start free. Clubs pay simple software plus the processing
            rate they already expect.
          </p>
          <a href={process.env.NEXT_PUBLIC_HQ_URL ?? "http://localhost:3001"}>
            Explore Duna for operators <ArrowRight aria-hidden size={17} />
          </a>
        </div>
      </section>

      <section className="final-cta">
        <div className="final-cta__sun" />
        <Badge tone="live">South Bay · Chicago · New York</Badge>
        <h2>There’s always another game.</h2>
        <p>Find yours. Bring the whole history with you.</p>
        <Link href="/app">
          Enter Duna <ArrowRight aria-hidden size={18} />
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
