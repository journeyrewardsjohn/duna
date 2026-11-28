import "../pages.css";

import type { Metadata } from "next";
import { AppStoreLink } from "@/components/site/apps/store-link";
import { ConceptCoachDay } from "@/components/site/concepts/concept-coach-day";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { clubSignupHref, siteLinks } from "@/components/site/links";
import { sitePhotos } from "@/components/site/media";
import { siteOgImage } from "@/components/site/og";
import { ownerContent } from "@/components/site/owner-content";
import {
  OwnerSlot,
  PageHero,
  SectionHead,
  Split,
  StatusChip,
} from "@/components/site/page-parts";
import { Reveal } from "@/components/site/reveal";
import { ConceptStage } from "@/components/site/stage";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import {
  LaterConceptDrill,
  LaterConceptPayout,
  LaterConceptScore,
} from "@/components/site/deferred";

const title = "Duna Pro for coaches";
const description =
  "Your coaching day in your pocket: today's sessions with the wind for each court, practice plans drawn on a court, a scorer, and getting paid.";
const ogImage = siteOgImage({
  title: "Your coaching day, in your pocket.",
  eyebrow: "Duna Pro, for coaches",
  concept: "coach",
});

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/coaches",
    types: { "text/markdown": "/coaches.md" },
  },
  openGraph: {
    title,
    description,
    url: "/coaches",
    siteName: "Duna",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

function structuredData() {
  const page = absolutePublicUrl("/coaches");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${page}#webpage`,
        url: page,
        name: title,
        description,
        inLanguage: "en-US",
        isPartOf: { "@id": `${absolutePublicUrl("/")}#website` },
        mainEntity: { "@id": `${page}#app` },
      },
      {
        "@type": "MobileApplication",
        "@id": `${page}#app`,
        name: "Duna Pro",
        applicationCategory: "SportsApplication",
        operatingSystem: "iOS",
        description:
          "For coaches and club staff: the day with the conditions, the plan, the roster, the scorer, and getting paid.",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Duna",
            item: absolutePublicUrl("/"),
          },
          { "@type": "ListItem", position: 2, name: "For coaches", item: page },
        ],
      },
    ],
  };
}

const PRO_FEATURES = [
  {
    name: "Today",
    body: "Your sessions, who is coming, and the conditions for each court.",
  },
  {
    name: "The plan",
    body: "Practice plans from your drill library, block by block.",
  },
  { name: "The roster", body: "Who is booked, who has paid, who is new." },
  { name: "The scorer", body: "Keep score on your phone or your watch." },
  {
    name: "Getting paid",
    body: "Every booking and payout, on the schedule you choose.",
  },
] as const;

/**
 * For coaches (`/coaches`, spec 2.7): Duna Pro, the coach's app. The day
 * with the one-line conditions, the practice plan and its drill on a court,
 * the scorer, getting paid, and the app itself. The generated portrait is a
 * slot for the owner's own coach photographs.
 */
