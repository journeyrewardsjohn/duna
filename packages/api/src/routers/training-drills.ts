/**
 * Router seam: training-drills (owner: B5). Drill library, versions, review and storefront (flag training.storefront).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.trainingDrills  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   player.trainingDrills  protectedProcedure: signed-in actor; add .use(requireScope(...)) per procedure
 *   public.trainingDrills  publicProcedure: anonymous allowed, IP rate limited; ctx.actor may still be present
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/training-drills.ts, service code in ../services/training-drills/, demo
 * fixtures in @duna/core/demo/training-drills. Read ./README.md first.
 */
import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "training-drills";

export const trainingDrillsOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("training:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const trainingDrillsPlayerRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const trainingDrillsPublicRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
