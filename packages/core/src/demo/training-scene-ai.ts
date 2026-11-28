/**
 * Demo fixtures: training-scene-ai (owner: B6d). One "Create with AI" run in
 * every state. Shaped by `contracts/training-scene-ai.ts`; parsed in
 * packages/api/src/contracts/training-scene-ai.test.ts.
 */
import { demoPlayer } from "../demo";
import { demoId } from "./ids";
import {
  trainingDrillsDemoIds,
  trainingDrillsDemoScenes,
} from "./training-drills";

const id = (n: number) => demoId("training-scene-ai", n);
const CREATED = "2026-11-27T18:00:00.000Z";
const FINISHED = "2026-11-27T18:00:40.000Z";
const prompt =
  "Three passers in serve-receive, a server on the far side, rotate after five serves.";
const spots = [
  {
    id: "S1",
    label: "Server",
    place: "far service line",
    role: "player" as const,
    side: "far" as const,
  },
  {
    id: "P1",
    label: "Passer 1",
    place: "left back",
    role: "player" as const,
    side: "near" as const,
  },
  {
    id: "P2",
    label: "Passer 2",
    place: "right back",
    role: "player" as const,
    side: "near" as const,
  },
  {
    id: "T",
    label: "Target",
    place: "setter target",
    role: "target" as const,
    side: "near" as const,
  },
];
const draft = trainingDrillsDemoScenes[0]!.document;
const requestedBy = {
  personId: demoPlayer.id,
  displayName: demoPlayer.displayName,
};

type Status =
  | "queued"
  | "naming"
  | "placing"
  | "validating"
  | "repairing"
  | "ready-for-review"
  | "accepted"
  | "rejected"
  | "failed";

const run = (n: number, status: Status, attempts: number) => {
  const named = status !== "queued" && status !== "naming";
  const placed = named && status !== "placing";
  const finished = ["accepted", "rejected", "failed"].includes(status);
  return {
    id: id(n),
    prompt,
    status,
    attempts,
    namedSpots: named ? spots : [],
    ...(placed ? { draftDocument: draft } : {}),
    validationIssues:
      status === "repairing" || status === "failed"
        ? [
            {
              rule: "players-overlap",
              message: "Passer 1 and Passer 2 stand in the same spot.",
            },
          ]
        : [],
    ...(status === "accepted"
      ? {
          resultSceneId: trainingDrillsDemoScenes[1]!.id,
          drillId: trainingDrillsDemoIds.personalDrill,
        }
      : {}),
    requestedBy,
    model: "[model]",
    ...(status === "failed" ? { errorCode: "validator-still-failing" } : {}),
    createdAt: CREATED,
    ...(finished ? { finishedAt: FINISHED } : {}),
  };
};

export const trainingSceneAiDemoRuns = [
  run(1, "queued", 0),
  run(2, "naming", 1),
  run(3, "placing", 1),
  run(4, "validating", 1),
  run(5, "repairing", 2),
  run(6, "ready-for-review", 2),
  run(7, "accepted", 2),
  run(8, "rejected", 1),
  run(9, "failed", 3),
];

export const trainingSceneAiDemoIds = {
  queuedRun: id(1),
  readyRun: id(6),
  acceptedRun: id(7),
} as const;

export const trainingSceneAiDemo = {
  domain: "training-scene-ai",
  runs: trainingSceneAiDemoRuns,
} as const;
