/**
 * Drill scene model v2 (B6a, data only): `@duna/core/training-scene`.
 *
 * Pure: no I/O, no clock, no dependencies. The drill library stores a scene
 * per drill version (`training_drill_scenes.document`), validates it here
 * and serves `resolveTrainingScene` to the future 2D / 3D player. Nothing in
 * a scene is ever executed. See ./analyze.ts for which rules run here and
 * which wait for the timing resolver.
 */
import {
  analyzeTrainingScene,
  type ResolvedTrainingScene,
  type TrainingSceneValidation,
} from "./analyze";

export {
  TRAINING_SCENE_MAX_ACTIONS_PER_STEP,
  TRAINING_SCENE_MAX_BYTES,
  TRAINING_SCENE_MAX_DEPTH,
  TRAINING_SCENE_MAX_PEOPLE,
  TRAINING_SCENE_MAX_SLOTS,
  TRAINING_SCENE_MAX_STEPS,
  TRAINING_SCENE_MODEL_VERSION,
  TRAINING_SCENE_SCHEMA_ID,
  TRAINING_SCENE_VALIDATOR_VERSION,
  COURTS as TRAINING_SCENE_COURTS,
  NET_PRESETS as TRAINING_SCENE_NET_PRESETS,
  VERBS as TRAINING_SCENE_VERBS,
} from "./model";
export {
  AREA_NAMES as TRAINING_SCENE_AREA_NAMES,
  SPOTS as TRAINING_SCENE_SPOTS,
} from "./layout";
export type {
  ResolvedSceneAction,
  ResolvedSceneSlot,
  ResolvedSceneStep,
  ResolvedSceneThing,
  ResolvedTrainingScene,
  ScenePoint,
  TrainingSceneIssue,
  TrainingSceneIssueLevel,
  TrainingSceneValidation,
} from "./analyze";
export {
  deriveTrainingSceneEstimates,
  type TrainingSceneEstimates,
} from "./derive";
export { convertLegacyTrainingScene } from "./legacy";
export { trainingSceneExamples } from "./examples";

/** Every rule this module checks; errors make a scene invalid. */
export function validateTrainingScene(
  document: unknown,
): TrainingSceneValidation {
  return analyzeTrainingScene(document).validation;
}

/** The scene in metres for a player; undefined unless it validates. */
export function resolveTrainingScene(
  document: unknown,
): ResolvedTrainingScene | undefined {
  return analyzeTrainingScene(document).resolved;
}
