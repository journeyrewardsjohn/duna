/**
 * Router seam: pay (owner: B2). Duna Pay (Connect embedded onboarding, payout/tax/refund policy, publish gate).
 *
 * Mounted exactly once in ../router.ts:
 *   operator.pay  organizationProcedure(scope): signed in, scope checked, organization resolved server-side (ctx.organizationId)
 *
 * Add procedures here, never in router.ts. Zod schemas live in
 * ../contracts/pay.ts, service code in ../services/pay/, demo
 * fixtures in @duna/core/demo/pay. Read ./README.md first.
 */
import { organizationProcedure, router } from "../auth";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "pay";

export const payOperatorRouter = router({
  // Placeholder so the mount is type-checked and reachable in demo mode.
  // Replace it with real procedures; keep a demo-mode branch in each.
  status: organizationProcedure("payments:read")
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),
});
