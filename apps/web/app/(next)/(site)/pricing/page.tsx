import "../pages.css";

import {
  MEMBERSHIP_PLAN_IDS,
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
} from "@duna/core";
import { WEBSITE_MONTHLY_PRICE_MINOR } from "@duna/api/website-billing";
import { Icon } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "@/components/site/site-link";
import { legalIndex } from "@/components/legal/legal-library";
import { LinkButton } from "@/components/site/link-button";
import { clubSignupHref, siteLinks } from "@/components/site/links";
import { siteOgImage } from "@/components/site/og";
import { PageHero, SectionHead } from "@/components/site/page-parts";
import { PlanCards } from "@/components/site/pricing/plan-cards";
import {
  dollars,
  feeFacts,
  processingTerms,
} from "@/components/site/pricing/pricing-data";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import { LaterFeeCalculator } from "@/components/site/deferred";

const title = "Pricing · Duna";
const description =
  "Plans for clubs, coaches and players, and where every dollar of a booking goes. Free to start on both sides of the net.";
const ogImage = siteOgImage({
  title: "Simple to start. Clear as you grow.",
  eyebrow: "Pricing",
  concept: "price",
});

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/pricing",
    types: { "text/markdown": "/pricing.md" },
  },
  openGraph: {
    title,
    description,
    url: "/pricing",
    siteName: "Duna",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "Duna pricing" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

/** The documents whose terms the prices depend on. */
const TERMS = ["fees-and-premium", "duna-pay", "hq-terms"] as const;

/**
 * Prices are drafts until the owner approves the terms that go with them:
 * the notice shows while any of those documents is a draft (the legal
 * index's status). The fee policy has a version
 * (`ORGANIZATION_FEE_POLICY_VERSION`) but no "final" mark yet, so the legal
 * status is the switch.
 */
function termsAreDraft(): boolean {
  const documents = legalIndex().documents;
  return TERMS.some(
    (slug) =>
      documents.find((document) => document.slug === slug)?.status !==
      "in-effect",
  );
}

interface Faq {
  readonly question: string;
  readonly answer: string;
}

function faqs(): readonly Faq[] {
  const processing = processingTerms();
  const free = ORGANIZATION_PLANS.coach;
  return [
    {
      question: "Is Duna free for players?",
      answer: `Yes. Finding games, booking, keeping score and your Sand Rating are free. Card payments for bookings carry a ${feeFacts.serviceFee} Duna service fee, shown with the total before you pay, unless you have Duna Premium.`,
    },
    {
      question: "What does Duna Premium add?",
      answer: `No service fee on eligible bookings, more uploaded video and live hours each month, and your full Sand Rating history. Premium is ${feeFacts.premiumMonthly} a month or ${feeFacts.premiumYearly} a year; Premium+ is ${feeFacts.premiumPlusMonthly} a month or ${feeFacts.premiumPlusYearly} a year. It renews until you cancel, and you can cancel online at any time.`,
    },
    {
      question: "Can a solo coach use the Free plan?",
      answer: `Yes. ${free.name} has every feature, with no monthly fee and a ${feeFacts.freeClubFee} fee on what you sell, plus card or bank processing.`,
    },
    {
      question: "Who pays card processing?",
      answer: `The club, out of the booking price: about ${processing.card} for a card online, ${processing.bank} for a bank payment. The player’s total never grows because of it.`,
    },
    {
      question: "When do clubs get paid?",
      answer:
        "Money for a sale is released once the payment has settled and the club has delivered what it sold (a session that has taken place, for example). Duna then pays it out within 3 business days on the daily schedule, the default. Weekly and monthly schedules are slower by the club’s choice.",
    },
    {
      question: "Is the club website included?",
      answer: `The club website is an add-on at ${dollars(WEBSITE_MONTHLY_PRICE_MINOR)} a month.`,
    },
  ];
}

function structuredData(list: readonly Faq[]) {
  const page = absolutePublicUrl("/pricing");
  const offer = (name: string, priceMinor: number, href: string) => ({
    "@type": "Offer",
    name,
    price: (priceMinor / 100).toFixed(2),
    priceCurrency: "USD",
    url: href,
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${page}#duna-hq`,
        name: "Duna HQ",
        description: "Software to run a volleyball club or coaching business.",
        brand: { "@type": "Brand", name: "Duna" },
        offers: ORGANIZATION_PLAN_IDS.map((id) =>
          offer(
            ORGANIZATION_PLANS[id].productName,
            ORGANIZATION_PLANS[id].monthlyPriceMinor,
            clubSignupHref(id),
          ),
        ),
      },
      {
        "@type": "Product",
        "@id": `${page}#duna-premium`,
        name: "Duna Premium",
        description:
          "Player membership: no service fee on bookings and more video.",
        brand: { "@type": "Brand", name: "Duna" },
        offers: MEMBERSHIP_PLAN_IDS.filter((id) => id !== "free").map((id) =>
          offer(
            `Duna ${MEMBERSHIP_PLANS[id].name}`,
            MEMBERSHIP_PLANS[id].monthlyPriceMinor,
            absolutePublicUrl(siteLinks.premium),
          ),
        ),
      },
      {
        "@type": "FAQPage",
        "@id": `${page}#faq`,
        mainEntity: list.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

/**
 * Pricing (`/pricing`, spec 2.8): both audiences' plans from the plan tables
 * in code, the fees in plain words, a calculator driven by the real fee
 * composition, and a short FAQ with only true answers. A notice says the
 * terms are drafts until the owner approves them.
 */
export default function PricingPage() {
  const list = faqs();
  const draft = termsAreDraft();
  const premium = MEMBERSHIP_PLANS.premium;
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(structuredData(list)),
        }}
        type="application/ld+json"
      />
      <PageHero
        id="pricing-title"
        label="Pricing"
        lead="Players play free. Clubs and coaches start free and move to a plan with a smaller fee as they sell more."
        title="Simple to start. Clear as you grow."
      >
        {draft ? (
          <div className="site-notice" role="note">
            <Icon name="info" size="control" />
            <p>
              These are Duna’s prices today. Our updated fee terms are still in
              draft.{" "}
              <Link href="/legal/fees-and-premium">
                Read the draft fee terms
              </Link>
              .
            </p>
          </div>
        ) : null}
      </PageHero>

      <section aria-label="Plans" className="site-wrap site-section" id="plans">
        <PlanCards />
      </section>

      <section
        aria-labelledby="fees-title"
        className="site-wrap site-section"
        id="fees"
      >
        <SectionHead
          id="fees-title"
          label="Fees, explained"
          lead="Two fees and a processing cost can touch a booking. Each has one payer, and the player sees their total before paying."
          title="Where every dollar of a booking goes."
        />
        <dl className="site-fees">
          <div>
            <dt>Platform fee</dt>
            <dd>
              The club pays Duna a share of what it sells:{" "}
              <b className="td-num">{feeFacts.freeClubFee}</b> on{" "}
              {ORGANIZATION_PLANS.coach.name},{" "}
              <b className="td-num">{feeFacts.clubFee}</b> on{" "}
              {ORGANIZATION_PLANS["small-club"].name},{" "}
              {ORGANIZATION_PLANS.club.defaultCommissionBps === 0
                ? "none"
                : feeFacts.scaleFee}{" "}
              on {ORGANIZATION_PLANS.club.name}. It comes out of the club’s
              payout.
            </dd>
          </div>
          <div>
            <dt>Player service fee</dt>
            <dd>
              The player pays <b className="td-num">{feeFacts.serviceFee}</b> on
              card payments for bookings, registrations, memberships and
              packages, on top of the price and shown with the total before
              paying. None on goods, credits or cash, and none with Premium.
            </dd>
          </div>
          <div>
            <dt>What Premium adds</dt>
            <dd>
              Duna {premium.name} takes the service fee off eligible bookings
              and adds video: from{" "}
              <b className="td-num">{feeFacts.premiumMonthly}</b> a month.
            </dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>
              Card and bank costs, an estimate the club bears: card{" "}
              {processingTerms().card}; bank {processingTerms().bank}.
            </dd>
          </div>
        </dl>
        <LaterFeeCalculator />
      </section>

      <section
        aria-labelledby="faq-title"
        className="site-wrap site-section"
        id="faq"
      >
        <SectionHead
          id="faq-title"
          label="Questions"
          title="Questions, answered."
        />
        <div className="site-faq">
          {list.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="price-close-title"
        className="site-wrap site-section site-section--tight"
      >
        <div className="site-final">
          <p className="site-label">Both sides of the net</p>
          <h2 className="site-h2" id="price-close-title">
            Free to start. Today.
          </h2>
          <div className="site-actions">
            <LinkButton href={siteLinks.findGame} variant="primary">
              Find a game
            </LinkButton>
            <LinkButton
              href={clubSignupHref("coach", "month", "pricing")}
              variant="secondary"
            >
              Start your club free
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  );
}
