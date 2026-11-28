import "../pages.css";

import { log } from "@duna/observability";
import { RatingRing } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { ConceptRating } from "@/components/site/concepts/concept-rating";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";
import { sitePhotos } from "@/components/site/media";
import { siteOgImage } from "@/components/site/og";
import { PageHero, SectionHead } from "@/components/site/page-parts";
import { RatingStory } from "@/components/site/rating/rating-story";
import { Reveal } from "@/components/site/reveal";
import { ConceptStage } from "@/components/site/stage";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import { createPublicCaller } from "@/lib/public-api";

/** The published evidence changes when a new audited run completes. */
export const revalidate = 3_600;

const title = "Sand Rating";
const description =
  "How the Sand Rating works: what moves it, why a result counts only when both sides confirm it, provisional and established ratings, and the evidence behind it.";
const ogImage = siteOgImage({
  title: "One number for your level, earned on the sand.",
  eyebrow: "Sand Rating",
  concept: "rating",
});

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/sand-rating",
    types: { "text/markdown": "/sand-rating.md" },
  },
  openGraph: {
    title: `${title} · Duna`,
    description,
    url: "/sand-rating",
    siteName: "Duna",
    type: "article",
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · Duna`,
    description,
    images: [ogImage],
  },
};

type RatingLab = Awaited<
  ReturnType<ReturnType<typeof createPublicCaller>["public"]["ratingLab"]>
>;

async function loadLab(): Promise<RatingLab | undefined> {
  try {
    return await createPublicCaller().public.ratingLab();
  } catch (error) {
    // The method section shows its pending state; the page still renders.
    log.warn("site.sandRating.lab.unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return undefined;
  }
}

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function shortDate(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

const MOVES = [
  {
    title: "The result against what was expected",
    body: "Before every match Duna works out how likely each side is to win. Beat a stronger pair and you rise more; lose to a weaker one and you drop more.",
  },
  {
    title: "The score, not only the win",
    body: "Points won count, so a close loss is not the same as a heavy one.",
  },
  {
    title: "Your partner",
    body: "Doubles is not two singles ratings. A team is modelled with extra weight on the weaker partner, because that is who gets served.",
  },
  {
    title: "How sure Duna is",
    body: "A new rating moves quickly and settles as matches add up. Playing the same pair again and again counts for less.",
  },
  {
    title: "A cap on quick gains",
    body: "Gains in a week are capped; losses are not. A hot weekend cannot inflate a number.",
  },
] as const;

const CONFIDENCE = [
  {
    name: "Provisional",
    body: "Too few matches to show a number. The ring is dotted and says how many matches are left.",
  },
  {
    name: "Developing",
    body: "A number with a wide margin. It moves quickly.",
  },
  { name: "Reliable", body: "Settled enough to compare with anyone’s." },
  { name: "Locked", body: "A long record. It moves only with real change." },
] as const;

function structuredData() {
  const page = absolutePublicUrl("/sand-rating");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${page}#article`,
        url: page,
        headline: "How the Sand Rating works",
        description,
        inLanguage: "en-US",
        isPartOf: { "@id": `${absolutePublicUrl("/")}#website` },
        publisher: { "@id": `${absolutePublicUrl("/")}#organization` },
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "text/markdown",
          contentUrl: absolutePublicUrl("/sand-rating.md"),
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
          { "@type": "ListItem", position: 2, name: "Sand Rating", item: page },
        ],
      },
    ],
  };
}

/**
 * Sand Rating (`/sand-rating`, absorbs `/methodology`): one example match
 * told with the real NetScore and RatingRing, what moves the number, what
 * "confirmed by both sides" means, provisional versus established (the
 * provisional ring shows an em dash, brand book §4), and the published
 * walk-forward evidence. Links into search and the signed-in score entry.
 */
