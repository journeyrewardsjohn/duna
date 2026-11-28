import { describe, expect, it } from "vitest";
import {
  convertLegacyTrainingScene,
  deriveTrainingSceneEstimates,
  resolveTrainingScene,
  TRAINING_SCENE_MAX_BYTES,
  trainingSceneExamples,
  validateTrainingScene,
} from "./index";

// Tests mutate arbitrary JSON paths on purpose; a precise type would only
// get in the way of breaking documents.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

function example(index: number): Doc {
  return structuredClone(trainingSceneExamples[index]) as Doc;
}
const serveReceive = () => example(0);
const pepper = () => example(1);
const serving = () => example(2);
const digTransition = () => example(3);
const king = () => example(4);

function codes(document: unknown, level?: "error" | "warning" | "info") {
  return validateTrainingScene(document)
    .issues.filter((issue) => !level || issue.level === level)
    .map((issue) => issue.code);
}

describe("the six prototype drills", () => {
  it.each(trainingSceneExamples.map((doc, index) => [doc.id, index]))(
    "%s validates with no errors or warnings",
    (_id, index) => {
      const result = validateTrainingScene(
        trainingSceneExamples[index as number],
      );
      expect(result.issues.filter((issue) => issue.level !== "info")).toEqual(
        [],
      );
      expect(result.ok).toBe(true);
    },
  );

  it("resolves a scene for the player in metres with captions filled in", () => {
    const resolved = resolveTrainingScene(serveReceive())!;
    expect(resolved.court).toMatchObject({
      type: "beach",
      length: 16,
      width: 8,
      netHeight: 2.24,
    });
    const server = resolved.slots.find((slot) => slot.id === "srv")!;
    expect(server).toMatchObject({ side: "B", occupant: "p1", label: "P1" });
    expect(server.y).toBeCloseTo(9.2);
    expect(resolved.steps[0]!.caption).toBe("P1 serves to P2.");
    expect(resolved.steps[0]!.actions[0]).toMatchObject({
      verb: "serve",
      group: "contact",
      crossesNet: true,
    });
    expect(resolved.supply[0]).toMatchObject({ id: "cart", x: -5.4, y: 8.4 });
    expect(resolved.rotation?.maps[0]?.map).toEqual({
      srv: "feed",
      feed: "srv",
      passL: "passR",
      passR: "passL",
    });
  });

  it("derives touches and jumps per rep", () => {
    expect(deriveTrainingSceneEstimates(serveReceive())).toEqual({
      touchesPerRep: 4,
      jumpsPerRep: 1,
    });
    expect(deriveTrainingSceneEstimates({})).toEqual({});
  });

  it("reports the automatic net adjustment as info only", () => {
    const result = validateTrainingScene(king());
    expect(result.ok).toBe(true);
    for (const issue of result.issues) expect(issue.level).toBe("info");
  });
});

