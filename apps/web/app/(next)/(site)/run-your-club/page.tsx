import "../pages.css";

import { ORGANIZATION_PLANS } from "@duna/core";
import type { Metadata } from "next";
import { ConceptAskDuna } from "@/components/site/concepts/concept-ask-duna";
import { ConceptConcierge } from "@/components/site/concepts/concept-concierge";
import { ConceptMemberPass } from "@/components/site/concepts/concept-member-pass";
import { ConceptOpenGame } from "@/components/site/concepts/concept-open-game";
import { ConceptPayout } from "@/components/site/concepts/concept-payout";
import { ConceptSetupRead } from "@/components/site/concepts/concept-setup-read";
import { ConceptSiteEdit } from "@/components/site/concepts/concept-site-edit";
import { ConceptTeamWeek } from "@/components/site/concepts/concept-team-week";
import { ConceptTile } from "@/components/site/home/home-bands";
import { LinkButton } from "@/components/site/link-button";
import { clubSignupHref, siteLinks } from "@/components/site/links";
import { sitePhotos } from "@/components/site/media";
import { ownerContent } from "@/components/site/owner-content";
import {
  OwnerSlot,
  PageHero,
  SectionHead,
  StatusChip,
} from "@/components/site/page-parts";
import { ClubPlanSummary } from "@/components/site/pricing/plan-summary";
import { organizationFeeLine } from "@/components/site/pricing/pricing-data";
import { Reveal } from "@/components/site/reveal";
import { ConceptStage } from "@/components/site/stage";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import { siteOgImage } from "@/components/site/og";

const title = "Run your volleyball club";
const description =
  "Bookings, programs, memberships, payments, staff and your club website in one place, for beach and indoor. Start on Free and move up as you grow.";
const ogImage = siteOgImage({
  title: "Run the whole club from one place.",
  eyebrow: "For clubs and coaches",
  concept: "club",
});

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/run-your-club",
    types: { "text/markdown": "/run-your-club.md" },
  },
  openGraph: {
    title: `${title} · Duna`,
    description,
    url: "/run-your-club",
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

const free = ORGANIZATION_PLANS.coach;

function structuredData() {
  const page = absolutePublicUrl("/run-your-club");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${page}#webpage`,
        url: page,
        name: "Run your volleyball club on Duna",
        description,
        inLanguage: "en-US",
        isPartOf: { "@id": `${absolutePublicUrl("/")}#website` },
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "text/markdown",
          contentUrl: absolutePublicUrl("/run-your-club.md"),
        },
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
          {
            "@type": "ListItem",
            position: 2,
            name: "For clubs",
            item: page,
          },
        ],
      },
    ],
  };
}

/**
 * For clubs (`/run-your-club`, spec 2.6): what Duna runs for a club, each job
 * as a concept over photography with an honest Live today / In build status;
 * how a club starts today and what is coming; the plans in one line each; a
 * slot for a real club's result (renders nothing until supplied); and the two
 * ways forward, Start free or a conversation with a person.
 */
