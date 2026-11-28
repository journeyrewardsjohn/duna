import "../pages.css";

import { CrestMark } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { DeviceTrio } from "@/components/site/apps/device-trio";
import { AppStoreLink } from "@/components/site/apps/store-link";
import { ConceptWallet } from "@/components/site/concepts/concept-wallet";
import { ConceptTile } from "@/components/site/home/home-bands";
import { ArrowLink } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";
import { sitePhotos } from "@/components/site/media";
import { siteOgImage } from "@/components/site/og";
import { PageHero, SectionHead, Split } from "@/components/site/page-parts";
import { Reveal } from "@/components/site/reveal";
import { ConceptStage } from "@/components/site/stage";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import {
  LaterConceptFilm,
  LaterConceptOpenGame,
  LaterConceptRating,
  LaterConceptScore,
  LaterConceptWatch,
} from "@/components/site/deferred";

const title = "The Duna apps";
const description =
  "Duna for players and parents, Duna Pro for coaches and club staff: scorekeeper, Sand Rating, wallet cards, film and Apple Watch, on iPhone and iPad.";
const ogImage = siteOgImage({
  title: "Two apps. One game.",
  eyebrow: "Duna and Duna Pro",
  concept: "score",
});

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/apps",
    types: { "text/markdown": "/apps.md" },
  },
  openGraph: {
    title: `${title} · Duna`,
    description,
    url: "/apps",
    siteName: "Duna",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · Duna`,
    description,
    images: [ogImage],
  },
};

function structuredData() {
  const page = absolutePublicUrl("/apps");
  const app = (name: string, about: string) => ({
    "@type": "MobileApplication",
    "@id": `${page}#${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    applicationCategory: "SportsApplication",
    operatingSystem: "iOS, watchOS",
    description: about,
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${page}#webpage`,
        url: page,
        name: title,
        description,
        isPartOf: { "@id": `${absolutePublicUrl("/")}#website` },
      },
      app(
        "Duna",
        "For players and parents: find games, book, keep score, get a Sand Rating and carry club cards.",
      ),
      app(
        "Duna Pro",
        "For coaches and club staff: the day with the conditions, the plan, the roster, the scorer and getting paid.",
      ),
    ],
  };
}

const PRO = [
  { name: "Today", body: "Sessions with the conditions for each court." },
  { name: "The plan", body: "Practice plans and drills on a court." },
  { name: "The roster", body: "Who is booked, paid and new." },
  { name: "The scorer", body: "On the phone or the watch." },
  { name: "Getting paid", body: "Bookings and payouts in one list." },
] as const;

/**
 * The apps (`/apps`): Duna and Duna Pro. The player app's parts as live
 * concepts (scorekeeper, Sand Rating, the real wallet stack, film), the
 * coach app in brief, Apple Watch with the gestures it ships with, and one
 * app at every size. Store links read "link coming" until the owner adds
 * the listings.
 */
