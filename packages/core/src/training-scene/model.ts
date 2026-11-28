/**
 * Drill scene model v2: units, courts, net presets, verbs and limits. Pure
 * data, ported from the Drill Studio prototype (`src/model.js`).
 *
 * Coordinate system (metres): origin at the centre of the net on the floor.
 *   x runs along the net (side A's right hand is +x),
 *   y runs across the net (side A is y < 0, side B is y > 0),
 *   z is up.
 */

export const TRAINING_SCENE_SCHEMA_ID = "duna.drill/2";
export const TRAINING_SCENE_MODEL_VERSION = 2;
export const TRAINING_SCENE_VALIDATOR_VERSION = "2.0.0";
/** A scene is stored as jsonb on every drill version: keep it small. */
export const TRAINING_SCENE_MAX_BYTES = 65_536;
export const TRAINING_SCENE_MAX_DEPTH = 12;
export const TRAINING_SCENE_MAX_PEOPLE = 40;
export const TRAINING_SCENE_MAX_SLOTS = 40;
export const TRAINING_SCENE_MAX_STEPS = 60;
export const TRAINING_SCENE_MAX_ACTIONS_PER_STEP = 12;
/** Balls, equipment, supply and zones each. */
export const TRAINING_SCENE_MAX_THINGS = 40;

export const G = 9.81; // m/s²
/** FIVB ball circumference 65–67 cm ⇒ diameter ≈ 0.21 m. */
export const BALL_RADIUS = 0.105;

export type CourtType =
  "beach" | "indoor" | "beach-half" | "indoor-half" | "none";

export interface CourtSpec {
  readonly id: CourtType;
  readonly discipline: "beach" | "indoor" | "any";
  readonly length: number;
  readonly width: number;
  readonly attackLine: number | null;
  readonly freeZone: number;
  readonly netLength: number;
  readonly postOffset: number;
  readonly surface: "sand" | "hard";
  readonly half?: boolean;
  readonly noCourt?: boolean;
  readonly label: string;
}

export const COURTS: Readonly<Record<CourtType, CourtSpec>> = {
  beach: {
    id: "beach",
    discipline: "beach",
    length: 16,
    width: 8,
    attackLine: null,
    freeZone: 3,
    netLength: 8.5,
    postOffset: 0.85,
    surface: "sand",
    label: "Beach court, 16 × 8 m, no attack line",
  },
  indoor: {
    id: "indoor",
    discipline: "indoor",
    length: 18,
    width: 9,
    attackLine: 3,
    freeZone: 3,
    netLength: 9.5,
    postOffset: 0.75,
    surface: "hard",
    label: "Indoor court, 18 × 9 m, attack lines 3 m from the net",
  },
  "beach-half": {
    id: "beach-half",
    discipline: "beach",
    length: 16,
    width: 8,
    attackLine: null,
    freeZone: 3,
    netLength: 8.5,
    postOffset: 0.85,
    surface: "sand",
    half: true,
    label: "Beach half-court (side A in use)",
  },
  "indoor-half": {
    id: "indoor-half",
    discipline: "indoor",
    length: 18,
    width: 9,
    attackLine: 3,
    freeZone: 3,
    netLength: 9.5,
    postOffset: 0.75,
    surface: "hard",
    half: true,
    label: "Indoor half-court (side A in use)",
  },
  none: {
    id: "none",
    discipline: "any",
    length: 16,
    width: 8,
    attackLine: null,
    freeZone: 3,
    netLength: 0,
    postOffset: 0,
    surface: "sand",
    noCourt: true,
    label: "No court: open space, drawn on a 16 × 8 m frame",
  },
};

export function isCourtType(value: unknown): value is CourtType {
  return typeof value === "string" && Object.hasOwn(COURTS, value);
}

/** Net heights. `certainty` is how sure we are, not a legal citation. */
export const NET_PRESETS = {
  men: { height: 2.43, label: "Men", certainty: "known" },
  women: { height: 2.24, label: "Women", certainty: "known" },
  "boys-youth": {
    height: 2.35,
    label: "Boys youth (≈U14–U16)",
    certainty: "recalled",
  },
  "girls-youth": { height: 2.24, label: "Girls youth", certainty: "recalled" },
  u12: { height: 2.13, label: "Under-12 / mini", certainty: "recalled" },
} as const;
export type NetPreset = keyof typeof NET_PRESETS;

export function isNetPreset(value: unknown): value is NetPreset {
  return typeof value === "string" && Object.hasOwn(NET_PRESETS, value);
}

export interface VerbSpec {
  readonly group: "contact" | "player";
  readonly flight?: "speed" | "apex";
  readonly speed?: number;
  readonly apex?: number;
  readonly contactZ?: number;
  readonly jump?: boolean;
  readonly label: string;
  readonly read: string;
}

