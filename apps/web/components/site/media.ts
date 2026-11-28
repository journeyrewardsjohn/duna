import type { StaticImageData } from "next/image";
import beachAttack from "@/public/site/beach-attack.webp";
import coachMorning from "@/public/site/coach-morning.webp";
import coachPortrait from "@/public/site/coach-portrait.webp";
import courtsFirstLight from "@/public/site/courts-first-light.webp";
import digSpray from "@/public/site/dig-spray.webp";
import friendsWalk from "@/public/site/friends-walk.webp";
import heroPortrait from "@/public/site/hero-portrait.webp";
import indoorHuddle from "@/public/site/indoor-huddle.webp";
import indoorServe from "@/public/site/indoor-serve.webp";
import partnersLowfive from "@/public/site/partners-lowfive.webp";
import watchRest from "@/public/site/watch-rest.webp";

/**
 * The public site's photographs (generated illustrations of adults; credits in
 * `public/site/CREDITS.md`). They illustrate the sport: never captioned as
 * members, clubs or customers. Static imports give `next/image` the size and
 * a blur placeholder, and let it serve AVIF and WebP at each width.
 */
export interface SitePhoto {
  readonly image: StaticImageData;
  readonly alt: string;
  /** CSS object-position, so the subject stays in frame at every crop. */
  readonly focal: string;
}

export const sitePhotos = {
  heroPortrait: {
    image: heroPortrait,
    alt: "A beach volleyball player rests between rallies in late sun, sand on her shoulder.",
    focal: "30% 50%",
  },
  friendsWalk: {
    image: friendsWalk,
    alt: "Four friends walk across the sand to the courts at sunset.",
    focal: "50% 50%",
  },
  beachAttack: {
    image: beachAttack,
    alt: "A player attacks the ball over the block at golden hour.",
    focal: "50% 40%",
  },
  partnersLowfive: {
    image: partnersLowfive,
    alt: "Two partners touch hands after winning a point.",
    focal: "50% 40%",
  },
  watchRest: {
    image: watchRest,
    alt: "A player checks her watch while resting on the sand.",
    focal: "50% 50%",
  },
  digSpray: {
    image: digSpray,
    alt: "A player dives to dig the ball, sand spraying.",
    focal: "50% 50%",
  },
  indoorHuddle: {
    image: indoorHuddle,
    alt: "An indoor team huddles between sets, a coach with a clipboard beside them.",
    focal: "50% 40%",
  },
  courtsFirstLight: {
    image: courtsFirstLight,
    alt: "Empty beach courts at first light.",
    focal: "50% 50%",
  },
  coachMorning: {
    image: coachMorning,
    alt: "A coach shows two players a passing platform on the beach.",
    focal: "50% 40%",
  },
  indoorServe: {
    image: indoorServe,
    alt: "A player jump-serves in a gym under warm lights.",
    focal: "50% 40%",
  },
  coachPortrait: {
    image: coachPortrait,
    alt: "A beach volleyball coach stands by a net post at sunset with a bag of balls on his shoulder.",
    focal: "50% 22%",
  },
} as const satisfies Record<string, SitePhoto>;