export default function AppsPage() {
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData()) }}
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <AppStoreLink app="duna" />
            <AppStoreLink app="dunaPro" />
          </>
        }
        id="apps-title"
        label="Duna and Duna Pro"
        lead="Duna for players and parents. Duna Pro for coaches and club staff. One account, on iPhone, iPad and Apple Watch."
        stage={
          <ConceptStage
            credit="Generated image · demo clubs"
            photo={sitePhotos.friendsWalk}
            priority
            sizes="(max-width: 1000px) 100vw, 50vw"
          >
            <ConceptWallet />
          </ConceptStage>
        }
        title="Two apps. One game."
      />

      <section
        aria-labelledby="duna-title"
        className="site-wrap site-section"
        id="duna"
      >
        <SectionHead
          id="duna-title"
          label="Duna, for players"
          lead="Find a game, keep score, get your Sand Rating and watch it back. Your club cards sit in the same app."
          row
          title="Everything after “who’s playing?”"
        />
        <div className="site-tiles">
          <ConceptTile
            anchor="scorekeeper"
            body="Tap a side for each point. It keeps the server and every set, and the buttons on this card work."
            concept={<LaterConceptScore />}
            credit="Generated image · demo match"
            label="Scorekeeper"
            photo={sitePhotos.beachAttack}
            span="wide"
            title="Keep score with one hand."
          />
          <ConceptTile
            anchor="rating"
            body={
              <>
                When both sides confirm a result, your rating moves.{" "}
                <a href={siteLinks.sandRating}>How it works</a>
              </>
            }
            concept={
              <LaterConceptRating
                from={3.12}
                label="After this match"
                reliability={2}
                size={168}
                status="Confirmed by both sides"
                to={3.2}
              />
            }
            credit="Generated image · demo numbers"
            label="Sand Rating"
            photo={sitePhotos.partnersLowfive}
            span="narrow"
            title="Your level, earned on the sand."
          />
          <ConceptTile
            anchor="film"
            body="Film a match and see your heart rate and every rally laid over the video, point by point."
            concept={<LaterConceptFilm />}
            credit="Generated image · demo film"
            label="Film"
            photo={sitePhotos.digSpray}
            span="narrow"
            title="Watch it back with your heart rate."
          />
          <ConceptTile
            anchor="find"
            body="Search by where, when and what, then join a game that needs two more. Your club cards sit in the same app and your phone’s wallet."
            concept={<LaterConceptOpenGame />}
            credit="Generated image · demo game"
            label="Find and book"
            photo={sitePhotos.courtsFirstLight}
            span="wide"
            title="A game tonight, two taps away."
          />
        </div>
      </section>

      <section
        aria-labelledby="pro-title"
        className="site-wrap site-section"
        id="pro"
      >
        <SectionHead
          id="pro-title"
          label="Duna Pro, for coaches and staff"
          title="The coach’s day, in one app."
        />
        <div className="td site-showcase" data-theme="dark">
          <div className="site-showcase__copy">
            <span aria-hidden="true" className="site-app__icon">
              <CrestMark />
            </span>
            <p className="site-body">
              Today’s sessions with the wind for each court, the plan, the
              roster, the scorer and the money, for coaches on their own and
              staff inside a club.
            </p>
            <div className="site-actions">
              <AppStoreLink app="dunaPro" />
              <ArrowLink href={siteLinks.forCoaches}>
                Duna Pro for coaches
              </ArrowLink>
            </div>
          </div>
          <Reveal as="ol" className="site-showcase__list" rally>
            {PRO.map((feature) => (
              <li key={feature.name}>
                <b>{feature.name}</b>
                <span>{feature.body}</span>
              </li>
            ))}
          </Reveal>
        </div>
      </section>

      <Split
        anchor="watch"
        id="watch-title"
        label="Apple Watch"
        stage={
          <ConceptStage
            credit="Generated image"
            photo={sitePhotos.watchRest}
            place="start"
            shape="wide"
            sizes="(max-width: 1000px) 100vw, 58vw"
          >
            <LaterConceptWatch />
          </ConceptStage>
        }
        title="Your match, on your wrist."
      >
        <p className="site-lead">
          Start or carry on a match from your watch and keep score without your
          phone on the court. Swipe up or down for a point, left to undo, right
          to save a moment worth seeing again.
        </p>
        <p className="site-body">
          Finished scores wait safely if the connection drops, and send when it
          comes back.
        </p>
      </Split>

      <section
        aria-labelledby="screens-title"
        className="site-wrap site-section"
        id="screens"
      >
        <SectionHead
          id="screens-title"
          label="iPhone, iPad and the foldable"
          lead="Layouts follow the width of the window, not the name of the device. Nothing lives on only one size."
          title="One app, every screen you play with."
        />
        <DeviceTrio />
      </section>

      <section
        aria-labelledby="apps-close-title"
        className="site-wrap site-section site-section--tight"
      >
        <div className="site-final">
          <p className="site-label">On the App Store</p>
          <h2 className="site-h2" id="apps-close-title">
            See you at the net.
          </h2>
          <div className="site-actions">
            <AppStoreLink app="duna" />
            <AppStoreLink app="dunaPro" />
          </div>
          <p className="site-meta">
            Prefer the web? Find a game and book at{" "}
            <a href={siteLinks.findGame}>duna.coach</a> too.
          </p>
        </div>
      </section>
    </main>
  );
}
