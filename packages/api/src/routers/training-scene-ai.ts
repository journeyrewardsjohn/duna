/**
 * Router seam: training-scene-ai (owner: B6d). Create-with-AI pipeline for training scenes.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.trainingSceneAi  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/training-scene-ai.ts, service code in ../services/training-scene-ai/, demo
 * fixtures in @duna/core/demo/training-scene-ai. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "training-scene-ai";

export const trainingSceneAiOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("training:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
