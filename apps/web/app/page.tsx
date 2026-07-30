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
import { getServerCaller } from "@/lib/api";

export default async function HomePage() {
  const caller = await getServerCaller();
  const [events, people, venues] = await Promise.all([
    caller.public.events(),
    caller.public.players({ limit: 50 }),
    caller.public.venues(),
  ]);
  const courtCount = venues.reduce(
    (total, venue) => total + venue.courtCount,
    0,
  );
  const featuredEvent = events[0];
  const featuredPlayer = people[0];
  const marketLabel = venues[0]
    ? `${venues[0].city}, ${venues[0].region}`
    : "New markets opening";
  const markets = [...new Set(venues.map((venue) => venue.city))].join(" · ");
  return (
    <main className="marketing">
      <SiteHeader />

      <section className="hero">
        <div className="hero__noise" />
        <div className="hero__glow" />
        <div className="hero__content">
          <Badge tone="live">
            <Radio aria-hidden size={12} /> {courtCount} connected{" "}
            {courtCount === 1 ? "court" : "courts"}
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
              <Numeric>{people.length}</Numeric>
              <span>public player profiles</span>
            </div>
            <div>
              <Numeric>{events.length}</Numeric>
              <span>published play options</span>
            </div>
            <div>
              <Numeric>{courtCount}</Numeric>
              <span>bookable court resources</span>
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
              <Badge tone={featuredEvent?.live ? "live" : "neutral"}>
                {featuredEvent?.live ? "Live" : "Connected"}
              </Badge>
              <span>{featuredEvent?.venueName ?? "Duna scoring"}</span>
            </div>
            <div className="hero-live-card__score">
              <span>{featuredEvent?.title ?? "No event published yet"}</span>
              <Numeric>
                {featuredEvent
                  ? `${featuredEvent.spotsRemaining}/${featuredEvent.capacity}`
                  : "—"}
              </Numeric>
            </div>
            <small>
              {featuredEvent
                ? "Connected capacity, schedule, and venue"
                : "Operators publish inventory into this surface"}
            </small>
          </div>
          <div className="hero-rating-card">
            <RatingOrbit
              compact
              confidence={featuredPlayer?.rating.confidence ?? "Provisional"}
              delta={featuredPlayer?.rating.delta}
              value={featuredPlayer?.rating.display ?? 1}
            />
            <div>
              <span>{featuredPlayer?.displayName ?? "Your Sand Rating"}</span>
              <strong className="duna-numeric">
                {featuredPlayer?.rating.display.toFixed(2) ?? "—"}
              </strong>
              <small>
                {featuredPlayer
                  ? `${featuredPlayer.rating.confidence} confidence`
                  : "Built from verified results"}
              </small>
            </div>
          </div>
        </div>
      </section>

      <section className="market-ribbon">
        <div>
          <MapPin aria-hidden size={16} />
          <span>{marketLabel} is connected</span>
        </div>
        <p>
          <Numeric>{people.length}</Numeric> public profiles ·{" "}
          <Numeric>{events.length}</Numeric> published options ·{" "}
          <Numeric>{courtCount}</Numeric> courts
        </p>
        <Link href="/app/discover">Explore the market</Link>
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
          {events.slice(0, 4).map((event, index) => (
            <EventCard event={event} featured={index === 0} key={event.id} />
          ))}
          {events.length === 0 && (
            <article className="empty-state">
              <h3>No public sessions yet.</h3>
              <p>Connected operator inventory will appear here.</p>
            </article>
          )}
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
            <RatingOrbit
              confidence={featuredPlayer?.rating.confidence ?? "Provisional"}
              delta={featuredPlayer?.rating.delta}
              value={featuredPlayer?.rating.display ?? 1}
            />
          </div>
          <div className="rating-story__ladder">
            {people.slice(0, 4).map((person, index) => (
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
            <Badge tone="positive">Connected snapshot</Badge>
          </div>
          <div className="operator-callout__metrics">
            <div>
              <small>Published sessions</small>
              <Numeric>{events.length}</Numeric>
              <span>Live repository</span>
            </div>
            <div>
              <small>Connected courts</small>
              <Numeric>{courtCount}</Numeric>
              <span>{venues.length} venues</span>
            </div>
            <div>
              <small>Public profiles</small>
              <Numeric>{people.length}</Numeric>
              <span>Privacy-filtered</span>
            </div>
          </div>
          <div className="operator-callout__schedule">
            <span>{featuredEvent ? "Next" : "Ready"}</span>
            <strong>{featuredEvent?.title ?? "Publish from Duna HQ"}</strong>
            <small>
              {featuredEvent
                ? `${featuredEvent.venueName} · ${featuredEvent.spotsRemaining} spots remaining`
                : "Inventory, schedules, registration, and reporting"}
            </small>
            <Badge tone={featuredEvent?.live ? "live" : "neutral"}>
              {featuredEvent?.live ? "Live" : "Connected"}
            </Badge>
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
        <Badge tone={markets ? "live" : "neutral"}>
          {markets || "New markets opening"}
        </Badge>
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