describe("rules: one passing and one broken document each", () => {
  it("SCHEMA", () => {
    expect(codes(serveReceive(), "error")).toEqual([]);
    const doc = serveReceive();
    doc.schema = "duna.drill/1";
    delete doc.title;
    doc.court.type = "grass";
    doc.teaching.objective = "";
    const result = validateTrainingScene(doc);
    expect(result.ok).toBe(false);
    expect(
      result.issues.filter((issue) => issue.code === "SCHEMA"),
    ).toHaveLength(4);
    expect(result.issues[0]!.rule).toBe("schema");
    expect(codes({ ...serveReceive(), people: [] }, "error")).toContain(
      "SCHEMA",
    );
    expect(codes({ ...serveReceive(), rep: { steps: [] } }, "error")).toContain(
      "SCHEMA",
    );
    const dup = serveReceive();
    dup.slots[1].id = "srv";
    expect(codes(dup, "error")).toContain("SCHEMA");
  });

  it("REF_SPOT and REF_AREA", () => {
    const doc = serveReceive();
    doc.equipment[0].spot = "setter-target";
    expect(codes(doc, "error")).toEqual(["REF_SPOT"]);
    const area = serveReceive();
    area.zones[0].area = "middle-earth";
    expect(codes(area, "error")).toEqual(["REF_AREA"]);
    const result = validateTrainingScene(area);
    expect(result.issues[0]!.rule).toBe("ref-area");
  });

  it("REF_PERSON", () => {
    const doc = serveReceive();
    doc.slots[0].occupant = "ghost";
    expect(codes(doc, "error")).toContain("REF_PERSON");
  });

  it("REF_ACTOR", () => {
    const doc = serveReceive();
    doc.rep.steps[3].actions[0].actor = "passX";
    expect(codes(doc, "error")).toEqual(["REF_ACTOR"]);
  });

  it("REF_VERB", () => {
    const doc = serveReceive();
    doc.rep.steps[0].actions[0].verb = "spike-of-doom";
    expect(codes(doc, "error")).toContain("REF_VERB");
  });

  it("REF_BALL", () => {
    const doc = serveReceive();
    doc.rep.steps[2].actions[0].ball = "b9";
    expect(codes(doc, "error")).toEqual(["REF_BALL"]);
  });

  it("REF_TARGET", () => {
    const doc = serveReceive();
    doc.rep.steps[0].actions[0].to = { slot: "nobody" };
    expect(codes(doc, "error")).toContain("REF_TARGET");
  });

  it("REF_SLOT, REF_SUPPLY and BALL_NOWHERE", () => {
    const slot = serveReceive();
    slot.balls[0].start = { slot: "missing" };
    expect(codes(slot, "error")).toEqual(["REF_SLOT"]);
    const supply = serveReceive();
    supply.balls[0].start = { supply: "missing" };
    expect(codes(supply, "error")).toEqual(["REF_SUPPLY"]);
    const nowhere = serveReceive();
    nowhere.balls[0].start = {};
    expect(codes(nowhere, "error")).toEqual(["BALL_NOWHERE"]);
    const fromSupply = serveReceive();
    fromSupply.balls[0].start = { supply: "cart" };
    expect(codes(fromSupply, "error")).not.toContain("REF_SUPPLY");
  });

  it("CONTINUITY", () => {
    const doc = serveReceive();
    // The set starts where the setter began, not where the pass landed.
    doc.rep.steps[2].actions[0].from = { spot: "passer-right" };
    expect(codes(doc, "error")).toEqual(["CONTINUITY"]);
    const near = serveReceive();
    near.rep.steps[2].actions[0].from = { spot: "set-target" };
    expect(codes(near, "error")).toEqual([]);
  });

  it("BOUNDS", () => {
    const doc = serveReceive();
    doc.slots[0].pos = { x: 0, y: 30 };
    expect(codes(doc, "error")).toContain("BOUNDS");
    const target = serveReceive();
    target.rep.steps[3].actions[0].to = { x: 0, y: 20 };
    expect(codes(target, "error")).toContain("BOUNDS");
  });

  it("NET", () => {
    const doc = serveReceive();
    // A forced, flat, fast arc from 1.3 m off the net cannot clear the tape.
    doc.court.net = "men";
    doc.rep.steps[3].actions[0].arc = { speed: 30 };
    expect(codes(doc, "error")).toContain("NET");
  });

  it("ANTENNA", () => {
    const doc = serveReceive();
    doc.rep.steps[3].actions[0].to = { x: 6.9, y: 0.4 };
    expect(codes(doc, "error")).toContain("ANTENNA");
  });

  it("SERVE_ZONE", () => {
    const inside = serving();
    inside.slots[0].spot = "passer-middle";
    expect(codes(inside, "warning")).toContain("SERVE_ZONE");
    const noCross = serving();
    noCross.rep.steps[0].actions[0].to = { area: "deep-band", side: "A" };
    expect(codes(noCross, "error")).toContain("SERVE_ZONE");
  });

  it("THREE_TOUCHES", () => {
    const doc = pepper();
    expect(codes(doc)).not.toContain("THREE_TOUCHES");
    delete doc.rules;
    expect(codes(doc, "warning")).toContain("THREE_TOUCHES");
  });

  it("OWN_SIDE", () => {
    const doc = serveReceive();
    doc.rep.steps[2].actions[0].actor = "srv";
    expect(codes(doc, "warning")).toContain("OWN_SIDE");
    // Coach feeds from the other side are fine.
    expect(codes(digTransition())).not.toContain("OWN_SIDE");
  });

  it("SPACING", () => {
    const doc = serveReceive();
    doc.slots[2].pos = { x: -2, y: -5.8 };
    doc.slots[3].pos = { x: -2.2, y: -5.8 };
    expect(codes(doc, "warning")).toContain("SPACING");
  });

  it("ROTATION", () => {
    const doc = serveReceive();
    doc.rotation.map = {
      srv: "feed",
      feed: "srv",
      passL: "passR",
      passR: "passR",
    };
    expect(codes(doc, "error")).toContain("ROTATION");
    const dropped = serveReceive();
    dropped.rotation.map = { srv: "feed", passL: "passR", passR: "passL" };
    expect(codes(dropped, "error")).toContain("ROTATION");
    const unknown = king();
    unknown.rotation.shown = "draw";
    expect(codes(unknown, "error")).toContain("ROTATION");
    expect(codes(king(), "error")).toEqual([]);
  });

  it("TEACHING", () => {
    const doc = serveReceive();
    doc.teaching.successCriteria = [];
    doc.rep.steps[1].caption = "";
    doc.teaching.cues.push({ step: "s9", text: "Nowhere" });
    delete doc.rotation.caption;
    const teaching = validateTrainingScene(doc).issues.filter(
      (issue) => issue.code === "TEACHING",
    );
    expect(teaching).toHaveLength(4);
    expect(teaching.every((issue) => issue.level === "warning")).toBe(true);
    expect(validateTrainingScene(doc).ok).toBe(true);
  });

  it("NET_PRESET", () => {
    const doc = serveReceive();
    doc.court.net = "giants";
    expect(codes(doc, "warning")).toEqual(["NET_PRESET"]);
    const high = serveReceive();
    high.court.netHeight = 3;
    expect(codes(high, "warning")).toContain("NET_PRESET");
    const custom = serveReceive();
    custom.court.netHeight = 2.3;
    expect(codes(custom)).not.toContain("NET_PRESET");
  });
});

