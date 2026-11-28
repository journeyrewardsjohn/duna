/**
 * The Duna glyph drawings, on a 24 unit grid.
 *
 * Sources, all read from the published design system "Tideline" (bundle.js,
 * Icons / IconFamily / IconRules / LightAndWeather cards), not redrawn:
 *  - the Brand Book 2.0 set (`BRAND` in the 4.0 layer): the four verbs and the
 *    core set, drawn from the board;
 *  - the 3.4.2 icon family (`FAM`): sport, conditions, places, people, product;
 *  - the 4.1.1 extras (`EXTRA`): locate, sidebar, home;
 *  - the light marks (`LightGlyph`, and `docs/design/tideline-4.1.1/assets/
 *    light-*.svg`): four solid shapes plus "too dark";
 *  - the interface set the Tideline library already drew for its own controls.
 *
 * Every line glyph is a list of path strings drawn with one stroke (1.75, square
 * ends, mitred joins, no fill, `currentColor`); see `icon.tsx`. Circles are
 * written as arcs so that every glyph is plain path data.
 *
 * Two glyphs are drawn here on purpose, by owner instruction:
 *  - `media-play`: a true play triangle for media controls. The `play` name
 *    stays the Play verb's own tab icon (a net-and-ball mark), which reads as an
 *    up arrow at small sizes and so must not be used on a media control.
 *  - `map-style`: the neutral "map look" glyph (the system's layers stack) for
 *    the single icon button that switches between map and satellite. The look
 *    you switch to is drawn by `map` and `satellite`.
 */

