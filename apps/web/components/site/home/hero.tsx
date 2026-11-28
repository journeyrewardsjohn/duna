import { Rally } from "@duna/ui/tideline";
import { ConceptRating } from "../concepts/concept-rating";
import { ArrowLink } from "../link-button";
import { siteLinks } from "../links";
import { sitePhotos } from "../media";
import { PhotoStage } from "../photo-stage";
import { SearchCard } from "../search/search-card";

/** The example Sand Rating on the hero card (labelled "Example" on the card). */
const HERO_RATING = { from: 3.12, to: 3.2, reliability: 2 } as const;
const HERO_STATS = [
  { label: "Matches", value: "23" },
  { label: "Won", value: "14" },
  { label: "Next half", value: "3.50" },
] as const;

/**
 * The first screen (spec 2.3): title, promise and search on the left, the
 * photograph with the Sand Rating card on the right. Everything on it Rises
 * with CSS alone from the first paint; nothing waits for script. On phones
 * the photo moves under the search.
 */
export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className="site-wrap site-hero">
      <Rally className="site-hero__copy">
        <p className="site-label">Beach and indoor volleyball</p>
        <h1 className="site-display" id="home-title">
          Meet you at the net.
        </h1>
        <p className="site-lead">
          Find a game tonight, keep score on your phone, and watch your Sand
          Rating grow. Clubs and coaches run their whole week on Duna.
        </p>
        <div>
          <SearchCard />
        </div>
        <div className="site-hero__links">
          <ArrowLink href={siteLinks.addScore}>
            Played somewhere? Add your score
          </ArrowLink>
          <ArrowLink href="#clubs">Run a club or coach? Start free</ArrowLink>
        </div>
      </Rally>
      <PhotoStage
        className="site-hero__photo td-rise"
        credit="Generated image · demo numbers"
        photo={sitePhotos.heroPortrait}
        priority
        sizes="(max-width: 1000px) 100vw, 58vw"
        video="/site/hero-loop.mp4"
      >
        <span aria-hidden="true" className="site-hero__net" />
        <div className="site-hero__float">
          <ConceptRating
            from={HERO_RATING.from}
            label="After tonight"
            reliability={HERO_RATING.reliability}
            stats={HERO_STATS}
            status="Confirmed by both sides"
            to={HERO_RATING.to}
            trigger="first-paint"
          />
        </div>
      </PhotoStage>
    </section>
  );
}