describe("caps and hostile input", () => {
  it.each([null, undefined, 1, "scene", true, [], [serveReceive()]])(
    "rejects a non-object (%s) without throwing",
    (input) => {
      const result = validateTrainingScene(input);
      expect(result.ok).toBe(false);
      expect(result.errors).toBeGreaterThan(0);
      expect(resolveTrainingScene(input)).toBeUndefined();
    },
  );

  it("caps the serialized size", () => {
    const doc = serveReceive();
    doc.notes = "x".repeat(TRAINING_SCENE_MAX_BYTES);
    expect(codes(doc)).toEqual(["SIZE"]);
  });

  it("caps nesting depth", () => {
    const doc = serveReceive();
    let deep: Doc = {};
    doc.meta.extra = deep;
    for (let level = 0; level < 20; level++) {
      deep.next = {};
      deep = deep.next;
    }
    expect(codes(doc)).toEqual(["DEPTH"]);
  });

  it("caps people, slots, steps and actions", () => {
    const many = serveReceive();
    many.people = Array.from({ length: 41 }, (_, index) => ({
      id: `x${index}`,
      label: "X",
    }));
    expect(codes(many, "error")).toContain("LIMIT");
    const steps = serveReceive();
    steps.rep.steps = Array.from({ length: 61 }, (_, index) => ({
      id: `s${index}`,
      caption: "c",
      actions: [],
    }));
    expect(codes(steps, "error")).toContain("LIMIT");
    const actions = serveReceive();
    actions.rep.steps[0].actions = Array.from({ length: 13 }, () => ({
      actor: "srv",
      verb: "hold",
    }));
    expect(codes(actions, "error")).toContain("LIMIT");
  });

  it("rejects cycles and non-JSON values", () => {
    const doc = serveReceive();
    doc.self = doc;
    expect(validateTrainingScene(doc).ok).toBe(false);
    const big = serveReceive();
    big.meta.count = BigInt(1);
    expect(validateTrainingScene(big).ok).toBe(false);
  });

  it("treats strings as data, never code", () => {
    const doc = serveReceive();
    doc.title = "${process.exit(1)}";
    doc.rep.steps[0].caption = "{constructor} {__proto__} {srv}";
    const resolved = resolveTrainingScene(doc)!;
    expect(resolved.title).toBe("${process.exit(1)}");
    expect(resolved.steps[0]!.caption).toBe("{constructor} {__proto__} P1");
    const proto = serveReceive();
    proto.rep.steps[0].actions[0].verb = "constructor";
    expect(codes(proto, "error")).toContain("REF_VERB");
    const spot = serveReceive();
    spot.slots[0].spot = "__proto__";
    expect(codes(spot, "error")).toContain("REF_SPOT");
  });
});