export default function CoachesPage() {
  const signup = clubSignupHref("coach", "month", "coaches");
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData()) }}
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <LinkButton arrow href={signup} variant="primary">
              Start coaching on Duna
            </LinkButton>
            <AppStoreLink app="dunaPro" />
          </>
        }
        id="coaches-title"
        label="Duna Pro, for coaches"
        lead="See today’s sessions with the wind for each court, run the plan, keep score, and get paid. Coach on your own or inside a club."
        note="Free to start: no monthly fee, a fee only on what you sell."
        stage={
          <ConceptStage
            credit="Generated image · demo day"
            photo={sitePhotos.coachPortrait}
            priority
            sizes="(max-width: 1000px) 100vw, 50vw"
          >
            <ConceptCoachDay />
          </ConceptStage>
        }
        title="Your coaching day, in your pocket."
      />

      <Split
        anchor="plan"
        id="plan-title"
        label="The plan"
        stage={
          <ConceptStage
            credit="Generated image · demo plan"
            photo={sitePhotos.coachMorning}
            place="center"
            shape="wide"
            sizes="(max-width: 1000px) 100vw, 58vw"
          >
            <LaterConceptDrill />
          </ConceptStage>
        }
        title="Drills drawn on the court you’re standing on."
      >
        <p className="site-lead">
          Pick drills from your library, set the minutes, and run the plan block
          by block. Players see where to stand.
        </p>
        <ul className="site-points">
          <li>
            Describe a drill in plain words and Duna drafts it; you edit it
            before it is saved.
          </li>
          <li>Build a session from timed blocks, on one court or several.</li>
          <li>
            Set a season’s dates and Duna drafts its phases for you to change.
          </li>
        </ul>
        <p className="site-hero-status">
          <StatusChip status="live">Live today</StatusChip>
          <span className="site-meta">Animated drill scenes are in build.</span>
        </p>
      </Split>

      <Split
        anchor="scorer"
        flip
        id="scorer-title"
        label="The scorer"
        stage={
          <ConceptStage
            credit="Generated image · demo match"
            photo={sitePhotos.indoorServe}
            place="center"
            shape="wide"
            sizes="(max-width: 1000px) 100vw, 58vw"
          >
            <LaterConceptScore />
          </ConceptStage>
        }
        title="Score the scrimmage with one hand."
      >
        <p className="site-lead">
          Tap a side for each point. Duna keeps the server and every rally, on
          your phone or your watch. Try it: the buttons work.
        </p>
      </Split>

      <Split
        anchor="paid"
        id="paid-title"
        label="Getting paid"
        stage={
          <ConceptStage
            credit="Generated image · demo payout"
            photo={sitePhotos.partnersLowfive}
            place="center"
            shape="wide"
            sizes="(max-width: 1000px) 100vw, 58vw"
          >
            <LaterConceptPayout label="Your payouts" />
          </ConceptStage>
        }
        title="Paid once the lesson is taught."
      >
        <p className="site-lead">
          Players pay when they book. Once the payment has settled and the
          session has taken place, Duna pays you out within three business days
          on the daily schedule, with every booking listed.
        </p>
        <ArrowLink href={siteLinks.pricing}>
          See the fees, and what you keep
        </ArrowLink>
      </Split>

      <OwnerSlot>
        {ownerContent.coachQuote ? (
          <section
            aria-label="A coach on Duna"
            className="site-wrap site-section site-section--tight"
          >
            <figure className="site-quote">
              <blockquote>{ownerContent.coachQuote.text}</blockquote>
              <figcaption>{ownerContent.coachQuote.attribution}</figcaption>
            </figure>
          </section>
        ) : null}
      </OwnerSlot>

      <section
        aria-labelledby="pro-app-title"
        className="site-wrap site-section"
        id="app"
      >
        <SectionHead
          id="pro-app-title"
          label="The app"
          title="Duna Pro: the whole day, one app."
        />
        <div className="td site-showcase" data-theme="dark">
          <div className="site-showcase__copy">
            <p className="site-body">
              For coaches and club staff, on iPhone, iPad and Apple Watch. The
              same account runs your club in Duna HQ on the web.
            </p>
            <div className="site-actions">
              <AppStoreLink app="dunaPro" />
              <ArrowLink href={siteLinks.apps}>Both Duna apps</ArrowLink>
            </div>
          </div>
          <Reveal as="ol" className="site-showcase__list" rally>
            {PRO_FEATURES.map((feature) => (
              <li key={feature.name}>
                <b>{feature.name}</b>
                <span>{feature.body}</span>
              </li>
            ))}
          </Reveal>
        </div>
      </section>

      <section
        aria-labelledby="coach-close-title"
        className="site-wrap site-section site-section--tight"
      >
        <div className="site-final">
          <p className="site-label">On your own or inside a club</p>
          <h2 className="site-h2" id="coach-close-title">
            Coach more. Chase less.
          </h2>
          <div className="site-actions">
            <LinkButton href={signup} variant="primary">
              Start coaching on Duna
            </LinkButton>
            <LinkButton href={siteLinks.pricing} variant="secondary">
              Pricing
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  );
}