/** A closed circle as an arc path. */
function disc(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** A line glyph: paths stroked with the family stroke. */
export interface LineGlyph {
  kind: "line";
  paths: readonly string[];
}

/** One shape of a mark. `solid` fills with the ink, `accent` with the warm
 * signal (Hardwood, golden hour), `outline` strokes with the family stroke. */
export interface MarkShape {
  d: string;
  fill: "solid" | "accent" | "outline";
}

/** A mark: solid shapes, used with a text label (the light states). */
export interface MarkGlyph {
  kind: "mark";
  shapes: readonly MarkShape[];
}

export type Glyph = LineGlyph | MarkGlyph;

const line = (...paths: string[]): LineGlyph => ({ kind: "line", paths });

const CUP = "M6.5 12.5v4a5 5 0 0 0 5 5h1.5a5 5 0 0 0 5-5v-4";

/** The horizon bar the four light marks share. */
const HORIZON = "M2 14h20v2.5H2Z";

export const glyphGroups = {
  /** The four navigation verbs: Find, Play, Improve, Connect. */
  verbs: {
    find: line(disc(12, 8.5, 5), "M12 13.5V21"),
    play: line(
      "M12 12V21",
      "M3.5 16A8.5 8.5 0 0 1 20.5 16",
      disc(12, 4.5, 1.75),
    ),
    improve: line(
      "M4 21V20",
      "M4 20A4 4 0 0 1 8 16",
      "M4 20A10 10 0 0 1 14 10",
      "M4 20A16 16 0 0 1 20 4",
    ),
    connect: line(disc(8.5, 12, 5.5), disc(15.5, 12, 5.5)),
  },
  /** The Brand Book 2.0 core set. */
  core: {
    indoor: line("M3 6H21V18H3Z", "M12 6V18M8 6V18M16 6V18"),
    beach: line("M2 19A7 7 0 0 1 12 15A7 7 0 0 0 22 13", disc(16.5, 6.5, 2.75)),
    rating: line(
      "M3.5 17A8.5 8.5 0 0 1 20.5 17",
      "M12 17L16.5 9.5",
      "M3.5 17H20.5",
    ),
    schedule: line("M4 5H20V20H4Z", "M4 10H20M8 2.5V7M16 2.5V7"),
    message: line("M4 5H20V16H10L4 20.5Z"),
    partner: line(
      disc(8.5, 7.5, 3.25),
      "M2.5 20A6 6 0 0 1 14.5 20",
      "M15 5A3 3 0 0 1 15 11",
      "M17 14.5A5.5 5.5 0 0 1 21.5 20",
    ),
    film: line("M2.5 6H15.5V18H2.5Z", "M15.5 10.5L21.5 7V17L15.5 13.5"),
    pay: line("M3 6H21V18H3Z", "M3 10.5H21M6.5 14.5H11"),
  },
  /** Map looks: the look you switch to, and the neutral glyph for the button. */
  map: {
    map: line("M3 6L9 4L15 6L21 4V18L15 20L9 18L3 20Z", "M9 4V18M15 6V20"),
    satellite: line(
      "M9.5 9.5H14.5V14.5H9.5Z",
      "M2.5 9H7.5V15H2.5ZM16.5 9H21.5V15H16.5Z",
      "M7.5 12H9.5M14.5 12H16.5M12 14.5V18M9.5 20.5H14.5",
    ),
    "map-style": line("M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"),
    locate: line(
      "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3",
      disc(12, 12, 6.5),
      disc(12, 12, 2),
    ),
  },
  /** Media controls. */
  media: {
    "media-play": line("M7 4.5V19.5L19.5 12Z"),
  },
  /** Light states: always paired with a text label, never colour alone. */
  light: {
    "first-light": {
      kind: "mark",
      shapes: [
        { d: "M7 12A5 5 0 0 1 17 12Z", fill: "solid" },
        { d: HORIZON, fill: "solid" },
      ],
    },
    "full-sun": {
      kind: "mark",
      shapes: [
        { d: disc(12, 7.5, 4.5), fill: "solid" },
        { d: HORIZON, fill: "solid" },
      ],
    },
    "golden-hour": {
      kind: "mark",
      shapes: [
        { d: "M4 12A8 8 0 0 1 20 12Z", fill: "accent" },
        { d: HORIZON, fill: "solid" },
      ],
    },
    "under-lights": {
      kind: "mark",
      shapes: [
        { d: "M2 7.5h20V10H2Z", fill: "solid" },
        { d: "M4 12A8 8 0 0 0 20 12Z", fill: "solid" },
      ],
    },
    "too-dark": {
      kind: "mark",
      shapes: [
        { d: "M2 7.5h20V10H2Z", fill: "solid" },
        { d: "M4.9 12.9A7.1 7.1 0 0 0 19.1 12.9Z", fill: "outline" },
      ],
    },
  } satisfies Record<string, MarkGlyph>,
  /** Weather and conditions. */
  conditions: {
    wind: line("M3 9h10a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h6"),
    "wind-strong": line("M3 9h10a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h17"),
    gust: line("M3 7h12M3 12h16M15.5 8.5L19 12l-3.5 3.5M3 17h9"),
    rain: line(
      "M7 14h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 6.6 3.7 3.7 0 0 0 7 14zM9 17.5l-1 3M13 17.5l-1 3M17 17.5l-1 3",
    ),
    heat: line(
      "M9 13.5V5.5a2.5 2.5 0 1 1 5 0v8a4 4 0 1 1-5 0zM11.5 16v-4M18.5 5c1 1.2 1 2.3 0 3.5s-1 2.3 0 3.5",
    ),
    uv: line(
      disc(12, 12, 3),
      "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M7 7l1 1M16 16l1 1M7 17l1-1M16 8l1-1",
    ),
    lightning: line("M13.5 2.5L6 13.5h5.5L10 21.5l8-11h-5.5z"),
  },
  /** Sport. */
  sport: {
    net: line(
      "M4 21V4.5M20 21V4.5M4 6.5h16M4 8.5h16M4 14c5 1.6 11 1.6 16 0M9.3 8.5v6.3M14.7 8.5v6.3M2.5 21h3M18.5 21h3",
    ),
    court: line(
      "M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM4 12h16",
    ),
    ball: line(
      "M14.5 3a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M11 4c2.6 1.9 3.9 5.6 3.1 11.6M20.6 7.3c-3.2 2.2-7.6 2.8-11.6 1.7M4.6 14.6A10.5 10.5 0 0 0 9.6 19.4M2.6 17.6A13 13 0 0 0 5.4 20.6",
    ),
    serve: line(
      "M6 21c0-7.5 4-12.5 9.5-14M17.5 2.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
    ),
    set: line(
      "M12 2a2.3 2.3 0 1 0 0 4.6a2.3 2.3 0 1 0 0-4.6M12 10.8a2 2 0 1 0 0 4a2 2 0 1 0 0-4M7 21.5c0-2.9 2.2-4.7 5-4.7s5 1.8 5 4.7M7.8 17.8L5.5 10.5l2.6-3.2M16.2 17.8l2.3-7.3-2.6-3.2",
    ),
    dig: line(
      "M12 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M4.5 18L12 12.5l7.5 5.5M12 21v-2",
    ),
    block: line(
      "M7 12V6.5M10.33 12V4.5M13.67 12V4.5M17 12V6.5M5.5 12h13M3.5 16h17M3.5 20h17",
    ),
    attack: line("M5 4l10.5 10.5M15.5 14.5V8.5M15.5 14.5h-6M3.5 20h17"),
    rally: line(
      "M3.5 15C6 8.5 11 6 16 6.5M18.5 4.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 14v6.5M8 20.5h8",
    ),
    "side-switch": line(
      "M4 8h15M15.5 4.5L19 8l-3.5 3.5M20 16H5M8.5 12.5L5 16l3.5 3.5",
    ),
    timeout: line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 8.5h8M12 8.5V17"),
    whistle: line(
      "M4 10h10a5 5 0 1 1-4.6 7H8a4 4 0 0 1-4-4zM14 10V6.5h4.5M14 15h.01",
    ),
    score: line(
      "M4 5.5h5.5A1.5 1.5 0 0 1 11 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5zM14.5 5.5H20A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5h-5.5A1.5 1.5 0 0 1 13 17V7a1.5 1.5 0 0 1 1.5-1.5zM5 10.2a1.8 1.8 0 0 1 3.5.5c0 1.5-3.5 3-3.5 4.8h3.6M16 10l1.6-1.3v6.8",
    ),
    "set-won": line("M6 21V3.5M6 4h11l-2.5 4 2.5 4H6M9 8l1.5 1.5L13 7"),
    "match-point": line(
      "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 12h.01",
    ),
    sand: line(
      "M3 15c3-2 5-2 8 0s5 2 10-1M3 19c3-2 5-2 8 0s5 2 10-1M14 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0",
    ),
    level: line("M5 19v-4M10 19v-8M15 19V9M20 19V5"),
    flame: line(
      "M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z",
    ),
    tide: line("M3 16c4 0 6-6 10-6s5 4 8 4M3 20h18"),
  },
  /** Referee hand signals: a palm, fingers by meaning. */
  signals: {
    "signal-line": line(
      CUP,
      "M6.5 12.5h3.5M14 12.5h4M10 12.5V4.5a2 2 0 0 1 4 0v8",
    ),
    "signal-angle": line(
      CUP,
      "M6.5 12.5h2.3M15.3 12.5h2.7M8.8 12.5L7.6 5.4a1.6 1.6 0 0 1 3.1-.6l1.3 6.4l1.3-6.4a1.6 1.6 0 0 1 3.1.6l-1.1 7.1",
    ),
    "signal-no-block": line(
      "M6.5 10.5c0-1.6 1-2.5 2.2-2.5s2.2.9 2.2 2.5M10.9 10.5c0-1.6 1-2.5 2.2-2.5s2.2.9 2.2 2.5M15.3 10.5c0-1.4.9-2.2 2-2.2s2 .8 2 2.2V15a6 6 0 0 1-6 6h-2.6a5 5 0 0 1-4.9-4V10.5M6.5 13.5h5a1.6 1.6 0 0 0 0-3.2",
    ),
    "signal-ball": line(
      CUP,
      "M6.5 12.5V8a1.25 1.25 0 0 1 2.5 0v4.5M9 12V5.2a1.25 1.25 0 0 1 2.5 0V12M11.5 12V4.5a1.25 1.25 0 0 1 2.5 0V12M14 12V5.5a1.25 1.25 0 0 1 2.5 0v7M16.5 12.5V9a1.25 1.25 0 0 1 2.5 0v4",
    ),
    "signal-switch": line(
      CUP,
      "M6.5 12.5h3.5M14 12.5h4M10 12.5V8a3 3 0 0 1 3-3h5.5M16.5 2.5L19 5l-2.5 2.5",
    ),
  },
  /** Places and booking. */
  places: {
    venue: line("M4 21V9.5L12 4l8 5.5V21M9.5 21v-6h5v6M2.5 21h19"),
    "lit-court": line(
      "M4 11h16v9.5H4zM12 11v9.5M12 3v3.5M6.5 4.5l1.5 2.5M17.5 4.5L16 7",
    ),
    "court-free": line(
      "M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM8.5 12.5l2.5 2.5 4.5-5",
    ),
    "court-taken": line(
      "M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3zM9 9.5l6 6M15 9.5l-6 6",
    ),
    layout: line("M6 3h12v18H6zM6 12h12M2.5 7.5v9M21.5 7.5v9"),
    pin: line(
      "M12 21.5s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 8a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
    ),
    directions: line(
      "M12 2.5l9.5 9.5-9.5 9.5L2.5 12zM9 15v-3a1.5 1.5 0 0 1 1.5-1.5H15M13 8.5l2 2-2 2",
    ),
    "approved-player": line(
      "M9 3.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M3 20.5c.6-3.6 3-6 6-6 1.6 0 3 .6 4 1.6M15 18l2 2 4-4.5",
    ),
    waiver: line(
      "M6.5 3H15l4 4v14H6.5zM15 3v4h4M9.5 16.5c1.5-2.5 2.5-2.5 3 0s1.5 2.5 3 0",
    ),
    policy: line(
      "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 10h6M9 13.5h4",
    ),
    key: line(
      "M7.5 6a4 4 0 1 0 0 8a4 4 0 1 0 0-8M11.5 10H21M18 10v3.5M15 10v2.5",
    ),
    "clock-window": line(
      "M12 4a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17M12 8.5V12.5l3 2M8.5 1.5h7",
    ),
    home: line("M4 11l8-6.5L20 11M6.5 9.5V19h11V9.5"),
    sidebar: line("M4 5h16v14H4zM9.5 5v14"),
  },
  /** People and things. */
  people: {
    coach: line(
      "M10 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M3.5 20.5c.7-3.6 3.3-6 6.5-6 1.2 0 2.3.3 3.2.9M16.5 14.5h4v3a2 2 0 1 1-4 0z",
    ),
    player: line(
      "M9.5 3.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M3 20.5c.7-3.6 3.3-6 6.5-6 1.4 0 2.7.4 3.7 1.2M18.5 14a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
    ),
    you: line(
      "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4.5 20c.8-3.6 3.9-6 7.5-6s6.7 2.4 7.5 6",
    ),
    "junior-guardian": line(
      "M8 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6M2.5 20.5c.5-4.2 2.6-7 5.5-7s5 2.8 5.5 7M17 10.5a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4M14.5 20.5c.3-2.6 1.2-4 2.5-4s2.2 1.4 2.5 4",
    ),
    "member-card": line(
      "M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5zM8 9.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3M12 10h5M12 14h3",
    ),
    wallet: line(
      "M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V6a2 2 0 0 1 2-2h10.5M16.5 14h.01",
    ),
    pass: line("M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 6v12"),
    "credit-pack": line(
      "M12 3.5c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6.5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5M4 11.5v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5",
    ),
    podium: line(
      "M2.5 20.5h19M9 20.5V9h6v11.5M3.5 20.5V14H9M15 20.5V12h5.5v8.5",
    ),
    trophy: line(
      "M8 3.5h8v5a4 4 0 0 1-8 0zM8 5.5H5a3 3 0 0 0 3 4M16 5.5h3a3 3 0 0 1-3 4M12 12.5v4M8.5 20.5h7M10 16.5h4",
    ),
    medal: line(
      "M12 21a5 5 0 1 0 0-10a5 5 0 1 0 0 10M9 11.5L6 3h4l2 5M15 11.5L18 3h-4l-2 5M12 14.5v3",
    ),
    hydrate: line(
      "M10 2.5h4v3h-4zM9 5.5h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2zM7 12h10",
    ),
    verified: line(
      "M12 3l2.3 1.7 2.8-.2.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.2L12 21l-2.3-1.7-2.8.2-.9-2.7L3.7 15.2l.9-2.7-.9-2.7L6 8.2l.9-2.7 2.8.2zM8.5 12l2.5 2.5 4.5-5",
    ),
    "tap-to-pay": line(
      "M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM10 17h4M10.5 9.5a3 3 0 0 1 3 0M9 7.5a6 6 0 0 1 6 0M11.5 11.5h1",
    ),
  },
  /** Product. */
  product: {
    lesson: line(
      "M8.5 3.5h7v3h-7zM7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17M8 12h8M8 16h5",
    ),
    clinic: line(
      "M12 2.5a2.3 2.3 0 1 0 0 4.6a2.3 2.3 0 1 0 0-4.6M7.5 12.5c.5-2.4 2.2-3.8 4.5-3.8s4 1.4 4.5 3.8M5.5 13.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M18.5 13.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M2 21.5c.4-1.9 1.7-3 3.5-3s3.1 1.1 3.5 3M15 21.5c.4-1.9 1.7-3 3.5-3s3.1 1.1 3.5 3",
    ),
    tournament: line(
      "M3 5h5v4.5M3 9.5h5M3 14.5h5V19M3 19h5M8 7.5h4.5v9H8M12.5 12h8.5",
    ),
    league: line(
      "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM5.5 10.5h13M8 15h8",
    ),
    highlight: line("M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"),
    "heart-rate": line("M2.5 12.5h4l2.5-6 4.5 11 2.5-5h5.5"),
    watch: line(
      "M8 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 7l1-4h4l1 4M9 17l1 4h4l1-4M9.5 12h2l1-2 1 4 1-2",
    ),
    timer: line(
      "M12 7a7 7 0 1 0 0 14a7 7 0 1 0 0-14M12 11v3.5M9.5 2.5h5M12 2.5V7M18 6.5l1.5-1.5",
    ),
    thread: line(
      "M4.5 4h10A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3h-.5A1.5 1.5 0 0 1 3 11.5v-6A1.5 1.5 0 0 1 4.5 4zM16 8.5h3.5A1.5 1.5 0 0 1 21 10v6a1.5 1.5 0 0 1-1.5 1.5H19v3l-4-3h-3",
    ),
    mail: line(
      "M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5zM3.5 7l8.5 6 8.5-6",
    ),
    "phone-bubble": line(
      "M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5zM8.5 12h.01M12 12h.01M15.5 12h.01",
    ),
    send: line("M4 12L20.5 4 14 20.5l-2.5-6.5z"),
    undo: line("M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"),
  },
  /**
   * The interface set the Tideline library already drew for its own controls
   * (check, chevrons, close and the rest). Kept as they were so every existing
   * `Icon` call keeps its drawing.
   */
  interface: {
    check: line("M5 12.5l4.5 4.5L19 7.5"),
    minus: line("M6 12h12"),
    plus: line("M12 5v14M5 12h14"),
    close: line("M6 6l12 12M18 6L6 18"),
    "chevron-down": line("M6 9l6 6 6-6"),
    "chevron-left": line("M15 6l-6 6 6 6"),
    "chevron-right": line("M9 6l6 6-6 6"),
    search: line("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.8-3.8"),
    clock: line("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"),
    info: line("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01"),
    alert: line("M12 4l9 15.5H3L12 4zM12 10v4.5M12 17h.01"),
    success: line(
      "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.8 2.8L16 9.8",
    ),
    more: line("M6 12h.01M12 12h.01M18 12h.01"),
    "user-plus": line(
      "M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 20a7 7 0 0 1 11.5-5.4M18 14v6M15 17h6",
    ),
    command: line(
      "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z",
    ),
    sort: line("M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"),
    filter: line("M4 6h16M7 12h10M10 18h4"),
    users: line(
      "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 20a7 7 0 0 1 14 0M16 4.3a4 4 0 0 1 0 7.4M18.5 14.5A7 7 0 0 1 22 20",
    ),
  },
} satisfies Record<string, Record<string, Glyph>>;

/**
 * Names from earlier system versions that still resolve ("every 3.4 name still
 * resolves"): they draw the Brand Book glyph that replaced them.
 */
export const glyphAliases = {
  calendar: "schedule",
  session: "schedule",
  video: "film",
  bubble: "message",
  chat: "message",
  team: "partner",
  card: "pay",
  sun: "full-sun",
  sunrise: "first-light",
  sunset: "golden-hour",
  "lights-on": "under-lights",
} as const;