describe("legacy v1 scenes", () => {
  const v1 = {
    court: "beach-full",
    perspective: "isometric",
    positions: [
      {
        id: "p1",
        label: "1",
        role: "Working athlete",
        team: "a",
        x: 39.3,
        y: 25,
      },
      {
        id: "p2",
        label: "2",
        role: "Working athlete",
        team: "a",
        x: 60.7,
        y: 35,
      },
      { id: "p3", label: "3", role: "Defender", team: "b", x: 39.3, y: 75 },
      { id: "p4", label: "4", role: "Defender", team: "b", x: 60.7, y: 65 },
    ],
    movements: [
      { id: "m1", from: "p1", to: "p2", kind: "player", order: 1 },
      {
        id: "m2",
        from: "p2",
        to: "p3",
        kind: "ball",
        label: "Ball path",
        order: 2,
      },
      { id: "m3", from: "p3", to: "p4", kind: "player", order: 3 },
    ],
    ballCount: 2,
    loopSeconds: 12,
  };

  it("converts to a v2 document with no errors", () => {
    const converted = convertLegacyTrainingScene(v1, {
      title: "Pepper",
      objective: "Ball control.",
    })!;
    expect(converted.schema).toBe("duna.drill/2");
    const result = validateTrainingScene(converted);
    expect(result.issues.filter((issue) => issue.level === "error")).toEqual(
      [],
    );
    const resolved = resolveTrainingScene(converted)!;
    const p1 = resolved.slots.find((slot) => slot.id === "p1")!;
    expect(p1.side).toBe("A");
    expect(p1.y).toBeLessThan(0);
    expect(resolved.steps.map((step) => step.actions[0]!.verb)).toEqual([
      "move",
      "pass",
      "move",
    ]);
    // Converting again gives the same document.
    expect(
      convertLegacyTrainingScene(v1, {
        title: "Pepper",
        objective: "Ball control.",
      }),
    ).toEqual(converted);
  });

  it("converts the court kinds and a scene with no movements", () => {
    for (const court of ["indoor-full", "half-court", "no-court"]) {
      const converted = convertLegacyTrainingScene({
        ...v1,
        court,
        movements: [],
      })!;
      expect(validateTrainingScene(converted).errors).toBe(0);
    }
  });

  it("refuses unusable input", () => {
    expect(convertLegacyTrainingScene(null)).toBeUndefined();
    expect(convertLegacyTrainingScene({ positions: "nope" })).toBeUndefined();
    expect(
      convertLegacyTrainingScene({ positions: [{ id: "p1" }] }),
    ).toBeUndefined();
  });
});

