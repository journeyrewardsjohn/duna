/**
 * Router seam: training-programs (owner: B4). Unified training programs.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.trainingPrograms  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   player.trainingPrograms  protectedProcedure: signed-in actor; add .use(requireScope(...)) per procedure
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/training-programs.ts, service code in ../services/training-programs/, demo
 * fixtures in @duna/core/demo/training-programs. Read ./README.md first.
 */
import { organizationProcedure, protectedProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "training-programs";

export const trainingProgramsOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("training:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const trainingProgramsPlayerRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