export default async function SandRatingPage() {
  const lab = await loadLab();
  const champion = lab?.models.find(
    (model) => model.modelId === lab.championModelId,
  );
  return (
    <main className="site-page-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData()) }}
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <LinkButton arrow href={siteLinks.addScore} variant="primary">
              Add a score
            </LinkButton>
            <LinkButton href={siteLinks.findGame} variant="secondary">
              Find a game
            </LinkButton>
          </>
        }
        id="rating-title"
        label="Sand Rating"
        lead="A number from 1.00 to 8.00 for your level on the sand. It moves only on results both sides agree on, and it says how sure it is."
        stage={
          <ConceptStage
            credit="Generated image · example numbers"
            photo={sitePhotos.partnersLowfive}
            priority
            sizes="(max-width: 1000px) 100vw, 50vw"
          >
            <ConceptRating
              from={3.12}
              label="After this match"
              reliability={2}
              status="Confirmed by both sides"
              to={3.2}
              trigger="first-paint"
            />
          </ConceptStage>
        }
        title="One number for your level, earned on the sand."
      />

      <section
        aria-labelledby="story-title"
        className="site-wrap site-section"
        id="how"
      >
        <SectionHead
          id="story-title"
          label="One match"
          lead="Here is what happens between the last rally and a new number."
          title="Watch a result become a rating."
        />
        <RatingStory />
      </section>

      <section
        aria-labelledby="moves-title"
        className="site-wrap site-section"
        id="moves"
      >
        <SectionHead
          id="moves-title"
          label="What moves it"
          row
          lead="Not wins alone. The rating weighs who you played, how it went and how much it already knows about you."
          title="Every match is a little evidence."
        />
        <Reveal as="ol" className="site-cards" rally>
          {MOVES.map((item, index) => (
            <li key={item.title}>
              <span className="td-num site-cards__n">{index + 1}</span>
              <h3 className="site-h3">{item.title}</h3>
              <p className="site-body">{item.body}</p>
            </li>
          ))}
        </Reveal>
      </section>

      <section
        aria-labelledby="confirm-title"
        className="site-wrap site-section"
        id="confirmed"
      >
        <SectionHead
          id="confirm-title"
          label="Confirmed by both sides"
          title="A result counts when the other side agrees."
        />
        <div className="site-two">
          <Reveal className="site-prose">
            <p className="site-lead">
              Anyone can save a score. It changes nobody’s rating until it is
              confirmed.
            </p>
            <ul className="site-points">
              <li>A saved match waits as “waiting for confirmation”.</li>
              <li>
                A player on each side confirms it, and nobody disputes it. A
                dispute comes with a reason, and the match stays out until it is
                settled.
              </li>
              <li>
                It is a competitive two-on-two match, and every player has a
                claimed profile.
              </li>
              <li>Then, and only then, every player’s rating moves.</li>
            </ul>
          </Reveal>
          <Reveal className="site-ladder-panel">
            <p className="site-label">How sure it is</p>
            <ol className="site-ladder">
              {CONFIDENCE.map((step) => (
                <li key={step.name}>
                  <b>{step.name}</b>
                  <span>{step.body}</span>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section
        aria-labelledby="provisional-title"
        className="site-wrap site-section"
        id="provisional"
      >
        <SectionHead
          id="provisional-title"
          label="Provisional and established"
          title="No number until it means something."
        />
        <div className="site-rings">
          <figure>
            <RatingRing
              animate={false}
              matchesLeft={3}
              reliability={1}
              size={200}
              value={null}
            />
            <figcaption>
              <b>Provisional</b>
              <span>
                A dotted ring and a dash instead of a number, with the matches
                still needed.
              </span>
            </figcaption>
          </figure>
          <figure>
            <RatingRing
              animate={false}
              delta={0.08}
              reliability={3}
              size={200}
              value={3.2}
            />
            <figcaption>
              <b>Established</b>
              <span>
                The number, its last change, and a three-part band for how sure
                it is.
              </span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section
        aria-labelledby="method-title"
        className="site-wrap site-section"
        id="method"
      >
        <SectionHead
          id="method-title"
          label="Why you can trust it"
          lead="Duna replays volleyball history in order. Every model publishes its prediction before it sees the result, then earns its place on accuracy and calibration."
          title="Predict first. Learn second. Prove every gain."
        />
        <Reveal as="ul" className="site-cards site-cards--three" rally>
          <li>
            <h3 className="site-h3">No look-ahead</h3>
            <p className="site-body">
              Ratings are frozen at their pre-match values before the result
              updates them.
            </p>
          </li>
          <li>
            <h3 className="site-h3">Real challengers</h3>
            <p className="site-body">
              Simple baselines, Elo variants and Duna’s own models compete on
              the same matches.
            </p>
          </li>
          <li>
            <h3 className="site-h3">A person promotes</h3>
            <p className="site-body">
              A new model reaches the live rating only after it improves the
              results and a person approves it. Nothing changes it silently.
            </p>
          </li>
        </Reveal>
        {lab && lab.models.length > 0 ? (
          <div className="site-lab">
            <dl className="site-lab__facts">
              <div>
                <dt>Pre-match predictions</dt>
                <dd className="td-num">
                  {lab.matchesProcessed.toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd className="td-num">
                  {lab.playersProcessed.toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt>Matches from</dt>
                <dd className="td-num">
                  {shortDate(lab.dateFrom)} – {shortDate(lab.dateTo)}
                </dd>
              </div>
              {champion ? (
                <div>
                  <dt>Best model’s accuracy</dt>
                  <dd className="td-num">{percentage(champion.accuracy)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="site-table-wrap">
              <table className="site-table">
                <caption>
                  Every model on the same history ({lab.methodologyVersion}).
                  Lower is better for Brier score, log loss and calibration
                  error.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">Brier</th>
                    <th scope="col">Log loss</th>
                    <th scope="col">Calibration</th>
                  </tr>
                </thead>
                <tbody>
                  {lab.models.map((model) => (
                    <tr
                      data-best={
                        model.modelId === lab.championModelId ? "" : undefined
                      }
                      key={model.modelId}
                    >
                      <th scope="row">
                        {model.label}
                        <span className="site-meta">{model.family}</span>
                      </th>
                      <td className="td-num">{percentage(model.accuracy)}</td>
                      <td className="td-num">{model.brierScore.toFixed(4)}</td>
                      <td className="td-num">{model.logLoss.toFixed(4)}</td>
                      <td className="td-num">
                        {model.expectedCalibrationError.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="site-meta">
              The best model is the one with the lowest Brier score in this run,
              with log loss as the tie-breaker. Being best here does not put it
              into the live rating by itself.
            </p>
          </div>
        ) : (
          <div className="site-lab site-lab--pending" role="status">
            <p className="site-h3">
              The first audited run is not published yet.
            </p>
            <p className="site-body">
              The method is live. Its numbers appear here once an audited
              walk-forward run completes.
            </p>
          </div>
        )}
        <dl className="site-glossary">
          <div>
            <dt>Accuracy</dt>
            <dd>
              Share of winners picked above 50%. An exact 50/50 counts as half.
            </dd>
          </div>
          <div>
            <dt>Brier score</dt>
            <dd>Mean squared probability error. 0.25 is a coin flip.</dd>
          </div>
          <div>
            <dt>Log loss</dt>
            <dd>Punishes confident wrong predictions hardest.</dd>
          </div>
          <div>
            <dt>Calibration error</dt>
            <dd>
              The gap between a forecast’s probability and how often it
              happened.
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="rating-close-title"
        className="site-wrap site-section site-section--tight"
      >
        <div className="site-final">
          <p className="site-label">Start yours</p>
          <h2 className="site-h2" id="rating-close-title">
            Play a match. Get a number.
          </h2>
          <div className="site-actions">
            <LinkButton href={siteLinks.findGame} variant="primary">
              Find a game
            </LinkButton>
            <LinkButton href={siteLinks.addScore} variant="secondary">
              Add a score
            </LinkButton>
          </div>
          <ArrowLink href={siteLinks.rankings}>See the rankings</ArrowLink>
        </div>
      </section>
    </main>
  );
}
