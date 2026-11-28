/**
 * Contract: training-scene-ai (owner: B6d). "Create with AI": the model
 * names spots, code places them (packages/training-scene layout), the
 * validator runs, a repair loop retries, and a coach accepts or rejects.
 * Frozen by W3-0; H8 (DL-Studio) builds against it and the demo fixtures in
 * `@duna/core/demo/training-scene-ai`. Procedures:
 * `operator.trainingSceneAi.*` (see docs/plan/w3-contracts.md).
 */
import { trainingSceneAiRunStatuses } from "@duna/db/schema";
import { z } from "zod";
import { trainingDrillsSceneIssueSchema } from "./training-drills";
import {
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3PersonRefSchema,
} from "./w3-common";

export const trainingSceneAiRunStatusSchema = z.enum(
  trainingSceneAiRunStatuses,
);

/** A spot the model named; code turns it into coordinates. */
export const trainingSceneAiNamedSpotSchema = z.object({
  id: z.string().min(1).max(32),
  label: z.string().min(1).max(80),
  /** A named place, e.g. "left back", "setter target", "far service line". */
  place: z.string().min(1).max(80),
  role: z.enum(["player", "coach", "target", "cone", "ball-cart"]),
  side: z.enum(["near", "far"]),
});

export const trainingSceneAiRunSchema = z.object({
  id: w3IdSchema,
  drillId: w3IdSchema.optional(),
  prompt: z.string().min(1),
  status: trainingSceneAiRunStatusSchema,
  attempts: z.number().int().min(0).max(10),
  namedSpots: z.array(trainingSceneAiNamedSpotSchema),
  /** The candidate scene (model v2) once placed. */
  draftDocument: z.record(z.string(), z.unknown()).optional(),
  validationIssues: z.array(trainingDrillsSceneIssueSchema),
  resultSceneId: w3IdSchema.optional(),
  requestedBy: w3PersonRefSchema.optional(),
  model: z.string().optional(),
  /** Machine reason when failed, e.g. "validator-still-failing", "model-unavailable". */
  errorCode: z.string().max(64).optional(),
  createdAt: w3DateTimeSchema,
  finishedAt: w3DateTimeSchema.optional(),
});

export const trainingSceneAiStartInputSchema = z.object({
  /** The coach's description of the drill. Never player names. */
  prompt: z.string().min(10).max(4000),
  drillId: w3IdSchema.optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});
export const trainingSceneAiRunInputSchema = z.object({ runId: w3IdSchema });
export const trainingSceneAiRunsInputSchema = z.object({
  drillId: w3IdSchema.optional(),
});
export const trainingSceneAiRunsSchema = z.object({
  items: z.array(trainingSceneAiRunSchema),
});
/** Accepting saves the scene as a new drill version (or a new personal drill). */
export const trainingSceneAiAcceptInputSchema = z.object({
  runId: w3IdSchema,
  title: z.string().min(1).max(160).optional(),
  changeNote: z.string().max(500).optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});
export const trainingSceneAiAcceptResultSchema = z.object({
  run: trainingSceneAiRunSchema,
  drillId: w3IdSchema,
  drillVersionId: w3IdSchema,
  sceneId: w3IdSchema,
});
export const trainingSceneAiRejectInputSchema = z.object({
  runId: w3IdSchema,
  reason: z.string().max(500).optional(),
});

export type TrainingSceneAiRun = z.infer<typeof trainingSceneAiRunSchema>;
