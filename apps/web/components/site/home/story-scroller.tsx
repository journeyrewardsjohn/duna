"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConceptFilm } from "../concepts/concept-film";
import { ConceptOpenGame } from "../concepts/concept-open-game";
import { ConceptRating } from "../concepts/concept-rating";
import { ConceptScore } from "../concepts/concept-score";
import { type SitePhoto, sitePhotos } from "../media";
import { PhotoStage } from "../photo-stage";
import { type PlayPhase, useActivatedPhase } from "../use-play-once";

type Concept = "game" | "score" | "ring" | "film";

const STEPS: ReadonlyArray<{
  tag: string;
  title: string;
  body: string;
  photo: SitePhoto;
  concept: Concept;
  video?: string;
}> = [
  {
    tag: "Find",
    title: "Where, when, what. Then you’re in.",
    body: "Search a beach, a gym or “near me”. See open games, clinics and leagues with how many players they still need, and the time the game is confirmed.",
    photo: sitePhotos.friendsWalk,
    concept: "game",
  },
  {
    tag: "Score",
    title: "Keep score with one hand.",
    body: "Big targets, one tap a rally, the server tracked for you. Works on your phone and your watch, even when the signal drops at the beach.",
    photo: sitePhotos.beachAttack,
    concept: "score",
    video: "/site/attack-loop.mp4",
  },
  {
    tag: "Rate",
    title: "Get your Sand Rating.",
    body: "When both sides confirm a result, your Sand Rating moves. The outer ring shows how close you are to the next half point. The inner ring shows how sure we are.",
    photo: sitePhotos.partnersLowfive,
    concept: "ring",
  },
  {
    tag: "Improve",
    title: "Watch it back with your heart rate.",
    body: "Film a match, and Duna marks every rally. Wear your watch and see your effort laid over the video, point by point.",
    photo: sitePhotos.watchRest,
    concept: "film",
  },
];

function ConceptFor({
  concept,
  trigger,
  phase,
}: {
  readonly concept: Concept;
  readonly trigger: "in-view" | "driven";
  readonly phase?: PlayPhase;
}) {
  switch (concept) {
    case "game":
      return <ConceptOpenGame phase={phase} trigger={trigger} />;
    case "score":
      return <ConceptScore phase={phase} trigger={trigger} />;
    case "ring":
      return (
        <ConceptRating
          from={3.12}
          label="After this match"
          phase={phase}
          reliability={2}
          status="Confirmed"
          to={3.2}
          trigger={trigger}
        />
      );
    case "film":
      return <ConceptFilm phase={phase} trigger={trigger} />;
  }
}

/** One slide of the sticky column; its concept plays the first time it is shown. */
function Slide({
  step,
  shown,
  playing,
}: {
  readonly step: (typeof STEPS)[number];
  /** The slide on view (step one before the story is reached). */
  readonly shown: boolean;
  /** The story is on screen and this is its step: play the concept. */
  readonly playing: boolean;
}) {
  const phase = useActivatedPhase(playing);
  return (
    <div
      aria-hidden={!shown}
      className="site-story__slide"
      data-active={shown || undefined}
      inert={!shown}
    >
      <PhotoStage
        className="site-story__frame"
        credit="Generated image · demo data"
        decorative
        photo={step.photo}
        sizes="(max-width: 1000px) 0px, 56vw"
        video={step.video}
        videoActive={playing}
      >
        <div className="site-float site-float--center">
          <ConceptFor concept={step.concept} phase={phase} trigger="driven" />
        </div>
      </PhotoStage>
    </div>
  );
}

/**
 * The player story (spec 3.1 item 4): four steps. On desktop the media column
 * is `position: sticky` (scroll-linked, never scroll-jacked); the active step
 * is the heading nearest the middle of the viewport, and its photograph and
 * concept cross-fade in. On phones each step carries its own photo and
 * concept inline. Before script runs, step one is shown.
 */
export function StoryScroller({ heading }: { readonly heading: ReactNode }) {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(false);
  const steps = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const column = media.current;
    const list = steps.current;
    if (!column || !list) return;
    let frame = 0;
    const pick = () => {
      frame = 0;
      if (column.offsetParent === null) return;
      const box = list.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return;
      setSeen(true);
      const middle = window.innerHeight / 2;
      let best = 0;
      let distance = Number.POSITIVE_INFINITY;
      list.querySelectorAll("h3").forEach((title, index) => {
        const rect = title.getBoundingClientRect();
        const away = Math.abs((rect.top + rect.bottom) / 2 - middle);
        if (away < distance) {
          distance = away;
          best = index;
        }
      });
      setActive(best);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(pick);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="site-story">
      <div className="site-story__head">{heading}</div>
      <div className="site-story__media" ref={media}>
        {STEPS.map((step, index) => (
          <Slide
            key={step.tag}
            playing={seen && active === index}
            shown={active === index}
            step={step}
          />
        ))}
      </div>
      <div className="site-story__steps" ref={steps}>
        {STEPS.map((step, index) => (
          <article
            className="site-story__step"
            data-active={active === index || undefined}
            key={step.tag}
          >
            <p className="site-story__tag">
              <span className="site-label">{step.tag}</span>
              <span aria-hidden="true" className="site-story__tagline" />
            </p>
            <h3 className="site-h3">{step.title}</h3>
            <p className="site-lead">{step.body}</p>
            <PhotoStage
              className="site-story__inline"
              credit="Generated image · demo data"
              photo={step.photo}
              sizes="(max-width: 640px) 100vw, (max-width: 1000px) 90vw, 0px"
            >
              <div className="site-float site-float--center">
                <ConceptFor concept={step.concept} trigger="in-view" />
              </div>
            </PhotoStage>
          </article>
        ))}
      </div>
    </div>
  );
}
