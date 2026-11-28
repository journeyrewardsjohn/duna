import {
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLANS,
  type OrganizationPlanDefinition,
} from "@duna/core";
import { CrestMark } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { ConceptAskDuna } from "../concepts/concept-ask-duna";
import { ConceptDrill } from "../concepts/concept-drill";
import { ConceptMemberPass } from "../concepts/concept-member-pass";
import { ConceptOpenGame } from "../concepts/concept-open-game";
import { ArrowLink, LinkButton } from "../link-button";
import { siteLinks } from "../links";
import { type SitePhoto, sitePhotos } from "../media";
import { NetLine } from "../net-line";
import { PhotoStage } from "../photo-stage";

/* ------------------------------------------------------------------ */
/* Honeypot band (spec 3.1 item 5)                                     */
/* ------------------------------------------------------------------ */

export function HoneypotBand() {
  return (
    <section
      aria-labelledby="honey-title"
      className="site-wrap site-section site-section--tight"
    >
      <div className="td site-honey" data-theme="dark">
        <PhotoStage
          className="site-honey__photo"
          credit="Generated image"
          photo={sitePhotos.digSpray}
          sizes="(max-width: 900px) 100vw, 50vw"
        />
        <div className="site-honey__copy">
          <p className="site-label site-label--dune">No account needed</p>
          <h2 className="site-h2" id="honey-title">
            Played somewhere we don’t know yet?
          </h2>
          <p className="site-lead">
            Add the court and your score. You’ll see where your Sand Rating
            starts, and you can save it to your name when you’re ready.
          </p>
          <ol className="site-honey__steps">
            <li>
              <span>
                <strong>Where you played.</strong> Any beach, park or gym. If it
                isn’t on Duna, add it.
              </span>
            </li>
            <li>
              <span>
                <strong>The score.</strong> Set by set, and who was on each
                side.
              </span>
            </li>
            <li>
              <span>
                <strong>Your first estimate.</strong> It counts once someone on
                the other side confirms.
              </span>
            </li>
          </ol>
          <div>
            <LinkButton arrow href={siteLinks.addScore} variant="primary">
              Add a score
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Clubs chapter (spec 3.1 item 6)                                     */
/* ------------------------------------------------------------------ */

/**
 * A photograph with a concept over it and its words at the bottom on the
 * scrim: the home clubs chapter, and every module on the clubs page. Below
 * 540 px of tile width the concept takes its compact variant (site.css).
 */
export function ConceptTile({
  photo,
  span,
  label,
  title,
  body,
  concept,
  status,
  anchor,
  credit = "Generated image · demo data",
}: {
  readonly photo: SitePhoto;
  readonly span: "wide" | "narrow";
  readonly label: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly concept: ReactNode;
  /** "Live today" / "In build": shown beside the label. */
  readonly status?: ReactNode;
  /** A fragment other pages can link to. */
  readonly anchor?: string;
  readonly credit?: string;
}) {
  return (
    <article className="site-tile" data-span={span} id={anchor}>
      <PhotoStage
        className="site-tile__photo"
        credit={credit}
        photo={photo}
        sizes={
          span === "wide"
            ? "(max-width: 1000px) 100vw, 58vw"
            : "(max-width: 1000px) 100vw, 42vw"
        }
      >
        <div className="site-tile__concept">{concept}</div>
        <div className="td site-tile__copy" data-theme="dark">
          <p className="site-label site-tile__label">
            <span>{label}</span>
            {status}
          </p>
          <h3 className="site-h3">{title}</h3>
          <p>{body}</p>
        </div>
      </PhotoStage>
    </article>
  );
}

export function ClubsChapter() {
  return (
    <section
      aria-labelledby="clubs-title"
      className="site-wrap site-section"
      id="clubs"
    >
      <NetLine label="For clubs and coaches" />
      <div className="site-section__head site-section__head--row">
        <h2 className="site-h2" id="clubs-title">
          The same game, from the other side of the net.
        </h2>
        <p className="site-body">
          Every game a player finds is a session a club ran. Bookings, payments,
          plans and people sit in one place, and you approve every change.
        </p>
      </div>
      <div className="site-tiles">
        <ConceptTile
          body="Members carry one card in their phone’s wallet. On a class day it shows the pass for that class."
          concept={<ConceptMemberPass />}
          label="Memberships"
          photo={sitePhotos.indoorHuddle}
          span="wide"
          title="The membership card turns into tonight’s pass."
        />
        <ConceptTile
          body="Set a minimum and a confirm time. Players see “needs 2 more”, and Duna runs or cancels it on time."
          concept={<ConceptOpenGame view="club" />}
          label="Bookings"
          photo={sitePhotos.courtsFirstLight}
          span="narrow"
          title="Courts, clinics and open games fill themselves."
        />
        <ConceptTile
          body="Practice plans built from a drill library, drawn on a court, with the time for each block."
          concept={<ConceptDrill />}
          label="Programs and drills"
          photo={sitePhotos.coachMorning}
          span="narrow"
          title="Write the week. Run the court."
        />
        <ConceptTile
          body="It notices wind, gaps and clashes, and proposes a change with the before and after. Nothing moves until you approve it."
          concept={<ConceptAskDuna />}
          label="Ask Duna"
          photo={sitePhotos.indoorServe}
          span="wide"
          title="Duna suggests. You decide."
        />
      </div>
      <div className="site-actions">
        <LinkButton arrow href={siteLinks.forClubs} variant="primary">
          See everything Duna runs
        </LinkButton>
        <LinkButton href={siteLinks.pricing} variant="secondary">
          Pricing
        </LinkButton>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing teaser (spec 3.1 item 7): numbers from packages/core only   */
/* ------------------------------------------------------------------ */

function dollars(minor: number) {
  const value = minor / 100;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function percent(bps: number) {
  return `${bps / 100}%`;
}

function feeLine(plan: OrganizationPlanDefinition) {
  return plan.defaultCommissionBps === 0
    ? "no fee"
    : `a ${percent(plan.defaultCommissionBps)} fee`;
}

export function PricingTeaser() {
  const free = ORGANIZATION_PLANS.coach;
  const club = ORGANIZATION_PLANS["small-club"];
  const scale = ORGANIZATION_PLANS.club;
  const premium = MEMBERSHIP_PLANS.premium;
  return (
    <section
      aria-labelledby="price-title"
      className="site-wrap site-section site-section--tight"
    >
      <NetLine
        chip={<span className="site-draft">Draft · owner to confirm</span>}
        label="Pricing"
      />
      <div className="site-section__head">
        <h2 className="site-h2" id="price-title">
          Free to start, on both sides of the net.
        </h2>
      </div>
      <div className="site-plans">
        <article className="site-plan">
          <p className="site-label">Players</p>
          <p className="site-plan__price">
            <span className="td-num">
              {dollars(MEMBERSHIP_PLANS.free.monthlyPriceMinor)}
            </span>
            <span className="site-meta">
              to find, book, score and get rated
            </span>
          </p>
          <p className="site-body">
            Duna {premium.name} removes the service fee on bookings and adds
            more video. From{" "}
            <span className="td-num">{dollars(premium.monthlyPriceMinor)}</span>{" "}
            a month.
          </p>
          <ArrowLink href={siteLinks.pricing}>Player plans</ArrowLink>
        </article>
        <article className="site-plan">
          <p className="site-label">Clubs and coaches</p>
          <p className="site-plan__price">
            <span className="td-num">{dollars(free.monthlyPriceMinor)}</span>
            <span className="site-meta">
              a month on {free.name}, with {feeLine(free)} on sales
            </span>
          </p>
          <p className="site-body">
            {club.name} is{" "}
            <span className="td-num">{dollars(club.monthlyPriceMinor)}</span> a
            month with {feeLine(club)}. {scale.name} is{" "}
            <span className="td-num">{dollars(scale.monthlyPriceMinor)}</span> a
            month with {feeLine(scale)}.
          </p>
          <ArrowLink href={siteLinks.pricing}>Club plans</ArrowLink>
        </article>
      </div>
      <p className="site-meta site-plans__note">
        Prices are drafts until the owner confirms the plans and fees. Payment
        processing is extra.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Apps (spec 3.1 item 8), quote slot (item 9), close (item 10)        */
/* ------------------------------------------------------------------ */

export function AppsBand() {
  return (
    <section
      aria-labelledby="apps-title"
      className="site-wrap site-section site-section--tight"
    >
      <NetLine label="The apps" />
      <div className="site-section__head">
        <h2 className="site-h2" id="apps-title">
          Two apps. One game.
        </h2>
      </div>
      <div className="site-apps">
        <article className="td site-app" data-app="play" data-theme="dark">
          <span aria-hidden="true" className="site-app__icon">
            <CrestMark />
          </span>
          <h3 className="site-h3">Duna</h3>
          <p className="site-body">
            For players and parents. Find games, book, keep score with the
            scorekeeper, get your Sand Rating, carry your membership card in
            your wallet.
          </p>
          <span className="site-app__store">App Store · link coming</span>
        </article>
        <article className="site-app" data-app="pro">
          <span aria-hidden="true" className="site-app__icon">
            <CrestMark />
          </span>
          <h3 className="site-h3">Duna Pro</h3>
          <p className="site-body">
            For coaches and club staff. Your day with the conditions, the plan,
            the roster, the scorer, and getting paid.
          </p>
          <span className="site-app__store">App Store · link coming</span>
        </article>
      </div>
    </section>
  );
}

export interface SiteQuote {
  readonly text: string;
  readonly name: string;
  readonly club: string;
}

/**
 * A real member's words, with their permission, name and club. Renders
 * nothing until the owner supplies one (no invented quotes).
 */
export function QuoteSlot({ quote }: { readonly quote?: SiteQuote }) {
  if (!quote) return null;
  return (
    <section className="site-wrap site-section site-section--tight">
      <figure className="site-quote">
        <blockquote>{quote.text}</blockquote>
        <figcaption>
          {quote.name}, {quote.club}
        </figcaption>
      </figure>
    </section>
  );
}

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-title"
      className="site-wrap site-section site-section--tight"
    >
      <div className="site-final">
        <p className="site-label">Tonight, this weekend, or next month</p>
        <h2 className="site-h2" id="final-title">
          Better by the next rally.
        </h2>
        <div className="site-actions">
          <LinkButton href="#search" variant="primary">
            Find a game
          </LinkButton>
          <LinkButton href={siteLinks.startClub} variant="secondary">
            Start your club free
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
