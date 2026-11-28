import type { Metadata } from "next";
import { log } from "@duna/observability";
import { HomeHero } from "@/components/site/home/hero";
import {
  AppsBand,
  ClubsChapter,
  FinalCta,
  HoneypotBand,
  PricingTeaser,
  QuoteSlot,
} from "@/components/site/home/home-bands";
import {
  type RailSession,
  railSessions,
  SessionRail,
} from "@/components/site/home/session-rail";
import { NetLine } from "@/components/site/net-line";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import { createPublicCaller } from "@/lib/public-api";
import { LaterStoryScroller } from "@/components/site/deferred";

/** Rebuilt every five minutes, so the rail stays current while the page is static. */
export const revalidate = 300;

const title = "Duna · Beach and indoor volleyball near you";
const description =
  "Find a game tonight, keep score on your phone and get your Sand Rating. Clubs and coaches run bookings, payments and programs on Duna.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/", types: { "text/markdown": "/index.md" } },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Duna",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

async function loadRail(): Promise<RailSession[]> {
  try {
    const discovery = await createPublicCaller().public.discoveryMap();
    return railSessions(discovery.items);
  } catch (error) {
    // The rail shows its empty state; the page still renders.
    log.warn("site.home.rail.unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return [];
  }
}

function structuredData() {
  const home = absolutePublicUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        name: "Duna",
        legalName: "Beach Elite LLC",
        url: home,
        description:
          "Duna connects beach and indoor volleyball players, clubs and coaches: find a game, keep score, get a Sand Rating, and run a club.",
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: "Duna",
        publisher: { "@id": `${home}#organization` },
        inLanguage: "en-US",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absolutePublicUrl("/discover")}?where={q}`,
          },
          "query-input": "required name=q",
        },
      },
    ],
  };
}

/**
 * Home (`/`, spec 3.1): the hero with the Where · When · What search, the
 * rail, the player story, the no-account score band, the clubs chapter, the
 * pricing teaser, the apps, the quote slot (empty until a real quote) and the
 * close. One h1. Statically rendered; the rail refreshes every five minutes.
 */
export default async function HomePage() {
  const sessions = await loadRail();
  return (
    <main className="site-home" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData()) }}
        type="application/ld+json"
      />
      <HomeHero />
      <SessionRail sessions={sessions} />
      <section aria-labelledby="play-title" className="site-wrap site-section">
        <LaterStoryScroller
          heading={
            <>
              <NetLine label="For players" />
              <h2 className="site-h2" id="play-title">
                From finding a game to knowing your level.
              </h2>
            </>
          }
        />
      </section>
      <HoneypotBand />
      <ClubsChapter />
      <PricingTeaser />
      <AppsBand />
      <QuoteSlot />
      <FinalCta />
    </main>
  );
}
