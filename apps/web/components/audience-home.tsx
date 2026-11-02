import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  MapPin,
  Radio,
  CreditCard,
  MessageSquare,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { clubFeatureByKey, clubFeatureGroups } from "@/lib/club-features";
import {
  clubHighlights,
  playerHighlights,
  clubFaqs,
  playerFaqs,
} from "@/lib/audience-pages";
import { DUNA_HQ_SIGNUP_URL } from "@/lib/site-urls";
import styles from "./audience-home.module.css";

const clubIcons = [
  CalendarDays,
  Trophy,
  CreditCard,
  Users,
  MessageSquare,
  Video,
];
const playerIcons = [
  MapPin,
  CalendarDays,
  ChartNoAxesCombined,
  Trophy,
  Video,
  Radio,
];

export function AudienceHome({
  audience,
}: {
  readonly audience: "clubs" | "players";
}) {
  const clubs = audience === "clubs";
  const highlights = clubs
    ? clubHighlights.map((item) => ({
        ...item,
        href: `/run-your-club/features/${item.key}`,
      }))
    : playerHighlights;
  const faqs = clubs ? clubFaqs : playerFaqs;
  return (
    <main className={styles.page} data-zone="editorial">
      <SiteHeader />
      <section
        className={`${styles.shell} ${styles.hero}`}
        aria-labelledby="audience-heading"
      >
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            {clubs ? "Duna for clubs & coaches" : "Duna for players"}
          </span>
          <h1 id="audience-heading">
            {clubs ? (
              <>
                Your club.
                <br />
                All together.
              </>
            ) : (
              <>
                More play.
                <br />
                More possibility.
              </>
            )}
          </h1>
          <p>
            {clubs
              ? "Bookings, programs, payments, and people. Everything you need to run your volleyball club, in one place."
              : "Find your next game, build your skills, and stay close to the sport. Your volleyball life, all in Duna."}
          </p>
          <div className={styles.actions}>
            {clubs ? (
              <a className={styles.primary} href={DUNA_HQ_SIGNUP_URL}>
                Get started <ArrowRight aria-hidden size={18} />
              </a>
            ) : (
              <Link className={styles.primary} href="/discover">
                Find a game <ArrowRight aria-hidden size={18} />
              </Link>
            )}
            <Link
              className={styles.secondary}
              href={clubs ? "#features" : "/app"}
            >
              {clubs ? "Explore the features" : "Open Duna Player"}
            </Link>
          </div>
          <span className={styles.heroNote}>
            {clubs
              ? "Built for indoor, beach, and everything in between."
              : "Courts, community, and a game that goes with you."}
          </span>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.heroImage}>
            <Image
              alt={
                clubs
                  ? "Volleyball courts ready for a day of club play"
                  : "Beach volleyball on a tournament center court"
              }
              fill
              priority
              sizes="(max-width: 760px) 100vw, 50vw"
              src={
                clubs
                  ? "/media/brand/duna-club-hero-v1.webp"
                  : "/media/brand/duna-home-tournament-hero-v1.webp"
              }
            />
          </div>
          <div className={styles.visualCaption}>
            <span>
              {clubs
                ? "Less admin. More time on court."
                : "Your next game starts here."}
            </span>
            <span>{clubs ? "Duna HQ" : "Duna Player"}</span>
          </div>
        </div>
      </section>

      <section
        className={styles.featureSection}
        id="features"
        aria-labelledby="features-heading"
      >
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>
                {clubs ? "One connected club" : "Every part of your game"}
              </span>
              <h2 id="features-heading">
                {clubs
                  ? "Less to juggle. More room to grow."
                  : "Get on court. Keep getting better."}
              </h2>
            </div>
            <p>
              {clubs
                ? "From the first booking to the next season, keep the day-to-day simple."
                : "A place to play, a way to improve, and a community to share it with."}
            </p>
          </div>
          <div className={styles.features}>
            {highlights.map((item, index) => {
              const Icon = (clubs ? clubIcons : playerIcons)[index]!;
              return (
                <Link
                  className={styles.feature}
                  href={item.href}
                  key={item.title}
                >
                  <Icon aria-hidden size={24} strokeWidth={1.5} />
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span>
                    Explore <ArrowRight aria-hidden size={16} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {clubs ? (
        <>
          <section
            className={`${styles.shell} ${styles.builtFor}`}
            id="built-for"
            aria-labelledby="built-for-heading"
          >
            <div>
              <span className={styles.eyebrow}>Made for your operation</span>
              <h2 id="built-for-heading">One coach or a whole club.</h2>
              <p>
                Bring your people, places, and programs together. Duna fits the
                way you run them.
              </p>
              <Link className={styles.textLink} href="/run-your-club">
                Meet Duna HQ <ArrowRight aria-hidden size={17} />
              </Link>
            </div>
            <div className={styles.useCases}>
              <Link href="/run-your-club#club-owner">
                <h3>Clubs & facilities</h3>
                <p>
                  Coordinate courts, staff, memberships, and your full calendar.
                </p>
                <ArrowRight aria-hidden size={18} />
              </Link>
              <Link href="/run-your-club#solo-coach">
                <h3>Independent coaches</h3>
                <p>
                  Offer lessons, plan training, and keep player relationships
                  close.
                </p>
                <ArrowRight aria-hidden size={18} />
              </Link>
              <Link href="/run-your-club/features/events">
                <h3>Leagues & event organizers</h3>
                <p>
                  Take registrations and manage competition from sign-up to
                  results.
                </p>
                <ArrowRight aria-hidden size={18} />
              </Link>
            </div>
          </section>
          <section className={styles.catalog} aria-labelledby="catalog-heading">
            <div className={styles.shell}>
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.eyebrow}>Explore the platform</span>
                  <h2 id="catalog-heading">All the details. Easy to find.</h2>
                </div>
                <Link
                  className={styles.textLink}
                  href="/run-your-club/features"
                >
                  View all features <ArrowRight aria-hidden size={17} />
                </Link>
              </div>
              <div className={styles.catalogGroups}>
                {clubFeatureGroups.map((group) => (
                  <div key={group.label}>
                    <h3>{group.label}</h3>
                    <p>{group.description}</p>
                    {group.keys.map((key) => {
                      const item = clubFeatureByKey.get(key);
                      return item ? (
                        <Link href={item.href} key={key}>
                          {item.navLabel}
                          <ArrowRight aria-hidden size={16} />
                        </Link>
                      ) : null;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className={`${styles.shell} ${styles.playerBridge}`}>
            <div>
              <span className={styles.eyebrow}>
                Better for your players, too
              </span>
              <h2>A club they can stay connected to.</h2>
              <p>
                Players discover your offers, book their next session, and
                follow their progress. You keep the whole experience together.
              </p>
              <Link className={styles.textLink} href="/players">
                See Duna for Players <ArrowRight aria-hidden size={17} />
              </Link>
            </div>
            <div className={styles.bridgeImage}>
              <Image
                alt="Players coming together at a volleyball court"
                fill
                sizes="(max-width: 760px) 100vw, 40vw"
                src="/media/event-library/duna-event-community-huddle.webp"
              />
            </div>
          </section>
        </>
      ) : (
        <section
          className={`${styles.shell} ${styles.playerExtras}`}
          aria-label="More ways to enjoy Duna"
        >
          <div>
            <span className={styles.eyebrow}>Follow the game</span>
            <h2>From your court to center court.</h2>
            <p>
              Follow the pro tour, find broadcasts, and explore the players and
              results shaping the sport.
            </p>
            <Link className={styles.textLink} href="/pro">
              Explore the pro tour <ArrowRight aria-hidden size={17} />
            </Link>
            <Link className={styles.textLink} href="/rankings">
              World rankings <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
          <div>
            <span className={styles.eyebrow}>Make it your game</span>
            <h2>Keep the moments that matter.</h2>
            <p>
              Bring people together, track how you feel, and keep your score
              close with Duna for Apple Watch.
            </p>
            <Link className={styles.textLink} href="/create">
              Create an event <ArrowRight aria-hidden size={17} />
            </Link>
            <Link className={styles.textLink} href="/apps/apple-watch">
              Duna for Apple Watch <ArrowRight aria-hidden size={17} />
            </Link>
            <Link className={styles.textLink} href="/app/health">
              Health & training load <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
        </section>
      )}

      <section
        className={`${styles.shell} ${styles.faq}`}
        aria-labelledby="faq-heading"
      >
        <h2 id="faq-heading">A few things to know.</h2>
        <div>
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <span aria-hidden>+</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
          {clubs ? (
            <Link className={styles.textLink} href="/run-your-club#plans">
              See plans & pricing <ArrowRight aria-hidden size={17} />
            </Link>
          ) : (
            <Link className={styles.textLink} href="/methodology">
              How Sand Rating works <ArrowRight aria-hidden size={17} />
            </Link>
          )}
        </div>
      </section>
      <section className={styles.closing}>
        <div className={styles.shell}>
          <div>
            <h2>
              {clubs
                ? "More time for the game."
                : "Your next game is out there."}
            </h2>
            <p>
              {clubs
                ? "Give your club one place to run."
                : "Find it. Make it yours."}
            </p>
          </div>
          {clubs ? (
            <a className={styles.primary} href={DUNA_HQ_SIGNUP_URL}>
              Get started with Duna <ArrowRight aria-hidden size={18} />
            </a>
          ) : (
            <Link className={styles.primary} href="/discover">
              Explore places to play <ArrowRight aria-hidden size={18} />
            </Link>
          )}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
