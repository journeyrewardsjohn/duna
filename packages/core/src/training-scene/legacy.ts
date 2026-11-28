/**
 * Converts a legacy (v1) drill scene into a v2 document with pinned metres.
 *
 * v1 (`drillSceneSchema` in packages/api/src/training-contracts.ts, drawn by
 * apps/hq/components/training-court-animation.tsx): positions are percent of
 * the drawing frame, x 0–100 along the net, y 0–100 across it with the net at
 * y = 50; team "a" works at the top (y < 50). Here the frame is taken as the
 * court itself (sideline to sideline, baseline to baseline), so every v1
 * position lands on the court and a ball between two of them crosses the net
 * between the antennae; the top half becomes side A (y < 0 in v2). Movements become one step each,
 * in their `order`: ball movements are contacts (a pass, or a toss when a
 * coach feeds), player and rotation movements are moves to the other slot.
 */
import { COURTS, type CourtType, TRAINING_SCENE_SCHEMA_ID } from "./model";

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

const COURT_MAP: Readonly<Record<string, CourtType>> = {
  "beach-full": "beach",
  "indoor-full": "indoor",
  "half-court": "beach-half",
  "no-court": "none",
};

function safeId(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value : "";
  const cleaned = text.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return cleaned || fallback;
}

export function convertLegacyTrainingScene(
  v1: unknown,
  meta: {
    readonly title?: string;
    readonly objective?: string;
    readonly durationMinutes?: number;
    readonly focus?: string;
  } = {},
): Record<string, unknown> | undefined {
  if (!isRecord(v1) || !Array.isArray(v1.positions)) return undefined;
  const courtType = COURT_MAP[String(v1.court)] ?? "beach";
  const court = COURTS[courtType];
  const frameX = court.width;
  const frameY = court.length;
  const round = (value: number) => Math.round(value * 100) / 100;

  const people: Rec[] = [];
  const slots: Rec[] = [];
  const slotIds = new Set<string>();
  v1.positions.slice(0, 30).forEach((position, index) => {
    if (!isRecord(position)) return;
    const x = num(position.x);
    const y = num(position.y);
    if (x === undefined || y === undefined) return;
    let id = safeId(position.id, `s${index + 1}`);
    while (slotIds.has(id)) id = `${id}-${index + 1}`;
    slotIds.add(id);
    const clampedX = Math.min(Math.max(x, 0), 100);
    const clampedY = Math.min(Math.max(y, 0), 100);
    const team = position.team;
    const personId = `p${people.length + 1}`;
    const label =
      typeof position.label === "string" && position.label.trim()
        ? position.label.trim().slice(0, 12)
        : `P${people.length + 1}`;
    people.push({ id: personId, label });
    slots.push({
      id,
      side: clampedY < 50 ? "A" : "B",
      ...(team === "coach" ? { kind: "coach" } : {}),
      role:
        typeof position.role === "string" && position.role.trim()
          ? position.role.trim().slice(0, 60)
          : "Player",
      pos: {
        x: round((clampedX / 100 - 0.5) * frameX),
        y: round((clampedY / 100 - 0.5) * frameY),
      },
      occupant: personId,
      ...(team === "queue" ? { waiting: true } : {}),
    });
  });
  if (slots.length === 0) return undefined;

  const movements = (Array.isArray(v1.movements) ? v1.movements : [])
    .filter(isRecord)
    .filter(
      (movement) =>
        slotIds.has(String(movement.from)) && slotIds.has(String(movement.to)),
    )
    .sort((a, b) => (num(a.order) ?? 0) - (num(b.order) ?? 0))
    .slice(0, 40);
  const coachSlots = new Set(
    slots.filter((slot) => slot.kind === "coach").map((slot) => slot.id),
  );
  const firstBall = movements.find((movement) => movement.kind === "ball");
  const steps: Rec[] = movements.map((movement, index) => {
    const from = String(movement.from);
    const to = String(movement.to);
    const ball = movement.kind === "ball";
    const verb = ball ? (coachSlots.has(from) ? "toss" : "pass") : "move";
    return {
      id: `s${index + 1}`,
      caption: ball
        ? `{${from}} ${verb === "toss" ? "tosses" : "passes"} to {${to}}.`
        : `{${from}} moves to where {${to}} started.`,
      actions: [
        ball
          ? { actor: from, verb, ball: "b1", to: { slot: to } }
          : { actor: from, verb, to: { slot: to } },
      ],
    };
  });
  if (steps.length === 0) {
    // A scene with nobody moving still needs one step to be a drill.
    steps.push({
      id: "s1",
      caption: `{${slots[0]!.id}} holds position.`,
      actions: [{ actor: String(slots[0]!.id), verb: "hold" }],
    });
  }
  const objective =
    meta.objective?.trim().slice(0, 300) ||
    "Converted from the earlier drill diagram; check the steps before use.";
  return {
    schema: TRAINING_SCENE_SCHEMA_ID,
    title: meta.title?.trim().slice(0, 160) || "Converted drill",
    court: { type: courtType, net: "women" },
    meta: {
      ...(meta.durationMinutes
        ? { durationMinutes: meta.durationMinutes }
        : {}),
      ...(meta.focus ? { focus: meta.focus } : {}),
      converted: true,
    },
    teaching: {
      objective,
      successCriteria: [],
      cues: [],
    },
    people,
    slots,
    balls: [
      {
        id: "b1",
        start: { slot: firstBall ? String(firstBall.from) : slots[0]!.id },
      },
    ],
    rep: { ballsBetweenReps: "supply", restSeconds: 5, steps },
  };
}
