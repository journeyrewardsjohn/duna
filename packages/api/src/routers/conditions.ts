/**
 * Router seam: conditions (owner: B11). Court conditions: weather, sun, wind relative to court, light.
 *
 * Mounted exactly once in ../router.ts:
 *   operator.conditions  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *   public.conditions  publicProcedure: anonymous allowed, IP rate limited; ctx.actor may still be present
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/conditions.ts, service code in ../services/conditions/, demo
 * fixtures in @duna/core/demo/conditions. Read ./README.md first.
 */
import { organizationProcedure, publicProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "conditions";

export const conditionsOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("sessions:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});

export const conditionsPublicRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