export default function RunYourClubPage() {
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData()) }}
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <LinkButton
              arrow
              href={clubSignupHref("coach", "month", "run-your-club")}
              variant="primary"
            >
              Start your club free
            </LinkButton>
            <LinkButton href={siteLinks.talkToUs} variant="secondary">
              Talk to us
            </LinkButton>
          </>
        }
        id="clubs-title"
        label="For clubs and coaches"
        lead="Bookings, programs, memberships, payments, staff and your website, for beach and indoor. Start on Free and move up when the club grows."
        note={`No monthly fee on ${free.name}. ${organizationFeeLine(free.defaultCommissionBps)}, plus card processing.`}
        stage={
          <ConceptStage
            credit="Generated image · demo club"
            photo={sitePhotos.indoorHuddle}
            priority
            sizes="(max-width: 1000px) 100vw, 50vw"
          >
            <ConceptSiteEdit trigger="first-paint" />
          </ConceptStage>
        }
        title="Run the whole club from one place."
      >
        <p className="site-hero-status">
          <StatusChip status="live">Live today</StatusChip>
          <span className="site-meta">
            Your club website stays in step with your schedule. Editing it by
            asking is in build.
          </span>
        </p>
      </PageHero>

      <section
        aria-labelledby="runs-title"
        className="site-wrap site-section"
        id="features"
      >
        <SectionHead
          id="runs-title"
          label="What Duna runs"
          lead="Every job below works on its own and with the others: a booking is a session on the schedule, a payment, a member’s card and a line in your payouts."
          row
          title="Every job, one login."
        />
        <div className="site-tiles">
          <ConceptTile
            anchor="bookings"
            body="Courts, clinics, privates, leagues and open games with minimums, waitlists and a confirm time. Programs and seasons sit on the same schedule."
            concept={<ConceptOpenGame view="club" />}
            label="Bookings and programs"
            photo={sitePhotos.courtsFirstLight}
            span="wide"
            status={<StatusChip status="live">Live today</StatusChip>}
            title="You see the money as the game fills."
          />
          <ConceptTile
            anchor="memberships"
            body="Plans and credits, and a card in every member’s phone wallet that shows the right pass on a class day."
            concept={<ConceptMemberPass />}
            label="Memberships and the card"
            photo={sitePhotos.friendsWalk}
            span="narrow"
            status={<StatusChip status="live">Live today</StatusChip>}
            title="One card for every member."
          />
          <ConceptTile
            anchor="payments"
            body="Cards and bank payments, refunds in a tap, every payout listed. You are paid within three business days once the money has settled and the session has taken place."
            concept={<ConceptPayout />}
            label="Payments · Duna Pay"
            photo={sitePhotos.partnersLowfive}
            span="narrow"
            status={<StatusChip status="live">Live today</StatusChip>}
            title="Paid when the game is played."
          />
          <ConceptTile
            anchor="team"
            body="Coaches and staff with roles, schedules and pay. See who is on each session and what still needs someone."
            concept={<ConceptTeamWeek />}
            label="Team and schedule"
            photo={sitePhotos.coachMorning}
            span="wide"
            status={<StatusChip status="live">Live today</StatusChip>}
            title="Every session has a coach."
          />
          <ConceptTile
            anchor="concierge"
            body="Texts, email and chat from one person in one thread, answered the way they wrote."
            concept={<ConceptConcierge />}
            label="Concierge"
            photo={sitePhotos.beachAttack}
            span="wide"
            status={<StatusChip status="build">In build</StatusChip>}
            title="Every conversation in one place."
          />
          <ConceptTile
            anchor="ask-duna"
            body="Ask a question about your club, or ask for a change. Duna shows the before and after and who gets told; nothing moves until you approve it."
            concept={<ConceptAskDuna />}
            label="Ask Duna"
            photo={sitePhotos.indoorServe}
            span="narrow"
            status={<StatusChip status="live">Live today</StatusChip>}
            title="A proposal, not a surprise."
          />
        </div>
      </section>

      <section
        aria-labelledby="start-title"
        className="site-wrap site-section"
        id="start"
      >
        <SectionHead
          id="start-title"
          label="How a club starts"
          title="Open for bookings this week."
        />
        <div className="site-start">
          <Reveal className="site-start__today">
            <p className="site-start__kicker">
              <StatusChip status="live">Today</StatusChip>
            </p>
            <ol className="site-steps">
              <li>
                <b>Create your account and name your club.</b>
                <span>Minutes, on the Free plan.</span>
              </li>
              <li>
                <b>Add your places, courts and hours.</b>
                <span>Beach, indoor or both.</span>
              </li>
              <li>
                <b>Verify your identity for Duna Pay.</b>
                <span>Once, so you can take payments and be paid out.</span>
              </li>
              <li>
                <b>Add a first session and publish.</b>
                <span>
                  Bookings open when places, hours, one offering and payments
                  are ready.
                </span>
              </li>
            </ol>
            <div className="site-actions">
              <LinkButton
                arrow
                href={clubSignupHref("coach", "month", "run-your-club")}
                variant="primary"
              >
                Start free
              </LinkButton>
            </div>
          </Reveal>
          <div className="td site-start__next" data-theme="dark">
            <div className="site-start__copy">
              <p className="site-start__kicker">
                <StatusChip status="build">Coming next</StatusChip>
              </p>
              <h3 className="site-h3">Start from your website address.</h3>
              <p className="site-body">
                Give Duna your club’s website and it reads it for your name,
                hours, places and what you offer. You keep, edit or skip each
                line; nothing is applied until you confirm.
              </p>
            </div>
            <ConceptSetupRead />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="plans-title"
        className="site-wrap site-section site-section--tight"
        id="plans"
      >
        <SectionHead
          chip={<span className="site-draft">Draft pricing</span>}
          id="plans-title"
          label="Pricing"
          title="Free to start. Cheaper per sale as you grow."
        />
        <ClubPlanSummary />
      </section>

      <OwnerSlot>
        {ownerContent.clubResult ? (
          <section
            aria-label="A club on Duna"
            className="site-wrap site-section site-section--tight"
          >
            <figure className="site-quote">
              <blockquote>{ownerContent.clubResult.text}</blockquote>
              <figcaption>{ownerContent.clubResult.attribution}</figcaption>
            </figure>
          </section>
        ) : null}
      </OwnerSlot>

      <section
        aria-labelledby="close-title"
        className="site-wrap site-section site-section--tight"
      >
        <div className="site-final">
          <p className="site-label">Start today, or talk it through</p>
          <h2 className="site-h2" id="close-title">
            Your club, open for bookings.
          </h2>
          <p className="site-body">
            Start on {free.name} with no monthly fee. Or write to us and a
            person replies.
          </p>
          <div className="site-actions">
            <LinkButton
              href={clubSignupHref("coach", "month", "run-your-club")}
              variant="primary"
            >
              Start free
            </LinkButton>
            <LinkButton href={siteLinks.talkToUs} variant="secondary">
              Talk to us
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  );
}
