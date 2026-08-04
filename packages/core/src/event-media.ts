import type { EventKind } from "./types";

export interface DunaEventMedia {
  readonly id: string;
  readonly title: string;
  readonly alt: string;
  readonly path: string;
  readonly kinds: readonly EventKind[];
}

const pathFor = (id: string) => `/media/event-library/duna-event-${id}.webp`;

export const DUNA_EVENT_MEDIA: readonly DunaEventMedia[] = [
  {
    id: "sunrise-tournament",
    title: "First light",
    alt: "Beach volleyball tournament rally at sunrise",
    path: pathFor("sunrise-tournament"),
    kinds: ["tournament", "league"],
  },
  {
    id: "night-league",
    title: "Under the lights",
    alt: "Beach volleyball league rally under court lights",
    path: pathFor("night-league"),
    kinds: ["league", "tournament", "open-play"],
  },
  {
    id: "womens-championship",
    title: "Full extension",
    alt: "Women's beach volleyball player diving for a ball",
    path: pathFor("womens-championship"),
    kinds: ["tournament", "league", "clinic"],
  },
  {
    id: "mens-open",
    title: "Power serve",
    alt: "Beach volleyball player jump serving in competition",
    path: pathFor("mens-open"),
    kinds: ["tournament", "league", "clinic"],
  },
  {
    id: "coed-social",
    title: "Play together",
    alt: "Coed beach volleyball players celebrating a point",
    path: pathFor("coed-social"),
    kinds: ["open-play", "pickup", "league"],
  },
  {
    id: "junior-clinic",
    title: "Next generation",
    alt: "Youth beach volleyball clinic on a bright morning",
    path: pathFor("junior-clinic"),
    kinds: ["clinic", "private-lesson"],
  },
  {
    id: "elite-clinic",
    title: "Read the game",
    alt: "Advanced beach volleyball clinic at the net",
    path: pathFor("elite-clinic"),
    kinds: ["clinic", "private-lesson"],
  },
  {
    id: "private-coaching",
    title: "One more rep",
    alt: "Private beach volleyball coaching session",
    path: pathFor("private-coaching"),
    kinds: ["private-lesson", "clinic"],
  },
  {
    id: "grass-tournament",
    title: "Summer grass",
    alt: "Grass volleyball tournament in a coastal park",
    path: pathFor("grass-tournament"),
    kinds: ["tournament", "league", "open-play"],
  },
  {
    id: "indoor-sand",
    title: "Inside the lines",
    alt: "Indoor sand volleyball facility during a rally",
    path: pathFor("indoor-sand"),
    kinds: ["court-rental", "league", "clinic"],
  },
  {
    id: "beach-sixes",
    title: "Sixes on sand",
    alt: "Six-person beach volleyball match by the ocean",
    path: pathFor("beach-sixes"),
    kinds: ["tournament", "league", "open-play"],
  },
  {
    id: "king-of-the-beach",
    title: "King of the beach",
    alt: "King of the beach volleyball attack at the net",
    path: pathFor("king-of-the-beach"),
    kinds: ["tournament", "open-play"],
  },
  {
    id: "queen-of-the-beach",
    title: "Queen of the beach",
    alt: "Queen of the beach volleyball competition",
    path: pathFor("queen-of-the-beach"),
    kinds: ["tournament", "open-play"],
  },
  {
    id: "junior-showcase",
    title: "Showcase day",
    alt: "Multiple junior beach volleyball courts in play",
    path: pathFor("junior-showcase"),
    kinds: ["tournament", "clinic", "league"],
  },
  {
    id: "golden-hour-pickup",
    title: "Golden hour",
    alt: "Beach volleyball pickup at golden hour",
    path: pathFor("golden-hour-pickup"),
    kinds: ["pickup", "open-play", "court-rental"],
  },
  {
    id: "oceanfront-finals",
    title: "Final point",
    alt: "Oceanfront beach volleyball final in a full stadium",
    path: pathFor("oceanfront-finals"),
    kinds: ["tournament", "league"],
  },
  {
    id: "community-huddle",
    title: "The people you meet",
    alt: "Beach volleyball community joining hands after play",
    path: pathFor("community-huddle"),
    kinds: ["open-play", "pickup", "clinic"],
  },
  {
    id: "court-rental",
    title: "Your court is ready",
    alt: "Freshly prepared beach volleyball court at sunrise",
    path: pathFor("court-rental"),
    kinds: ["court-rental", "private-lesson"],
  },
  {
    id: "wellness-warmup",
    title: "Before first serve",
    alt: "Volleyball athletes warming up beside the court",
    path: pathFor("wellness-warmup"),
    kinds: ["clinic", "open-play", "private-lesson"],
  },
  {
    id: "weather-training",
    title: "Any forecast",
    alt: "Beach volleyball practice under dramatic coastal clouds",
    path: pathFor("weather-training"),
    kinds: ["clinic", "league", "open-play"],
  },
] as const;

export function eventMediaForKind(kind: EventKind): readonly DunaEventMedia[] {
  const matched = DUNA_EVENT_MEDIA.filter((item) => item.kinds.includes(kind));
  return [
    ...matched,
    ...DUNA_EVENT_MEDIA.filter((item) => !matched.includes(item)),
  ];
}

export function defaultEventMedia(kind: EventKind, seed = ""): DunaEventMedia {
  const choices = eventMediaForKind(kind);
  const hash = [...seed].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    kind.length,
  );
  return choices[hash % choices.length] ?? DUNA_EVENT_MEDIA[0]!;
}
