/**
 * Router seam: facility (owner: B9). Facility owners, public court access rules and stop-play (flag facility.owners).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.facility  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   player.facility  protectedProcedure: signed-in actor; add .use(requireScope(...)) per procedure
 *   public.facility  publicProcedure: anonymous allowed, IP rate limited; ctx.actor may still be present
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/facility.ts, service code in ../services/facility/, demo
 * fixtures in @duna/core/demo/facility. Read ./README.md first.
 */
import {
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "facility";

export const facilityOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("sessions:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const facilityPlayerRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const facilityPublicRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