/** mulberry32: a tiny seeded PRNG so the property test is reproducible. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function paths(
  value: unknown,
  prefix: (string | number)[] = [],
): (string | number)[][] {
  if (typeof value !== "object" || value === null) return [prefix];
  const entries = Array.isArray(value)
    ? value.map((child, index) => [index, child] as const)
    : Object.entries(value);
  return [
    prefix,
    ...entries.flatMap(([key, child]) => paths(child, [...prefix, key])),
  ];
}

const junk: readonly unknown[] = [
  null,
  undefined,
  -1,
  0,
  1e9,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  "",
  "x".repeat(5_000),
  "__proto__",
  true,
  [],
  {},
  [1, 2, 3],
  { slot: "nobody" },
  { spot: "server-right#999" },
  { x: 1e6, y: -1e6 },
];

function mutate(doc: Doc, random: () => number): Doc {
  const all = paths(doc).filter((path) => path.length > 0);
  const count = 1 + Math.floor(random() * 4);
  for (let n = 0; n < count; n++) {
    const path = all[Math.floor(random() * all.length)]!;
    let parent: Doc | undefined = doc;
    for (const key of path.slice(0, -1)) {
      parent = parent?.[key];
      if (typeof parent !== "object" || parent === null) break;
    }
    if (typeof parent !== "object" || parent === null) continue;
    const last = path.at(-1)!;
    // Arrays index by string too; one record view keeps the mutations simple.
    const target = parent as Doc;
    const key = String(last);
    const choice = random();
    if (choice < 0.3) {
      if (Array.isArray(parent) && typeof last === "number")
        parent.splice(last, 1);
      else delete target[key];
    } else if (choice < 0.5) {
      target[key] = junk[Math.floor(random() * junk.length)];
    } else if (choice < 0.7) {
      target[key] =
        typeof target[key] === "number"
          ? (random() - 0.5) * 60
          : `z${Math.floor(random() * 99)}`;
    } else if (choice < 0.85 && typeof target[key] === "string") {
      // Scramble an id so a reference dangles.
      target[key] = `${target[key]}${Math.floor(random() * 9)}`;
    } else {
      target[key] = structuredClone(doc.slots ?? []);
    }
  }
  return doc;
}

describe("property: mutated scenes", () => {
  it("never throw, always return a well-formed result, and are deterministic", () => {
    const random = mulberry32(20_261_128);
    for (let run = 0; run < 600; run++) {
      const base = example(Math.floor(random() * trainingSceneExamples.length));
      const doc = mutate(base, random);
      const snapshot = structuredClone(doc);
      let first: ReturnType<typeof validateTrainingScene> | undefined;
      expect(() => {
        first = validateTrainingScene(doc);
      }).not.toThrow();
      const result = first!;
      expect(result.errors).toBeGreaterThanOrEqual(0);
      expect(result.warnings).toBeGreaterThanOrEqual(0);
      expect(result.ok).toBe(result.errors === 0);
      expect(result.errors).toBe(
        result.issues.filter((issue) => issue.level === "error").length,
      );
      for (const issue of result.issues) {
        expect(typeof issue.code).toBe("string");
        expect(issue.rule).toMatch(/^[a-z_-]+$/);
        expect(issue.message.length).toBeLessThan(600);
      }
      // Validation never mutates the document and is deterministic.
      expect(doc).toEqual(snapshot);
      expect(validateTrainingScene(doc)).toEqual(result);
      expect(() => resolveTrainingScene(doc)).not.toThrow();
      expect(() => deriveTrainingSceneEstimates(doc)).not.toThrow();
      expect(resolveTrainingScene(doc) === undefined).toBe(!result.ok);
    }
  });
});
