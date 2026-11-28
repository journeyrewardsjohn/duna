"use client";

/**
 * The public site's islands below the first screen, hydrated after it has
 * settled (`deferHydration`): the server still renders each one in full, so
 * the page looks and reads the same from the first byte; only its script
 * waits. A page's hero keeps the eager component.
 *
 * Each import is type-only or dynamic, so none of these lands in a page's
 * first-view script. See docs/design/website-performance.md §7.
 */
import type { ComponentProps } from "react";
import type { ConceptAskDuna } from "./concepts/concept-ask-duna";
import type { ConceptConcierge } from "./concepts/concept-concierge";
import type { ConceptDrill } from "./concepts/concept-drill";
import type { ConceptFilm } from "./concepts/concept-film";
import type { ConceptMemberPass } from "./concepts/concept-member-pass";
import type { ConceptOpenGame } from "./concepts/concept-open-game";
import type { ConceptPayout } from "./concepts/concept-payout";
import type { ConceptRating } from "./concepts/concept-rating";
import type { ConceptScore } from "./concepts/concept-score";
import type { ConceptSetupRead } from "./concepts/concept-setup-read";
import type { ConceptTeamWeek } from "./concepts/concept-team-week";
import type { ConceptWatch } from "./concepts/concept-watch";
import { deferHydration } from "./defer-hydration";
import type { StoryScroller } from "./home/story-scroller";
import type { PlayerFinder } from "./pro/player-finder";

export const LaterConceptAskDuna = deferHydration<
  ComponentProps<typeof ConceptAskDuna>
>(() =>
  import("./concepts/concept-ask-duna").then((module) => module.ConceptAskDuna),
);

export const LaterConceptConcierge = deferHydration<
  ComponentProps<typeof ConceptConcierge>
>(() =>
  import("./concepts/concept-concierge").then(
    (module) => module.ConceptConcierge,
  ),
);

export const LaterConceptDrill = deferHydration<
  ComponentProps<typeof ConceptDrill>
>(() =>
  import("./concepts/concept-drill").then((module) => module.ConceptDrill),
);

export const LaterConceptFilm = deferHydration<
  ComponentProps<typeof ConceptFilm>
>(() => import("./concepts/concept-film").then((module) => module.ConceptFilm));

export const LaterConceptMemberPass = deferHydration<
  ComponentProps<typeof ConceptMemberPass>
>(() =>
  import("./concepts/concept-member-pass").then(
    (module) => module.ConceptMemberPass,
  ),
);

export const LaterConceptOpenGame = deferHydration<
  ComponentProps<typeof ConceptOpenGame>
>(() =>
  import("./concepts/concept-open-game").then(
    (module) => module.ConceptOpenGame,
  ),
);

export const LaterConceptPayout = deferHydration<
  ComponentProps<typeof ConceptPayout>
>(() =>
  import("./concepts/concept-payout").then((module) => module.ConceptPayout),
);

export const LaterConceptRating = deferHydration<
  ComponentProps<typeof ConceptRating>
>(() =>
  import("./concepts/concept-rating").then((module) => module.ConceptRating),
);

export const LaterConceptScore = deferHydration<
  ComponentProps<typeof ConceptScore>
>(() =>
  import("./concepts/concept-score").then((module) => module.ConceptScore),
);

export const LaterConceptSetupRead = deferHydration<
  ComponentProps<typeof ConceptSetupRead>
>(() =>
  import("./concepts/concept-setup-read").then(
    (module) => module.ConceptSetupRead,
  ),
);

export const LaterConceptTeamWeek = deferHydration<
  ComponentProps<typeof ConceptTeamWeek>
>(() =>
  import("./concepts/concept-team-week").then(
    (module) => module.ConceptTeamWeek,
  ),
);

export const LaterConceptWatch = deferHydration<
  ComponentProps<typeof ConceptWatch>
>(() =>
  import("./concepts/concept-watch").then((module) => module.ConceptWatch),
);

export const LaterStoryScroller = deferHydration<
  ComponentProps<typeof StoryScroller>
>(() => import("./home/story-scroller").then((module) => module.StoryScroller));

export const LaterFeeCalculator = deferHydration<Record<string, never>>(() =>
  import("./pricing/fee-calculator").then((module) => module.FeeCalculator),
);

export const LaterPlayerFinder = deferHydration<
  ComponentProps<typeof PlayerFinder>
>(() => import("./pro/player-finder").then((module) => module.PlayerFinder));

export const LaterRatingStory = deferHydration<Record<string, never>>(() =>
  import("./rating/rating-story").then((module) => module.RatingStory),
);
