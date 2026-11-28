/**
 * Load estimates that can be read straight off a valid scene without the
 * timing resolver: ball contacts and jumps in one rep. Metres per player and
 * work-to-rest need player tracks over time (B6a follow-up) and are omitted
 * rather than guessed.
 */
import { analyzeTrainingScene } from "./analyze";

export interface TrainingSceneEstimates {
  touchesPerRep?: number;
  jumpsPerRep?: number;
  metresPerPlayer?: number;
  workRestRatio?: string;
}

export function deriveTrainingSceneEstimates(
  document: unknown,
): TrainingSceneEstimates {
  const { resolved } = analyzeTrainingScene(document);
  if (!resolved) return {};
  let touches = 0;
  let jumps = 0;
  for (const step of resolved.steps) {
    for (const action of step.actions) {
      if (action.group === "contact") touches++;
      if (action.jump) jumps++;
    }
  }
  return { touchesPerRep: touches, jumpsPerRep: jumps };
}