/**
 * Verbs. Contacts move a ball; the flight is derived from the verb.
 * contactZ = ball height at contact (m); apex = default peak for lofted
 * contacts; speed = default horizontal speed (m/s) for driven contacts.
 * Engineering defaults tuned to look right for club play, not measurements.
 */
export const VERBS: Readonly<Record<string, VerbSpec>> = {
  serve: {
    group: "contact",
    flight: "speed",
    speed: 15,
    contactZ: 2.6,
    jump: false,
    label: "Float serve",
    read: "serves",
  },
  jumpserve: {
    group: "contact",
    flight: "speed",
    speed: 19,
    contactZ: 3.1,
    jump: true,
    label: "Jump serve (hard, flat)",
    read: "jump-serves",
  },
  pass: {
    group: "contact",
    flight: "apex",
    apex: 4.4,
    contactZ: 0.8,
    jump: false,
    label: "Pass",
    read: "passes",
  },
  set: {
    group: "contact",
    flight: "apex",
    apex: 4.8,
    contactZ: 2.4,
    jump: false,
    label: "Set",
    read: "sets",
  },
  attack: {
    group: "contact",
    flight: "speed",
    speed: 16,
    contactZ: 2.9,
    jump: true,
    label: "Attack",
    read: "attacks",
  },
  hit: {
    group: "contact",
    flight: "speed",
    speed: 10,
    contactZ: 2.2,
    jump: false,
    label: "Controlled hit",
    read: "hits",
  },
  roll: {
    group: "contact",
    flight: "apex",
    apex: 3.9,
    contactZ: 2.8,
    jump: true,
    label: "Roll shot",
    read: "rolls",
  },
  cut: {
    group: "contact",
    flight: "speed",
    speed: 9,
    contactZ: 2.8,
    jump: true,
    label: "Cut shot",
    read: "cuts",
  },
  dig: {
    group: "contact",
    flight: "apex",
    apex: 4.2,
    contactZ: 0.6,
    jump: false,
    label: "Dig",
    read: "digs",
  },
  toss: {
    group: "contact",
    flight: "apex",
    apex: 3.4,
    contactZ: 1.1,
    jump: false,
    label: "Toss",
    read: "tosses",
  },
  freeball: {
    group: "contact",
    flight: "apex",
    apex: 4.6,
    contactZ: 1.0,
    jump: false,
    label: "Free ball",
    read: "sends a free ball",
  },
  block: {
    group: "player",
    jump: true,
    contactZ: 2.7,
    label: "Block",
    read: "blocks",
  },
  move: { group: "player", speed: 3.0, label: "Move", read: "moves" },
  shuffle: { group: "player", speed: 2.2, label: "Shuffle", read: "shuffles" },
  transition: {
    group: "player",
    speed: 3.2,
    label: "Transition",
    read: "transitions",
  },
  rotate: { group: "player", speed: 2.2, label: "Rotate", read: "rotates" },
  hold: { group: "player", label: "Hold", read: "holds" },
};

export function verbOf(value: unknown): VerbSpec | undefined {
  return typeof value === "string" && Object.hasOwn(VERBS, value)
    ? VERBS[value]
    : undefined;
}

export const CONTACT_VERBS = Object.keys(VERBS).filter(
  (key) => VERBS[key]!.group === "contact",
);
export const MOVE_VERBS = ["move", "shuffle", "transition", "rotate"];

/** Plausibility limits (engineering defaults, documented as such). */
export const LIMITS = {
  speed: {
    sand: { warn: 4.0, error: 5.5 },
    hard: { warn: 4.5, error: 6.5 },
  },
  /** A contact must happen within this distance of the ball. */
  reach: 1.1,
  /** Two players' start spots closer than this overlap. */
  minSpacing: 0.7,
  /** Above the tape, on top of the ball radius. */
  netClearance: 0.15,
  recoverSpeed: 2.6,
  rotationSpeed: 2.4,
} as const;

export const SIDES = ["A", "B", "neutral"] as const;
export type SceneSide = (typeof SIDES)[number];

export function netHeightOf(court: unknown): number {
  if (court && typeof court === "object") {
    const record = court as Record<string, unknown>;
    if (
      typeof record.netHeight === "number" &&
      Number.isFinite(record.netHeight)
    ) {
      return record.netHeight;
    }
    if (isNetPreset(record.net)) return NET_PRESETS[record.net].height;
  }
  return NET_PRESETS.women.height;
}

export function courtOf(court: unknown): CourtSpec {
  const type =
    court && typeof court === "object"
      ? (court as Record<string, unknown>).type
      : undefined;
  return isCourtType(type) ? COURTS[type] : COURTS.beach;
}
